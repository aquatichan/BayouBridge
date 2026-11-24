import type { ActivityEvent, CaseDocument, CaseState, OutboxItem, PlanTask } from "@/lib/types";
import { getKv } from "@/lib/kv";
import { seal, sealBytes, unseal, unsealBytes } from "@/lib/seal";

// The case store.
//
// Every case is one value in a key-value store (src/lib/kv.ts): Redis over
// HTTP when it is configured, so every serverless instance sees the same
// cases, or process memory when it isn't (local dev, tests). With Redis the
// value is encrypted with AES-256-GCM before it leaves the server
// (src/lib/seal.ts), and uploaded file bytes are encrypted and stored in
// chunks under their own keys. Session cases get a native expiry that is
// pushed out every time the case is used, so they vanish CASE_TTL_MS after
// last use; "Delete my case" removes every key at once.
//
// Changes to a case take a short lock, then read, change and write the whole
// record, so two requests (a double-clicked Approve) can't lose each other's update.
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
/** Uploaded bytes outlive the case record a little, and are re-extended on use, so they never expire first. After a case ends they are unreachable and gone within this slack. */
const FILE_TTL_MS = CASE_TTL_MS + 30 * 60 * 1000;
const FILE_REFRESH_MS = 15 * 60 * 1000;
const MAX_SESSION_CASES = 200;
const CHUNK_CHARS = 400_000; // keeps every Redis request well under 1 MB
const LOCK_MS = 10_000;

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

/** Where a file's bytes are kept. The bytes themselves never sit in the case record. */
export interface StoredFile { mime: string; chunks: number }

export interface CaseRecord {
  /** The latest completed run, with approvals applied. Missing until the first run. */
  state?: CaseState;
  /** Session cases only. */
  profile?: CaseProfile;
  documents: CaseDocument[];
  /** Uploaded files by document id. Read the bytes with readFile(). Never sent to the browser. */
  files: Record<string, StoredFile>;
  approvals: Record<string, { by: string; at: string }>;
  /** The household's answers to "things that don't match", by conflict id. */
  resolutions: Record<string, string>;
  outbox: OutboxItem[];
  /** Events logged after the run (approvals), so new events get fresh seq numbers. */
  extraEvents: ActivityEvent[];
  /** Claude calls made for this case so far (see MAX_CLAUDE_READS in cases.ts). */
  claudeReads: number;
  /** When the file chunks' expiry was last pushed out. */
  filesTouchedAt: number;
}

const kv = () => getKv();
const caseKey = (id: string) => `bb:case:${id}`;
const lockKey = (id: string) => `bb:lock:${id}`;
const fileKey = (id: string, docId: string, n: number) => `bb:file:${id}:${docId}:${n}`;
const SESSIONS = "bb:sessions";
const ttlFor = (rec: Pick<CaseRecord, "profile">) => (rec.profile ? CASE_TTL_MS : undefined);

const blank = (now: number): CaseRecord => ({ documents: [], files: {}, approvals: {}, resolutions: {}, outbox: [], extraEvents: [], claudeReads: 0, filesTouchedAt: now });
const parse = (raw: string | null): CaseRecord | undefined => (raw === null ? undefined : { ...blank(0), ...(JSON.parse(unseal(raw)) as CaseRecord) });
const fileKeys = (id: string, files: Record<string, StoredFile>) => Object.entries(files).flatMap(([docId, f]) => Array.from({ length: f.chunks }, (_, n) => fileKey(id, docId, n)));

/** Run `fn` holding the case's lock, so read-change-write cycles on one case never interleave across requests or instances. */
async function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
  let token: string | null = null;
  for (let i = 0; i < 60 && !token; i++) {
    token = await kv().lock(lockKey(id), LOCK_MS);
    if (!token) await new Promise((r) => setTimeout(r, 50));
  }
  if (!token) throw new Error("This case is busy. Please try again in a moment.");
  try { return await fn(); } finally { await kv().unlock(lockKey(id), token); }
}

