import assert from "node:assert/strict";
import { test } from "node:test";
import { createSampleCase, runSessionCase } from "../src/lib/cases";
import { spanish } from "../src/lib/es";

delete process.env.ANTHROPIC_API_KEY;

test("an owner's FEMA appeal asks for ownership, not a contractor estimate, and drafts the signed letter", async () => {
  const id = createSampleCase("en", "nguyen");
  let s = await runSessionCase(id, { addDocumentIds: ["doc-nguyen-bank-statement"] });
  const fema = s.matches.find((m) => m.programId === "fema-appeal")!;
  assert(fema.evidence.some((e) => e.type === "proof_of_ownership" && e.satisfiedBy.length));
  assert(!fema.evidence.some((e) => e.type === "repair_estimate"));
  const letter = s.packets.find((p) => p.programId === "fema-appeal")!.letter!;
  for (const need of ["Registration number: 9402-11786", "Disaster number: DR-9999-TX", "6127 Bissonnet St", "(signature)", "2026-12-29"]) assert(letter.en.includes(need), need);
  assert(letter.es.includes("Número de registro: 9402-11786") && letter.es.includes("(firma)"));
  s = await runSessionCase(id, { incremental: true });
});

test("an unnamed relative from Claude shows as a household member, not 'Husband / Husband'", () => {
  assert.equal(spanish("Household member, uses CPAP machine"), "Miembro del hogar, usa máquina CPAP");
  assert.equal(spanish("Husband"), "Esposo");
});
