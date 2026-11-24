import { CaseError, createSampleCase, createUserCase, sampleFollowUps, samplePapers } from "@/lib/cases";
import { getCase } from "@/lib/store";

// POST /api/cases
//   { sample: true, demo?, language, empty? }           a private copy of a synthetic sample household (reyes, johnson, nguyen);
//                                                       with empty: true it starts with no papers and the app hands them out
//   { name?, address, language, consent: true }         a new case for the household's own documents
// Returns { caseId, profile, followUps, papers, documentCount }. Cases are
// stored encrypted (Redis when configured) and expire after 2 hours.
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const caseId = body.sample === true ? await createSampleCase(body.language, body.demo ?? "reyes", { empty: body.empty === true }) : await createUserCase(body);
    const rec = (await getCase(caseId))!;
    const p = rec.profile!;
    return Response.json({
      caseId, profile: { name: p.name, address: p.address, sample: p.sample, demo: p.demo },
      followUps: sampleFollowUps(p.demo), papers: samplePapers(p.demo), documentCount: rec.documents.length,
    });
  } catch (err) {
    if (err instanceof CaseError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
