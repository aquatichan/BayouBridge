import { EVIDENCE_LABELS, programs, type ProgramRule } from "@/data/resources";
import type {
  CaseDocument, Conflict, EvidenceType, ExtractionResult, Fact, FollowUpQuestion,
  GraphEdge, GraphNode, Need, NeedKey, Person, PlanTask, ProgramMatch,
} from "@/lib/types";

// Deterministic reasoning over extracted facts. No LLM here: every output can be
// traced to a fact, and every fact to a quote in an uploaded document.

const allFacts = (ex: ExtractionResult[]) => ex.flatMap((e) => e.facts);

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);
}

// ── Entity resolution ────────────────────────────────────────────────────────

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);

/** Two names refer to the same person if their first names are near-identical and they share a surname token. */
export function sameName(a: string, b: string): boolean {
  const [fa, ...ra] = norm(a);
  const [fb, ...rb] = norm(b);
  if (!fa || !fb) return false;
  const firstClose = fa === fb || fa.replace(/(.)\1/g, "$1") === fb.replace(/(.)\1/g, "$1");
  const sharesSurname = ra.some((t) => rb.includes(t));
  return firstClose && sharesSurname;
}

export function resolvePeople(ex: ExtractionResult[]): { people: Person[]; aliasNotes: string[] } {
  const people: Person[] = [];
  const aliasNotes: string[] = [];
  for (const f of allFacts(ex).filter((f) => f.type === "person")) {
    const name = f.value.replace(/ \(age \d+\)/, "");
    const role = f.normalized === "role:mother" ? "Mother, 71, uses oxygen" : f.normalized === "role:son" ? "Son, 16" : "Head of household";
    const existing = people.find((p) => sameName(p.name, name) || p.aliases.includes(name));
    if (existing) {
      if (existing.name !== name && !existing.aliases.includes(name)) {
        existing.aliases.push(name);
        aliasNotes.push(`"${name}" matched to ${existing.name}`);
      }
      if (!existing.sourceDocs.includes(f.docId)) existing.sourceDocs.push(f.docId);
    } else {
      people.push({ name, aliases: [], role, sourceDocs: [f.docId] });
    }
  }
  return { people, aliasNotes };
}

// ── Needs ───────────────────────────────────────────────────────────────────

const NEED_META: Record<NeedKey, { label: string; urgency: Need["urgency"] }> = {
  medical_power: { label: "Oxygen concentrator needs reliable power", urgency: "critical" },
  roof_damage: { label: "Roof wind damage (tarped, not repaired)", urgency: "high" },
  fema_denial: { label: "FEMA said ineligible: occupancy not verified", urgency: "high" },
  interior_water_damage: { label: "Living room water damage", urgency: "medium" },
  food_loss: { label: "Food lost in 4-day outage", urgency: "medium" },
};

export function deriveNeeds(ex: ExtractionResult[]): Need[] {
  const map = new Map<NeedKey, string[]>();
  for (const f of allFacts(ex)) {
    let key: NeedKey | undefined;
    if ((f.type === "damage" || f.type === "need") && f.normalized && f.normalized in NEED_META) key = f.normalized as NeedKey;
    if (f.type === "determination" && f.normalized === "fema_ineligible_info") key = "fema_denial";
    if (key) map.set(key, [...(map.get(key) ?? []), f.id]);
  }
  const order = { critical: 0, high: 1, medium: 2 };
  return [...map.entries()]
    .map(([key, supportedBy]) => ({ key, ...NEED_META[key], supportedBy }))
    .sort((a, b) => order[a.urgency] - order[b.urgency]);
}

// ── Conflicts ───────────────────────────────────────────────────────────────

