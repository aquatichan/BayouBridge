import { addUploads, CaseError, parseTyped } from "@/lib/cases";

// POST /api/cases/:id/documents (multipart/form-data)
//   files:     photos (JPEG, PNG, WebP, GIF), PDFs or text files, up to 10 per case, 8 MB each
//   statement: what happened, in the household's own words (typed or dictated)
//   typed:     JSON [{ kind, text }]: documents the household typed out instead of uploading
// Files are kept with the case in the encrypted case store (AES-256-GCM in Redis);
// a server restart or a different serverless instance does not lose them.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Send the files as multipart/form-data." }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const statement = form.get("statement");
  try {
    const docs = await addUploads(id, files, typeof statement === "string" ? statement : undefined, parseTyped(form.get("typed")));
    return Response.json({ documents: docs.map(({ id, title, filename, kind, source, mime }) => ({ id, title, filename, kind, source, mime })) });
  } catch (err) {
    if (err instanceof CaseError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
