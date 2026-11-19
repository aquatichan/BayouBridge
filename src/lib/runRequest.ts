import { followUpDocuments } from "@/data/household";
import type { RunHooks } from "@/lib/agents/coordinator";
import { runSessionCase } from "@/lib/cases";
import { runDemoCase } from "@/lib/runDemo";
import { getCase } from "@/lib/store";
import type { CaseState } from "@/lib/types";

// The body accepted by POST /api/run and /api/run/stream:
//   {}                                   the shared synthetic demo case (classic dashboard)
//   { addDocumentIds: ["doc-..."] }      the demo case plus allow-listed follow-up documents
//   { caseId }                           a session case from the consumer flow
//   { caseId, incremental: true }        the same, reusing documents read in its last run

export interface RunRequest { caseId?: string; addDocumentIds?: string[]; incremental?: boolean }

export async function readRunRequest(req: Request): Promise<RunRequest | { error: string; status: 400 | 404 }> {
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const out: RunRequest = {};
  if (body.caseId !== undefined) {
    if (typeof body.caseId !== "string" || body.caseId.length > 100) return { error: "caseId must be a string", status: 400 };
    if (!getCase(body.caseId)?.profile) return { error: "This case has expired or was deleted. Please start again.", status: 404 };
    out.caseId = body.caseId;
    out.incremental = body.incremental === true;
    return out;
  }
  const ids = body.addDocumentIds;
  if (ids === undefined) return out;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) return { error: "addDocumentIds must be an array of document ids", status: 400 };
  const unknown = ids.filter((id) => !followUpDocuments.some((d) => d.id === id));
  if (unknown.length) return { error: `Unknown document id: ${unknown.join(", ")}`, status: 400 };
  out.addDocumentIds = ids;
  return out;
}

export function runRequested(r: RunRequest, hooks: RunHooks = {}): Promise<CaseState> {
  return r.caseId
    ? runSessionCase(r.caseId, { incremental: r.incremental, ...hooks })
    : runDemoCase({ addDocumentIds: r.addDocumentIds, ...hooks });
}