export function findConflicts(ex: ExtractionResult[], aliasNotes: string[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const losses = allFacts(ex).filter((f) => f.type === "date_of_loss" && f.normalized);
  const distinct = [...new Set(losses.map((f) => f.normalized))];
  if (distinct.length > 1) {
    conflicts.push({
      id: "conflict-date-of-loss",
      field: "Date of loss",
      values: losses.map((f) => ({ value: f.value, docId: f.docId, quote: f.quote })),
      impact: "Insurer and FEMA records disagree. Mismatched dates can delay a claim review.",
      question: {
        en: "Which day did the damage happen? FEMA has October 9 and the insurer has October 10.",
        es: "¿Qué día ocurrió el daño? FEMA tiene el 9 de octubre y la aseguradora tiene el 10 de octubre.",
      },
    });
  }
  const persons = allFacts(ex).filter((f) => f.type === "person" && !f.normalized?.startsWith("role:"));
  const variants = [...new Set(persons.map((p) => p.value))];
  if (variants.length > 1 && aliasNotes.length) {
    conflicts.push({
      id: "conflict-name",
      field: "Policyholder name",
      values: variants.map((v) => { const f = persons.find((p) => p.value === v)!; return { value: v, docId: f.docId, quote: f.quote }; }),
      impact: "The same person appears under different spellings. Insurers may ask for ID to match records.",
      question: {
        en: "Is your legal name Ana Reyes or Anna Reyes-Ortega? We'll ask the insurer to correct it.",
        es: "¿Su nombre legal es Ana Reyes o Anna Reyes-Ortega? Le pediremos a la aseguradora que lo corrija.",
      },
    });
  }
  return conflicts;
}

// ── Recovery-Match rules engine ────────────────────────────────────────────

function factValue(facts: Fact[], label: string): number | undefined {
  const f = facts.find((x) => x.type === "money" && x.label === label);
  return f?.normalized ? Number(f.normalized) : undefined;
}

/** Signals computed from facts that program triggers can reference. */
export function caseSignals(ex: ExtractionResult[]): Record<string, boolean> {
  const facts = allFacts(ex);
  const estimate = factValue(facts, "Repair estimate total") ?? 0;
  const deductible = factValue(facts, "Hurricane deductible") ?? 0;
  const interior = factValue(facts, "Interior repair line items") ?? 0;
  const floodExcluded = facts.some((f) => f.normalized === "flood_excluded");
  // Out-of-pocket = deductible + interior work that may fall under a flood exclusion.
  const outOfPocket = deductible + (floodExcluded ? interior : 0);
  return { coverage_gap: estimate > 0 && outOfPocket >= 2000 };
}

export function matchPrograms(
  docs: CaseDocument[], ex: ExtractionResult[], needs: Need[], today: string,
): ProgramMatch[] {
  const facts = allFacts(ex);
  const signals = caseSignals(ex);
  const have = (t: EvidenceType) => ex.filter((e) => e.evidenceTypes.includes(t)).map((e) => e.docId);
  const needKeys = new Set(needs.map((n) => n.key));

  return programs.map((p: ProgramRule) => {
    const firing = p.triggers.filter((t) => (t.need ? needKeys.has(t.need as NeedKey) : t.fact ? signals[t.fact] : false));
    const evidence = p.requires.map((r) => {
      const satisfiedBy = have(r.type);
      const hintFact = facts.find((f) => f.normalized === `has:${r.type}`);
      return { type: r.type, label: r.label, satisfiedBy, hint: satisfiedBy.length ? undefined : hintFact?.value };
    });
    const ok = evidence.filter((e) => e.satisfiedBy.length).length;
    const readiness = evidence.length ? ok / evidence.length : 1;

    let deadline: ProgramMatch["deadline"];
    if (p.deadline) {
      const f = facts.find((x) => x.normalized?.startsWith(p.deadline!.fromFact + ":"));
      if (f) {
        const base = f.normalized!.split(":")[1];
        deadline = { date: p.deadline.days ? addDays(base, p.deadline.days) : base, basis: p.deadline.basis };
      }
    }

    const missing = evidence.filter((e) => !e.satisfiedBy.length);
    const reasons = firing.map((t) => t.description);
    if (deadline) reasons.push(`Deadline ${deadline.date} (${daysBetween(today, deadline.date)} days left): ${deadline.basis}`);

    return {
      programId: p.id,
      name: p.name,
      status: firing.length ? "possible_match" : "not_indicated",
      reasons,
      evidence,
      readiness,
      deadline,
      nextAction: p.nextAction,
      blocked: missing.length > 0,
      blockedBy: missing.map((m) => m.label),
      source: p.source,
      caveat: p.caveat,
    } satisfies ProgramMatch;
  }).filter((m) => m.status === "possible_match")
    .sort((a, b) => (a.deadline?.date ?? "9999").localeCompare(b.deadline?.date ?? "9999"));
}

// ── Gap analysis ────────────────────────────────────────────────────────────

/** Share of required evidence (across matched programs, de-duplicated) that is on file. */
export function evidenceScore(matches: ProgramMatch[]): number {
  const req = new Map<EvidenceType, boolean>();
  for (const m of matches) for (const e of m.evidence) req.set(e.type, (req.get(e.type) ?? false) || e.satisfiedBy.length > 0);
  if (!req.size) return 100;
  return Math.round((100 * [...req.values()].filter(Boolean).length) / req.size);
}

const QUESTIONS: Partial<Record<EvidenceType, { en: string; es: string }>> = {
  proof_of_occupancy: {
    en: "You mentioned your September electric bill is in your email. Can you forward it to us? FEMA needs it to show you lived at 1847 Cypress Bayou Ln before the storm.",
    es: "Usted mencionó que tiene la factura de la luz de septiembre en su correo. ¿Nos la puede reenviar? FEMA la necesita para comprobar que vivía en 1847 Cypress Bayou Ln antes del huracán.",
  },
  insurance_policy: {
    en: "Do you have the first page of your homeowners policy (the declarations page)? It shows what is covered.",
    es: "¿Tiene la primera página de su póliza de seguro de vivienda (la página de declaraciones)? Muestra lo que está cubierto.",
  },
  medical_need_documentation: {
    en: "Who is Carmen's doctor? We can send them the form to list your home as a critical care customer.",
    es: "¿Quién es el médico de Carmen? Le podemos enviar el formulario para registrar su casa como cliente de cuidado crítico.",
  },
  proof_of_identity: {
    en: "Can you take a photo of your driver's license or state ID?",
    es: "¿Puede tomar una foto de su licencia de conducir o identificación estatal?",
  },
};

/**
 * Pick the single most valuable thing to ask the household for:
 * the missing item that unblocks the most programs, weighted by how close the
 * deadline is, with a bonus when the household already said they have it.
 */
export function pickFollowUp(matches: ProgramMatch[], today: string): FollowUpQuestion | undefined {
  const score = new Map<EvidenceType, { s: number; unblocks: string[]; hint?: string }>();
  for (const m of matches) {
    const urgency = m.deadline ? Math.max(1, 60 - daysBetween(today, m.deadline.date)) / 10 : 1;
    for (const e of m.evidence.filter((x) => !x.satisfiedBy.length)) {
      const cur = score.get(e.type) ?? { s: 0, unblocks: [] };
      cur.s += 1 + urgency + (e.hint ? 5 : 0); // the household already has it: easiest win
      cur.unblocks.push(m.programId);
      cur.hint ??= e.hint;
      score.set(e.type, cur);
    }
  }
  const best = [...score.entries()].sort((a, b) => b[1].s - a[1].s)[0];
  if (!best) return undefined;
  const [type, info] = best;
  const q = QUESTIONS[type] ?? { en: `Can you share: ${EVIDENCE_LABELS[type]}?`, es: `¿Puede compartir: ${EVIDENCE_LABELS[type]}?` };
  return {
    evidence: type,
    unblocks: info.unblocks,
    ...q,
    why: `Unblocks ${info.unblocks.length} pathway${info.unblocks.length > 1 ? "s" : ""}${info.hint ? `. The household already mentioned having it (${info.hint})` : ""}.`,
  };
}

// ── Plan ────────────────────────────────────────────────────────────────────

export function buildPlan(matches: ProgramMatch[], conflicts: Conflict[], followUp: FollowUpQuestion | undefined, today: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  const add = (t: Omit<PlanTask, "id">) => tasks.push({ id: `task-${tasks.length + 1}`, ...t });

  const critical = matches.find((m) => m.programId === "critical-care");
  if (critical) add({ title: "Get Carmen's doctor to sign the critical care form", owner: "Navigator", priority: 0, programId: critical.programId, status: "blocked", detail: "Her oxygen concentrator needs power. Also make a backup plan for the next outage." });

  for (const c of conflicts) add({ title: `Resolve conflict: ${c.field}`, owner: "Household", priority: 1, status: "ready", detail: c.question.en });

  if (followUp) add({ title: `Collect: ${EVIDENCE_LABELS[followUp.evidence]}`, owner: "Household", priority: 1, status: "ready", detail: followUp.why });

  for (const m of matches.filter((x) => x.programId !== "critical-care")) {
    const days = m.deadline ? daysBetween(today, m.deadline.date) : 90;
    add({
      title: m.nextAction,
      owner: m.programId === "sba-home-loan" ? "Navigator" : "BayouBridge",
      due: m.deadline?.date,
      priority: 2 + days / 100,
      programId: m.programId,
      status: m.blocked ? "blocked" : "needs_approval",
      detail: m.blocked ? `Waiting on: ${m.blockedBy.join(", ")}` : "Packet is ready. A navigator must approve before anything is sent.",
    });
  }
  return tasks.sort((a, b) => a.priority - b.priority);
}

// ── Recovery graph ──────────────────────────────────────────────────────────

const NEED_EVIDENCE: Record<NeedKey, string[]> = {
  roof_damage: ["roof_damage"],
  interior_water_damage: ["interior_water_damage"],
  medical_power: ["medical_power"],
  food_loss: ["food_loss"],
  fema_denial: ["fema_ineligible_info"],
};

const PROGRAM_NEEDS: Record<string, NeedKey[]> = {
  "fema-appeal": ["fema_denial", "roof_damage"],
  "insurance-claim": ["roof_damage", "interior_water_damage"],
  "sba-home-loan": ["roof_damage", "interior_water_damage"],
  "critical-care": ["medical_power"],
  "food-assistance": ["food_loss"],
};

export function buildGraph(docs: CaseDocument[], ex: ExtractionResult[], needs: Need[], matches: ProgramMatch[]) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const facts = allFacts(ex);
  for (const d of docs) nodes.push({ id: d.id, kind: "document", label: d.title, sub: d.filename });
  for (const n of needs) {
    nodes.push({ id: `need:${n.key}`, kind: "need", label: n.label, sub: n.urgency });
    const docIds = new Set(facts.filter((f) => NEED_EVIDENCE[n.key].includes(f.normalized ?? "")).map((f) => f.docId));
    for (const d of docIds) edges.push({ from: d, to: `need:${n.key}`, relation: "supports" });
  }
  const missingSeen = new Set<string>();
  for (const m of matches) {
    const pid = `program:${m.programId}`;
    nodes.push({ id: pid, kind: "program", label: m.name, sub: `${Math.round(m.readiness * 100)}% ready` });
    for (const k of PROGRAM_NEEDS[m.programId] ?? []) if (needs.some((n) => n.key === k)) edges.push({ from: `need:${k}`, to: pid, relation: "supports" });
    for (const e of m.evidence) {
      // Documents that feed no need (e.g. an insurer email) link straight to the pathway they support.
      for (const d of e.satisfiedBy) if (!edges.some((x) => x.from === d)) edges.push({ from: d, to: pid, relation: "supports" });
      if (e.satisfiedBy.length) continue;
      const mid = `missing:${e.type}`;
      if (!missingSeen.has(mid)) {
        missingSeen.add(mid);
        nodes.push({ id: mid, kind: "missing", label: e.label, sub: e.hint ? `Household has it: ${e.hint}` : "Not on file" });
      }
      edges.push({ from: mid, to: pid, relation: "blocks" });
    }
    if (m.deadline) {
      const did = `deadline:${m.programId}`;
      nodes.push({ id: did, kind: "deadline", label: m.deadline.date, sub: m.deadline.basis });
      edges.push({ from: pid, to: did, relation: "due" });
    }
  }
  return { nodes, edges };
}
