import assert from "node:assert/strict";
import { test } from "node:test";
import { runCase } from "../src/lib/agents/coordinator";
import { fromClaudeOutput } from "../src/lib/agents/llmExtract";
import { ExtractionError } from "../src/lib/agents/util";
import { asClaude, base, doc } from "./helpers";

// The Claude path, with stub extractors. Nothing here touches the network.
const fast = { docMs: 50, runMs: 2_000, breakerAfter: 2 };

test("a hanging Claude call times out, falls back to rules, and is aborted", async () => {
  const signals: AbortSignal[] = [];
  const t0 = Date.now();
  const s = await runCase({ ...base, limits: fast, extractor: (_d, opts) => { signals.push(opts!.signal!); return new Promise(() => {}); } });
  assert(Date.now() - t0 < 1_000, "finished on the per-document limit");
  assert(s.extractions.every((e) => e.method === "rules"));
  assert(s.events.some((e) => e.action === "Fell back to rules" && e.detail.includes("timeout")));
  assert(signals.every((sig) => sig.aborted), "every in-flight request was cancelled");
  assert.equal(s.matches.find((m) => m.programId === "fema-appeal")!.readiness, 0.5);
  assert.deepEqual(s.extraction, { claude: 0, rules: 6, fellBack: 6, mode: "rules" });
});

test("circuit breaker: after 2 failures the rest skip Claude, with one event", async () => {
  let calls = 0;
  const s = await runCase({ ...base, limits: fast, extractor: async () => { calls++; throw new ExtractionError("error", "API key was rejected (401)"); } });
  assert.equal(s.events.filter((e) => e.action === "Fell back to rules").length, 2);
  assert.equal(s.events.filter((e) => e.action === "Claude skipped").length, 1);
  assert(calls <= 6);
  assert(s.extractions.every((e) => e.method === "rules"));
});

test("mixed run: refusals fall back per document and the summary says so", async () => {
  const s = await runCase({
    ...base, limits: { ...fast, breakerAfter: 99 },
    extractor: async (d) => { if (d.kind === "photo") throw new ExtractionError("refusal", "stub refusal"); return fromClaudeOutput(d, asClaude(d)); },
  });
  assert.deepEqual(s.extraction, { claude: 4, rules: 2, fellBack: 2, mode: "mixed" });
  assert(s.events.some((e) => e.detail.includes("refusal")));
});

test("a hallucinated quote is dropped and a missing need is restored from rules", () => {
  const voice = doc("doc-voice-note");
  const raw = asClaude(voice).filter((f) => f.normalized !== "medical_power");
  raw.push({ type: "need", label: "Needs a generator", value: "Wants a free generator", normalized: "medical_power", confidence: 0.9, quote: "FEMA promised us a generator" });
  const ex = fromClaudeOutput(voice, raw);
  assert(!ex.facts.some((f) => f.quote.includes("generator")));
  assert(ex.facts.some((f) => f.normalized === "medical_power"));
  assert(ex.issues?.some((i) => i.startsWith("dropped: Needs a generator")));
  assert(ex.issues?.includes("filled from rules: Power-dependent medical equipment"));
  assert.equal(ex.method, "claude");
});

test("garbage normalized values are repaired", () => {
  const fema = fromClaudeOutput(doc("doc-fema-letter"), asClaude(doc("doc-fema-letter")).map((f) => f.type === "date_of_loss" ? { ...f, normalized: "10/09/2026" } : f));
  assert.equal(fema.facts.find((f) => f.type === "date_of_loss")?.normalized, "2026-10-09");
  const est = fromClaudeOutput(doc("doc-estimate"), [
    { type: "money", label: "Estimate total", value: "$14,850.00", normalized: "$14,850", confidence: 1.4, quote: "TOTAL ..... $14,850.00" },
    { type: "damage", label: "Cause", value: "wind damage to roof", normalized: "wind", confidence: 0.9, quote: "Cause noted by estimator: wind damage to roof, rain intrusion to living room." },
    { type: "address", label: "Property", value: "1847 Cypress Bayou Ln", normalized: "", confidence: 0.9, quote: "Customer: Ana Reyes Property: 1847 Cypress Bayou Ln" },
  ]);
  const money = est.facts.find((f) => f.type === "money" && f.id.includes("#c"))!;
  assert.equal(money.label, "Repair estimate total");
  assert.equal(money.normalized, "14850");
  assert(money.confidence <= 1);
  assert.equal(est.facts.find((f) => f.type === "damage" && f.id.includes("#c"))?.normalized, "roof_damage");
  assert(est.facts.some((f) => f.type === "address" && f.id.includes("#c")), "a quote spanning a line break still matches");
});

test("Claude returning nothing usable falls back with reason 'validation'", async () => {
  assert.throws(() => fromClaudeOutput(doc("doc-estimate"), []), /no facts/);
  const s = await runCase({ ...base, limits: fast, extractor: async (d) => fromClaudeOutput(d, []) });
  assert(s.events.some((e) => e.action === "Fell back to rules" && e.detail.includes("validation")));
  assert.equal(s.matches.find((m) => m.programId === "fema-appeal")!.readiness, 0.5);
});

test("Claude path with rules-equivalent facts is deep-equal to the rules-only run", async () => {
  const rules = await runCase(base);
  const claude = await runCase({ ...base, extractor: async (d) => fromClaudeOutput(d, asClaude(d)) });
  assert(claude.extractions.every((e) => e.method === "claude" && !e.issues?.length));
  assert.deepEqual(claude.matches, rules.matches);
  assert.deepEqual(claude.plan, rules.plan);
  const needs = (s: typeof rules) => s.needs.map((n) => [n.key, n.label, n.urgency, n.supportedBy.length]);
  assert.deepEqual(needs(claude), needs(rules));
  assert.equal(claude.evidenceScore, rules.evidenceScore);
});
