import { DEMO_TODAY, documents, household } from "../src/data/household";
import { runCase } from "../src/lib/agents/coordinator";

runCase({ caseId: household.caseId, householdName: household.name, address: household.address, disaster: household.disaster, today: DEMO_TODAY, documents })
  .then((s) => {
    for (const e of s.events) console.log(`[${e.agent}] ${e.action}: ${e.detail}`);
    console.log("\nPEOPLE", s.people);
    console.log("CONFLICTS", s.conflicts.map((c) => [c.field, c.values.map((v) => v.value)]));
    for (const m of s.matches) console.log("MATCH", m.name, Math.round(m.readiness * 100) + "%", m.deadline?.date, "missing:", m.blockedBy);
    console.log("FOLLOWUP", s.followUp?.evidence, s.followUp?.why);
    for (const t of s.plan) console.log("TASK", t.owner, t.status, t.title, t.due ?? "");
  });
