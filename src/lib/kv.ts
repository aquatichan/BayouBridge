// A tiny key-value layer under the case store (src/lib/store.ts).
//
// Two backends, same interface:
//  - Redis over HTTP (Upstash, e.g. from the Vercel Marketplace) when
//    UPSTASH_REDIS_REST_URL / _TOKEN (or Vercel's KV_REST_API_URL / _TOKEN)
//    are set. Shared by every serverless instance, with native key expiry
//    and atomic SET NX locks. Plain fetch against the REST API: no SDK.
//  - In memory otherwise (local dev, tests). Lives on globalThis so it
//    survives Next.js dev-server module reloads; gone when the process ends.

export interface Kv {
  /** Value or null. With `touchMs`, also pushes the key's expiry out to that many ms from now. `now` is a test clock (memory only). */
  get(key: string, touchMs?: number, now?: number): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number, now?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Set the expiry of existing keys. */
  pexpire(keys: string[], ttlMs: number): Promise<void>;
  /** A lock token, or null if someone else holds the lock. */
  lock(key: string, ttlMs: number): Promise<string | null>;
  unlock(key: string, token: string): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  zcard(key: string): Promise<number>;
  /** Remove and return the lowest-scored member. */
  zpopmin(key: string): Promise<string | null>;
  zremrangebyscore(key: string, maxScore: number): Promise<void>;
}

// --- In memory --------------------------------------------------------------

class MemoryKv implements Kv {
  private data = new Map<string, { v: string; exp?: number }>();
  private zsets = new Map<string, Map<string, number>>();

  private live(key: string, now: number) {
    const e = this.data.get(key);
    if (e?.exp !== undefined && e.exp <= now) { this.data.delete(key); return undefined; }
    return e;
  }
  async get(key: string, touchMs?: number, now = Date.now()) {
    const e = this.live(key, now);
    if (!e) return null;
    if (touchMs) e.exp = now + touchMs;
    return e.v;
  }
  async set(key: string, value: string, ttlMs?: number, now = Date.now()) { this.data.set(key, { v: value, exp: ttlMs ? now + ttlMs : undefined }); }
  async del(...keys: string[]) { for (const k of keys) this.data.delete(k); }
  async pexpire(keys: string[], ttlMs: number) { for (const k of keys) { const e = this.live(k, Date.now()); if (e) e.exp = Date.now() + ttlMs; } }
  async lock(key: string, ttlMs: number) {
    if (this.live(key, Date.now())) return null;
    const token = crypto.randomUUID();
    this.data.set(key, { v: token, exp: Date.now() + ttlMs });
    return token;
  }
  async unlock(key: string, token: string) { if (this.data.get(key)?.v === token) this.data.delete(key); }
  private z(key: string) { let z = this.zsets.get(key); if (!z) this.zsets.set(key, (z = new Map())); return z; }
  async zadd(key: string, score: number, member: string) { this.z(key).set(member, score); }
  async zrem(key: string, member: string) { this.z(key).delete(member); }
  async zcard(key: string) { return this.z(key).size; }
  async zpopmin(key: string) {
    const first = [...this.z(key).entries()].sort((a, b) => a[1] - b[1])[0];
    if (!first) return null;
    this.z(key).delete(first[0]);
    return first[0];
  }
  async zremrangebyscore(key: string, maxScore: number) { for (const [m, s] of this.z(key)) if (s <= maxScore) this.z(key).delete(m); }
}

// --- Redis over HTTP (Upstash REST API) ---------------------------------------

type Cmd = (string | number)[];

class RestKv implements Kv {
  constructor(private url: string, private token: string) {}

  private async send(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(this.url.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | { result?: unknown; error?: string }[] | null;
    if (!res.ok || !json) throw new Error(`Redis request failed (${res.status})`);
    const bad = Array.isArray(json) ? json.find((r) => r.error) : json.error ? json : undefined;
    if (bad) throw new Error(`Redis error: ${bad.error}`);
    return Array.isArray(json) ? json.map((r) => r.result) : json.result;
  }
  private cmd(...args: Cmd) { return this.send("", args); }

  async get(key: string, touchMs?: number) {
    return (await (touchMs ? this.cmd("GETEX", key, "PX", touchMs) : this.cmd("GET", key))) as string | null;
  }
  async set(key: string, value: string, ttlMs?: number) {
    await (ttlMs ? this.cmd("SET", key, value, "PX", ttlMs) : this.cmd("SET", key, value));
  }
  async del(...keys: string[]) { if (keys.length) await this.cmd("DEL", ...keys); }
  async pexpire(keys: string[], ttlMs: number) {
    if (keys.length) await this.send("/pipeline", keys.map((k) => ["PEXPIRE", k, ttlMs]));
  }
  async lock(key: string, ttlMs: number) {
    const token = crypto.randomUUID();
    return (await this.cmd("SET", key, token, "NX", "PX", ttlMs)) === "OK" ? token : null;
  }
  async unlock(key: string, token: string) {
    await this.cmd("EVAL", "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, token);
  }
  async zadd(key: string, score: number, member: string) { await this.cmd("ZADD", key, score, member); }
  async zrem(key: string, member: string) { await this.cmd("ZREM", key, member); }
  async zcard(key: string) { return Number(await this.cmd("ZCARD", key)); }
  async zpopmin(key: string) {
    const r = (await this.cmd("ZPOPMIN", key)) as string[];
    return r?.[0] ?? null;
  }
  async zremrangebyscore(key: string, maxScore: number) { await this.cmd("ZREMRANGEBYSCORE", key, "-inf", maxScore); }
}

// --- Choosing a backend --------------------------------------------------------

const g = globalThis as typeof globalThis & { __bayoubridgeKv?: Kv; __bayoubridgeMem?: Kv };

export function redisConfigured(): boolean {
  return Boolean(redisEnv());
}

function redisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : undefined;
}

export function getKv(): Kv {
  if (g.__bayoubridgeKv) return g.__bayoubridgeKv;
  const env = redisEnv();
  if (env) return (g.__bayoubridgeKv = new RestKv(env.url, env.token));
  return (g.__bayoubridgeMem ??= new MemoryKv());
}

/** Test-only: use this backend (or, with undefined, go back to choosing from the environment). */
export function __setKvForTests(kv: Kv | undefined) { g.__bayoubridgeKv = kv; }
/** Test-only: a REST backend pointed at a (fake) server. */
export function __restKvForTests(url: string, token: string): Kv { return new RestKv(url, token); }
