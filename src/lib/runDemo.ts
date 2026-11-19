import { DEMO_TODAY, documents, followUpDocuments, household } from "@/data/household";
import { runCase, type RunHooks } from "@/lib/agents/coordinator";
import { extractWithClaude } from "@/lib/agents/llmExtract";
import { lastRun, saveRun } from "@/lib/store";
import type { CaseState } from "@/lib/types";

// One entry point for running the demo case, shared by the API route and
// scripts/run-demo.ts so both take exactly the same path.

/** Claude extraction is used only when a key is set on the server. */
export const claudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

export class UnknownDocumentError extends Error {}

/** Parse the optional `{ addDocumentIds }` body shared by /api/run and /api/run/stream. */
export async function readRunRequest(req: Request): Promise<{ addDocumentIds?: string[] } | { error: string }> {
  const body: unknown = await req.json().catch(() => ({}));
  const ids = (body as { addDocumentIds?: unknown } | null)?.addDocumentIds;
  if (ids === undefined) return {};
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) return { error: "addDocumentIds must be an array of document ids" };
  const unknown = ids.filter((id) => !followUpDocuments.some((d) => d.id === id));
  if (unknown.length) return { error: `Unknown document id: ${unknown.join(", ")}` };
  return { addDocumentIds: ids };
}

export interface DemoRunOptions extends RunHooks {
  /**
   * Follow-up documents to add, by id. Only ids in `followUpDocuments` are
   * accepted; the server never takes document text from the browser. When
   * set, documents already read in this case's last run are reused.
   */
  addDocumentIds?: string[];
}

export async function runDemoCase(opts: DemoRunOptions = {}): Promise<CaseState> {
  const { addDocumentIds, ...hooks } = opts;
  const ids = [...new Set(addDocumentIds ?? [])];
  const unknown = ids.filter((id) => !followUpDocuments.some((d) => d.id === id));
  if (unknown.length) throw new UnknownDocumentError(`Unknown document id: ${unknown.join(", ")}`);
  // Base documents first, then follow-ups in allow-list order, so the order is stable.
  const docs = [...documents, ...followUpDocuments.filter((d) => ids.includes(d.id))];
  const reuse = ids.length ? lastRun(household.caseId)?.extractions : undefined;

  const base = {
    caseId: household.caseId,
    householdName: household.name,
    address: household.address,
    disaster: household.disaster,
    today: DEMO_TODAY,
    documents: docs,
    reuse,
  };
  let state: CaseState;
  if (!claudeConfigured()) state = await runCase({ ...base, ...hooks });
  else {
    try {
      state = await runCase({ ...base, ...hooks, extractor: extractWithClaude });
    } catch (err) {
      // Per-document fallbacks normally absorb Claude problems. If the run still
      // fails, run it once more entirely offline so the caller always gets a case.
      // (No live hooks on the rerun: the caller gets the final state as a whole.)
      console.error("[BayouBridge] Claude run failed, rerunning with the rules engine:", err);
      state = await runCase(base);
    }
  }
  saveRun(state);
  return state;
}
