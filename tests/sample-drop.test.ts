import assert from "node:assert/strict";
import { test } from "node:test";
import { DELETE, GET, POST } from "../src/app/api/[...path]/route";
import { DEMOS } from "../src/data/demos";
import { createSampleCase, runSessionCase } from "../src/lib/cases";

// The app's sample flow: a sample case starts empty, the person drops the
// family's papers in (in any order, in batches), and the result matches a
// sample case that started with every paper. All through the one API route.
delete process.env.ANTHROPIC_API_KEY;

const call = (method: "GET" | "POST" | "DELETE", path: string, body?: unknown) => {
  const handler = { GET, POST, DELETE }[method];
  const req = new Request(`http://test/api/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return handler(req, { params: Promise.resolve({ path: path.split("?")[0].split("/") }) });
};

test("one API route serves every endpoint", async () => {
  assert.equal((await call("GET", "status")).status, 200);
  assert.equal((await call("GET", "nope")).status, 404);
  assert.equal((await call("DELETE", "status")).status, 405);
});

test("an empty sample case filled by drops ends where a full sample case does", async () => {
  const created = await call("POST", "cases", { sample: true, demo: "johnson", language: "en", empty: true });
  const { caseId, papers } = (await created.json()) as { caseId: string; papers: { id: string; stage: string }[] };
  assert.equal(papers.filter((p) => p.stage === "start").length, DEMOS.johnson.documents.length);
  assert.equal(papers.filter((p) => p.stage === "later").length, DEMOS.johnson.followUps.length);

  const start = papers.filter((p) => p.stage === "start").map((p) => p.id);
  // Dropped in two batches, the second first, to prove order doesn't matter.
  const run = async (ids: string[]) => {
    const r = await call("POST", "run", { caseId, incremental: true, addDocumentIds: ids });
    assert.equal(r.status, 200);
    return ((await r.json()) as { state: { documents: { id: string }[]; matches: { programId: string; readiness: number }[]; plan: { id: string }[] } }).state;
  };
  await run(start.slice(2));
  const dropped = await run(start.slice(0, 2));

  const full = await runSessionCase(await createSampleCase("en", "johnson"));
  assert.deepEqual(dropped.documents.map((d) => d.id), full.documents.map((d) => d.id));
  assert.deepEqual(dropped.matches.map((m) => [m.programId, m.readiness]), full.matches.map((m) => [m.programId, m.readiness]));
  assert.deepEqual(dropped.plan.map((t) => t.id), full.plan.map((t) => t.id));

  // Another family's paper is refused.
  const other = await call("POST", "run", { caseId, incremental: true, addDocumentIds: [DEMOS.nguyen.documents[0].id] });
  assert.equal(other.status, 200);
  assert(!((await other.json()) as { state: { documents: { id: string }[] } }).state.documents.some((d) => d.id === DEMOS.nguyen.documents[0].id));

  assert.equal((await call("GET", `cases/${caseId}`)).status, 200);
  assert.equal((await call("DELETE", `cases/${caseId}`)).status, 200);
  assert.equal((await call("POST", "run", { caseId })).status, 404);
});
