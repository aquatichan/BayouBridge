import { DEMO_TODAY, documents, household } from "../src/data/household";
import { extractWithRules } from "../src/lib/agents/evidence";
import type { ClaudeFact } from "../src/lib/agents/llmExtract";
import type { CaseDocument, CaseState } from "../src/lib/types";

export const base = {
  caseId: household.caseId,
  householdName: household.name,
  address: household.address,
  disaster: household.disaster,
  today: DEMO_TODAY,
  documents,
};

export const doc = (id: string) => documents.find((d) => d.id === id)!;

/** The rules extractor's facts, shaped like Claude's raw structured output. */
export const asClaude = (d: CaseDocument): ClaudeFact[] =>
  extractWithRules(d).facts.map((f) => ({
    type: f.type as ClaudeFact["type"], label: f.label, value: f.value,
    normalized: f.normalized ?? "", confidence: f.confidence, quote: f.quote,
  }));

/**
 * Everything the rules-mode pipeline outputs, minus the input documents. Rules
 * mode is fully deterministic (no clocks, no randomness), so all of it is
 * snapshotted: text changes in recovery.ts (e.g. Phase 9) must keep the Reyes
 * output byte-identical.
 */
export function stableView(s: CaseState) {
  return JSON.parse(JSON.stringify({
    extractions: s.extractions,
    people: s.people,
    needs: s.needs,
    conflicts: s.conflicts,
    matches: s.matches,
    evidenceScore: s.evidenceScore,
    followUp: s.followUp,
    plan: s.plan,
    packets: s.packets,
    graph: s.graph,
    events: s.events.map((e) => `[${e.agent}] ${e.action}: ${e.detail}`),
    minutesSaved: s.minutesSaved,
    extraction: s.extraction,
  }));
}
