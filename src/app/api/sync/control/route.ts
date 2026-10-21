import { NextRequest, NextResponse } from "next/server";
import { syncBus, UserDecision } from "@/core/interaction-gate";
import { BrowserSessionManager } from "@/automation/core/browser-manager";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { command, decision } = body as {
      command: "pause" | "resume" | "stop" | "decision";
      decision?: UserDecision;
    };

    if (command === "pause") {
      syncBus.pause();
      return NextResponse.json({ liveState: syncBus.getState() });
    }

    if (command === "resume") {
      syncBus.resume();
      return NextResponse.json({ liveState: syncBus.getState() });
    }

    if (command === "stop") {
      syncBus.stop();
      await BrowserSessionManager.closeAllContexts();
      return NextResponse.json({ liveState: syncBus.getState() });
    }

    if (command === "decision" && decision) {
      syncBus.respondToPrompt(decision);
      return NextResponse.json({ liveState: syncBus.getState() });
    }

    return NextResponse.json({ error: "Invalid control command" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
