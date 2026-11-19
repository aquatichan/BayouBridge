import type { CaseState } from "@/lib/types";

// Demo-grade, in-memory case store. It lives on globalThis so it survives
// Next.js dev-server module reloads, and it resets when the server restarts.
// There is deliberately no database: everything here is synthetic demo data.

interface CaseRecord {
  /** The latest completed run for this case. */
  state: CaseState;
}

const g = globalThis as typeof globalThis & { __bayoubridgeStore?: Map<string, CaseRecord> };
const cases = (g.__bayoubridgeStore ??= new Map<string, CaseRecord>());

export function saveRun(state: CaseState): void {
  const rec = cases.get(state.caseId);
  if (rec) rec.state = state;
  else cases.set(state.caseId, { state });
}

export function lastRun(caseId: string): CaseState | undefined {
  return cases.get(caseId)?.state;
}
