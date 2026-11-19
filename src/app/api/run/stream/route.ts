import { CaseError } from "@/lib/cases";
import { readRunRequest, runRequested } from "@/lib/runRequest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Minimum gap between activity events on the wire. Rules-mode runs finish in
 *  milliseconds; this keeps them watchable. Real Claude latency is never padded. */
const MIN_EVENT_GAP_MS = 250;
const KEEP_ALIVE_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /api/run/stream — the same run as POST /api/run, streamed as
// Server-Sent Events while the agents work:
//   event: task   { id, agent, label, status: "started" | "done" }
//   event: agent  ActivityEvent (one per activity-log line)
//   event: state  Partial<CaseState> (the slice a task just produced)
//   event: done   { state, extraction } (authoritative final state)
//   event: error  { message }
// Body (optional): { addDocumentIds?: string[] }, same allow-list as /api/run.
export async function POST(req: Request) {
  const parsed = await readRunRequest(req);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: parsed.status });

  const enc = new TextEncoder();
  let closed = false;
  const stopped = () => closed || req.signal.aborted;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        if (stopped()) return;
        try { controller.enqueue(enc.encode(chunk)); } catch { closed = true; } // client went away
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      // Frames go out in order. Only `agent` frames are spaced out, and only
      // when they arrive faster than MIN_EVENT_GAP_MS.
      const queue: [string, unknown][] = [];
      let pumping = false;
      let lastAgent = 0;
      const pump = async () => {
        if (pumping) return;
        pumping = true;
        try {
          while (queue.length && !stopped()) {
            const [event, data] = queue[0];
            if (event === "agent") {
              const wait = lastAgent + MIN_EVENT_GAP_MS - Date.now();
              if (wait > 0) await sleep(wait);
              lastAgent = Date.now();
            }
            queue.shift();
            send(event, data);
          }
        } finally {
          pumping = false;
        }
      };
      const push = (event: string, data: unknown) => { queue.push([event, data]); void pump(); };
      const drain = async () => { while ((queue.length || pumping) && !stopped()) await sleep(20); };

      const keepAlive = setInterval(() => write(": keep-alive\n\n"), KEEP_ALIVE_MS);
      try {
        const state = await runRequested(parsed, {
          onEvent: (e) => push("agent", e),
          onState: (s) => push("state", s),
          onTask: (t) => push("task", t),
          signal: req.signal,
        });
        await drain();
        send("done", { state, extraction: state.extraction });
      } catch (err) {
        await drain();
        if (err instanceof CaseError) send("error", { message: err.message });
        else {
          console.error("[BayouBridge] /api/run/stream failed:", err instanceof Error ? err.message : err);
          send("error", { message: "The agent pipeline failed. See the server log." });
        }
      } finally {
        clearInterval(keepAlive);
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed by the client */ }
        }
      }
    },
    cancel() {
      closed = true; // browser disconnected: stop writing; the run itself finishes on its own
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
