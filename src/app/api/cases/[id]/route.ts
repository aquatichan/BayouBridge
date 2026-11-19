import { deleteCase, getCase } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET /api/cases/:id     the case's profile and documents (for picking up after a page reload)
// DELETE /api/cases/:id  forget the case and every file uploaded to it, right away
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rec = getCase((await params).id);
  if (!rec?.profile) return Response.json({ error: "This case has expired or was deleted." }, { status: 404 });
  const { name, address, language, sample } = rec.profile;
  return Response.json({ profile: { name, address, language, sample }, documents: rec.documents, state: rec.state ?? null });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!getCase(id)?.profile) return Response.json({ error: "Case not found." }, { status: 404 });
  deleteCase(id);
  return Response.json({ deleted: true });
}
