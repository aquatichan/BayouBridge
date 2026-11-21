import { approveTask } from "@/lib/store";

// POST /api/approve { caseId, taskId }: the only place a plan task can be
// approved. Checked against the plan the server produced in its last run:
// unknown case or task → 404, blocked task → 409, a task that sends nothing →
// 400. An approved packet goes to the in-memory sandbox outbox. Nothing is
// emailed, submitted or sent over the network.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { caseId?: unknown; taskId?: unknown } | null;
  if (typeof body?.caseId !== "string" || typeof body?.taskId !== "string") {
    return Response.json({ error: "caseId and taskId are required" }, { status: 400 });
  }
  const r = approveTask(body.caseId, body.taskId);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ already: r.already, task: r.task, events: r.events, item: r.item });
}
