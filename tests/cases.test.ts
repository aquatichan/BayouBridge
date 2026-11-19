import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as approve } from "../src/app/api/approve/route";
import { POST as createCase } from "../src/app/api/cases/route";
import { DELETE as deleteCase, GET as getCase } from "../src/app/api/cases/[id]/route";
import { POST as upload } from "../src/app/api/cases/[id]/documents/route";
import { POST as stream } from "../src/app/api/run/stream/route";
import { documents as sample } from "../src/data/household";
import { runCase } from "../src/lib/agents/coordinator";
import { fromUploadReading } from "../src/lib/agents/llmExtract";
import { runSessionCase } from "../src/lib/cases";
import { CASE_TTL_MS, getCase as storeGet } from "../src/lib/store";
import type { CaseDocument } from "../src/lib/types";

// Session cases and real uploads (Phase 11). No network: without a key, uploads
// aren't read; the Claude reading itself is tested through fromUploadReading.
delete process.env.ANTHROPIC_API_KEY;

const json = (body: unknown) => new Request("http://test/api/cases", { method: "POST", body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const newCase = async (body: unknown) => { const r = await createCase(json(body)); return { status: r.status, body: await r.json() }; };
const sendFiles = async (id: string, files: File[], statement?: string) => {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  if (statement) form.append("statement", statement);
  const r = await upload(new Request(`http://test/api/cases/${id}/documents`, { method: "POST", body: form }), params(id));
  return { status: r.status, body: await r.json() };
};

test("a real case needs consent and an address; ids are unguessable", async () => {
  assert.equal((await newCase({ address: "512 Willow Creek Dr, Houston, TX 77016" })).status, 400);
  assert.equal((await newCase({ consent: true, address: "x" })).status, 400);
  const ok = await newCase({ consent: true, name: "Okafor", address: "512 Willow Creek Dr, Houston, TX 77016", language: "es" });
  assert.equal(ok.status, 200);
  assert.match(ok.body.caseId, /^[0-9a-f-]{36}$/);
});

test("uploads: types and sizes are checked, and the sample case takes no uploads", async () => {
  const { body } = await newCase({ consent: true, address: "512 Willow Creek Dr, Houston, TX 77016" });
  const id = body.caseId;
  assert.equal((await sendFiles(id, [new File(["MZ"], "app.exe", { type: "application/x-msdownload" })])).status, 415);
  assert.equal((await sendFiles(id, [new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" })])).status, 413);
  assert.equal((await sendFiles(id, Array.from({ length: 11 }, (_, i) => new File(["x"], `p${i}.jpg`, { type: "image/jpeg" })))).status, 413);
  assert.equal((await sendFiles(id, [])).status, 400);
  const ok = await sendFiles(id, [new File([new Uint8Array(10)], "../../roof.jpg", { type: "image/jpeg" })], "We lost all our food.");
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.documents.map((d: CaseDocument) => [d.filename, d.source]), [["roof.jpg", "upload"], ["your-words.txt", "statement"]]);
  const s = await newCase({ sample: true });
  assert.equal((await sendFiles(s.body.caseId, [new File(["x"], "a.jpg", { type: "image/jpeg" })])).status, 400);
});

test("without an API key: typed words are read by the rules engine, photos get an honest warning", async () => {
  const { body } = await newCase({ consent: true, address: "512 Willow Creek Dr, Houston, TX 77016" });
  await sendFiles(body.caseId, [new File([new Uint8Array(10)], "roof.jpg", { type: "image/jpeg" })],
    "My mother, Ruth Okafor, is 78 and uses an oxygen concentrator. We lost all our food.");
  const s = await runSessionCase(body.caseId);
  assert.deepEqual(s.needs.map((n) => n.key).sort(), ["food_loss", "medical_power"]);
  assert.match(s.warnings.join(" "), /no Claude API key.*roof\.jpg/);
  assert.equal(s.householdName, "Your household");
});

test("a Claude reading of a photographed bill becomes the document, and proves occupancy", async () => {
  const upload: CaseDocument = { id: "up-1", kind: "photo", title: "IMG_9001.jpg", filename: "IMG_9001.jpg", mime: "image/jpeg", receivedAt: "2026-11-18", text: "", language: "en", source: "upload" };
  const reading = fromUploadReading(upload, {
    kind: "utility_bill", title: "September electric bill", language: "en",
    text: "Customer: Ana Reyes\nService address: 1847 Cypress Bayou Ln, Houston, TX 77093\nBilling period: September 1, 2026 – September 30, 2026",
    facts: [
      { type: "billing_period", label: "Billing period", value: "September 1, 2026 – September 30, 2026", normalized: "billing_end:2026-09-30", confidence: 0.9, quote: "Billing period: September 1, 2026 – September 30, 2026" },
      { type: "address", label: "Service address", value: "1847 Cypress Bayou Ln, Houston, TX 77093", normalized: "", confidence: 0.9, quote: "Service address: 1847 Cypress Bayou Ln" },
      { type: "person", label: "Customer", value: "Ana Reyes", normalized: "", confidence: 0.9, quote: "Customer: Ana Reyes" },
    ],
  });
  assert.equal(reading.document?.kind, "utility_bill");
  const s = await runCase({
    caseId: "t", householdName: "Reyes household", address: "1847 Cypress Bayou Ln, Houston, TX 77093", disaster: "", today: "2026-11-18",
    documents: [...sample, upload],
    extractor: async (d) => (d.id === "up-1" ? reading : (await import("../src/lib/agents/evidence")).extractWithRules(d)),
  });
  assert.equal(s.documents.find((d) => d.id === "up-1")?.title, "September electric bill");
  assert(s.events.some((e) => e.action === "Verified proof of occupancy"));
  assert.equal(s.matches.find((m) => m.programId === "fema-appeal")?.readiness, 1);
});

test("a photo reading with no facts still keeps what the photo shows", () => {
  const photo: CaseDocument = { id: "up-2", kind: "photo", title: "x.jpg", filename: "x.jpg", mime: "image/jpeg", receivedAt: "2026-11-18", text: "", language: "en", source: "upload" };
  const r = fromUploadReading(photo, { kind: "photo", title: "Photo of roof damage", language: "en", text: "[Photo description] Missing shingles and exposed wood decking on the roof.", facts: [] });
  assert.equal(r.document?.title, "Photo of roof damage");
  assert(r.facts.some((f) => f.normalized === "roof_damage"), "the rules backstop reads the description");
  assert.deepEqual(r.evidenceTypes, ["damage_photo"]);
});

test("sample cases are private copies: approvals in one don't show up in another", async () => {
  const a = (await newCase({ sample: true })).body.caseId;
  const b = (await newCase({ sample: true })).body.caseId;
  const sa = await runSessionCase(a);
  await runSessionCase(b);
  assert.equal(sa.matches.find((m) => m.programId === "fema-appeal")?.readiness, 0.75);
  const r = await approve(new Request("http://test/api/approve", { method: "POST", body: JSON.stringify({ caseId: a, taskId: "task:insurance-claim" }) }));
  assert.equal((await r.json()).item.approvedBy, "You");
  assert(!storeGet(b)!.state!.plan.find((t) => t.id === "task:insurance-claim")?.approved);
});

test("delete forgets the case at once, and cases expire after 2 hours", async () => {
  const id = (await newCase({ consent: true, address: "512 Willow Creek Dr, Houston, TX 77016" })).body.caseId;
  assert.equal((await getCase(new Request("http://test"), params(id))).status, 200);
  assert.equal((await deleteCase(new Request("http://test"), params(id))).status, 200);
  assert.equal((await getCase(new Request("http://test"), params(id))).status, 404);
  const run = await stream(new Request("http://test/api/run/stream", { method: "POST", body: JSON.stringify({ caseId: id }) }));
  assert.equal(run.status, 404);
  const old = (await newCase({ consent: true, address: "512 Willow Creek Dr, Houston, TX 77016" })).body.caseId;
  assert(storeGet(old, Date.now() + 1000));
  assert.equal(storeGet(old, Date.now() + CASE_TTL_MS + 5000), undefined);
});
