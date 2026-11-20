import assert from "node:assert/strict";
import { test } from "node:test";
import { runCase } from "../src/lib/agents/coordinator";
import { fromClaudeOutput } from "../src/lib/agents/llmExtract";
import { equipmentUser, findEquipment } from "../src/lib/equipment";
import { tr } from "../src/lib/es";
import { extractionLabel, extractionTooltip } from "../src/lib/labels";
import type { CaseDocument } from "../src/lib/types";

// Claude words a medical-power need its own way ("Husband uses a CPAP machine").
// The plan must still name the equipment cleanly and say whose it is.

const story: CaseDocument = {
  id: "st-1", kind: "voice_note", title: "In your own words", filename: "your-words.txt", mime: "text/plain",
  receivedAt: "2026-11-19", language: "en", source: "statement",
  text: "Our daughter Maya is 8. My husband uses a CPAP machine at night and we had no power for 5 days.",
};

const run = () => runCase({
  caseId: "t", householdName: "Your household", address: "2210 Telephone Rd, Houston, TX 77023", disaster: "Storm",
  today: "2026-11-19", documents: [story], approver: "household",
  extractor: async (d) => fromClaudeOutput(d, [{
    type: "need", label: "Medical equipment", value: "Husband uses a CPAP machine", normalized: "medical_power", confidence: 0.9,
    quote: "My husband uses a CPAP machine at night and we had no power for 5 days.",
  }]),
});

test("Claude's free-form equipment value becomes clean wording", async () => {
  const s = await run();
  assert.deepEqual(s.needs.map((n) => n.label), ["CPAP machine needs reliable power"]);
  const critical = s.plan.find((t) => t.programId === "critical-care")!;
  assert.equal(critical.title, "Get your husband's doctor to sign the critical care form");
  assert.equal(critical.detail, "His CPAP machine needs power. Also make a backup plan for the next outage.");
  assert.equal(s.followUp?.en, "Who is your husband's doctor? We can send them the form to list your home as a critical care customer.");
  assert(s.followUp?.es.startsWith("¿Quién es el médico de su esposo?"));
  assert.equal(tr(critical.title, "es"), "Pedirle al médico de su esposo que firme el formulario de cuidado crítico");
});

test("equipment and who uses it, in English and Spanish", () => {
  assert.equal(findEquipment("Mi mamá usa un concentrador de oxígeno"), "Oxygen concentrator");
  assert.equal(findEquipment("she is on oxygen"), "Oxygen equipment");
  assert.equal(findEquipment("his BiPAP"), "BiPAP machine");
  assert.equal(findEquipment("abuelo necesita diálisis"), "Dialysis machine");
  assert.equal(findEquipment("We lost the fan"), undefined);
  assert.equal(equipmentUser("Our daughter Maya is 8. My husband uses a CPAP machine."), "husband");
  assert.equal(equipmentUser("Mis hijos son pequeños. Mi esposo usa un CPAP."), "husband");
  assert.equal(equipmentUser("Los niños son pequeños y usan un nebulizador."), undefined, "Spanish 'son' is not a son");
});

test("the extractor badge reads in both languages", () => {
  const mixed = { claude: 3, rules: 2, fellBack: 2, mode: "mixed" as const };
  assert.equal(tr(extractionLabel(mixed), "es"), "Claude 3 · reglas 2");
  assert(tr(extractionTooltip(mixed), "es").startsWith("2 de 5 documentos pasaron al motor de reglas"));
  for (const x of [{ claude: 6, rules: 0, fellBack: 0, mode: "claude" as const }, { claude: 0, rules: 6, fellBack: 0, mode: "rules" as const },
    { claude: 0, rules: 6, fellBack: 6, mode: "rules" as const }]) {
    assert.notEqual(tr(extractionTooltip(x), "es"), extractionTooltip(x));
    if (x.mode === "rules") assert.equal(tr(extractionLabel(x), "es"), "el motor de reglas");
  }
});
