import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as createCase } from "../src/server/api/cases";
import { POST as resolve } from "../src/server/api/resolve";
import { DEMO_CARDS, type DemoId } from "../src/data/demoList";
import { DEMOS } from "../src/data/demos";
import { runSessionCase } from "../src/lib/cases";
import { spanish } from "../src/lib/es";
import { approveTask } from "../src/lib/store";
import type { CaseState } from "../src/lib/types";

// Phase 3: each sample household, played the way the app plays it (a document
// "arrives" for each ask, the household answers each conflict and approves each
// packet), ends with every task done and every pathway at 100%. No model is ever
// called, even with a key set.
process.env.ANTHROPIC_API_KEY = "sk-test-not-used"; // proves sample cases ignore it

async function newSample(demo: DemoId) {
  const r = await createCase(new Request("http://test/api/cases", { method: "POST", body: JSON.stringify({ sample: true, demo, language: "en" }) }));
  return (await r.json()) as { caseId: string; profile: { name: string; address: string }; followUps: { id: string; title: string; provides: string }[] };
}

/** Play a demo to the end. Returns every state along the way. */
async function play(demo: DemoId) {
  const { caseId, followUps } = await newSample(demo);
  const states: CaseState[] = [await runSessionCase(caseId)];
  let s = states[0];
  for (let i = 0; s.followUp && i < 10; i++) {
    const next = followUps.find((f) => f.provides === s.followUp!.evidence && !s.documents.some((d) => d.id === f.id));
    assert(next, `${demo}: no sample document provides ${s.followUp.evidence}`);
    s = await runSessionCase(caseId, { incremental: true, addDocumentIds: [next.id] });
    states.push(s);
  }
  for (const c of s.conflicts) {
    const r = await resolve(new Request("http://test/api/resolve", { method: "POST", body: JSON.stringify({ caseId, conflictId: c.id, value: c.values[0].value }) }));
    assert.equal(r.status, 200);
  }
  for (const t of s.plan.filter((x) => x.status === "needs_approval")) assert(approveTask(caseId, t.id).ok, `${demo}: could not approve ${t.id}`);
  // One more run (as after any new document): answers and approvals must survive it.
  s = await runSessionCase(caseId, { incremental: true });
  states.push(s);
  return { caseId, states, final: s };
}

for (const { id } of DEMO_CARDS) {
  test(`${id}: ends with every task done and every pathway at 100%, without a model`, async () => {
    const { states, final } = await play(id);
    assert(states[0].matches.some((m) => m.readiness < 1), "it starts with gaps to fill");
    assert(final.matches.length >= 3);
    for (const m of final.matches) assert.equal(m.readiness, 1, `${m.programId} at ${m.readiness}`);
    assert.equal(final.evidenceScore, 100);
    assert.equal(final.followUp, undefined);
    for (const t of final.plan) assert(t.status === "done" || t.approved, `${t.id} is ${t.status}${t.approved ? "" : ", not approved"}`);
    assert(final.conflicts.every((c) => c.resolved));
    for (const s of states) assert.deepEqual({ mode: s.extraction.mode, claude: s.extraction.claude, sample: s.extraction.sample }, { mode: "rules", claude: 0, sample: true });
  });
}

test("the three households are different people in different situations", async () => {
  const first = Object.fromEntries(await Promise.all(DEMO_CARDS.map(async ({ id }) => [id, (await play(id)).final] as const)));
  const people = (id: DemoId) => first[id].people.map((p) => `${p.name}: ${p.role}`);
  assert.deepEqual(people("johnson"), ["Denise Johnson: Head of household", "Amara: Daughter, 6, uses nebulizer", "Jaylen: Son, 9", "Malik: Son, 2"]);
  assert.deepEqual(people("nguyen"), ["Minh Nguyen: Head of household", "Lan Nguyen: Wife, 64"]);
  const programs = (id: DemoId) => first[id].matches.map((m) => m.programId).sort();
  assert.deepEqual(programs("reyes"), ["critical-care", "fema-appeal", "food-assistance", "insurance-claim", "sba-home-loan"]);
  assert.deepEqual(programs("johnson"), ["critical-care", "fema-appeal", "food-assistance"], "a renter with no insurance");
  assert.deepEqual(programs("nguyen"), ["fema-appeal", "insurance-claim", "sba-home-loan"], "insured owners, no medical need");
  // Nothing about one household leaks into another's output.
  const text = (id: DemoId) => JSON.stringify({ ...first[id], documents: undefined, events: undefined });
  for (const leak of ["Reyes", "Carmen", "Cypress", "oxygen"]) {
    assert(!text("johnson").includes(leak) && !text("nguyen").includes(leak), `"${leak}" leaked`);
  }
});

test("every string the demos put on screen has Spanish", async () => {
  const shown = (s: CaseState) => [
    ...s.matches.flatMap((m) => [m.name, m.caveat, m.source.label, ...m.evidence.map((e) => e.label)]),
    ...s.plan.flatMap((t) => (t.id.startsWith("task:conflict") && t.status !== "done" ? [t.title] : [t.title, t.detail])),
    ...(s.followUp ? [s.followUp.why] : []),
    ...s.needs.map((n) => n.label), ...s.people.map((p) => p.role), ...s.warnings,
    ...s.documents.map((d) => d.title), ...s.extractions.flatMap((x) => x.facts.map((f) => f.label)),
    ...s.packets.flatMap((p) => [p.title, p.to, ...p.attachments.map((a) => a.title)]),
  ];
  const all = (await Promise.all(DEMO_CARDS.map(({ id }) => play(id)))).flatMap((r) => r.states.flatMap(shown));
  assert.deepEqual([...new Set(all)].filter((x) => spanish(x) === undefined), []);
  for (const d of Object.values(DEMOS)) for (const f of d.followUps) assert(spanish(f.doc.title), `follow-up title "${f.doc.title}"`);
});

test("answers to conflicts are checked", async () => {
  const { caseId } = await newSample("reyes");
  await runSessionCase(caseId);
  const post = (body: unknown) => resolve(new Request("http://test/api/resolve", { method: "POST", body: JSON.stringify(body) }));
  assert.equal((await post({ caseId, conflictId: "conflict-name", value: "Somebody Else" })).status, 400);
  assert.equal((await post({ caseId, conflictId: "nope", value: "Ana Reyes" })).status, 404);
  assert.equal((await post({ caseId: "nope", conflictId: "conflict-name", value: "Ana Reyes" })).status, 404);
  const ok = await post({ caseId, conflictId: "conflict-name", value: "Ana Reyes" });
  const body = await ok.json();
  assert.equal(body.plan.find((t: { id: string }) => t.id === "task:conflict-name").status, "done");
  assert.equal(body.conflicts.find((c: { id: string }) => c.id === "conflict-name").resolved, "Ana Reyes");
});
