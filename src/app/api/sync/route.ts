import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded, prisma } from "@/core/db";
import { syncBus } from "@/core/interaction-gate";
import { runSyncJob } from "@/core/sync-orchestrator";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const limit = Number(req.nextUrl.searchParams.get("limit") || "30");

    const jobs = await prisma.syncJob.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        resume: true,
        records: {
          include: { platform: true },
          orderBy: { startedAt: "asc" },
        },
      },
    });

    const records = await prisma.syncRecord.findMany({
      orderBy: { startedAt: "desc" },
      take: limit * 3,
      include: {
        platform: true,
        resume: true,
        syncJob: true,
      },
    });

    return NextResponse.json({
      liveState: syncBus.getState(),
      jobs,
      records,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    if (syncBus.getState().isRunning) {
      return NextResponse.json(
        { error: "A sync job is already running." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const platformIds = Array.isArray(body.platformIds)
      ? body.platformIds
      : undefined;
    const dryRun =
      typeof body.dryRun === "boolean" ? body.dryRun : undefined;
    const force = typeof body.force === "boolean" ? body.force : false;

    // Launch orchestration asynchronously so the UI can immediately stream SSE progress
    runSyncJob({
      platformIds,
      dryRun,
      force,
      triggerSource: "ui",
      interactive: true,
    }).catch((err) => {
      console.error("Background sync job failed:", err);
      syncBus.finishJob(`Sync failed: ${(err as Error).message}`);
    });

    return NextResponse.json({
      started: true,
      liveState: syncBus.getState(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
