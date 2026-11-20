import { EVIDENCE_LABELS, programs, type ProgramRule } from "@/data/resources";
import { equipmentUser, findEquipment, ROLES } from "@/lib/equipment";
import type {
  CaseDocument, Conflict, DocKind, EvidenceType, ExtractionResult, Fact, FollowUpQuestion,
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

// ── Household context ──────────────────────────────────────────────────────
// Names, places and equipment in the text below come from the case's own facts,
// so the same code works for any household (see src/data/household2.ts).

/** What household-specific wording needs: the street, and who depends on powered medical equipment. */
export interface CaseContext {
  street: string;
  /** Who approves outbound packets: a navigator (the demo script) or the household itself (the app). */
  approver?: "navigator" | "household";
  medical?: { first?: string; relation?: string; equipment: string };
}

const overlaps = (a: string, b: string) => a.includes(b) || b.includes(a);
/** The equipment a medical-power need is about: "Oxygen concentrator (Carmen, 71)" or Claude's "Husband uses a CPAP machine" → its name. */
const equipmentOf = (need: Fact) =>
  findEquipment(need.value) ?? findEquipment(need.quote)
  ?? (need.value.replace(/\s*\(.*\)$/, "").replace(/^.*\buses (?:an? )?/i, "").trim() || "Medical equipment");
/** "Oxygen concentrator" → "oxygen concentrator", but "CPAP machine" stays as is. */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const EQUIPMENT_SHORT: Record<string, string> = { "oxygen concentrator": "oxygen", "oxygen equipment": "oxygen" };

/** The relative named in the same sentence as a medical-equipment need, if any. */
function medicalFactFor(person: Fact, facts: Fact[]): Fact | undefined {
  return facts.find((n) => n.type === "need" && n.normalized === "medical_power" && n.docId === person.docId && overlaps(n.quote, person.quote));
}

export function caseContext(address: string, ex: ExtractionResult[], approver: CaseContext["approver"] = "navigator"): CaseContext {
  const facts = allFacts(ex);
  const street = address.split(",")[0].trim() || "your home";
  const need = facts.find((f) => f.type === "need" && f.normalized === "medical_power");
  if (!need) return { street, approver };
  const person = facts.find((f) => f.type === "person" && f.normalized?.startsWith("role:") && medicalFactFor(f, [need]));
  const named = need.value.match(/\((\p{Lu}[\p{L}'-]+)/u)?.[1]; // a capitalized first name, not "(husband)"
  return {
    street,
    approver,
    medical: {
      first: person ? person.value.split(/[\s(]/)[0] : named && named !== "household member" ? named : undefined,
      // No person fact for them (e.g. "My husband uses a CPAP machine"): the relative named next to the equipment.
      relation: person?.normalized?.slice("role:".length) ?? equipmentUser(need.quote) ?? equipmentUser(need.value),
      equipment: lowerFirst(equipmentOf(need)),
    },
  };
}

const RELATION: Record<string, string> = Object.fromEntries(ROLES.map((r) => [`role:${r}`, r[0].toUpperCase() + r.slice(1)]));
const PRONOUN: Record<string, string> = {
  mother: "Her", wife: "Her", daughter: "Her", grandmother: "Her", son: "His", husband: "His", father: "His", grandfather: "His",
};
const RELATIVE_ES: Record<string, string> = {
  mother: "mamá", father: "papá", wife: "esposa", husband: "esposo", daughter: "hija", son: "hijo", grandmother: "abuela", grandfather: "abuelo",
};
/** Who uses the equipment, for "___'s doctor": their name, else "your husband" (or "the husband" for a navigator), else "the household member". */
function member(ctx: CaseContext): string {
  const m = ctx.medical;
  if (m?.first) return m.first;
  if (m?.relation) return `${ctx.approver === "household" ? "your" : "the"} ${m.relation}`;
  return "the household member";
}

/** "Mother, 71, uses oxygen": relation, age and equipment, all read from the facts. */
function roleOf(f: Fact, facts: Fact[]): string {
  const relation = f.normalized ? RELATION[f.normalized] : undefined;
  if (!relation) return "Head of household";
  const age = f.value.match(/\(age (\d+)\)/)?.[1] ?? f.quote.match(/\b(?:tiene|is|aged?)\s+(\d{1,3})\b/i)?.[1];
  const need = medicalFactFor(f, facts);
  const equipment = need ? lowerFirst(equipmentOf(need)) : undefined;
  return [relation, age, equipment && `uses ${EQUIPMENT_SHORT[equipment] ?? equipment}`].filter(Boolean).join(", ");
}

export function resolvePeople(ex: ExtractionResult[]): { people: Person[]; aliasNotes: string[] } {
  const people: Person[] = [];
  const aliasNotes: string[] = [];
  const facts = allFacts(ex);
  for (const f of facts.filter((f) => f.type === "person")) {
    const name = f.value.replace(/ \(age \d+\)/, "");
    const role = roleOf(f, facts);
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
  medical_power: { label: "Powered medical equipment needs reliable power", urgency: "critical" },
  roof_damage: { label: "Roof wind damage (tarped, not repaired)", urgency: "high" },
  fema_denial: { label: "FEMA said ineligible: occupancy not verified", urgency: "high" },
  interior_water_damage: { label: "Living room water damage", urgency: "medium" },
  food_loss: { label: "Food lost in power outage", urgency: "medium" },
};

const ROOMS = ["living room", "kitchen", "bedroom", "bathroom", "garage"];
/** Spanish names for the same rooms, so "entró agua a la sala" is living-room water damage. */
const ROOMS_ES: [RegExp, string][] = [[/\bsala\b/, "living room"], [/\bcocina\b/, "kitchen"], [/\b(?:cuarto|rec[aá]mara|dormitorio|habitaci[oó]n)\b/, "bedroom"], [/\bba[ñn]o\b/, "bathroom"], [/\bgaraje\b|\bcochera\b/, "garage"]];

export function deriveNeeds(ex: ExtractionResult[], docs: CaseDocument[] = []): Need[] {
  const map = new Map<NeedKey, string[]>();
  for (const f of allFacts(ex)) {
    let key: NeedKey | undefined;
    if ((f.type === "damage" || f.type === "need") && f.normalized && f.normalized in NEED_META) key = f.normalized as NeedKey;
    if (f.type === "determination" && f.normalized === "fema_ineligible_info") key = "fema_denial";
    if (key) map.set(key, [...(map.get(key) ?? []), f.id]);
  }
  const order = { critical: 0, high: 1, medium: 2 };
  const facts = allFacts(ex);
  // Labels that depend on the household come from the supporting facts and their documents.
  const labelFor = (key: NeedKey, ids: string[]) => {
    const first = facts.find((f) => f.id === ids[0]);
    const v = first?.value ?? "";
    const text = docs.filter((d) => ids.some((id) => facts.find((f) => f.id === id)?.docId === d.id)).map((d) => d.text.toLowerCase()).join("\n");
    if (key === "medical_power" && first) return `${equipmentOf(first)} needs reliable power`;
    const outage = v.match(/\(([^)]*outage)\)/)?.[1];
    if (key === "food_loss") return outage ? `Food lost in ${outage}` : "Food lost in power outage";
    if (key === "roof_damage" && docs.length) return /\btarp/.test(text) ? NEED_META.roof_damage.label : "Roof wind damage";
    if (key === "interior_water_damage" && docs.length) {
      const room = ROOMS.find((r) => text.includes(r)) ?? ROOMS_ES.find(([re]) => re.test(text))?.[1];
      return room ? `${room[0].toUpperCase()}${room.slice(1)} water damage` : "Interior water damage";
    }
    // Only a FEMA letter that says so names the reason; a household's "FEMA denied us" doesn't.
    if (key === "fema_denial" && !facts.some((f) => f.normalized === "missing:proof_of_occupancy")) return "FEMA denied the application";
    return NEED_META[key].label;
  };
  return [...map.entries()]
    .map(([key, supportedBy]) => ({ key, ...NEED_META[key], label: labelFor(key, supportedBy), supportedBy }))
    .sort((a, b) => order[a.urgency] - order[b.urgency]);
}

// ── Conflicts ───────────────────────────────────────────────────────────────

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dayEn = (iso: string) => `${MONTHS_EN[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const dayEs = (iso: string) => `el ${Number(iso.slice(8, 10))} de ${MONTHS_ES[Number(iso.slice(5, 7)) - 1]}`;

/** How a question names the source of a fact. */
const SOURCE: Partial<Record<DocKind, { en: string; es: string }>> = {
  fema_letter: { en: "FEMA", es: "FEMA" },
  insurance_email: { en: "the insurer", es: "la aseguradora" },
  estimate: { en: "the contractor's estimate", es: "el presupuesto del contratista" },
  utility_bill: { en: "the utility bill", es: "la factura" },
  bank_statement: { en: "the bank statement", es: "el estado de cuenta" },
  insurance_policy: { en: "the insurance policy", es: "la póliza de seguro" },
  lease: { en: "the lease", es: "el contrato de renta" },
  voice_note: { en: "your voice note", es: "su nota de voz" },
  photo: { en: "a photo", es: "una foto" },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const joinList = (xs: string[], and: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);
const toEs = (s: string) => (s.startsWith("el ") ? `al ${s.slice(3)}` : `a ${s}`); // "a + el" contracts to "al"

export function findConflicts(ex: ExtractionResult[], aliasNotes: string[], docs: CaseDocument[] = []): Conflict[] {
  const conflicts: Conflict[] = [];
  const sourceOf = (docId: string) => SOURCE[docs.find((d) => d.id === docId)?.kind as DocKind] ?? { en: "one document", es: "un documento" };
  const losses = allFacts(ex).filter((f) => f.type === "date_of_loss" && f.normalized);
  const distinct = [...new Set(losses.map((f) => f.normalized!))];
  if (distinct.length > 1) {
    // One clause per date, naming the first document that states it.
    const parts = distinct.map((iso) => ({ iso, src: sourceOf(losses.find((f) => f.normalized === iso)!.docId) }));
    conflicts.push({
      id: "conflict-date-of-loss",
      field: "Date of loss",
      values: losses.map((f) => ({ value: f.value, docId: f.docId, quote: f.quote })),
      impact: `${parts.map((p) => p.src.en).sort().join() === "FEMA,the insurer" ? "Insurer and FEMA records" : "The documents"} disagree. Mismatched dates can delay a claim review.`,
      question: {
        en: `Which day did the damage happen? ${cap(joinList(parts.map((p) => `${p.src.en} has ${dayEn(p.iso)}`), "and"))}.`,
        es: `¿Qué día ocurrió el daño? ${cap(joinList(parts.map((p) => `${p.src.es} tiene ${dayEs(p.iso)}`), "y"))}.`,
      },
    });
  }
  const persons = allFacts(ex).filter((f) => f.type === "person" && !f.normalized?.startsWith("role:"));
  const variants = [...new Set(persons.map((p) => p.value))];
  if (variants.length > 1 && aliasNotes.length) {
    // The spelling found in the fewest documents is probably the one to correct.
    const docCount = (v: string) => new Set(persons.filter((p) => p.value === v).map((p) => p.docId)).size;
    const odd = variants.reduce((a, b) => (docCount(b) < docCount(a) ? b : a));
    const who = sourceOf(persons.find((p) => p.value === odd)!.docId);
    conflicts.push({
      id: "conflict-name",
      field: "Policyholder name",
      values: variants.map((v) => { const f = persons.find((p) => p.value === v)!; return { value: v, docId: f.docId, quote: f.quote }; }),
      impact: "The same person appears under different spellings. Insurers may ask for ID to match records.",
      question: {
        en: `Is your legal name ${joinList(variants, "or")}? We'll ask ${who.en} to correct it.`,
        es: `¿Su nombre legal es ${joinList(variants, "o")}? Le pediremos ${toEs(who.es)} que lo corrija.`,
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
  docs: CaseDocument[], ex: ExtractionResult[], needs: Need[], today: string, ctx?: CaseContext,
): ProgramMatch[] {
  const facts = allFacts(ex);
  const signals = caseSignals(ex);
  const have = (t: EvidenceType) => ex.filter((e) => e.evidenceTypes.includes(t)).map((e) => e.docId);
  const needKeys = new Set(needs.map((n) => n.key));
  const tenure = tenureOf(facts, docs);
  const uninsured = facts.some((f) => f.normalized === "absent:insurance_policy")
    && !have("insurance_correspondence").length && !have("insurance_policy").length;

  return programs.filter((p) => !(p.ownersOnly && tenure === "renter") && !(p.needsInsurance && uninsured)).map((p: ProgramRule) => {
    const firing = p.triggers.filter((t) => (t.need ? needKeys.has(t.need as NeedKey) : t.fact ? signals[t.fact] : false));
    const requires = tenure === "renter" && p.requiresForRenters ? p.requiresForRenters : p.requires;
    const evidence = requires.map((r) => {
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
    const equipment = ctx?.medical?.equipment;
    const withArticle = equipment ? `${/^[aeiou]/i.test(equipment) ? "an" : "a"} ${equipment}` : "powered medical equipment";
    const reasons = firing.map((t) => t.description.replace("{equipment}", withArticle));
    if (deadline) reasons.push(`Deadline ${deadline.date} (${daysBetween(today, deadline.date)} days left): ${deadline.basis}`);

    return {
      programId: p.id,
      name: p.name,
      status: firing.length ? "possible_match" : "not_indicated",
      reasons,
      evidence,
      readiness,
      deadline,
      nextAction: (ctx?.approver === "household" && p.nextActionHousehold ? p.nextActionHousehold : p.nextAction)
        .replace("{member}", ctx ? member(ctx) : "the household member"),
      blocked: missing.length > 0,
      blockedBy: missing.map((m) => m.label),
      source: p.source,
      caveat: p.caveat,
    } satisfies ProgramMatch;
  }).filter((m) => m.status === "possible_match")
    .sort((a, b) => (a.deadline?.date ?? "9999").localeCompare(b.deadline?.date ?? "9999"));
}

/** "renter" or "owner" when the documents say so (a lease on file counts as renting); undefined when unknown or mixed. */
export function tenureOf(facts: Fact[], docs: CaseDocument[]): "renter" | "owner" | undefined {
  const said = new Set(facts.filter((f) => f.type === "tenure").map((f) => f.normalized));
  if (docs.some((d) => d.kind === "lease")) said.add("renter");
  if (docs.some((d) => d.kind === "deed")) said.add("owner");
  return said.size === 1 ? (said.has("renter") ? "renter" : said.has("owner") ? "owner" : undefined) : undefined;
}

// ── Gap analysis ────────────────────────────────────────────────────────────

/** Share of required evidence (across matched programs, de-duplicated) that is on file. */
export function evidenceScore(matches: ProgramMatch[]): number {
  const req = new Map<EvidenceType, boolean>();
  for (const m of matches) for (const e of m.evidence) req.set(e.type, (req.get(e.type) ?? false) || e.satisfiedBy.length > 0);
  if (!req.size) return 100;
  return Math.round((100 * [...req.values()].filter(Boolean).length) / req.size);
}

/** The follow-up question for a missing evidence type, worded from the household's own facts. */
function questionFor(type: EvidenceType, ctx: CaseContext, hint?: string): { en: string; es: string } | undefined {
  if (type === "proof_of_occupancy") {
    const bill = hint?.match(/^(?:(\w+) )?electric bill in email$/i);
    const mes = bill?.[1] && MONTHS_ES[MONTHS_EN.indexOf(bill[1])];
    const ask = bill
      ? { en: `You mentioned your ${bill[1] ? `${bill[1]} ` : ""}electric bill is in your email. Can you forward it to us?`,
          es: `Usted mencionó que tiene la factura de la luz${mes ? ` de ${mes}` : ""} en su correo. ¿Nos la puede reenviar?` }
      : hint
        ? { en: `You mentioned you have it (${hint}). Can you send it to us?`, es: `Usted mencionó que lo tiene (${hint}). ¿Nos lo puede enviar?` }
        : { en: "Can you share a utility bill, lease, or bank statement from before the storm?",
            es: "¿Puede compartir una factura de servicios, un contrato de renta o un estado de cuenta de antes del huracán?" };
    return {
      en: `${ask.en} FEMA needs it to show you lived at ${ctx.street} before the storm.`,
      es: `${ask.es} FEMA ${bill || !hint ? "la" : "lo"} necesita para comprobar que vivía en ${ctx.street} antes del huracán.`,
    };
  }
  if (type === "medical_need_documentation") {
    const first = ctx.medical?.first;
    const rel = ctx.medical?.relation;
    return {
      en: `Who is ${member(ctx)}'s doctor? We can send them the form to list your home as a critical care customer.`,
      es: `¿Quién es el médico de ${first ?? (rel && RELATIVE_ES[rel] ? `su ${RELATIVE_ES[rel]}` : "su familiar")}? Le podemos enviar el formulario para registrar su casa como cliente de cuidado crítico.`,
    };
  }
  if (type === "fema_determination" && hint) {
    return {
      en: "You mentioned FEMA sent you a letter. Can you take a photo of it? The appeal starts from what it says and the date on it.",
      es: "Usted mencionó que FEMA le envió una carta. ¿Le puede tomar una foto? La apelación parte de lo que dice y de su fecha.",
    };
  }
  return QUESTIONS[type];
}

const QUESTIONS: Partial<Record<EvidenceType, { en: string; es: string }>> = {
  damage_photo: {
    en: "Can you take a few photos of the damage? Wide shots of each room and close-ups of the roof, ceiling and floors help most.",
    es: "¿Puede tomar unas fotos de los daños? Sirven más las fotos de cada cuarto completo y de cerca del techo, el cielo raso y los pisos.",
  },
  fema_determination: {
    en: "Do you have the letter FEMA sent you about your application? A photo of every page is enough.",
    es: "¿Tiene la carta que FEMA le envió sobre su solicitud? Basta con una foto de cada página.",
  },
  repair_estimate: {
    en: "Has a contractor given you a written repair estimate? A photo of it is enough.",
    es: "¿Algún contratista le dio un presupuesto de reparación por escrito? Basta con una foto.",
  },
  insurance_correspondence: {
    en: "Have you received any letter or email from your insurance company about this claim?",
    es: "¿Ha recibido alguna carta o correo de su compañía de seguros sobre este reclamo?",
  },
  loss_statement: {
    en: "Can you tell us in your own words what you lost, like food, clothes or furniture?",
    es: "¿Nos puede contar con sus propias palabras qué perdió, como comida, ropa o muebles?",
  },
  insurance_policy: {
    en: "Do you have the first page of your homeowners policy (the declarations page)? It shows what is covered.",
    es: "¿Tiene la primera página de su póliza de seguro de vivienda (la página de declaraciones)? Muestra lo que está cubierto.",
  },
  proof_of_identity: {
    en: "Can you take a photo of your driver's license or state ID?",
    es: "¿Puede tomar una foto de su licencia de conducir o identificación estatal?",
  },
};

/** Pathways that serve a critical (safety) need, e.g. power for an oxygen concentrator. */
const servesCriticalNeed = (programId: string) =>
  (PROGRAM_NEEDS[programId] ?? []).some((k) => NEED_META[k].urgency === "critical");

/**
 * Pick the single most valuable thing to ask the household for:
 * the missing item that unblocks the most programs, weighted by how close the
 * deadline is, with a bonus when the household already said they have it and
 * a smaller one when it unblocks a pathway for a critical (safety) need.
 */
export function pickFollowUp(matches: ProgramMatch[], today: string, ctx: CaseContext = { street: "your home" }): FollowUpQuestion | undefined {
  const score = new Map<EvidenceType, { s: number; unblocks: string[]; hint?: string }>();
  for (const m of matches) {
    const urgency = m.deadline ? Math.max(1, 60 - daysBetween(today, m.deadline.date)) / 10 : 1;
    for (const e of m.evidence.filter((x) => !x.satisfiedBy.length)) {
      const cur = score.get(e.type) ?? { s: 0, unblocks: [] };
      cur.s += 1 + urgency + (e.hint ? 5 : 0) // the household already has it: easiest win
        + (servesCriticalNeed(m.programId) ? 2 : 0); // safety before paperwork when nothing else separates them
      cur.unblocks.push(m.programId);
      cur.hint ??= e.hint;
      score.set(e.type, cur);
    }
  }
  const best = [...score.entries()].sort((a, b) => b[1].s - a[1].s)[0];
  if (!best) return undefined;
  const [type, info] = best;
  const q = questionFor(type, ctx, info.hint) ?? { en: `Can you share: ${EVIDENCE_LABELS[type]}?`, es: `¿Puede compartir: ${EVIDENCE_LABELS[type]}?` };
  return {
    evidence: type,
    unblocks: info.unblocks,
    ...q,
    why: `Unblocks ${info.unblocks.length} pathway${info.unblocks.length > 1 ? "s" : ""}${info.hint ? `. The household already mentioned having it (${info.hint})` : ""}.`,
  };
}

// ── Plan ────────────────────────────────────────────────────────────────────

export function buildPlan(
  matches: ProgramMatch[], conflicts: Conflict[], followUp: FollowUpQuestion | undefined, today: string,
  ctx: CaseContext = { street: "your home" },
): PlanTask[] {
  const tasks: PlanTask[] = [];
  // Ids come from what the task is about, not its position, so an approval still
  // points at the same task after a re-run changes the plan (e.g. a new document).
  const add = (id: string, t: Omit<PlanTask, "id">) => tasks.push({ id: `task:${id}`, ...t });

  const critical = matches.find((m) => m.programId === "critical-care");
  if (critical) {
    const m = ctx.medical;
    // "Her"/"His" only when the documents state the relationship; otherwise the person's name.
    const whose = (m?.relation && PRONOUN[m.relation]) ?? (m?.first ? `${m.first}'s` : "Their");
    // Until the doctor's form is on file this is the caseworker's to chase; once it is, the packet to the provider waits for approval.
    add(critical.programId, critical.blocked ? {
      title: `Get ${member(ctx)}'s doctor to sign the critical care form`,
      owner: "Navigator", priority: 0, programId: critical.programId, status: "blocked",
      detail: `${whose} ${m?.equipment ?? "medical equipment"} needs power. Also make a backup plan for the next outage.`,
    } : {
      title: `Send ${member(ctx)}'s critical care form to the electric provider`,
      owner: "BayouBridge", priority: 0, programId: critical.programId, status: "needs_approval",
      detail: ctx.approver === "household" ? "Packet is ready. Nothing is sent until you approve it." : "Packet is ready. A navigator must approve before anything is sent.",
    });
  }

  for (const c of conflicts) add(c.id, { title: `Resolve conflict: ${c.field}`, owner: "Household", priority: 1, status: "ready", detail: c.question.en });

  if (followUp) add(`collect:${followUp.evidence}`, { title: `Collect: ${EVIDENCE_LABELS[followUp.evidence]}`, owner: "Household", priority: 1, status: "ready", detail: followUp.why });

  for (const m of matches.filter((x) => x.programId !== "critical-care")) {
    const days = m.deadline ? daysBetween(today, m.deadline.date) : 90;
    add(m.programId, {
      title: m.nextAction,
      // A loan is the family's decision: a caseworker talks it through, but in the app the household approves it themselves.
      owner: m.programId === "sba-home-loan" && ctx.approver !== "household" ? "Navigator" : "BayouBridge",
      due: m.deadline?.date,
      priority: 2 + days / 100,
      programId: m.programId,
      status: m.blocked ? "blocked" : "needs_approval",
      detail: m.blocked ? `Waiting on: ${m.blockedBy.join(", ")}`
        : ctx.approver === "household" ? "Packet is ready. Nothing is sent until you approve it."
        : "Packet is ready. A navigator must approve before anything is sent.",
    });
  }
  return tasks.sort((a, b) => a.priority - b.priority);
}

// ── Recovery graph ──────────────────────────────────────────────────────────

export const NEED_EVIDENCE: Record<NeedKey, string[]> = {
  roof_damage: ["roof_damage"],
  interior_water_damage: ["interior_water_damage"],
  medical_power: ["medical_power"],
  food_loss: ["food_loss"],
  fema_denial: ["fema_ineligible_info"],
};

export const PROGRAM_NEEDS: Record<string, NeedKey[]> = {
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
