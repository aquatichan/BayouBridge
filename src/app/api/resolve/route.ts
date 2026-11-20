import { resolveConflict } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST /api/resolve { caseId, conflictId, value }: the household answers one of
// "things that don't match" (which date of loss, which spelling of a name). The
// value must be one the documents state. It is kept with the case and applied to
// every later run, so the conflict's plan step stays done.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { caseId?: unknown; conflictId?: unknown; value?: unknown } | null;
  if (typeof body?.caseId !== "string" || typeof body?.conflictId !== "string" || typeof body?.value !== "string") {
    return Response.json({ error: "caseId, conflictId and value are required" }, { status: 400 });
  }
  const r = resolveConflict(body.caseId, body.conflictId, body.value);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ conflicts: r.state.conflicts, plan: r.state.plan, events: r.events });
}
