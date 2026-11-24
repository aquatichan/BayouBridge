import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

// A tiny fake of the Upstash Redis REST API (just the commands the store uses),
// so the real HTTP backend, encryption and locking run end to end.
type Cmd = (string | number)[];
const strings = new Map<string, { v: string; exp?: number }>();
const zsets = new Map<string, Map<string, number>>();
let maxBody = 0;

const live = (k: string) => {
  const e = strings.get(k);
  if (e?.exp !== undefined && e.exp <= Date.now()) { strings.delete(k); return undefined; }
  return e;
};
const z = (k: string) => { let m = zsets.get(k); if (!m) zsets.set(k, (m = new Map())); return m; };

function run(c: Cmd): unknown {
  const [op, key, ...a] = c as [string, string, ...(string | number)[]];
  switch (String(op).toUpperCase()) {
    case "GET": return live(key)?.v ?? null;
    case "GETEX": { const e = live(key); if (e && a[0] === "PX") e.exp = Date.now() + Number(a[1]); return e?.v ?? null; }
    case "SET": {
      const nx = a.includes("NX"); const px = a.indexOf("PX");
      if (nx && live(key)) return null;
      strings.set(key, { v: String(a[0]), exp: px >= 0 ? Date.now() + Number(a[px + 1]) : undefined });
      return "OK";
    }
    case "DEL": { let n = 0; for (const k of [key, ...a.map(String)]) if (strings.delete(k)) n++; return n; }
    case "PEXPIRE": { const e = live(key); if (e) e.exp = Date.now() + Number(a[0]); return e ? 1 : 0; }
    case "EVAL": { const k = String(a[1]); return live(k)?.v === a[2] ? (strings.delete(k), 1) : 0; }
    case "ZADD": z(key).set(String(a[1]), Number(a[0])); return 1;
    case "ZREM": return z(key).delete(String(a[0])) ? 1 : 0;
    case "ZCARD": return z(key).size;
    case "ZPOPMIN": { const f = [...z(key)].sort((p, q) => p[1] - q[1])[0]; if (!f) return []; z(key).delete(f[0]); return [f[0], String(f[1])]; }
    case "ZREMRANGEBYSCORE": for (const [m, s] of z(key)) if (s <= Number(a[1])) z(key).delete(m); return 0;
    default: throw new Error(`fake redis: unsupported ${op}`);
  }
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    maxBody = Math.max(maxBody, body.length);
    if (req.headers.authorization !== "Bearer test-token") { res.statusCode = 401; res.end("{}"); return; }
    const payload = JSON.parse(body);
    try {
      const out = req.url === "/pipeline" ? (payload as Cmd[]).map((c) => ({ result: run(c) })) : { result: run(payload) };
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(out));
    } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: String(e) })); }
  });
});

const key = randomBytes(32).toString("hex");
process.env.BAYOUBRIDGE_CASE_KEY = key;
delete process.env.ANTHROPIC_API_KEY;

import { __restKvForTests, __setKvForTests } from "../src/lib/kv";
import { addDocuments, approveTask, CASE_TTL_MS, createSessionCase, deleteCase, getCase, readFile } from "../src/lib/store";
import { runSessionCase, createSampleCase } from "../src/lib/cases";

before(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  __setKvForTests(__restKvForTests(process.env.UPSTASH_REDIS_REST_URL, "test-token"));
});
after(() => { __setKvForTests(undefined); server.close(); });

const dump = () => [...strings.values()].map((e) => e.v).join("\n");
const profile = { name: "Okafor", address: "512 Willow Creek Dr, Houston, TX 77016", language: "en" as const, sample: false };

test("a case and its uploaded file round-trip through Redis, and nothing readable is stored", async () => {
  const id = await createSessionCase(profile);
  const bytes = randomBytes(1_200_000); // forces several chunks
  assert(await addDocuments(id, [{
    doc: { id: "up-1", kind: "photo", title: "roof.jpg", filename: "roof.jpg", mime: "image/jpeg", receivedAt: "2026-11-18", text: "", language: "en", source: "upload" },
    file: { mime: "image/jpeg", data: bytes },
  }]));
  const stored = dump();
  assert(!stored.includes("Willow Creek") && !stored.includes("Okafor"), "case record must be encrypted");
  assert(!stored.includes(bytes.subarray(0, 24).toString("base64")), "file bytes must be encrypted");
  assert(maxBody < 1_000_000, `every Redis request stays under 1 MB (largest ${maxBody})`);

  const rec = (await getCase(id))!; // a different "instance" would read exactly this
  assert.equal(rec.profile?.address, profile.address);
  assert.equal(rec.documents[0].filename, "roof.jpg");
  assert(rec.files["up-1"].chunks > 1);
  assert.deepEqual((await readFile(id, "up-1", rec.files["up-1"]))?.data, bytes);
});

test("a wrong key cannot read a case", async () => {
  const id = await createSessionCase(profile);
  process.env.BAYOUBRIDGE_CASE_KEY = randomBytes(32).toString("hex");
  await assert.rejects(getCase(id));
  process.env.BAYOUBRIDGE_CASE_KEY = key;
  assert(await getCase(id));
});

test("Redis without a key refuses to store anything", async () => {
  delete process.env.BAYOUBRIDGE_CASE_KEY;
  await assert.rejects(createSessionCase(profile), /BAYOUBRIDGE_CASE_KEY/);
  process.env.BAYOUBRIDGE_CASE_KEY = key;
});

test("delete removes the record and every file chunk; the case is gone", async () => {
  const id = await createSessionCase(profile);
  await addDocuments(id, [{
    doc: { id: "up-2", kind: "photo", title: "a.jpg", filename: "a.jpg", mime: "image/jpeg", receivedAt: "2026-11-18", text: "", language: "en", source: "upload" },
    file: { mime: "image/jpeg", data: randomBytes(900_000) },
  }]);
  assert([...strings.keys()].some((k) => k.startsWith(`bb:file:${id}`)));
  assert(await deleteCase(id));
  assert.equal(await getCase(id), undefined);
  assert(![...strings.keys()].some((k) => k.includes(id)), "no key mentioning the case remains");
  assert.equal(await deleteCase(id), false);
});

test("a session case expires after the TTL, and use keeps it alive", async () => {
  const id = await createSessionCase(profile);
  const k = `bb:case:${id}`;
  strings.get(k)!.exp = Date.now() + 1000; // nearly expired...
  assert(await getCase(id)); // ...using it pushes expiry out to a full TTL
  const left = strings.get(k)!.exp! - Date.now();
  assert(left > CASE_TTL_MS - 5000 && left <= CASE_TTL_MS);
  strings.get(k)!.exp = Date.now() - 1;
  assert.equal(await getCase(id), undefined);
});

test("two simultaneous approvals queue the packet once", async () => {
  const id = await createSampleCase("en", "nguyen");
  const s = await runSessionCase(id, { addDocumentIds: ["doc-nguyen-bank-statement"] });
  const task = s.plan.find((t) => t.status === "needs_approval")!;
  const results = await Promise.all([approveTask(id, task.id), approveTask(id, task.id), approveTask(id, task.id)]);
  assert(results.every((r) => r.ok));
  assert.equal(results.filter((r) => r.ok && !r.already).length, 1, "exactly one approval is new");
  assert.equal((await getCase(id))!.outbox.length, 1);
  assert.equal((await getCase(id))!.outbox[0].taskId, task.id);
});
