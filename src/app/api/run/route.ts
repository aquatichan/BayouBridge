import { NextResponse } from "next/server";
import { runDemoCase } from "@/lib/runDemo";

export const dynamic = "force-dynamic";
// Worst case with Claude is ~15 s (per-document limit, documents run in parallel).
export const maxDuration = 60;

// POST /api/run — runs the full agent pipeline on the demo household.
// Uses Claude for extraction only when ANTHROPIC_API_KEY is set; otherwise the
// rules-based extractor. Claude problems fall back to rules per document, so
// this only fails on a real bug in the deterministic pipeline.
export async function POST() {
  try {
    const state = await runDemoCase();
    // `extraction` reports what actually ran per document, not whether a key is set.
    return NextResponse.json({ state, extraction: state.extraction });
  } catch (err) {
    console.error("[BayouBridge] /api/run failed:", err);
    return NextResponse.json({ error: "The agent pipeline failed. See the server log." }, { status: 500 });
  }
}
