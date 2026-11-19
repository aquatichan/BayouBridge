import type { ActivityEvent, AgentName, CaseDocument, CaseState, ExtractionResult } from "@/lib/types";
import { extractWithRules } from "./evidence";
import { fallbackReason, withTimeout } from "./util";
import { summarizeIssues } from "./validate";
import {
  buildGraph, buildPlan, deriveNeeds, evidenceScore, findConflicts, matchPrograms, pickFollowUp, resolvePeople,
} from "./recovery";

// Coordinator — runs the agents as a task graph. Each task names the tasks it
// depends on. Tasks run once, in dependency order, and every step is logged so
// the activity feed shows exactly what happened and why.

export type Extractor = (doc: CaseDocument, opts?: { signal?: AbortSignal }) => Promise<ExtractionResult>;

/** Time limits for the Claude path. The rules engine never waits on any of these. */
export interface RunLimits {
  /** Longest one document's Claude call may take before it falls back to rules. */
  docMs: number;
  /** Longest all Claude extraction in one run may take. Later documents go straight to rules. */
  runMs: number;
  /** After this many fallbacks in one run, stop calling Claude for the remaining documents. */
  breakerAfter: number;
}

export const DEFAULT_LIMITS: RunLimits = { docMs: 15_000, runMs: 30_000, breakerAfter: 2 };

interface Task {
  id: string;
  agent: AgentName;
  deps: string[];
  run: () => Promise<void> | void;
}

// Rough minutes a caseworker spends on each step by hand (from navigator
// interviews to be done this week — placeholders until then).
const MANUAL_MINUTES = { extract: 8, people: 5, conflicts: 10, match: 25, gaps: 10, plan: 15, graph: 5 };

