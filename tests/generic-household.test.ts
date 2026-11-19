import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_TODAY } from "../src/data/household";
import { documents2, household2 } from "../src/data/household2";
import { runCase } from "../src/lib/agents/coordinator";

// Phase 9: the pipeline works for a second synthetic household with no code edits,
// and nothing about the Reyes household leaks into its output.
test("a second household gets its own names, address, dates and equipment", async () => {
  const s = await runCase({
    caseId: household2.caseId, householdName: household2.name, address: household2.address,
    disaster: household2.disaster, today: DEMO_TODAY, documents: documents2,
  });
  const text = JSON.stringify({ ...s, documents: undefined }); // the output, not the input text
  for (const reyes of ["Carmen", "Reyes", "Ortega", "Luis", "Cypress", "1847", "October 10", "oxygen", "Living room", "tarped", "4-day"]) {
    assert(!text.includes(reyes), `output mentions "${reyes}"`);
  }

  assert.deepEqual(s.people.map((p) => [p.name, p.role, p.aliases]), [
    ["Grace Okafor", "Head of household", ["Grace Okafor-Mensah"]],
    ["Ruth Okafor", "Mother, 78, uses CPAP machine", []],
  ]);
  assert.deepEqual(s.needs.map((n) => n.label), [
    "CPAP machine needs reliable power", "Roof wind damage", "FEMA said ineligible: occupancy not verified",
    "Kitchen water damage", "Food lost in 3-day outage",
  ]);
  const [dates, names] = s.conflicts;
  assert.equal(dates.question.en, "Which day did the damage happen? FEMA has October 9 and the insurer has October 8.");
  assert.equal(dates.question.es, "¿Qué día ocurrió el daño? FEMA tiene el 9 de octubre y la aseguradora tiene el 8 de octubre.");
  assert.equal(names.question.en, "Is your legal name Grace Okafor or Grace Okafor-Mensah? We'll ask the insurer to correct it.");
  assert.equal(s.followUp?.evidence, "proof_of_occupancy");
  assert.equal(s.followUp?.en, "You mentioned your September electric bill is in your email. Can you forward it to us? FEMA needs it to show you lived at 512 Willow Creek Dr before the storm.");
  const critical = s.plan.find((t) => t.programId === "critical-care")!;
  assert.equal(critical.title, "Get Ruth's doctor to sign the critical care form");
  assert.equal(critical.detail, "Her CPAP machine needs power. Also make a backup plan for the next outage.");
  assert.equal(s.matches.find((m) => m.programId === "critical-care")?.nextAction, "Ask Ruth's doctor to fill out the provider's critical care form.");
  assert.equal(s.matches.find((m) => m.programId === "fema-appeal")?.deadline?.date, "2026-12-29");
  assert(s.packets.every((p) => p.bilingualCover.en.includes("512 Willow Creek Dr")));
});
