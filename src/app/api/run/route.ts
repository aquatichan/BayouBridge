import { NextResponse } from "next/server";
import { runDemoCase, UnknownDocumentError } from "@/lib/runDemo";

export const dynamic = "force-dynamic";
// Worst case with Claude is ~15 s (per-document limit, documents run in parallel).
export const maxDuration = 60;

// POST /api/run — runs the full agent pipeline on the demo household.
// Uses Claude for extraction only when ANTHROPIC_API_KEY is set; otherwise the
// rules-based extractor. Claude problems fall back to rules per document, so
// this only fails on a real bug in the deterministic pipeline.
//
// Body (optional): { addDocumentIds?: string[] } adds synthetic follow-up
// documents by id from the server's allow-list (e.g. the September electric bill).
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => ({}));
  const ids = (body as { addDocumentIds?: unknown })?.addDocumentIds;
  if (ids !== undefined && !(Array.isArray(ids) && ids.every((x) => typeof x === "string"))) {
    return NextResponse.json({ error: "addDocumentIds must be an array of document ids" }, { status: 400 });
  }
  try {
    const state = await runDemoCase({ addDocumentIds: ids as string[] | undefined });
    // `extraction` reports what actually ran per document, not whether a key is set.
    return NextResponse.json({ state, extraction: state.extraction });
  } catch (err) {
    if (err instanceof UnknownDocumentError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[BayouBridge] /api/run failed:", err);
    return NextResponse.json({ error: "The agent pipeline failed. See the server log." }, { status: 500 });
  }
}