export async function runCase(input: {
  caseId: string; householdName: string; address: string; disaster: string; today: string;
  documents: CaseDocument[]; extractor?: Extractor; limits?: Partial<RunLimits>;
}): Promise<CaseState> {
  const events: ActivityEvent[] = [];
  const log = (agent: AgentName, action: string, detail: string, refs?: string[], minutesSaved?: number) =>
    events.push({ seq: events.length + 1, agent, action, detail, refs, minutesSaved });

  const state: CaseState = {
    caseId: input.caseId, householdName: input.householdName, address: input.address, disaster: input.disaster,
    today: input.today, documents: input.documents, extractions: [], people: [], needs: [], conflicts: [],
    matches: [], plan: [], graph: { nodes: [], edges: [] }, evidenceScore: 0, events, minutesSaved: 0,
    extraction: { claude: 0, rules: 0, fellBack: 0, mode: "rules" },
  };
  let aliasNotes: string[] = [];

  // ── Claude extraction with time limits, fallback and a circuit breaker ──
  // Every document always ends up with an extraction: if Claude is slow,
  // refuses, returns junk or errors, the rules engine reads that document.
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const runDeadline = Date.now() + limits.runMs;
  const breaker = new AbortController(); // aborts in-flight Claude calls once tripped
  let failures = 0;
  let settled = 0;

  async function extract(d: CaseDocument): Promise<ExtractionResult> {
    const claude = input.extractor;
    if (!claude) return extractWithRules(d);
    try {
      const budget = Math.min(limits.docMs, runDeadline - Date.now());
      if (breaker.signal.aborted) return extractWithRules(d); // covered by the "Claude skipped" event
      if (budget <= 0) {
        log("Evidence Agent", "Fell back to rules", `${d.filename}: timeout (the run's ${limits.runMs}ms Claude budget is used up). The rules engine read it instead.`, [d.id]);
        return extractWithRules(d);
      }
      const call = new AbortController();
      const cancel = () => call.abort();
      breaker.signal.addEventListener("abort", cancel, { once: true });
      try {
        return await withTimeout(claude(d, { signal: call.signal }), budget, "Claude call", call.signal);
      } catch (err) {
        call.abort(); // stop the HTTP request too, so no socket or timer is left behind
        if (breaker.signal.aborted) return extractWithRules(d); // cut short by the breaker
        failures++;
        log("Evidence Agent", "Fell back to rules", `${d.filename}: ${fallbackReason(err)} (${(err as Error).message}). The rules engine read it instead.`, [d.id]);
        const remaining = input.documents.length - settled - 1;
        if (failures >= limits.breakerAfter && remaining > 0) {
          log("Evidence Agent", "Claude skipped", `Switching to rules for remaining documents (${remaining} left) after ${failures} Claude failures in this run.`);
          breaker.abort();
        }
        return extractWithRules(d);
      } finally {
        breaker.signal.removeEventListener("abort", cancel);
      }
    } finally {
      settled++;
    }
  }

  const tasks: Task[] = [
    ...input.documents.map<Task>((d) => ({
      id: `extract:${d.id}`, agent: "Evidence Agent", deps: [],
      run: async () => {
        const ex = await extract(d);
        state.extractions.push(ex);
        const types = ex.evidenceTypes.length ? ex.evidenceTypes.join(", ").replaceAll("_", " ") : "context only";
        log("Evidence Agent", `Read ${d.filename}`, `${ex.facts.length} facts extracted (${ex.method}${summarizeIssues(ex.issues)}). Classified as: ${types}.`, [d.id], MANUAL_MINUTES.extract);
      },
    })),
    {
      id: "people", agent: "Evidence Agent", deps: input.documents.map((d) => `extract:${d.id}`),
      run: () => {
        const r = resolvePeople(state.extractions);
        state.people = r.people;
        aliasNotes = r.aliasNotes;
        log("Evidence Agent", "Resolved people", `${r.people.length} household members found. ${r.aliasNotes.join("; ") || "No duplicate names."}`, undefined, MANUAL_MINUTES.people);
      },
    },
    {
      id: "needs", agent: "Coordinator", deps: ["people"],
      run: () => {
        state.needs = deriveNeeds(state.extractions);
        log("Coordinator", "Built needs list", state.needs.map((n) => `${n.label} (${n.urgency})`).join(" · "));
      },
    },
    {
      id: "conflicts", agent: "Evidence Agent", deps: ["people"],
      run: () => {
        state.conflicts = findConflicts(state.extractions, aliasNotes);
        log("Evidence Agent", "Checked for conflicts", state.conflicts.length ? state.conflicts.map((c) => c.field).join(", ") + " disagree across documents." : "No conflicts.", undefined, MANUAL_MINUTES.conflicts);
      },
    },
    {
      id: "match", agent: "Recovery-Match Agent", deps: ["needs"],
      run: () => {
        state.matches = matchPrograms(state.documents, state.extractions, state.needs, state.today);
        log("Recovery-Match Agent", "Matched recovery pathways", `${state.matches.length} possible matches from the verified source list: ${state.matches.map((m) => m.name).join(", ")}.`, undefined, MANUAL_MINUTES.match);
      },
    },
    {
      id: "gaps", agent: "Follow-up Agent", deps: ["match"],
      run: () => {
        state.evidenceScore = evidenceScore(state.matches);
        state.followUp = pickFollowUp(state.matches, state.today);
        log("Follow-up Agent", "Scored evidence", `${state.evidenceScore}% of required evidence is on file.${state.followUp ? ` Best next ask: ${state.followUp.evidence.replaceAll("_", " ")}.` : ""}`, undefined, MANUAL_MINUTES.gaps);
      },
    },
    {
      id: "plan", agent: "Coordinator", deps: ["gaps", "conflicts"],
      run: () => {
        state.plan = buildPlan(state.matches, state.conflicts, state.followUp, state.today);
        log("Coordinator", "Built recovery plan", `${state.plan.length} tasks, ${state.plan.filter((t) => t.status === "blocked").length} blocked on missing evidence.`, undefined, MANUAL_MINUTES.plan);
      },
    },
    {
      id: "safety", agent: "Safety Agent", deps: ["plan"],
      run: () => {
        const gated = state.plan.filter((t) => t.status !== "blocked" && t.owner === "BayouBridge").length;
        log("Safety Agent", "Applied approval gates", `${gated} outbound actions held for navigator approval. Nothing is sent or submitted automatically.`);
      },
    },
    {
      id: "graph", agent: "Coordinator", deps: ["plan"],
      run: () => {
        state.graph = buildGraph(state.documents, state.extractions, state.needs, state.matches);
        log("Coordinator", "Updated recovery graph", `${state.graph.nodes.length} nodes, ${state.graph.edges.length} links.`, undefined, MANUAL_MINUTES.graph);
      },
    },
  ];

  // Run ready tasks in waves; independent tasks in a wave run in parallel.
  const done = new Set<string>();
  log("Coordinator", "Started case run", `${input.documents.length} documents queued. ${tasks.length} tasks in the graph.`);
  while (done.size < tasks.length) {
    const ready = tasks.filter((t) => !done.has(t.id) && t.deps.every((d) => done.has(d)));
    if (!ready.length) throw new Error("Task graph has a cycle or a missing dependency");
    await Promise.all(ready.map(async (t) => { await t.run(); done.add(t.id); }));
  }
  // Keep document order stable regardless of which extraction finished first.
  state.extractions.sort((a, b) => input.documents.findIndex((d) => d.id === a.docId) - input.documents.findIndex((d) => d.id === b.docId));
  const claude = state.extractions.filter((e) => e.method === "claude").length;
  const rules = state.extractions.length - claude;
  state.extraction = {
    claude, rules,
    fellBack: input.extractor ? rules : 0, // with Claude configured, every rules read is a fallback
    mode: claude === 0 ? "rules" : rules === 0 ? "claude" : "mixed",
  };
  state.minutesSaved = events.reduce((s, e) => s + (e.minutesSaved ?? 0), 0);
  log("Coordinator", "Run complete", `About ${state.minutesSaved} minutes of manual casework done (estimate).`);
  return state;
}
