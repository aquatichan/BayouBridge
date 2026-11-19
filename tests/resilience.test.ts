import assert from "node:assert/strict";
import { test } from "node:test";
import { runCase } from "../src/lib/agents/coordinator";
import { base } from "./helpers";

// One agent failing must not take the run down (Phase 8).
const failing = (id: string) => (taskId: string) => { if (taskId === id) throw new Error(`simulated ${id} failure`); };

test("a failing graph step: plan and matches still come back, with a warning", async () => {
  const ok = await runCase(base);
  const s = await runCase({ ...base, beforeTask: failing("graph") });
  assert.deepEqual(s.matches, ok.matches);
  assert.deepEqual(s.plan, ok.plan);
  assert.deepEqual(s.graph, { nodes: [], edges: [] });
  assert.equal(s.warnings.length, 1);
  assert.match(s.warnings[0], /graph is empty/);
  assert(s.events.some((e) => e.action === "Step failed" && e.detail.includes("simulated graph failure")));
  assert.equal(s.events.at(-1)?.action, "Run complete");
});

test("a failing step with no safe default skips its dependents, and the run still completes", async () => {
  const s = await runCase({ ...base, beforeTask: failing("match") });
  assert.deepEqual(s.matches, []);
  assert.deepEqual(s.plan, []);
  const skipped = s.events.filter((e) => e.action === "Step skipped").map((e) => e.detail.split(":")[0]);
  assert.deepEqual(skipped.sort(), ["Holding drafts for your OK", "Writing the plan", "Preparing drafts", "Picking the next question", "Updating the case map"].sort());
  assert(s.needs.length > 0, "work done before the failure is kept");
  assert.equal(s.events.at(-1)?.action, "Run complete");
});

test("one document failing to extract leaves the rest of the case intact", async () => {
  const s = await runCase({ ...base, beforeTask: failing("extract:doc-insurance-email") });
  assert.equal(s.extractions.length, 6);
  assert.deepEqual(s.extractions.find((e) => e.docId === "doc-insurance-email")?.facts, []);
  assert(s.matches.some((m) => m.programId === "fema-appeal"));
  assert.match(s.warnings.join(" "), /facts are missing/);
});

test("conflicts failing: the plan is built without conflict tasks", async () => {
  const s = await runCase({ ...base, beforeTask: failing("conflicts") });
  assert.deepEqual(s.conflicts, []);
  assert(s.plan.length > 0 && !s.plan.some((t) => t.title.startsWith("Resolve conflict")));
});

test("safety failing fails closed: no task is marked as approvable", async () => {
  const s = await runCase({ ...base, beforeTask: failing("safety") });
  assert(!s.plan.some((t) => t.requiresApproval));
  assert.match(s.warnings.join(" "), /nothing can be approved/);
});

test("no warnings on a normal run", async () => {
  assert.deepEqual((await runCase(base)).warnings, []);
});
