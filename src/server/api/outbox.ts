import { outbox } from "@/lib/store";

// GET /api/outbox?caseId=BB-0417: packets approved into the sandbox outbox
// during this server session (in memory; cleared on restart).
export async function GET(req: Request) {
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (!caseId) return Response.json({ error: "caseId is required" }, { status: 400 });
  return Response.json({ items: outbox(caseId) });
}
