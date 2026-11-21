import assert from "node:assert/strict";
import { test } from "node:test";
import { createSampleCase, runSessionCase } from "../src/lib/cases";
import { OfficeDirector } from "../src/lib/office/director";
import { packetFileName, packetHtml, packetMarkdown } from "../src/lib/packetDoc";
import { approveTask } from "../src/lib/store";

delete process.env.ANTHROPIC_API_KEY;

test("an approved FEMA packet becomes a readable document, in both languages", async () => {
  const id = createSampleCase("en", "nguyen");
  const s = await runSessionCase(id, { addDocumentIds: ["doc-nguyen-bank-statement"] });
  const r = approveTask(id, "task:fema-appeal");
  assert(r.ok);
  const title = (d: string) => s.documents.find((x) => x.id === d)?.title ?? d;
  const md = packetMarkdown(r.item, "en", s.householdName, title);
  for (const want of ["# FEMA Individual Assistance appeal: packet", "**To:** FEMA", "## Appeal letter", "Registration number: 9402-11786", "## Enclosed documents", "nothing was sent"]) {
    assert(md.includes(want), want);
  }
  const es = packetMarkdown(r.item, "es", s.householdName, title);
  assert(es.includes("Apelación de Asistencia Individual de FEMA") && es.includes("Número de registro: 9402-11786"));
  const html = packetHtml(r.item, "en", s.householdName, title);
  assert(html.startsWith("<!doctype html>") && !html.includes("<script"));
  assert.equal(packetFileName(r.item), "fema-individual-assistance-appeal.md");
});

test("with ambient on, idle helpers find background work; off, they stay put", () => {
  const busy = Object.assign(new OfficeDirector(0), { ambient: true });
  const still = new OfficeDirector(0);
  for (let t = 0; t <= 4000; t += 50) { busy.tick(0.05, t); still.tick(0.05, t); }
  assert(Object.values(busy.mascots).every((m) => m.job?.key.startsWith("ambient:") || m.phase !== "idle"));
  assert(Object.values(still.mascots).every((m) => m.phase === "idle"));
});

test("FEMA packets carry a filled-in occupancy declaration, and the recovery package bundles everything", async () => {
  const { recoveryHtml, recoveryMarkdown } = await import("../src/lib/packetDoc");
  const id = createSampleCase("es", "johnson");
  let s = await runSessionCase(id, { addDocumentIds: ["doc-johnson-lease", "doc-johnson-pediatrician"] });
  const fema = s.packets.find((p) => p.programId === "fema-appeal")!;
  assert(fema.form!.en.includes("Applicant: Denise Johnson") && fema.form!.en.includes("Amara"), fema.form!.en);
  assert(fema.form!.es.includes("DECLARACIÓN DE RESIDENCIA") && fema.form!.es.includes("Firma:"));
  const items = s.plan.filter((t) => t.status === "needs_approval").map((t) => approveTask(id, t.id)).filter((r) => r.ok).map((r) => (r as { item: import("../src/lib/types").OutboxItem }).item);
  s = await runSessionCase(id, { incremental: true });
  const md = recoveryMarkdown(s, items, s.events, "es");
  assert(md.includes("# Paquete de recuperación") && md.includes("Declaración de residencia") && md.includes("🦫"));
  assert(recoveryHtml(s, items, s.events, "en").includes('aria-label="capybara"'));
});
