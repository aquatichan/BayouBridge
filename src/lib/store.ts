import type { ActivityEvent, CaseDocument, CaseState, OutboxItem, PlanTask } from "@/lib/types";

// Demo-grade, in-memory case store. It lives on globalThis so it survives
// Next.js dev-server module reloads, and everything in it is gone when the
// server restarts. There is deliberately no database and nothing is written
// to disk.
//
// Two kinds of case live here:
// - the shared demo case (BB-0417, synthetic, used by scripts and the golden test), and
// - session cases from the consumer flow ("Start my case" or "Try a sample
//   case"), each under an unguessable random id. A session case can hold a
//   person's real uploads, so it expires CASE_TTL_MS after its last use and
//   can be deleted at once with DELETE /api/cases/:id.
//
// Nothing in here is ever sent anywhere: no email, no submissions. Approved
// packets go to the sandbox outbox only.

export const CASE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SESSION_CASES = 200;

export interface CaseProfile {
  name: string;
  address: string;
  language: "en" | "es";
  /** A private copy of a synthetic sample household, not real data. */
  sample: boolean;
  /** Which sample household (sample cases only). */
  demo?: "reyes" | "johnson" | "nguyen";
  createdAt: number;
}

export interface UploadedFile { mime: string; data: Buffer }

interface CaseRecord {
  /** The latest completed run, with approvals applied. Missing until the first run. */
  state?: CaseState;
  /** Session cases only. */
  profile?: CaseProfile;
  documents: CaseDocument[];
  /** Raw bytes of uploaded files, by document id. Never sent to the browser. */
  files: Map<string, UploadedFile>;
  approvals: Record<string, { by: string; at: string }>;
  /** The household's answers to "things that don't match", by conflict id. */
  resolutions: Record<string, string>;
  outbox: OutboxItem[];
  /** Events logged after the run (approvals), so new events get fresh seq numbers. */
  extraEvents: ActivityEvent[];
  touchedAt: number;
}

const g = globalThis as typeof globalThis & { __bayoubridgeStore?: Map<string, CaseRecord> };
const cases = (g.__bayoubridgeStore ??= new Map<string, CaseRecord>());

const blank = (now: number): Omit<CaseRecord, "documents"> => ({ files: new Map(), approvals: {}, resolutions: {}, outbox: [], extraEvents: [], touchedAt: now });

/** Drop session cases that haven't been used for CASE_TTL_MS. The shared demo case holds no personal data and stays. */
function sweep(now: number) {
  for (const [id, rec] of cases) if (rec.profile && now - rec.touchedAt > CASE_TTL_MS) cases.delete(id);
}

export function createSessionCase(profile: Omit<CaseProfile, "createdAt">, documents: CaseDocument[] = [], now = Date.now()): string {
  sweep(now);
  const sessions = [...cases.entries()].filter(([, r]) => r.profile).sort((a, b) => a[1].touchedAt - b[1].touchedAt);
  while (sessions.length >= MAX_SESSION_CASES) cases.delete(sessions.shift()![0]);
  const id = crypto.randomUUID();
  cases.set(id, { ...blank(now), profile: { ...profile, createdAt: now }, documents });
  return id;
}

/** A session case, if it exists and hasn't expired. Using it keeps it alive. */
export function getCase(caseId: string, now = Date.now()) {
  sweep(now);
  const rec = cases.get(caseId);
  if (rec) rec.touchedAt = now;
  return rec;
}

export function addDocuments(caseId: string, docs: { doc: CaseDocument; file?: UploadedFile }[]) {
  const rec = cases.get(caseId);
  if (!rec) return false;
  for (const { doc, file } of docs) {
    rec.documents.push(doc);
    if (file) rec.files.set(doc.id, file);
  }
  return true;
}

/** Forget a case and everything uploaded to it. */
export function deleteCase(caseId: string): boolean {
  return cases.delete(caseId);
}

/** Carry earlier approvals onto a (possibly new) plan. Task ids are stable across runs. */
function withApprovals(state: CaseState, rec: Pick<CaseRecord, "approvals" | "outbox" | "resolutions">): CaseState {
  const answers = rec.resolutions ?? {};
  return {
    ...state,
    conflicts: state.conflicts.map((c) => (answers[c.id] ? { ...c, resolved: answers[c.id] } : c)),
    plan: state.plan.map((t) => {
      const answer = answers[t.id.replace(/^task:/, "")];
      if (answer) return { ...t, status: "done" as const, detail: `Confirmed: ${answer}` };
      return rec.approvals[t.id] && t.status !== "blocked" ? { ...t, approved: true } : t;
    }),
    packets: state.packets.map((p) => (rec.outbox.some((o) => o.packet.id === p.id) ? { ...p, status: "queued" } : p)),
  };
}

