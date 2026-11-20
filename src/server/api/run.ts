import { NextResponse } from "next/server";
import { CaseError } from "@/lib/cases";
import { UnknownDocumentError } from "@/lib/runDemo";
import { readRunRequest, runRequested } from "@/lib/runRequest";

// POST /api/run: the whole agent pipeline in one request. The browser uses it
// only when the live stream (/api/run/stream) is blocked. Body: see runRequest.ts.
// Claude problems fall back to rules per document, so this only fails on a real
// bug in the deterministic pipeline.
export async function POST(req: Request) {
  const parsed = await readRunRequest(req);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  try {
    const state = await runRequested(parsed);
    // `extraction` reports what actually ran per document, not whether a key is set.
    return NextResponse.json({ state, extraction: state.extraction });
  } catch (err) {
    if (err instanceof UnknownDocumentError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof CaseError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[BayouBridge] /api/run failed:", err);
    return NextResponse.json({ error: "The agent pipeline failed. See the server log." }, { status: 500 });
  }
}
