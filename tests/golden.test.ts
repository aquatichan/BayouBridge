import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { followUpDocuments } from "../src/data/household";
import { runCase } from "../src/lib/agents/coordinator";
import { base, stableView } from "./helpers";

// Golden test: the offline (rules) demo must not drift. To accept an intended
// change, regenerate with:  UPDATE_GOLDEN=1 npm test  and review the fixture diff.
const FIXTURE = new URL("./fixtures/rules-demo.json", import.meta.url);

test("rules-mode demo run matches the golden snapshot", async () => {
  const view = stableView(await runCase(base));
  if (process.env.UPDATE_GOLDEN) writeFileSync(FIXTURE, JSON.stringify(view, null, 2) + "\n");
  assert(existsSync(FIXTURE), "fixture missing: run UPDATE_GOLDEN=1 npm test once and commit tests/fixtures/rules-demo.json");
  assert.deepEqual(view, JSON.parse(readFileSync(FIXTURE, "utf8")));
});

test("headline numbers: 6 docs, FEMA appeal 50%, blocked on proof of occupancy and ownership", async () => {
  const s = await runCase(base);
  const fema = s.matches.find((m) => m.programId === "fema-appeal")!;
  assert.equal(s.extractions.length, 6);
  assert.equal(fema.readiness, 0.5);
  assert.deepEqual(fema.blockedBy, ["Proof of occupancy (utility bill, lease, or bank statement)", "Proof of ownership (deed, mortgage statement or property tax bill)"]);
  assert.equal(fema.deadline?.date, "2026-12-27");
  assert.equal(s.followUp?.evidence, "proof_of_occupancy");
  assert.equal(s.evidenceScore, 56);
  assert.deepEqual(s.extraction, { claude: 0, rules: 6, fellBack: 0, mode: "rules" });
});

test("the electric bill takes the FEMA appeal to 100% and changes the next ask", async () => {
  const s = await runCase({ ...base, documents: [...base.documents, ...followUpDocuments] });
  const fema = s.matches.find((m) => m.programId === "fema-appeal")!;
  assert.equal(fema.readiness, 1);
  assert.equal(fema.blocked, false);
  assert.equal(s.plan.find((t) => t.id === "task:fema-appeal")?.status, "needs_approval");
  assert(!s.graph.nodes.some((n) => n.id === "missing:proof_of_occupancy"));
  assert.equal(s.followUp?.evidence, "medical_need_documentation");
  assert.equal(s.people.length, 3, "Ana Reyes on the bill is not a new person");
  assert(s.packets.some((p) => p.programId === "fema-appeal" && p.attachments.some((a) => a.docId === "doc-electric-bill")));
});

test("a bill from after the storm, or for another address, is not proof of occupancy", async () => {
  const bill = followUpDocuments[0];
  const late = { ...bill, id: "doc-late", text: bill.text.replace("September 1, 2026 – September 30, 2026", "October 1, 2026 – October 31, 2026") };
  const other = { ...bill, id: "doc-other", text: bill.text.replace("1847 Cypress Bayou Ln", "22 Magnolia Dr") };
  for (const d of [late, other]) {
    const s = await runCase({ ...base, documents: [...base.documents, d] });
    assert.equal(s.matches.find((m) => m.programId === "fema-appeal")!.readiness, 0.5, d.id);
    assert(s.events.some((e) => e.action === "Occupancy not verified"), d.id);
  }
});

test("incremental re-run reuses earlier extractions and gives the same result", async () => {
  const first = await runCase(base);
  const docs = [...base.documents, ...followUpDocuments];
  const full = await runCase({ ...base, documents: docs });
  const inc = await runCase({ ...base, documents: docs, reuse: first.extractions });
  assert.equal(inc.events.filter((e) => e.action.startsWith("Reused ")).length, 6);
  assert.deepEqual(inc.matches, full.matches);
  assert.deepEqual(inc.plan, full.plan);
});
