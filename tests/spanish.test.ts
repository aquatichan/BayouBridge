import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_TODAY, documents, followUpDocuments, household } from "../src/data/household";
import { documents2, household2 } from "../src/data/household2";
import { runCase } from "../src/lib/agents/coordinator";
import { spanish, tr } from "../src/lib/es";
import type { CaseDocument, CaseState } from "../src/lib/types";

// Every agent-written string the dashboard shows has a Spanish version, for every
// demo household. A failure here means new English wording reached the screen
// without an entry in src/lib/es.ts.

const run = (h: typeof household, docs: CaseDocument[], approver?: "household") =>
  runCase({ caseId: h.caseId, householdName: h.name, address: h.address, disaster: h.disaster, today: DEMO_TODAY, documents: docs, approver });

/** The agent-written text CasePanel passes through tr(). */
function shown(s: CaseState): string[] {
  return [
    ...s.matches.flatMap((m) => [m.name, m.caveat, m.source.label, ...m.evidence.map((e) => e.label)]),
    ...s.plan.flatMap((t) => (t.id.startsWith("task:conflict") ? [t.title] : [t.title, t.detail])),
    ...(s.followUp ? [s.followUp.why, s.followUp.es] : []),
    ...s.needs.map((n) => n.label),
    ...s.people.map((p) => p.role),
    ...s.warnings,
    ...s.documents.map((d) => d.title),
    ...s.extractions.flatMap((x) => x.facts.map((f) => f.label)),
    ...s.packets.flatMap((p) => [p.title, p.to, ...p.attachments.map((a) => a.title)]),
  ];
}

test("every displayed agent string has Spanish, for every demo household", async () => {
  const states = await Promise.all([
    run(household, documents),
    run(household, [...documents, ...followUpDocuments]),
    run(household, documents, "household"),
    run(household2, documents2),
  ]);
  // The follow-up question is written in Spanish already; it only needs a pattern when it embeds an English label.
  const missing = [...new Set(states.flatMap(shown))].filter((x) => !/^[¿¡]|^Usted /.test(x) && spanish(x) === undefined);
  assert.deepEqual(missing, []);
});

test("templates keep names and numbers and translate the rest", () => {
  assert.equal(tr("Get Ruth's doctor to sign the critical care form", "es"), "Pedirle al médico de Ruth que firme el formulario de cuidado crítico");
  assert.equal(tr("Her CPAP machine needs power. Also make a backup plan for the next outage.", "es"),
    "Su máquina CPAP necesita electricidad. Haga también un plan de respaldo para el próximo apagón.");
  assert.equal(tr("Carmen's oxygen concentrator needs power. Also make a backup plan for the next outage.", "es"),
    "El concentrador de oxígeno de Carmen necesita electricidad. Haga también un plan de respaldo para el próximo apagón.");
  assert.equal(tr("Mother, 71, uses oxygen", "es"), "Madre, 71, usa oxígeno");
  assert.equal(tr("Food lost in 3-day outage", "es"), "Comida perdida en un apagón de 3 días");
  assert.equal(tr("Kitchen water damage", "es"), "Daño por agua en la cocina");
  assert.equal(tr("Waiting on: Photo ID, Proof of occupancy (utility bill, lease, or bank statement)", "es"),
    "Falta: Identificación con foto, Comprobante de residencia (factura de servicios, contrato de renta o estado de cuenta)");
  assert.equal(tr("Unblocks 2 pathways. The household already mentioned having it (September electric bill in email).", "es"),
    "Desbloquea 2 programas. La familia ya mencionó que lo tiene (factura de la luz de septiembre en su correo).");
  assert.equal(tr("Writing the plan failed, so the recovery graph is empty.", "es"), "Escribir el plan: falló, así que el mapa de recuperación está vacío.");
  assert.equal(tr("¿Puede compartir: Photo ID?", "es"), "¿Puede compartir: Identificación con foto?");
});

test("English stays English, and unknown text falls back to English", () => {
  assert.equal(tr("SBA disaster home loan", "en"), "SBA disaster home loan");
  assert.equal(tr("Something Claude wrote that we have never seen", "es"), "Something Claude wrote that we have never seen");
});

test("the Spanish packet cover has no English program or document names in it", async () => {
  const s = await run(household, [...documents, ...followUpDocuments]);
  for (const p of s.packets) {
    const es = p.bilingualCover.es;
    assert(!es.includes(p.title.replace(/: packet$/, "")), es);
    assert(!/household\)|Private insurer|decision letter|estimate\b/.test(es), es);
    assert(es.includes("del hogar Reyes"), es);
  }
});
