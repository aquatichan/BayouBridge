import type { ActivityEvent, CaseDocument, CaseState, OutboxItem, PlanTask } from "@/lib/types";
import { loadEncrypted, persistenceEnabled, saveEncrypted } from "@/lib/persistentStore";

// Persistent, encrypted case store.
//
// Cases live in memory for speed, and are also written to an encrypted
// file on the server's disk (src/lib/persistentStore.ts, data/cases.enc,
// AES-256-GCM) after every change, so they survive a server restart on
// that server. On start, the file is loaded back into memory. The demo
// case (BB-0417, synthetic) and session cases are all persisted the same
// way; session cases still expire CASE_TTL_MS after their last use, and
// deleting a case deletes it from disk too.
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
//
// Limit, stated plainly in the privacy page: the file lives on one
// server's disk, so it does not share cases across separate serverless
// function instances. A production deployment that needs that should
// move to an external store.

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
  /** Claude calls made for this case so far (see MAX_CLAUDE_READS in cases.ts). */
  claudeReads: number;
  touchedAt: number;
}

const g = globalThis as typeof globalThis & { __bayoubridgeStore?: Map<string, CaseRecord> };
const cases = (g.__bayoubridgeStore ??= new Map<string, CaseRecord>());

// --- Encrypted persistence -------------------------------------------------
// Uploaded file bytes are base64 inside the serialised JSON, so they are
// encrypted at rest along with the rest of the case.

interface SerializedRecord {
  state?: CaseState;
  profile?: CaseProfile;
  documents: CaseDocument[];
  files: { id: string; mime: string; data: string }[];
  approvals: Record<string, { by: string; at: string }>;
  resolutions: Record<string, string>;
  outbox: OutboxItem[];
  extraEvents: ActivityEvent[];
  claudeReads: number;
  touchedAt: number;
}

function serializeCases(): string {
  const entries: [string, SerializedRecord][] = [...cases.entries()].map(([id, rec]) => [
    id,
    {
      state: rec.state,
      profile: rec.profile,
      documents: rec.documents,
      files: [...rec.files.entries()].map(([fid, f]) => ({ id: fid, mime: f.mime, data: f.data.toString("base64") })),
      approvals: rec.approvals,
      resolutions: rec.resolutions,
      outbox: rec.outbox,
      extraEvents: rec.extraEvents,
      claudeReads: rec.claudeReads,
      touchedAt: rec.touchedAt,
    },
  ]);
  return JSON.stringify(entries);
}

function deserializeCases(raw: string, now: number): void {
  const entries = JSON.parse(raw) as [string, SerializedRecord][];
  for (const [id, s] of entries) {
    // Expired session cases are not resurrected on restart.
    if (s.profile && now - s.touchedAt > CASE_TTL_MS) continue;
    cases.set(id, {
      state: s.state,
      profile: s.profile,
      documents: s.documents ?? [],
      files: new Map((s.files ?? []).map((f) => [f.id, { mime: f.mime, data: Buffer.from(f.data, "base64") }])),
      approvals: s.approvals ?? {},
      resolutions: s.resolutions ?? {},
      outbox: s.outbox ?? [],
      extraEvents: s.extraEvents ?? [],
      claudeReads: s.claudeReads ?? 0,
      touchedAt: s.touchedAt,
    });
  }
}

let loadedFromDisk = false;

/** Load saved cases once per process, on first use. A corrupt / wrong-key file logs and starts empty rather than crashing the server. */
function ensureLoaded(now = Date.now()): void {
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  if (!persistenceEnabled()) return;
  try {
    const raw = loadEncrypted();
    if (raw) deserializeCases(raw, now);
  } catch (err) {
    console.error("[BayouBridge] Could not load saved cases, starting empty:", err instanceof Error ? err.message : err);
  }
}

/** Write the whole in-memory store to the encrypted file. Best-effort: a disk failure logs and never fails the request. */
function persist(): void {
  if (!persistenceEnabled()) return;
  try {
    saveEncrypted(serializeCases());
  } catch (err) {
    console.error("[BayouBridge] Could not save cases:", err instanceof Error ? err.message : err);
  }
}

/** Test-only: drop the in-memory store and force a reload from disk, simulating a server restart. */
export function __clearMemoryForTests(): void {
  cases.clear();
  loadedFromDisk = false;
}

/** Test-only: force a reload from disk on next access. */
export function __reloadForTests(): void {
  loadedFromDisk = false;
  ensureLoaded();
}

const blank = (now: number): Omit<CaseRecord, "documents"> => ({ files: new Map(), approvals: {}, resolutions: {}, outbox: [], extraEvents: [], claudeReads: 0, touchedAt: now });

/** Drop session cases that haven't been used for CASE_TTL_MS. The shared demo case holds no personal data and stays. */
function sweep(now: number) {
  let dropped = false;
  for (const [id, rec] of cases) if (rec.profile && now - rec.touchedAt > CASE_TTL_MS) { cases.delete(id); dropped = true; }
  if (dropped) persist();
}

export function createSessionCase(profile: Omit<CaseProfile, "createdAt">, documents: CaseDocument[] = [], now = Date.now()): string {
  ensureLoaded(now);
  sweep(now);
  const sessions = [...cases.entries()].filter(([, r]) => r.profile).sort((a, b) => a[1].touchedAt - b[1].touchedAt);
  while (sessions.length >= MAX_SESSION_CASES) cases.delete(sessions.shift()![0]);
  const id = crypto.randomUUID();
  cases.set(id, { ...blank(now), profile: { ...profile, createdAt: now }, documents });
  persist();
  return id;
}

/** A session case, if it exists and hasn't expired. Using it keeps it alive. */
export function getCase(caseId: string, now = Date.now()) {
  ensureLoaded(now);
  sweep(now);
  const rec = cases.get(caseId);
  if (rec) rec.touchedAt = now;
  return rec;
}

export function addDocuments(caseId: string, docs: { doc: CaseDocument; file?: UploadedFile }[]) {
  ensureLoaded();
  const rec = cases.get(caseId);
  if (!rec) return false;
  for (const { doc, file } of docs) {
    rec.documents.push(doc);
    if (file) rec.files.set(doc.id, file);
  }
  persist();
  return true;
}

/** Forget a case and everything uploaded to it. */
export function deleteCase(caseId: string): boolean {
  ensureLoaded();
  const deleted = cases.delete(caseId);
  if (deleted) persist();
  return deleted;
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
  ensureLoaded(now);
  const rec = cases.get(state.caseId);
  if (!rec) {
    cases.set(state.caseId, { ...blank(now), state, documents: state.documents });
    persist();
    return state;
  }
  rec.state = withApprovals(state, rec);
  // Keeps what reading the files found out (kind, title, text), plus anything uploaded while the run was going.
  rec.documents = [...state.documents, ...rec.documents.filter((d) => !state.documents.some((x) => x.id === d.id))];
  rec.extraEvents = [];
  rec.touchedAt = now;
  persist();
  return rec.state;
}

export function lastRun(caseId: string): CaseState | undefined {
  ensureLoaded();
  return cases.get(caseId)?.state;
}

export function outbox(caseId: string): OutboxItem[] {
  ensureLoaded();
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
  ensureLoaded();
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
    detail: `${conflict.field}: the household confirmed "${value}". It is used the next time the drafts are prepared.`, minutesSaved: 3,
  }];
  rec.extraEvents.push(...events);
  persist();
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
  ensureLoaded();
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
  persist();
  return { ok: true, already: false, task: { ...task, approved: true }, events, item };
}
