import { CaseError, createSampleCase, createUserCase, sampleFollowUps } from "@/lib/cases";
import { getCase } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST /api/cases
//   { sample: true, demo?, language }                   a private copy of a synthetic sample household (reyes, johnson, nguyen)
//   { name?, address, language, consent: true }         a new case for the household's own documents
// Returns { caseId, profile, followUps }. Cases live in server memory only and expire after 2 hours.
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const caseId = body.sample === true ? createSampleCase(body.language, body.demo ?? "reyes") : createUserCase(body);
    const p = getCase(caseId)!.profile!;
    return Response.json({
      caseId, profile: { name: p.name, address: p.address, sample: p.sample, demo: p.demo },
      followUps: sampleFollowUps(p.demo), documentCount: getCase(caseId)!.documents.length,
    });
  } catch (err) {
    if (err instanceof CaseError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
