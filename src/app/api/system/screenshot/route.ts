import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getLogsBaseDir } from "@/core/paths";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const relPath = req.nextUrl.searchParams.get("path");
    if (!relPath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const logsRoot = getLogsBaseDir();
    const resolved = path.resolve(process.cwd(), relPath);

    // Ensure the requested file is inside the logs directory (prevent path traversal)
    if (!resolved.startsWith(logsRoot)) {
      return NextResponse.json({ error: "Forbidden path" }, { status: 403 });
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(resolved);
    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
