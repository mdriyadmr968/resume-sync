import { NextRequest, NextResponse } from "next/server";
import {
  activateHistoricalResume,
  getCurrentResume,
  getResumeHistory,
  resolveGoogleResumeUrl,
  setMasterResumeFromGoogleUrl,
  setMasterResumeFromLocalFile,
  validateResumeFile,
} from "@/core/resume-manager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const refresh = req.nextUrl.searchParams.get("refresh") === "true";
    const currentResume = await getCurrentResume({
      refreshFromGoogle: refresh,
    });
    const history = await getResumeHistory();

    let validation = null;
    if (currentResume?.filePath) {
      validation = validateResumeFile(currentResume.filePath);
    }

    return NextResponse.json({
      currentResume,
      history,
      validation,
      defaultGoogleUrl:
        "https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/edit?usp=sharing",
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
    const body = await req.json();
    const { action } = body;

    if (action === "set_google_url") {
      const { url, fileName } = body;
      if (!url || typeof url !== "string") {
        return NextResponse.json(
          { error: "Please provide a valid Google Docs or Google Drive URL." },
          { status: 400 }
        );
      }
      const result = await setMasterResumeFromGoogleUrl(url, fileName);
      const history = await getResumeHistory();
      return NextResponse.json({
        currentResume: result.resume,
        isNewVersion: result.isNewVersion,
        history,
      });
    }

    if (action === "set_local_file") {
      const { filePath } = body;
      if (!filePath || typeof filePath !== "string") {
        return NextResponse.json(
          { error: "Please provide a valid local file path." },
          { status: 400 }
        );
      }
      const result = await setMasterResumeFromLocalFile(filePath);
      const history = await getResumeHistory();
      return NextResponse.json({
        currentResume: result.resume,
        isNewVersion: result.isNewVersion,
        history,
      });
    }

    if (action === "refresh") {
      const currentResume = await getCurrentResume({ refreshFromGoogle: true });
      const history = await getResumeHistory();
      return NextResponse.json({ currentResume, history });
    }

    if (action === "activate_version") {
      const { resumeId } = body;
      const currentResume = await activateHistoricalResume(resumeId);
      const history = await getResumeHistory();
      return NextResponse.json({ currentResume, history });
    }

    if (action === "preview_google_url") {
      const resolution = resolveGoogleResumeUrl(body.url || "");
      return NextResponse.json({ resolution });
    }

    if (action === "validate") {
      const current = await getCurrentResume();
      if (!current) {
        return NextResponse.json(
          { error: "No master resume selected." },
          { status: 400 }
        );
      }
      const validation = validateResumeFile(current.filePath);
      return NextResponse.json({ validation });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
