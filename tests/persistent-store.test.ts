import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// Opt in to persistence for this file only: a temp dir and a test key.
// (Persistence is off by default under NODE_ENV=test, so the other test
// files stay in-memory and deterministic.)
const dir = mkdtempSync(path.join(tmpdir(), "bayoubridge-persist-"));
process.env.BAYOUBRIDGE_DATA_DIR = dir;
process.env.BAYOUBRIDGE_CASE_KEY = randomBytes(32).toString("hex");
delete process.env.ANTHROPIC_API_KEY;

import { decryptText, encryptText, resolveKey } from "../src/lib/persistentStore";
import { __clearMemoryForTests, addDocuments, createSessionCase, deleteCase, getCase } from "../src/lib/store";

const dataFile = path.join(dir, "cases.enc");

test("AES-256-GCM round-trips, and tampering or a wrong key fails", () => {
  const key = resolveKey();
  const payload = encryptText("secret household address 512 Willow Creek Dr", key);
  assert.equal(decryptText(payload, key), "secret household address 512 Willow Creek Dr");
  const tampered = JSON.parse(payload) as Record<string, string>;
  tampered.data = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptText(JSON.stringify(tampered), key));
  assert.throws(() => decryptText(payload, randomBytes(32)));
});

test("a case with an uploaded file survives a simulated server restart", () => {
  const id = createSessionCase({ name: "Okafor", address: "512 Willow Creek Dr, Houston, TX 77016", language: "en", sample: false });
  assert.ok(existsSync(dataFile), "creating a case writes the encrypted file");
  const bytes = Buffer.from("fake-photo-bytes");
  assert.ok(addDocuments(id, [{
    doc: { id: "up-1", kind: "photo", title: "roof.jpg", filename: "roof.jpg", mime: "image/jpeg", receivedAt: "2026-11-18", text: "", language: "en", source: "upload" },
    file: { mime: "image/jpeg", data: bytes },
  }]));
  // The file on disk must not contain the address or the file bytes in plaintext.
  const onDisk = readFileSync(dataFile, "utf8");
  assert.ok(!onDisk.includes("512 Willow Creek"), "address must not appear in plaintext on disk");
  assert.ok(!onDisk.includes("fake-photo-bytes"), "upload bytes must not appear in plaintext on disk");

  // Simulate a restart: drop all memory, then read the case back.
  __clearMemoryForTests();
  const rec = getCase(id);
  assert.ok(rec, "case is back after a restart");
  assert.equal(rec.profile?.address, "512 Willow Creek Dr, Houston, TX 77016");
  assert.equal(rec.documents.length, 1);
  assert.equal(rec.documents[0].filename, "roof.jpg");
  assert.deepEqual(rec.files.get("up-1")?.data, bytes);
});

test("delete is permanent across a restart", () => {
  const id = createSessionCase({ name: "Okafor", address: "512 Willow Creek Dr, Houston, TX 77016", language: "en", sample: false });
  assert.ok(getCase(id));
  assert.ok(deleteCase(id));
  __clearMemoryForTests();
  assert.equal(getCase(id), undefined);
});

test("cleanup", () => {
  rmSync(dir, { recursive: true, force: true });
});
