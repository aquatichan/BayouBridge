import type { ActivityEvent, AgentName, CaseDocument, CaseState, ExtractionResult, TaskUpdate } from "@/lib/types";
import { classify, extractWithRules, occupancyCheck } from "./evidence";
import { fallbackReason, withTimeout } from "./util";
import { buildPacket } from "./packet";
import { summarizeIssues } from "./validate";
import {
  buildGraph, buildPlan, caseContext, deriveNeeds, evidenceScore, findConflicts, matchPrograms, pickFollowUp, resolvePeople,
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
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Which part of the case each task fills in, sent to `onState` when it finishes. */
const SLICES: Record<string, (keyof CaseState)[]> = {
  occupancy: ["extractions"], people: ["people"], needs: ["needs"], conflicts: ["conflicts"], match: ["matches"],
  gaps: ["evidenceScore", "followUp"], plan: ["plan"], packet: ["packets"], safety: ["plan"], graph: ["graph"],
};

const LABELS: Record<string, string> = {
  occupancy: "Checking proof of occupancy", people: "Resolving people", needs: "Building needs list",
  conflicts: "Checking for conflicts", match: "Matching recovery pathways", gaps: "Scoring evidence",
  plan: "Building the plan", packet: "Drafting packets", safety: "Applying approval gates", graph: "Updating the graph",
};

/** Optional live hooks. Callers that pass none get exactly the old behavior. */
export interface RunHooks {
  /** Every activity-log event, as it is logged. */
  onEvent?: (e: ActivityEvent) => void;
  /** The slice of state a task produced, right after it finishes (plus the initial state once at the start). */
  onState?: (partial: Partial<CaseState>) => void;
  /** A task started or finished. All extraction tasks start together. */
  onTask?: (t: TaskUpdate) => void;
  /** Aborts in-flight Claude calls (e.g. the browser disconnected); the run then finishes on rules. */
  signal?: AbortSignal;
}

const MANUAL_MINUTES = { extract: 8, occupancy: 5, people: 5, conflicts: 10, match: 25, gaps: 10, plan: 15, packet: 12, graph: 5 };

export async function runCase(input: {
  caseId: string; householdName: string; address: string; disaster: string; today: string;
  documents: CaseDocument[]; extractor?: Extractor; limits?: Partial<RunLimits>;
  /** Extractions from an earlier run to reuse by document id (incremental re-run when a new document arrives). */
  reuse?: ExtractionResult[];
  /** Test hook: called before each task runs; throw to simulate that step failing. */
  beforeTask?: (taskId: string) => void;
} & RunHooks): Promise<CaseState> {
  const events: ActivityEvent[] = [];
  const log = (agent: AgentName, action: string, detail: string, refs?: string[], minutesSaved?: number) => {
    const e: ActivityEvent = { seq: events.length + 1, agent, action, detail, refs, minutesSaved };
    events.push(e);
    input.onEvent?.(e);
  };
  const docOrder = (a: ExtractionResult, b: ExtractionResult) =>
    input.documents.findIndex((d) => d.id === a.docId) - input.documents.findIndex((d) => d.id === b.docId);
  // Sent before each "Read"/"Reused" event, so the UI never shows an event without its data.
  const publishExtractions = () => input.onState?.({ extractions: [...state.extractions].sort(docOrder) });

  const state: CaseState = {
    caseId: input.caseId, householdName: input.householdName, address: input.address, disaster: input.disaster,
    today: input.today, documents: input.documents, extractions: [], people: [], needs: [], conflicts: [],
    matches: [], plan: [], packets: [], graph: { nodes: [], edges: [] }, evidenceScore: 0, events, minutesSaved: 0,
    extraction: { claude: 0, rules: 0, fellBack: 0, mode: "rules" }, warnings: [],
  };
  let aliasNotes: string[] = [];
  /** Household wording (street, who uses medical equipment), read from the facts so far. */
  const ctx = () => caseContext(input.address, state.extractions);
  const bills = input.documents.filter((d) => d.kind === "utility_bill");

  // ── Claude extraction with time limits, fallback and a circuit breaker ──
  // Every document always ends up with an extraction: if Claude is slow,
  // refuses, returns junk or errors, the rules engine reads that document.
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const runDeadline = Date.now() + limits.runMs;
  const breaker = new AbortController(); // aborts in-flight Claude calls once tripped
  if (input.signal?.aborted) breaker.abort();
  else input.signal?.addEventListener("abort", () => breaker.abort(), { once: true });
  let failures = 0;
  let settled = 0;
  const reused = new Map((input.reuse ?? []).map((e) => [e.docId, e]));
  const toRead = input.documents.filter((d) => !reused.has(d.id)).length;

  async function extract(d: CaseDocument): Promise<ExtractionResult> {
    const claude = input.extractor;
    if (!claude) return extractWithRules(d);
    // Tell live viewers the rules engine has taken over this document.
    const viaRules = () => {
      input.onTask?.({ id: `extract:${d.id}`, agent: "Evidence Agent", label: `Reading ${d.filename}`, status: "started", via: "rules" });
      return extractWithRules(d);
    };
    try {
      const budget = Math.min(limits.docMs, runDeadline - Date.now());
      if (breaker.signal.aborted) return viaRules(); // covered by the "Claude skipped" event
      if (budget <= 0) {
        log("Evidence Agent", "Fell back to rules", `${d.filename}: timeout (the run's ${limits.runMs}ms Claude budget is used up). The rules engine read it instead.`, [d.id]);
        return viaRules();
      }
      const call = new AbortController();
      const cancel = () => call.abort();
      breaker.signal.addEventListener("abort", cancel, { once: true });
      try {
        return await withTimeout(claude(d, { signal: call.signal }), budget, "Claude call", call.signal);
      } catch (err) {
        call.abort(); // stop the HTTP request too, so no socket or timer is left behind
        if (breaker.signal.aborted) return viaRules(); // cut short by the breaker
        failures++;
        log("Evidence Agent", "Fell back to rules", `${d.filename}: ${fallbackReason(err)} (${(err as Error).message}). The rules engine read it instead.`, [d.id]);
        const remaining = toRead - settled - 1;
        if (failures >= limits.breakerAfter && remaining > 0) {
          log("Evidence Agent", "Claude skipped", `Switching to rules for remaining documents (${remaining} left) after ${failures} Claude failures in this run.`);
          breaker.abort();
        }
        return viaRules();
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
        const prev = reused.get(d.id);
        if (prev) {
          state.extractions.push(prev);
          publishExtractions();
          log("Evidence Agent", `Reused ${d.filename}`, `Already read in the previous run: ${prev.facts.length} facts (${prev.method}).`, [d.id]);
          return;
        }
        const ex = await extract(d);
        state.extractions.push(ex);
        publishExtractions();
        const types = ex.evidenceTypes.length ? ex.evidenceTypes.join(", ").replaceAll("_", " ")
          : d.kind === "utility_bill" ? "utility bill (occupancy check next)" : "context only";
        log("Evidence Agent", `Read ${d.filename}`, `${ex.facts.length} facts extracted (${ex.method}${summarizeIssues(ex.issues)}). Classified as: ${types}.`, [d.id], MANUAL_MINUTES.extract);
      },
    })),
    // Utility bills only count as proof of occupancy once every document is read:
    // the bill must pre-date the earliest date of loss any document states.
    ...(bills.length ? [{
      id: "occupancy", agent: "Evidence Agent" as const, deps: input.documents.map((d) => `extract:${d.id}`),
      run: () => {
        const losses = state.extractions.flatMap((e) => e.facts).filter((f) => f.type === "date_of_loss" && f.normalized).map((f) => f.normalized!).sort();
        const ctx = { address: input.address, dateOfLoss: losses[0] };
        for (const d of bills) {
          const i = state.extractions.findIndex((e) => e.docId === d.id);
          if (i < 0) continue;
          const ex = state.extractions[i];
          const check = occupancyCheck(ex.facts, ctx);
          state.extractions[i] = { ...ex, evidenceTypes: classify(d, ex.facts, ctx) }; // copy: reused extractions stay untouched
          log("Evidence Agent", check.ok ? "Verified proof of occupancy" : "Occupancy not verified", `${d.filename}: ${check.reason}.`, [d.id], check.ok ? MANUAL_MINUTES.occupancy : undefined);
        }
      },
    }] : []),
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
        state.needs = deriveNeeds(state.extractions, state.documents);
        log("Coordinator", "Built needs list", state.needs.map((n) => `${n.label} (${n.urgency})`).join(" · "));
      },
    },
    {
      id: "conflicts", agent: "Evidence Agent", deps: ["people"],
      run: () => {
        state.conflicts = findConflicts(state.extractions, aliasNotes, state.documents);
        log("Evidence Agent", "Checked for conflicts", state.conflicts.length ? state.conflicts.map((c) => c.field).join(", ") + " disagree across documents." : "No conflicts.", undefined, MANUAL_MINUTES.conflicts);
      },
    },
    {
      id: "match", agent: "Recovery-Match Agent", deps: ["needs", ...(bills.length ? ["occupancy"] : [])],
      run: () => {
        state.matches = matchPrograms(state.documents, state.extractions, state.needs, state.today, ctx());
        log("Recovery-Match Agent", "Matched recovery pathways", `${state.matches.length} possible matches from the verified source list: ${state.matches.map((m) => m.name).join(", ")}.`, undefined, MANUAL_MINUTES.match);
      },
    },
    {
      id: "gaps", agent: "Follow-up Agent", deps: ["match"],
      run: () => {
        state.evidenceScore = evidenceScore(state.matches);
        state.followUp = pickFollowUp(state.matches, state.today, ctx());
        log("Follow-up Agent", "Scored evidence", `${state.evidenceScore}% of required evidence is on file.${state.followUp ? ` Best next ask: ${state.followUp.evidence.replaceAll("_", " ")}.` : ""}`, undefined, MANUAL_MINUTES.gaps);
      },
    },
    {
      id: "plan", agent: "Coordinator", deps: ["gaps", "conflicts"],
      run: () => {
        state.plan = buildPlan(state.matches, state.conflicts, state.followUp, state.today, ctx());
        log("Coordinator", "Built recovery plan", `${state.plan.length} tasks, ${state.plan.filter((t) => t.status === "blocked").length} blocked on missing evidence.`, undefined, MANUAL_MINUTES.plan);
      },
    },
    {
      // Packets only for pathways with every required document on file.
      id: "packet", agent: "Packet Agent", deps: ["plan"],
      run: () => {
        state.packets = state.matches.filter((m) => !m.blocked).map((m) => buildPacket(m, state));
        for (const p of state.packets) {
          log("Packet Agent", `Drafted packet for ${state.matches.find((m) => m.programId === p.programId)?.name ?? p.programId}`,
            `${plural(p.attachments.length, "attachment")}, ${plural(p.citations.length, "cited fact")}, English and Spanish cover note. Held as a draft.`, p.attachments.map((a) => a.docId), MANUAL_MINUTES.packet);
        }
      },
    },
    {
      id: "safety", agent: "Safety Agent", deps: ["packet"],
      run: () => {
        // Every outbound action needs a navigator's approval, which only the server's approve route can record.
        state.plan = state.plan.map((t) => (t.owner === "BayouBridge" ? { ...t, requiresApproval: true } : t));
        const gated = state.plan.filter((t) => t.status !== "blocked" && t.requiresApproval).length;
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
  const labelOf = (t: Task) => LABELS[t.id] ?? `Reading ${input.documents.find((d) => `extract:${d.id}` === t.id)?.filename ?? t.id}`;
  const viaOf = (t: Task): TaskUpdate["via"] => !t.id.startsWith("extract:") ? undefined
    : reused.has(t.id.slice("extract:".length)) ? "reused" : input.extractor ? "claude" : "rules";
  const update = (t: Task, status: TaskUpdate["status"]) => input.onTask?.({ id: t.id, agent: t.agent, status, label: labelOf(t), via: viaOf(t) });
  const warn = (w: string) => { state.warnings.push(w); input.onState?.({ warnings: [...state.warnings] }); };

  // If one of these steps fails, the run carries on with a conservative default.
  // Steps without one (needs, match, plan) can't be guessed safely: their
  // dependents are skipped instead, and the run still finishes.
  const safeDefault = (id: string): { note: string; apply: () => void } | undefined => {
    if (id.startsWith("extract:")) {
      const docId = id.slice("extract:".length);
      return {
        note: "this document's facts are missing from the case",
        apply: () => { if (!state.extractions.some((e) => e.docId === docId)) state.extractions.push({ docId, evidenceTypes: [], facts: [], method: "rules", issues: ["dropped: extraction failed"] }); },
      };
    }
    const defaults: Record<string, { note: string; apply: () => void }> = {
      occupancy: { note: "utility bills were not counted as proof of occupancy", apply: () => {} },
      people: { note: "household members were not resolved", apply: () => { state.people = []; aliasNotes = []; } },
      conflicts: { note: "documents were not checked for conflicts", apply: () => { state.conflicts = []; } },
      gaps: { note: "no follow-up question was picked", apply: () => { state.followUp = undefined; } },
      packet: { note: "no packets were drafted, so nothing can be approved", apply: () => { state.packets = []; } },
      safety: { note: "approval gates were not applied, so nothing can be approved in this run", apply: () => {} },
      graph: { note: "the recovery graph is empty", apply: () => { state.graph = { nodes: [], edges: [] }; } },
    };
    return defaults[id];
  };
  const publish = (t: Task) => {
    const keys = SLICES[t.id]; // extraction tasks publish their own slice (publishExtractions)
    if (!input.onState || !keys) return;
    const partial: Partial<CaseState> = {};
    for (const k of keys) Object.assign(partial, { [k]: k === "extractions" ? [...state.extractions].sort(docOrder) : state[k] });
    input.onState(partial);
  };
  input.onState?.({ ...state, events: [] });
  log("Coordinator", "Started case run", `${input.documents.length} documents queued. ${tasks.length} tasks in the graph.`);
  const failed = new Set<string>(); // failed with no safe default, or skipped
  while (done.size + failed.size < tasks.length) {
    const open = tasks.filter((t) => !done.has(t.id) && !failed.has(t.id));
    const blocked = open.filter((t) => t.deps.some((d) => failed.has(d)));
    if (blocked.length) {
      for (const t of blocked) {
        failed.add(t.id);
        const dep = t.deps.find((d) => failed.has(d))!;
        log(t.agent, "Step skipped", `${labelOf(t)}: skipped because "${labelOf(tasks.find((x) => x.id === dep) ?? t)}" did not finish.`);
        warn(`${labelOf(t)} was skipped.`);
      }
      continue;
    }
    const ready = open.filter((t) => t.deps.every((d) => done.has(d)));
    if (!ready.length) {
      // A cycle or a missing dependency is a programming error. Never loop forever on it.
      for (const t of open) failed.add(t.id);
      log("Coordinator", "Step skipped", `${open.length} steps could not start (missing dependency).`);
      warn(`${open.length} steps could not start.`);
      break;
    }
    await Promise.all(ready.map(async (t) => {
      update(t, "started");
      try {
        input.beforeTask?.(t.id);
        const pending = t.run();
        if (pending) await pending; // sync tasks publish right after their event, with no gap
        done.add(t.id);
        update(t, "done");
        publish(t);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const fallback = safeDefault(t.id);
        log(t.agent, "Step failed", `${labelOf(t)}: ${msg}.${fallback ? ` Continuing: ${fallback.note}.` : " Steps that depend on it will be skipped."}`);
        update(t, "failed");
        if (fallback) {
          fallback.apply();
          done.add(t.id);
          warn(`${labelOf(t)} failed, so ${fallback.note}.`);
          if (t.id.startsWith("extract:")) publishExtractions(); else publish(t);
        } else {
          failed.add(t.id);
          warn(`${labelOf(t)} failed (${msg}).`);
        }
      }
    }));
  }
  // Keep document order stable regardless of which extraction finished first.
  state.extractions.sort(docOrder);
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
