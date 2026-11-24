import { extractionLabel } from "../src/lib/labels";
import { isDemoId } from "../src/data/demoList";
import { createSampleCase, runSessionCase } from "../src/lib/cases";
import { runDemoCase } from "../src/lib/runDemo";

// Usage: npx tsx scripts/run-demo.ts [reyes|johnson|nguyen]
// Reyes takes the same path as POST /api/run (Claude when ANTHROPIC_API_KEY is set, rules otherwise).
// Johnson and Nguyen run as sample cases, which are always read by the rules engine.
const which = process.argv[2] ?? "reyes";
if (!isDemoId(which)) { console.error(`Unknown household "${which}". Use reyes, johnson or nguyen.`); process.exit(1); }
const started = Date.now();
(which === "reyes" ? runDemoCase() : createSampleCase("en", which).then((id) => runSessionCase(id)))
  .then((s) => {
    for (const e of s.events) console.log(`[${e.agent}] ${e.action}: ${e.detail}`);
    console.log("\nPEOPLE", s.people);
    console.log("CONFLICTS", s.conflicts.map((c) => [c.field, c.values.map((v) => v.value)]));
    for (const m of s.matches) console.log("MATCH", m.name, Math.round(m.readiness * 100) + "%", m.deadline?.date, "missing:", m.blockedBy);
    console.log("FOLLOWUP", s.followUp?.evidence, s.followUp?.why);
    for (const t of s.plan) console.log("TASK", t.owner, t.status, t.title, t.due ?? "");
    const x = s.extraction;
    console.log(`EXTRACTION ${extractionLabel(x)} (claude ${x.claude} · rules ${x.rules} · fell back ${x.fellBack})`);
    console.error(`\n(run took ${Date.now() - started} ms)`);
  });
