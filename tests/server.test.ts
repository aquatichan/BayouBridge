import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as approve } from "../src/app/api/approve/route";
import { GET as outbox } from "../src/app/api/outbox/route";
import { POST as stream } from "../src/app/api/run/stream/route";
import { runDemoCase } from "../src/lib/runDemo";

// Route handlers called directly. The store is in-memory and per process, so
// these steps run in order within one test file.
delete process.env.ANTHROPIC_API_KEY;

const post = async (body: unknown) => {
  const r = await approve(new Request("http://test/api/approve", { method: "POST", body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};

test("approval gate is enforced on the server", async (t) => {
  await t.test("unknown case is 404", async () => {
    assert.equal((await post({ caseId: "BB-0417", taskId: "task:insurance-claim" })).status, 404);
  });
  const s = await runDemoCase();
  await t.test("blocked task is 409", async () => {
    const r = await post({ caseId: "BB-0417", taskId: "task:fema-appeal" });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /Proof of occupancy/);
  });
  await t.test("unknown task is 404, a task that sends nothing is 400, bad body is 400", async () => {
    assert.equal((await post({ caseId: "BB-0417", taskId: "task:nope" })).status, 404);
    assert.equal((await post({ caseId: "BB-0417", taskId: "task:conflict-name" })).status, 400);
    assert.equal((await post({ caseId: "BB-0417" })).status, 400);
  });
  await t.test("a ready task is approved once, with fresh event seqs", async () => {
    const r = await post({ caseId: "BB-0417", taskId: "task:insurance-claim" });
    assert.equal(r.status, 200);
    assert.equal(r.body.task.approved, true);
    assert.deepEqual(r.body.events.map((e: { seq: number; action: string }) => [e.seq, e.action]),
      [[s.events.length + 1, "Approval recorded"], [s.events.length + 2, "Queued to sandbox outbox"]]);
    const again = await post({ caseId: "BB-0417", taskId: "task:insurance-claim" });
    assert.equal(again.body.already, true);
    assert.equal(again.body.events.length, 0);
  });
  await t.test("the outbox lists the queued packet", async () => {
    const r = await outbox(new Request("http://test/api/outbox?caseId=BB-0417"));
    const { items } = await r.json();
    assert.equal(items.length, 1);
    assert.equal(items[0].packet.status, "queued");
    assert(items[0].packet.bilingualCover.es.length > 0);
  });
  await t.test("approvals survive a re-run that changes the plan (stable task ids)", async () => {
    const after = await runDemoCase({ addDocumentIds: ["doc-electric-bill", "doc-reyes-deed"] });
    assert.equal(after.plan.find((x) => x.id === "task:insurance-claim")?.approved, true);
    assert.equal((await post({ caseId: "BB-0417", taskId: "task:fema-appeal" })).status, 200);
  });
});

test("the stream sends live frames and an authoritative done frame", async () => {
  const res = await stream(new Request("http://test/api/run/stream", { method: "POST", body: "{}" }));
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  assert.equal(res.headers.get("x-accel-buffering"), "no");
  const text = await res.text();
  const frames = text.split("\n\n").filter((f) => f.startsWith("event:")).map((f) => ({
    event: f.match(/^event: (.*)$/m)![1], data: JSON.parse(f.match(/^data: (.*)$/m)![1]),
  }));
  // All six documents start before the first one is read: they run in parallel.
  const firstRead = frames.findIndex((f) => f.event === "agent" && f.data.action.startsWith("Read "));
  assert.equal(frames.slice(0, firstRead).filter((f) => f.event === "task" && f.data.status === "started" && f.data.id.startsWith("extract:")).length, 6);
  const done = frames.at(-1)!;
  assert.equal(done.event, "done");
  assert.deepEqual(frames.filter((f) => f.event === "agent").map((f) => f.data), done.data.state.events);
  const bad = await stream(new Request("http://test/api/run/stream", { method: "POST", body: JSON.stringify({ addDocumentIds: ["nope"] }) }));
  assert.equal(bad.status, 400);
});