/** Change a case in one locked read-change-write. Returns what `fn` returns, or undefined when there is no such case. */
export async function updateCase<T>(caseId: string, fn: (rec: CaseRecord) => T, now = Date.now()): Promise<T | undefined> {
  return locked(caseId, async () => {
    const rec = parse(await kv().get(caseKey(caseId), undefined, now));
    if (!rec) return undefined;
    const out = fn(rec);
    await kv().set(caseKey(caseId), seal(JSON.stringify(rec)), ttlFor(rec), now);
    return out;
  });
}

async function removeCase(caseId: string, rec: CaseRecord | undefined): Promise<void> {
  await kv().del(caseKey(caseId), ...(rec ? fileKeys(caseId, rec.files) : []));
  await kv().zrem(SESSIONS, caseId);
}

export async function createSessionCase(profile: Omit<CaseProfile, "createdAt">, documents: CaseDocument[] = [], now = Date.now()): Promise<string> {
  // Keep the number of live session cases bounded: forget the ones that have aged out, then make room by dropping the oldest.
  await kv().zremrangebyscore(SESSIONS, now - CASE_TTL_MS);
  while ((await kv().zcard(SESSIONS)) >= MAX_SESSION_CASES) {
    const oldest = await kv().zpopmin(SESSIONS);
    if (!oldest) break;
    await removeCase(oldest, parse(await kv().get(caseKey(oldest))));
  }
  const id = crypto.randomUUID();
  const rec: CaseRecord = { ...blank(now), profile: { ...profile, createdAt: now }, documents };
  await kv().set(caseKey(id), seal(JSON.stringify(rec)), CASE_TTL_MS, now);
  await kv().zadd(SESSIONS, now, id);
  return id;
}

/** A session case, if it exists and hasn't expired. Using it keeps it alive (and keeps its uploaded files alive with it). */
export async function getCase(caseId: string, now = Date.now()): Promise<CaseRecord | undefined> {
  const rec = parse(await kv().get(caseKey(caseId), CASE_TTL_MS, now));
  if (!rec) return undefined;
  if (rec.profile && Object.keys(rec.files).length && now - rec.filesTouchedAt > FILE_REFRESH_MS) {
    await kv().pexpire(fileKeys(caseId, rec.files), FILE_TTL_MS);
    rec.filesTouchedAt = now;
    await updateCase(caseId, (r) => { r.filesTouchedAt = now; }, now);
  }
  return rec;
}

async function writeFile(caseId: string, docId: string, file: UploadedFile): Promise<StoredFile> {
  const sealed = sealBytes(file.data);
  const parts: string[] = [];
  for (let i = 0; i < sealed.length; i += CHUNK_CHARS) parts.push(sealed.slice(i, i + CHUNK_CHARS));
  if (!parts.length) parts.push("");
  for (let i = 0; i < parts.length; i += 4) {
    await Promise.all(parts.slice(i, i + 4).map((p, k) => kv().set(fileKey(caseId, docId, i + k), p, FILE_TTL_MS)));
  }
  return { mime: file.mime, chunks: parts.length };
}

/** The bytes of one uploaded file, or undefined if it's gone. */
export async function readFile(caseId: string, docId: string, meta: StoredFile | undefined): Promise<UploadedFile | undefined> {
  if (!meta) return undefined;
  const parts = await Promise.all(Array.from({ length: meta.chunks }, (_, n) => kv().get(fileKey(caseId, docId, n))));
  if (parts.some((p) => p === null)) return undefined;
  return { mime: meta.mime, data: unsealBytes(parts.join("")) };
}

export async function addDocuments(caseId: string, docs: { doc: CaseDocument; file?: UploadedFile }[]): Promise<boolean> {
  const stored: Record<string, StoredFile> = {};
  for (const { doc, file } of docs) if (file) stored[doc.id] = await writeFile(caseId, doc.id, file);
  const ok = await updateCase(caseId, (rec) => {
    for (const { doc } of docs) rec.documents.push(doc);
    Object.assign(rec.files, stored);
    return true;
  });
  if (!ok) await kv().del(...fileKeys(caseId, stored)); // the case vanished while uploading
  return ok === true;
}

/** Forget a case and everything uploaded to it. */
export async function deleteCase(caseId: string): Promise<boolean> {
  return locked(caseId, async () => {
    const rec = parse(await kv().get(caseKey(caseId)));
    if (!rec) return false;
    await removeCase(caseId, rec);
    return true;
  });
}

