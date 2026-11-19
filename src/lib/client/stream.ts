import type { ActivityEvent, CaseState, ExtractionSummary, TaskUpdate } from "@/lib/types";

// Browser side of POST /api/run/stream (Server-Sent Events over a POST, so no EventSource).

export interface StreamHandlers {
  task: (t: TaskUpdate) => void;
  agent: (e: ActivityEvent) => void;
  state: (s: Partial<CaseState>) => void;
  done: (d: { state: CaseState; extraction: ExtractionSummary }) => void;
}

/** Split an SSE text buffer into complete frames; returns the frames and the unfinished rest. */
export function parseSSE(buf: string): { frames: { event: string; data: string }[]; rest: string } {
  const frames: { event: string; data: string }[] = [];
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const raw = buf.slice(0, i);
    buf = buf.slice(i + 2);
    let event = "message";
    const data: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) frames.push({ event, data: data.join("\n") }); // comment-only frames are keep-alives
  }
  return { frames, rest: buf };
}

export class RunError extends Error {}

/**
 * Run the agents with live updates. Resolves true when the run finished, false if streaming
 * isn't available (the caller can fall back to POST /api/run). Throws RunError for a problem
 * the person should see (expired case, nothing to read).
 */
export async function streamRun(body: object, on: StreamHandlers): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch("/api/run/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return false;
  }
  if (res.status === 400 || res.status === 404) throw new RunError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Bad request");
  if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("text/event-stream")) return false;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return false;
      const parsed = parseSSE(buf + value);
      buf = parsed.rest;
      for (const f of parsed.frames) {
        const data = JSON.parse(f.data);
        if (f.event === "task") on.task(data);
        else if (f.event === "agent") on.agent(data);
        else if (f.event === "state") on.state(data);
        else if (f.event === "done") { on.done(data); return true; }
        else if (f.event === "error") throw new RunError(data.message ?? "The agents couldn't finish.");
      }
    }
  } catch (e) {
    if (e instanceof RunError) throw e;
    return false;
  } finally {
    reader.cancel().catch(() => {});
  }
}
