import { NextResponse } from "next/server";
import { DEMO_TODAY, documents, household } from "@/data/household";
import { runCase } from "@/lib/agents/coordinator";
import { extractWithClaude } from "@/lib/agents/llmExtract";

export const dynamic = "force-dynamic";

// POST /api/run — runs the full agent pipeline on the demo household.
// Uses Claude for extraction only when ANTHROPIC_API_KEY is set; otherwise the
// rules-based extractor. The response says which one ran.
export async function POST() {
  const useClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const state = await runCase({
    caseId: household.caseId,
    householdName: household.name,
    address: household.address,
    disaster: household.disaster,
    today: DEMO_TODAY,
    documents,
    extractor: useClaude ? extractWithClaude : undefined,
  });
  return NextResponse.json({ state, extraction: useClaude ? "claude" : "rules" });
}
