import { extractionLabel } from "../src/lib/labels";
import { runDemoCase } from "../src/lib/runDemo";

// Same path as POST /api/run: Claude extraction when ANTHROPIC_API_KEY is set, rules otherwise.
const started = Date.now();
runDemoCase()
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
