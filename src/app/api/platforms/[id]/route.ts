import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded, prisma } from "@/core/db";
import { parsePlatformConfig } from "@/core/config-schemas";
import { createPlatformAdapter } from "@/automation/platforms/registry";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeeded();
    const { id } = await context.params;
    const platform = await prisma.platform.findUnique({
      where: { id },
      include: {
        syncRecords: {
          orderBy: { startedAt: "desc" },
          take: 10,
          include: { resume: true },
        },
      },
    });

    if (!platform) {
      return NextResponse.json(
        { error: "Platform not found" },
        { status: 404 }
      );
    }

    const parsedConfig = parsePlatformConfig(
      platform.type,
      platform.configJson
    );

    return NextResponse.json({
      platform,
      config: parsedConfig,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeeded();
    const { id } = await context.params;
    const existing = await prisma.platform.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Platform not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (typeof body.enabled === "boolean") updateData.enabled = body.enabled;
    if (typeof body.name === "string" && body.name.trim())
      updateData.name = body.name.trim();
    if (typeof body.url === "string" && body.url.trim())
      updateData.url = body.url.trim();

    if (body.config && typeof body.config === "object") {
      const currentCfg = parsePlatformConfig(
        existing.type,
        existing.configJson
      );
      const merged = { ...(currentCfg as object), ...body.config };
      const validated = parsePlatformConfig(
        existing.type,
        JSON.stringify(merged)
      );
      updateData.configJson = JSON.stringify(validated);
    }

    const updated = await prisma.platform.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      platform: updated,
      config: parsePlatformConfig(updated.type, updated.configJson),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeeded();
    const { id } = await context.params;
    const platform = await prisma.platform.findUnique({ where: { id } });
    if (!platform) {
      return NextResponse.json(
        { error: "Platform not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const adapter = createPlatformAdapter(platform);

    if (body.action === "connect") {
      const loginResult = await adapter.login();
      const updated = await prisma.platform.update({
        where: { id },
        data: {
          connected: loginResult.connected,
          loginStatus: loginResult.connected ? "connected" : "not_connected",
          lastError: loginResult.connected ? null : loginResult.message,
        },
      });
      return NextResponse.json({
        connected: loginResult.connected,
        message: loginResult.message,
        platform: updated,
      });
    }

    if (body.action === "health_check") {
      const health = await adapter.runHealthCheck();
      const updated = await prisma.platform.update({
        where: { id },
        data: {
          connected: health.sessionValid || platform.connected,
          loginStatus: health.sessionValid
            ? "connected"
            : platform.connected
              ? "expired"
              : "not_connected",
          healthStatus: health.overallStatus,
          healthDetailsJson: JSON.stringify(health),
          lastHealthCheckAt: new Date(),
        },
      });
      return NextResponse.json({ health, platform: updated });
    }

    if (body.action === "check_login") {
      const loggedIn = await adapter.checkLogin();
      const updated = await prisma.platform.update({
        where: { id },
        data: {
          connected: loggedIn,
          loginStatus: loggedIn ? "connected" : "expired",
        },
      });
      return NextResponse.json({ loggedIn, platform: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (id === "portfolio" || id === "linkedin" || id === "bdjobs") {
      return NextResponse.json(
        { error: "Core platforms cannot be deleted (you can disable them instead)." },
        { status: 400 }
      );
    }
    await prisma.platform.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
