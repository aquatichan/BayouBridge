import { outbox } from "@/lib/store";

// GET /api/outbox?caseId=BB-0417: packets approved into the sandbox outbox.
// The outbox is persisted with the case, so approvals survive a restart.
export async function GET(req: Request) {
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (!caseId) return Response.json({ error: "caseId is required" }, { status: 400 });
  return Response.json({ items: await outbox(caseId) });
}
