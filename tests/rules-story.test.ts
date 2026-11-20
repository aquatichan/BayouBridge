import assert from "node:assert/strict";
import { test } from "node:test";
import { runCase } from "../src/lib/agents/coordinator";
import { extractWithRules, storyDate } from "../src/lib/agents/evidence";
import { fromClaudeOutput } from "../src/lib/agents/llmExtract";
import { spanish } from "../src/lib/es";
import type { CaseDocument, CaseState } from "../src/lib/types";

// The offline rules engine reads a household's own words, not just the synthetic letters:
// what a survivor types into "In your own words" when no Claude key is set.

const say = (text: string, language: "en" | "es" = "en"): CaseDocument => ({
  id: "st-1", kind: "voice_note", title: "In your own words", filename: "your-words.txt", mime: "text/plain",
  receivedAt: "2026-11-19", text, language, source: "statement",
});
const run = (doc: CaseDocument) => runCase({
  caseId: "t", householdName: "Your household", address: "2210 Telephone Rd, Houston, TX 77023", disaster: "Storm",
  today: "2026-11-19", documents: [doc], approver: "household",
});
const facts = (doc: CaseDocument) => extractWithRules(doc).facts.map((f) => `${f.type}:${f.normalized ?? ""}:${f.value}`);

const EN = "Hurricane Delfina hit us on October 9, 2026. The wind ripped shingles off our roof and rain came into the kitchen, "
  + "the ceiling is stained and the floor is soaked. We rent our apartment at 2210 Telephone Rd. FEMA sent a letter saying we were denied. "
  + "My daughter Maya is 8 and my son Leo is 5. My husband uses a CPAP machine at night. We lost power for 5 days and all our food spoiled.";
const ES = "El huracán nos pegó el 9 de octubre. El viento se llevó parte del techo y entró agua a la sala. Rentamos la casa. "
  + "FEMA nos negó la ayuda. Mi mamá usa oxígeno. Mi hija Sofía tiene 6 años.";

test("an English story: storm date, roof, water, FEMA denial, renting, family, equipment and outage", async () => {
  const f = facts(say(EN));
  for (const want of ["date_of_loss:2026-10-09:", "damage:roof_damage:", "damage:interior_water_damage:", "determination:fema_ineligible_info:",
    "mentions_evidence:has:fema_determination:", "tenure:renter:", "person:role:daughter:Maya (age 8)", "person:role:son:Leo (age 5)",
    "need:medical_power:CPAP machine (husband)", "need:food_loss:Refrigerated food lost (5-day outage)"]) {
    assert(f.some((x) => x.startsWith(want)), `missing ${want} in ${f.join(" | ")}`);
  }
  const s = await run(say(EN));
  assert.deepEqual(s.needs.map((n) => n.label), ["CPAP machine needs reliable power", "Roof wind damage", "FEMA denied the application", "Kitchen water damage", "Food lost in 5-day outage"]);
  assert.deepEqual(s.people.map((p) => [p.name, p.role]), [["Maya", "Daughter, 8"], ["Leo", "Son, 5"]]);
  assert.equal(s.plan.find((t) => t.programId === "critical-care")?.title, "Get your husband's doctor to sign the critical care form");
  assert.equal(s.followUp?.evidence, "fema_determination", "they said they have the FEMA letter: ask for it first");
  assert(s.followUp?.en.startsWith("You mentioned FEMA sent you a letter."));
});

test("a Spanish story reads the same way", async () => {
  const f = facts(say(ES, "es"));
  for (const want of ["date_of_loss:2026-10-09:", "damage:roof_damage:", "damage:interior_water_damage:", "determination:fema_ineligible_info:",
    "tenure:renter:", "need:medical_power:Oxygen equipment (mother)", "person:role:daughter:Sofía (age 6)"]) {
    assert(f.some((x) => x.startsWith(want)), `missing ${want} in ${f.join(" | ")}`);
  }
  const s = await run(say(ES, "es"));
  assert(s.needs.some((n) => n.label === "Living room water damage"));
  assert.equal(s.plan.find((t) => t.programId === "critical-care")?.title, "Get your mother's doctor to sign the critical care form");
});

