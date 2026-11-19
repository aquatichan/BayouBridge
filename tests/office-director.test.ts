import assert from "node:assert/strict";
import { test } from "node:test";
import { OfficeDirector, STATIONS } from "../src/lib/office/director";
import type { TaskUpdate } from "../src/lib/types";

// The office director (the part of the 3D office with logic in it). Time is passed in, so no clocks.
const run = (d: OfficeDirector, from: number, ms: number, step = 50) => {
  for (let t = from; t <= from + ms; t += step) d.tick(step / 1000, t);
  return from + ms;
};
const task = (id: string, status: TaskUpdate["status"], extra: Partial<TaskUpdate> = {}): TaskUpdate =>
  ({ id, agent: "Evidence Agent", label: `Doing ${id}`, status, ...extra });

test("a task sends its mascot to the right desk, it works there, then heads home", () => {
  const d = new OfficeDirector(0);
  d.onTask(task("match", "started", { agent: "Recovery-Match Agent" }), 0);
  assert.equal(d.mascots.recovery.queue.length, 1);
  let t = run(d, 0, 6000);
  // The pathway library is Recovery's own desk, so it's already there and working.
  assert.equal(d.mascots.recovery.phase, "working");
  d.onTask(task("gaps", "started", { agent: "Follow-up Agent" }), t);
  d.onTask(task("match", "done", { agent: "Recovery-Match Agent" }), t);
  t = run(d, t, 200);
  assert.equal(d.mascots.recovery.phase, "walking", "walks to the follow-up phone");
  assert.equal(d.mascots.recovery.job?.station, "phone");
  d.onTask(task("gaps", "done", { agent: "Follow-up Agent" }), t);
  t = run(d, t, 8000);
  const home = d.slot("library", "recovery");
  assert.deepEqual(d.mascots.recovery.pos, home, "back at the library afterwards");
  assert.equal(d.mascots.recovery.phase, "idle");
});

test("Claude reads in the AI lab; a fallback hands the document to Evidence", () => {
  const d = new OfficeDirector(0);
  d.onTask(task("extract:doc-1", "started", { via: "claude" }), 0);
  assert.equal(d.mascots.llm.queue[0]?.station, "lab");
  d.onTask(task("extract:doc-1", "started", { via: "rules" }), 100);
  assert.equal(d.mascots.llm.queue.length + (d.mascots.llm.job ? 1 : 0), 0, "LLM Extraction lets go");
  assert.equal(d.mascots.evidence.queue[0]?.station, "reading");
});

test("reused documents need no one; the replay fallback still moves mascots from events", () => {
  const d = new OfficeDirector(0);
  d.onTask(task("extract:doc-1", "started", { via: "reused" }), 0);
  assert.equal(d.mascots.evidence.queue.length + d.mascots.llm.queue.length, 0);
  d.onEvent({ seq: 1, agent: "Evidence Agent", action: "Read IMG_1.jpg", detail: "3 facts extracted (claude). Classified as: damage photo.", refs: ["doc-2"] }, 0);
  assert.equal(d.mascots.llm.queue[0]?.station, "lab");
  d.onEvent({ seq: 2, agent: "Safety Agent", action: "Approval recorded", detail: "" }, 0);
  d.onEvent({ seq: 3, agent: "Packet Agent", action: "Queued to sandbox outbox", detail: "" }, 0);
  assert.deepEqual(d.mascots.approval.queue.map((j) => j.station), ["gate", "outbox"]);
});

test("the camera follows the busiest mascot, then the whole office once everyone is idle", () => {
  const d = new OfficeDirector(0);
  for (let i = 0; i < 4; i++) d.onTask(task(`extract:doc-${i}`, "started", { via: "rules" }), 0);
  d.onTask(task("needs", "started", { agent: "Coordinator" }), 0);
  run(d, 0, 100);
  assert.equal(d.follow, "evidence");
  for (let i = 0; i < 4; i++) d.onTask(task(`extract:doc-${i}`, "done"), 200);
  d.onTask(task("needs", "done", { agent: "Coordinator" }), 200);
  run(d, 200, 25_000);
  assert.equal(d.follow, null);
  assert(Object.values(d.mascots).every((m) => m.phase === "idle"));
});

test("every station spot is on the open inner ring, so straight walks never cross a desk", () => {
  for (const s of Object.values(STATIONS)) assert(Math.abs(Math.hypot(s.spot.x, s.spot.z) - 7.2) < 1e-9);
});
