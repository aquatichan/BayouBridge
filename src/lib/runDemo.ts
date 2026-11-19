import { DEMO_TODAY, documents, household } from "@/data/household";
import { runCase } from "@/lib/agents/coordinator";
import { extractWithClaude } from "@/lib/agents/llmExtract";
import type { CaseState } from "@/lib/types";

// One entry point for running the demo case, shared by the API route and
// scripts/run-demo.ts so both take exactly the same path.

/** Claude extraction is used only when a key is set on the server. */
export const claudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function runDemoCase(): Promise<CaseState> {
  const base = {
    caseId: household.caseId,
    householdName: household.name,
    address: household.address,
    disaster: household.disaster,
    today: DEMO_TODAY,
    documents,
  };
  if (!claudeConfigured()) return runCase(base);
  try {
    return await runCase({ ...base, extractor: extractWithClaude });
  } catch (err) {
    // Per-document fallbacks normally absorb Claude problems. If the run still
    // fails, run it once more entirely offline so the caller always gets a case.
    console.error("[BayouBridge] Claude run failed, rerunning with the rules engine:", err);
    return runCase(base);
  }
}
