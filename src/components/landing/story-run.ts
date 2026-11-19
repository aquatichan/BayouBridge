import { DEMO_TODAY, documents, followUpDocuments, household } from "@/data/household";
import { runCase, type RunHooks } from "@/lib/agents/coordinator";
import type { CaseState } from "@/lib/types";

// The landing page's scroll story runs the real pipeline on the synthetic
// sample case, right in the browser with the rules engine: no server call,
// no API cost per visitor, same results as the app. Loaded only when the
// story section comes near the screen.

const base = {
  caseId: "landing-sample",
  householdName: household.name,
  address: household.address,
  disaster: household.disaster,
  today: DEMO_TODAY,
  approver: "household" as const,
};

export function runSample(hooks: RunHooks): Promise<CaseState> {
  return runCase({ ...base, documents, ...hooks });
}

/** The September electric bill arrives: only it is read; everything else is reused. */
export function runWithBill(before: CaseState, hooks: RunHooks): Promise<CaseState> {
  return runCase({ ...base, documents: [...documents, ...followUpDocuments], reuse: before.extractions, ...hooks });
}
