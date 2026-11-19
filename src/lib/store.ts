import type { ActivityEvent, CaseState, OutboxItem, PlanTask } from "@/lib/types";

// Demo-grade, in-memory case store. It lives on globalThis so it survives
// Next.js dev-server module reloads, and it resets when the server restarts.
// There is deliberately no database: everything here is synthetic demo data.
//
// It holds the latest run per case (so approvals are checked against the plan
// the server produced, not one the browser sends), the approvals, and the
// sandbox outbox. Nothing in here is ever sent anywhere: there are no network
// calls, no email, no submissions.

interface CaseRecord {
  /** The latest completed run for this case, with approvals applied. */
  state: CaseState;
  approvals: Record<string, { by: string; at: string }>;
  outbox: OutboxItem[];
  /** Events logged after the run (approvals), so new events get fresh seq numbers. */
  extraEvents: ActivityEvent[];
}

const g = globalThis as typeof globalThis & { __bayoubridgeStore?: Map<string, CaseRecord> };
const cases = (g.__bayoubridgeStore ??= new Map<string, CaseRecord>());

/** Carry earlier approvals onto a (possibly new) plan. Task ids are stable across runs. */
function withApprovals(state: CaseState, rec: Pick<CaseRecord, "approvals" | "outbox">): CaseState {
  return {
    ...state,
    plan: state.plan.map((t) => (rec.approvals[t.id] && t.status !== "blocked" ? { ...t, approved: true } : t)),
    packets: state.packets.map((p) => (rec.outbox.some((o) => o.packet.id === p.id) ? { ...p, status: "queued" } : p)),
  };
}

/** Store a finished run and return it with this case's approvals applied. */
export function saveRun(state: CaseState): CaseState {
  const rec = cases.get(state.caseId);
  if (!rec) {
    cases.set(state.caseId, { state, approvals: {}, outbox: [], extraEvents: [] });
    return state;
  }
  rec.state = withApprovals(state, rec);
  rec.extraEvents = [];
  return rec.state;
}

export function lastRun(caseId: string): CaseState | undefined {
  return cases.get(caseId)?.state;
}

export function outbox(caseId: string): OutboxItem[] {
  return cases.get(caseId)?.outbox ?? [];
}

export type ApproveResult =
  | { ok: true; already: boolean; task: PlanTask; events: ActivityEvent[]; item: OutboxItem }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * The approval gate. Only POST /api/approve calls this. Synchronous on
 * purpose: Node runs it start to finish, so two requests can't interleave.
 */
export function approveTask(caseId: string, taskId: string, by = "Navigator (demo)"): ApproveResult {
  const rec = cases.get(caseId);
  if (!rec) return { ok: false, status: 404, error: "Case not found. Run the agents first." };
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
