import { syncBus } from "@/core/interaction-gate";
import { LiveBrowserState } from "@/core/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const sendState = (state: LiveBrowserState) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(state)}\n\n`)
          );
        } catch {
          // Stream closed
        }
      };

      // Send initial state immediately
      sendState(syncBus.getState());

      const listener = (state: LiveBrowserState) => {
        sendState(state);
      };

      syncBus.on("state", listener);

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          clearInterval(keepAlive);
        }
      }, 15000);

      cleanup = () => {
        clearInterval(keepAlive);
        syncBus.off("state", listener);
      };
    },
    cancel() {
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
