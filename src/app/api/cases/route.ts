import { CaseError, createSampleCase, createUserCase } from "@/lib/cases";

export const dynamic = "force-dynamic";

// POST /api/cases
//   { sample: true, language }                          a private copy of the synthetic sample case
//   { name?, address, language, consent: true }         a new case for the household's own documents
// Returns { caseId }. Cases live in server memory only and expire after 2 hours.
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const caseId = body.sample === true ? createSampleCase(body.language) : createUserCase(body);
    return Response.json({ caseId });
  } catch (err) {
    if (err instanceof CaseError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