/** Count one Claude read against this case's budget. False (and nothing counted) once `max` are used. */
export async function reserveClaudeRead(caseId: string, max: number): Promise<boolean> {
  return (await updateCase(caseId, (rec) => {
    if ((rec.claudeReads ?? 0) >= max) return false;
    rec.claudeReads = (rec.claudeReads ?? 0) + 1;
    return true;
  })) === true;
}

/** Add documents to a case if it doesn't have them yet, keeping `order`'s ordering. For sample households' papers. */
export async function addSampleDocuments(caseId: string, docs: CaseDocument[], order: (id: string) => number): Promise<CaseDocument[]> {
  return (await updateCase(caseId, (rec) => {
    for (const d of docs) if (!rec.documents.some((x) => x.id === d.id)) rec.documents.push(d);
    rec.documents.sort((a, b) => order(a.id) - order(b.id));
    return [...rec.documents];
  })) ?? [];
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
export async function saveRun(state: CaseState, now = Date.now()): Promise<CaseState> {
  return locked(state.caseId, async () => {
    const rec = parse(await kv().get(caseKey(state.caseId), undefined, now));
    if (!rec) {
      // The shared demo case (no profile, never expires) is created by its first run.
      const fresh: CaseRecord = { ...blank(now), state, documents: state.documents };
      await kv().set(caseKey(state.caseId), seal(JSON.stringify(fresh)), undefined, now);
      return state;
    }
    rec.state = withApprovals(state, rec);
    // Keeps what reading the files found out (kind, title, text), plus anything uploaded while the run was going.
    rec.documents = [...state.documents, ...rec.documents.filter((d) => !state.documents.some((x) => x.id === d.id))];
    rec.extraEvents = [];
    await kv().set(caseKey(state.caseId), seal(JSON.stringify(rec)), ttlFor(rec), now);
    return rec.state;
  });
}

export async function lastRun(caseId: string): Promise<CaseState | undefined> {
  return parse(await kv().get(caseKey(caseId)))?.state;
}

export async function outbox(caseId: string): Promise<OutboxItem[]> {
  return parse(await kv().get(caseKey(caseId)))?.outbox ?? [];
}

export type ResolveResult =
  | { ok: true; state: CaseState; events: ActivityEvent[] }
  | { ok: false; status: 400 | 404; error: string };

/**
 * The household answers one of "things that don't match" (which date, which spelling).
 * The answer must be one of the values the documents state. It is kept with the case
 * and applied to every later run, like an approval.
 */
export async function resolveConflict(caseId: string, conflictId: string, value: string): Promise<ResolveResult> {
  return (await updateCase(caseId, (rec): ResolveResult => {
  if (!rec?.state) return { ok: false, status: 404, error: "Case not found. Run the agents first." };
  const conflict = rec.state.conflicts.find((c) => c.id === conflictId);
  if (!conflict) return { ok: false, status: 404, error: "Unknown task. The plan may have changed; run the agents again." };
  if (!conflict.values.some((v) => v.value === value)) return { ok: false, status: 400, error: "Please choose one of the values your documents show." };
  (rec.resolutions ??= {})[conflictId] = value;
  rec.state = withApprovals(rec.state, rec);
  const seq = rec.state.events.length + rec.extraEvents.length;
  const events: ActivityEvent[] = [{
    seq: seq + 1, agent: "Evidence Agent", action: "Conflict resolved",
    detail: `${conflict.field}: the household confirmed "${value}". It is used the next time the drafts are prepared.`, minutesSaved: 3,
  }];
  rec.extraEvents.push(...events);
  return { ok: true, state: rec.state, events };
  })) ?? { ok: false, status: 404, error: "Case not found. Run the agents first." };
}

export type ApproveResult =
  | { ok: true; already: boolean; task: PlanTask; events: ActivityEvent[]; item: OutboxItem }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * The approval gate. Only POST /api/approve calls this. The change runs under
 * the case's lock, so two requests (a double click) can't both queue the packet.
 */
export async function approveTask(caseId: string, taskId: string): Promise<ApproveResult> {
  return (await updateCase(caseId, (rec): ApproveResult => {
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
  })) ?? { ok: false, status: 404, error: "Case not found. Run the agents first." };
}