test("renters are not offered homeowner pathways; owners are", async () => {
  const renter = await run(say(EN));
  assert(!renter.matches.some((m) => m.programId === "insurance-claim" || m.programId === "sba-home-loan"));
  assert(renter.matches.some((m) => m.programId === "fema-appeal"), "FEMA help is for renters too");
  const owner = await run(say(EN.replace("We rent our apartment", "We own our house")));
  assert(owner.matches.some((m) => m.programId === "insurance-claim"));
});

test("no insurance: no insurance claim", async () => {
  const s = await run(say("We own our home. The storm on October 9 tore the roof open. We don't have insurance."));
  assert(!s.matches.some((m) => m.programId === "insurance-claim"));
  assert(s.extractions[0].facts.some((f) => f.normalized === "absent:insurance_policy"));
});

test("things that look like facts but aren't", () => {
  const f = (t: string, lang: "en" | "es" = "en") => facts(say(t, lang));
  assert(!f("Mis hijos son pequeños y usan un nebulizador.", "es").some((x) => x.includes("role:son")), "Spanish 'son' means 'they are'");
  assert(!f("my son is 5 and we lost the water bill").some((x) => x.startsWith("person") || x.includes("interior_water")), "no name, and a water bill is not water damage");
  assert(!f("The storm was scary.").some((x) => x.startsWith("date_of_loss")), "no date, no date of loss");
  assert(f("Our landlord has not fixed anything.").some((x) => x.startsWith("tenure:renter")));
  assert(!f("The storm hit on October 9. I have homeowners insurance.").some((x) => x.startsWith("tenure")), "homeowners insurance alone is not stated tenure");
});

test("story dates: with and without a year, English, Spanish and numeric", () => {
  assert.deepEqual(storyDate("It hit on Oct. 9th", "2026-11-19"), { text: "Oct. 9th", iso: "2026-10-09" });
  assert.equal(storyDate("the storm on December 28", "2027-01-05")?.iso, "2026-12-28", "a date later in the year than the document is last year's");
  assert.equal(storyDate("el 9 de octubre de 2026", "2026-11-19")?.iso, "2026-10-09");
  assert.equal(storyDate("on 10/9/2026", "2026-11-19")?.iso, "2026-10-09");
  assert.equal(storyDate("no date here", "2026-11-19"), undefined);
});

test("Claude's other relatives and tenure survive validation", () => {
  const doc = say(EN);
  const ex = fromClaudeOutput(doc, [
    { type: "person", label: "Daughter", value: "Maya (age 8)", normalized: "role:daughter", confidence: 0.9, quote: "My daughter Maya is 8" },
    { type: "person", label: "Husband", value: "Unnamed husband", normalized: "esposo", confidence: 0.9, quote: "My husband uses a CPAP machine at night." },
    { type: "tenure", label: "Housing", value: "Renter", normalized: "rents", confidence: 0.9, quote: "We rent our apartment at 2210 Telephone Rd." },
  ]);
  const by = (n: string) => ex.facts.find((f) => f.normalized === n);
  assert(by("role:daughter"));
  assert(by("role:husband"), "repaired from 'esposo'");
  assert(by("renter"), "repaired from 'rents'");
});

test("every label the stories put on screen has Spanish", async () => {
  const shown = (s: CaseState) => [
    ...s.needs.map((n) => n.label), ...s.people.map((p) => p.role), ...s.plan.flatMap((t) => [t.title, t.detail]),
    ...s.extractions.flatMap((x) => x.facts.flatMap((f) => [f.label, ...(f.quote === f.value ? [] : [f.value])])),
    ...(s.followUp ? [s.followUp.why] : []),
  ];
  const states = await Promise.all([run(say(EN)), run(say(ES, "es"))]);
  // Words copied from the household's own text stay as written; names with ages too.
  const fromText = (x: string) => [EN, ES].some((t) => t.includes(x.replace(/\.\.\.$/, ""))) || /^\p{Lu}\p{Ll}+ \(age \d+\)$/u.test(x);
  const missing = [...new Set(states.flatMap(shown))].filter((x) => !fromText(x) && spanish(x) === undefined);
  assert.deepEqual(missing, []);
});
