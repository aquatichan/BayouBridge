// Encryption for anything BayouBridge writes to a shared store (Redis).
//
// AES-256-GCM, a fresh random IV for every value, the auth tag kept with it.
// A tampered value or a wrong key fails to open instead of returning junk.
//
// The key comes from BAYOUBRIDGE_CASE_KEY: 64 hex characters, 44-character
// base64 (32 bytes), or any other string, which is stretched with scrypt.
// The key lives only in the server's environment, never next to the data.
// When Redis is the backend the key is required; with the in-memory backend
// (local dev, tests) values are kept as they are, because nothing leaves
// the process.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { redisConfigured } from "@/lib/kv";

let cached: { source: string; key: Buffer } | undefined;

export function caseKey(): Buffer | undefined {
  const env = process.env.BAYOUBRIDGE_CASE_KEY?.trim();
  if (!env) return undefined;
  if (cached?.source === env) return cached.key;
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(env)) key = Buffer.from(env, "hex");
  else if (/^[A-Za-z0-9+/]{43}=$/.test(env) && Buffer.from(env, "base64").length === 32) key = Buffer.from(env, "base64");
  else key = scryptSync(env, "bayoubridge-case-key-v1", 32);
  cached = { source: env, key };
  return key;
}

export function encryptText(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}

export function decryptText(payload: string, key: Buffer): string {
  const o = JSON.parse(payload) as { v?: unknown; iv?: string; tag?: string; data?: string };
  if (o.v !== 1 || !o.iv || !o.tag || !o.data) throw new Error("Unsupported sealed value");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(o.iv, "base64"));
  d.setAuthTag(Buffer.from(o.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(o.data, "base64")), d.final()]).toString("utf8");
}

/** Encrypt for storage. Throws if Redis is the backend and no key is set: household data is never stored in the clear remotely. */
export function seal(plain: string): string {
  const key = caseKey();
  if (key) return encryptText(plain, key);
  if (redisConfigured()) throw new Error("BAYOUBRIDGE_CASE_KEY must be set when Redis is used, so cases are stored encrypted.");
  return plain;
}

export function unseal(stored: string): string {
  const key = caseKey();
  if (key) return decryptText(stored, key);
  if (redisConfigured()) throw new Error("BAYOUBRIDGE_CASE_KEY must be set when Redis is used.");
  return stored;
}

/** Encrypt raw file bytes into one base64 string (iv | tag | ciphertext). Same key rules as `seal`. */
export function sealBytes(data: Buffer): string {
  const key = caseKey();
  if (!key) {
    if (redisConfigured()) throw new Error("BAYOUBRIDGE_CASE_KEY must be set when Redis is used, so cases are stored encrypted.");
    return data.toString("base64");
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function unsealBytes(stored: string): Buffer {
  const key = caseKey();
  const raw = Buffer.from(stored, "base64");
  if (!key) {
    if (redisConfigured()) throw new Error("BAYOUBRIDGE_CASE_KEY must be set when Redis is used.");
    return raw;
  }
  const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
}
