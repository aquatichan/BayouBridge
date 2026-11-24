// Encrypted, persistent case storage for BayouBridge.
//
// Cases used to live only in server memory (src/lib/store.ts): a server
// restart wiped every case, including a household's real uploads. This
// module writes the whole case store to one encrypted file on the server's
// disk, so cases survive a restart on that server.
//
// Format: one file, `data/cases.enc` by default, holding a JSON envelope
// { v: 1, alg: "aes-256-gcm", iv, tag, data } where `data` is the
// AES-256-GCM ciphertext (base64) of the JSON-serialised case store.
// Uploaded file bytes are base64 inside that JSON, so they are encrypted
// at rest along with everything else. Writes are atomic (write to a
// temp file, then rename) and the file is chmod 0600.
//
// Key, in order:
//   1. BAYOUBRIDGE_CASE_KEY — 64 hex chars (32 bytes), 44-char base64,
//      or any other string, which is then derived with scrypt.
//   2. data/.case-key — generated once on first run (0600) when no env
//      key is set, so a local/dev server keeps working across restarts
//      without extra config. The key file lives next to the data file;
//      for production, set the env key instead and do not rely on it.
//   3. If neither exists, a random key is generated and saved as (2).
//
// Honest limit: this is a file on one server's disk. It survives a
// restart of that server, and it survives the dev server reloading.
// It is NOT shared across serverless function instances — on Vercel,
// two instances have separate disks. A production deployment that
// needs shared persistence should move this to an external store
// (database / object storage) and keep the same encryption. The
// privacy page says so in plain language.
//
// Tests: persistence is off by default under the test runner (NODE_ENV
// is unset there), unless BAYOUBRIDGE_DATA_DIR, BAYOUBRIDGE_CASE_KEY or
// BAYOUBRIDGE_PERSISTENCE=on is set. That keeps the existing in-memory
// test suite deterministic, and lets the persistent-store tests opt in
// with a temp dir.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export function dataDir(): string {
  return process.env.BAYOUBRIDGE_DATA_DIR?.trim() || path.join(process.cwd(), "data");
}

export function dataFile(): string {
  return path.join(dataDir(), "cases.enc");
}

export function keyFile(): string {
  return path.join(dataDir(), ".case-key");
}

export function persistenceEnabled(): boolean {
  if (process.env.BAYOUBRIDGE_PERSISTENCE === "off") return false;
  if (process.env.BAYOUBRIDGE_PERSISTENCE === "on") return true;
  // Opt in explicitly with a data dir / key, e.g. the persistent-store tests.
  if (process.env.BAYOUBRIDGE_DATA_DIR || process.env.BAYOUBRIDGE_CASE_KEY) return true;
  // On a real server NODE_ENV is "development" or "production". The test
  // runner leaves it unset, so the existing in-memory test suite stays
  // deterministic and does not leak cases between test files via disk.
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "production";
}

export function resolveKey(): Buffer {
  const env = process.env.BAYOUBRIDGE_CASE_KEY?.trim();
  if (env) {
    if (/^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
    try {
      const b = Buffer.from(env, "base64");
      if (b.length === 32) return b;
    } catch {
      // Fall through to scrypt below.
    }
    return scryptSync(env, "bayoubridge-case-key-v1", 32);
  }
  try {
    if (existsSync(keyFile())) {
      const raw = readFileSync(keyFile(), "utf8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    }
  } catch {
    // Fall through to generating a key below.
  }
  const key = randomBytes(32);
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(keyFile(), key.toString("hex"), { mode: 0o600 });
  try {
    chmodSync(keyFile(), 0o600);
  } catch {
    // chmod is best-effort on some filesystems.
  }
  return key;
}

export function encryptText(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  });
}

export function decryptText(payload: string, key: Buffer): string {
  const obj = JSON.parse(payload) as { v?: unknown; alg?: unknown; iv?: string; tag?: string; data?: string };
  if (obj.v !== 1 || obj.alg !== "aes-256-gcm" || !obj.iv || !obj.tag || !obj.data) {
    throw new Error("Unsupported encrypted case file");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(obj.iv, "base64"));
  decipher.setAuthTag(Buffer.from(obj.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(obj.data, "base64")), decipher.final()]).toString("utf8");
}

/** Atomically write `plaintext` (already serialised JSON) to the encrypted data file. No-op when persistence is off. */
export function saveEncrypted(plaintext: string): void {
  if (!persistenceEnabled()) return;
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const key = resolveKey();
  const tmp = path.join(dir, `.cases.enc.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`);
  writeFileSync(tmp, encryptText(plaintext, key), { mode: 0o600 });
  renameSync(tmp, dataFile());
  try {
    chmodSync(dataFile(), 0o600);
  } catch {
    // chmod is best-effort on some filesystems.
  }
}

/** Read and decrypt the data file, or null when there is nothing saved yet. Throws on a bad key / tampered file. */
export function loadEncrypted(): string | null {
  if (!persistenceEnabled()) return null;
  if (!existsSync(dataFile())) return null;
  const key = resolveKey();
  return decryptText(readFileSync(dataFile(), "utf8"), key);
}
