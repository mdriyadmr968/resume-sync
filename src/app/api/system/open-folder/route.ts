import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filePath, mode = "select" } = body as {
      filePath?: string;
      mode?: "select" | "open_file";
    };

    if (!filePath) {
      return NextResponse.json(
        { error: "filePath is required" },
        { status: 400 }
      );
    }

    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return NextResponse.json(
        { error: `File not found at ${resolved}` },
        { status: 404 }
      );
    }

    if (mode === "open_file") {
      execFile("cmd.exe", ["/c", "start", "", resolved]);
    } else {
      execFile("explorer.exe", [`/select,${resolved}`]);
    }

    return NextResponse.json({ opened: true, path: resolved });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
