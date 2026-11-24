import assert from "node:assert/strict";
import { test } from "node:test";
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { DeadlineStrip, LiveFeed, NextUp, ProgressRing, RecoveryPackage, WhyBlocked, missingOf } from "../src/components/app/Extras";
import { createSampleCase, runSessionCase } from "../src/lib/cases";
import { approveTask, resolveConflict } from "../src/lib/store";

// The test runner compiles JSX the classic way; Next.js uses the automatic runtime.
(globalThis as { React?: typeof React }).React = React;
delete process.env.ANTHROPIC_API_KEY;
const play = async (demo: "reyes" | "johnson" | "nguyen", add: string[] = []) => {
  const id = await createSampleCase("en", demo);
  return { id, s: await runSessionCase(id, add.length ? { addDocumentIds: add } : {}) };
};

test("a conflict answer reaches the appeal letter and the declaration, in the next run", async () => {
  const { id, s } = await play("reyes", ["doc-electric-bill", "doc-reyes-deed"]);
  const before = s.packets.find((p) => p.programId === "fema-appeal")!;
  assert(before.letter!.en.includes("Applicant: Ana Reyes") || before.letter!.en.includes("Ana Reyes"));
  assert((await resolveConflict(id, "conflict-name", "Anna Reyes-Ortega")).ok);
  assert((await resolveConflict(id, "conflict-date-of-loss", "October 10, 2026")).ok);
  const after = (await runSessionCase(id, { incremental: true })).packets.find((p) => p.programId === "fema-appeal")!;
  assert(after.letter!.en.includes("Anna Reyes-Ortega"), after.letter!.en);
  assert(after.form!.en.includes("Applicant: Anna Reyes-Ortega") && after.form!.en.includes("on October 10, 2026"), after.form!.en);
  assert(!after.form!.en.split("People who lived")[1].split("I declare")[0].includes("Anna Reyes-Ortega"), "the applicant is not listed as someone else");
});

test("the new panels render for each stage of a real run, in both languages", async () => {
  const { s } = await play("johnson");
  for (const lang of ["en", "es"] as const) {
    assert.match(html(h(ProgressRing, { s, lang })), /% /);
    const timeline = html(h(DeadlineStrip, { s, lang }));
    assert(timeline.includes(lang === "es" ? "Hoy" : "Today") && timeline.includes(lang === "es" ? "dic" : "Dec"), timeline.slice(0, 200));
    const blocked = s.plan.find((t) => t.status === "blocked" && t.programId);
    assert(blocked, "johnson starts with a waiting step");
    const why = html(h(WhyBlocked, { task: blocked, s, lang }));
    assert(why.includes(lang === "es" ? "¿Por qué está en espera?" : "Why is this waiting?") && why.includes("href="), why.slice(0, 200));
    assert(html(h(LiveFeed, { events: s.events, lang })).includes("→"));
  }
  assert(missingOf(s.plan.find((t) => t.programId === "fema-appeal")!, s).includes("proof_of_occupancy"));
  assert.equal(html(h(ProgressRing, { s: { ...s, matches: [] }, lang: "en" })), "", "no ring when nothing is matched");
});

test("Next up always names one real thing to do, until the case is complete", async () => {
  const base = { lang: "en" as const, sample: true, hasPile: true, laterInPile: true, startLeft: 0, household: "Johnson household", running: false };
  assert(html(h(NextUp, { ...base, s: null })).includes("Drop the Johnson household&#x27;s papers"));
  assert.equal(html(h(NextUp, { ...base, s: null, running: true })), "");
  const { id, s } = await play("johnson");
  assert(html(h(NextUp, { ...base, s, startLeft: 2 })).includes("other 2 papers"));
  assert(html(h(NextUp, { ...base, s })).includes("Find the paper the helpers asked for"));
  const done = await runSessionCase(id, { incremental: true, addDocumentIds: ["doc-johnson-pediatrician", "doc-johnson-lease"] });
  const out = [];
  for (const t of done.plan.filter((x) => x.status === "needs_approval")) { const r = await approveTask(id, t.id); assert(r.ok); out.push(r.item); }
  const fin = await runSessionCase(id, { incremental: true });
  const end = html(h(NextUp, { ...base, s: fin, laterInPile: false }));
  assert(end.includes("Download the recovery package"), end);
  assert(html(h(RecoveryPackage, { s: fin, outbox: out, events: fin.events, lang: "es" })).includes("Paquete de recuperación"));
});