/** Store a finished run and return it with this case's approvals applied. */
export function saveRun(state: CaseState, now = Date.now()): CaseState {
  const rec = cases.get(state.caseId);
  if (!rec) {
    cases.set(state.caseId, { ...blank(now), state, documents: state.documents });
    return state;
  }
  rec.state = withApprovals(state, rec);
  rec.documents = state.documents; // keeps what reading the files found out (kind, title, text)
  rec.extraEvents = [];
  rec.touchedAt = now;
  return rec.state;
}

export function lastRun(caseId: string): CaseState | undefined {
  return cases.get(caseId)?.state;
}

export function outbox(caseId: string): OutboxItem[] {
  return cases.get(caseId)?.outbox ?? [];
}

export type ResolveResult =
  | { ok: true; state: CaseState; events: ActivityEvent[] }
  | { ok: false; status: 400 | 404; error: string };

/**
 * The household answers one of "things that don't match" (which date, which spelling).
 * The answer must be one of the values the documents state. It is kept with the case
 * and applied to every later run, like an approval.
 */
export function resolveConflict(caseId: string, conflictId: string, value: string): ResolveResult {
  const rec = cases.get(caseId);
  if (!rec?.state) return { ok: false, status: 404, error: "Case not found. Run the agents first." };
  const conflict = rec.state.conflicts.find((c) => c.id === conflictId);
  if (!conflict) return { ok: false, status: 404, error: "Unknown task. The plan may have changed; run the agents again." };
  if (!conflict.values.some((v) => v.value === value)) return { ok: false, status: 400, error: "Please choose one of the values your documents show." };
  // Cases kept in memory from before answers existed (a dev-server reload keeps the store) have none yet.
  (rec.resolutions ??= {})[conflictId] = value;
  rec.state = withApprovals(rec.state, rec);
  rec.touchedAt = Date.now();
  const seq = rec.state.events.length + rec.extraEvents.length;
  const events: ActivityEvent[] = [{
    seq: seq + 1, agent: "Evidence Agent", action: "Conflict resolved",
    detail: `${conflict.field}: the household confirmed "${value}". Later drafts use it.`, minutesSaved: 3,
  }];
  rec.extraEvents.push(...events);
  return { ok: true, state: rec.state, events };
}

export type ApproveResult =
  | { ok: true; already: boolean; task: PlanTask; events: ActivityEvent[]; item: OutboxItem }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * The approval gate. Only POST /api/approve calls this. Synchronous on
 * purpose: Node runs it start to finish, so two requests can't interleave.
 */
export function approveTask(caseId: string, taskId: string): ApproveResult {
  const rec = cases.get(caseId);
  if (!rec?.state) return { ok: false, status: 404, error: "Case not found. Run the agents first." };
  // In the consumer flow the household approves for themselves; the shared demo case (scripts) is a navigator.
  const by = rec.profile ? "You" : "Navigator (demo)";
  const task = rec.state.plan.find((t) => t.id === taskId);
  if (!task) return { ok: false, status: 404, error: "Unknown task. The plan may have changed; run the agents again." };
  if (task.status === "blocked") return { ok: false, status: 409, error: `This task is blocked. ${task.detail}` };
  if (!task.requiresApproval) return { ok: false, status: 400, error: "This task doesn't send anything, so there is nothing to approve." };
  const packet = rec.state.packets.find((p) => p.programId === task.programId);
  if (!packet) return { ok: false, status: 409, error: "No packet has been drafted for this task yet." };

  const existing = rec.outbox.find((o) => o.taskId === taskId);
  if (existing) return { ok: true, already: true, task: { ...task, approved: true }, events: [], item: existing };

  const at = new Date().toISOString();
  rec.approvals[taskId] = { by, at };
  const item: OutboxItem = {
    id: `outbox-${rec.outbox.length + 1}`,
    caseId, taskId,
    packet: { ...packet, status: "queued" },
    approvedBy: by,
    queuedAt: at,
  };
  rec.outbox.push(item);
  rec.state = withApprovals(rec.state, rec);

  const seq = rec.state.events.length + rec.extraEvents.length;
  const events: ActivityEvent[] = [
    { seq: seq + 1, agent: "Safety Agent", action: "Approval recorded", detail: `${by} approved: "${task.title}"`, minutesSaved: 0 },
    {
      seq: seq + 2, agent: "Packet Agent", action: "Queued to sandbox outbox",
      detail: `${packet.title} with ${packet.attachments.length} attachment${packet.attachments.length === 1 ? "" : "s"}. Simulated send only: nothing leaves BayouBridge.`,
      refs: packet.attachments.map((a) => a.docId), minutesSaved: 6,
    },
  ];
  rec.extraEvents.push(...events);
  return { ok: true, already: false, task: { ...task, approved: true }, events, item };
}
