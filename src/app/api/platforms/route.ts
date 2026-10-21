import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded, prisma } from "@/core/db";
import { getCurrentResume } from "@/core/resume-manager";
import { CustomWebsiteConfigSchema } from "@/core/config-schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const currentResume = await getCurrentResume();
    const platforms = await prisma.platform.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        syncRecords: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });

    const enriched = platforms.map((p) => {
      let resumeStatus:
        | "up_to_date"
        | "update_available"
        | "not_configured"
        | "disabled" = "update_available";

      if (!p.enabled) {
        resumeStatus = "disabled";
      } else if (!p.connected && p.type !== "portfolio") {
        resumeStatus = "not_configured";
      } else if (
        currentResume &&
        p.lastSyncedHash &&
        p.lastSyncedHash === currentResume.fileHash
      ) {
        resumeStatus = "up_to_date";
      } else {
        resumeStatus = "update_available";
      }

      return {
        ...p,
        resumeStatus,
        currentResumeHash: currentResume?.fileHash ?? null,
        lastRecord: p.syncRecords[0] ?? null,
      };
    });

    const lastSyncJob = await prisma.syncJob.findFirst({
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json({
      platforms: enriched,
      currentResume,
      lastSyncJob,
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
    const body = await req.json();
    const { name, websiteUrl, loginUrl, resumePageUrl, uploadSelector, saveSelector, verificationSelector } = body;

    if (!name || !websiteUrl || !resumePageUrl) {
      return NextResponse.json(
        { error: "Name, Website URL, and Resume Page URL are required." },
        { status: 400 }
      );
    }

    const id =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      Date.now().toString().slice(-4);

    const validatedConfig = CustomWebsiteConfigSchema.parse({
      websiteUrl,
      loginUrl: loginUrl || websiteUrl,
      resumePageUrl,
      uploadSelector: uploadSelector || 'input[type="file"]',
      saveSelector: saveSelector || 'button:has-text("Save")',
      verificationSelector: verificationSelector || ".resume-filename",
    });

    const count = await prisma.platform.count();
    const created = await prisma.platform.create({
      data: {
        id,
        name,
        type: "custom",
        enabled: true,
        connected: false,
        loginStatus: "not_connected",
        adapterVersion: "1.0.0",
        url: websiteUrl,
        configJson: JSON.stringify(validatedConfig),
        sortOrder: count + 1,
      },
    });

    return NextResponse.json({ platform: created });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
