import type { CaseDocument, EvidenceType, ExtractionResult, Fact, FactType } from "@/lib/types";

// Evidence Agent — rules-based extractor.
// Works offline with no API key. When ANTHROPIC_API_KEY is set, the /api/run
// route uses Claude for extraction instead (see ./llmExtract.ts) and falls
// back to this on any error.

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export function parseDate(s: string): string | undefined {
  const m = s.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i);
  if (m) {
    const mm = String(MONTHS[m[1].toLowerCase()]).padStart(2, "0");
    return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`;
  }
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return undefined;
}

const DATE_RE = "((?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},\\s*\\d{4})";

function lineOf(text: string, idx: number): string {
  const start = text.lastIndexOf("\n", idx) + 1;
  const end = text.indexOf("\n", idx);
  return text.slice(start, end === -1 ? undefined : end).trim();
}

export function extractWithRules(doc: CaseDocument): ExtractionResult {
  const t = doc.text;
  const facts: Fact[] = [];
  let n = 0;
  const add = (type: FactType, label: string, value: string, quote: string, normalized?: string, confidence = 0.9) =>
    facts.push({ id: `${doc.id}#f${++n}`, docId: doc.id, type, label, value, normalized, confidence, quote });

  const find = (re: RegExp, fn: (m: RegExpMatchArray, quote: string) => void) => {
    for (const m of t.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) {
      fn(m, lineOf(t, m.index ?? 0));
    }
  };

  // People
  find(/(?:Customer|Applicant|Dear|soy)\s*:?\s+([A-ZÁÉÍÓÚ][a-záéíóúñ]+(?:[ -][A-ZÁÉÍÓÚ][a-záéíóúñ]+)+)/, (m, q) =>
    add("person", "Person named", m[1].replace(/,$/, ""), q, undefined, 0.92));
  find(/(?:mamá|mother),?\s+([A-ZÁÉÍÓÚ][a-záéíóúñ]+ [A-ZÁÉÍÓÚ][a-záéíóúñ]+)/, (m, q) =>
    add("person", "Household member (mother)", m[1], q, "role:mother", 0.85));
  find(/(?:hijo|son)\s+([A-ZÁÉÍÓÚ][a-záéíóúñ]+)\s+tiene\s+(\d+)/, (m, q) =>
    add("person", "Household member (son)", `${m[1]} (age ${m[2]})`, q, "role:son", 0.8));

  // Address
  find(/(\d{3,5} [A-Z][A-Za-z ]+ (?:Ln|St|Ave|Dr|Rd|Blvd)\b(?:, Houston, TX \d{5})?)/, (m, q) =>
    add("address", "Property address", m[1], q, m[1].slice(0, 26).toLowerCase(), 0.95));

  // Dates of loss / incident
  find(new RegExp(`(?:date of loss|Date of incident)\\s*:?\\s*${DATE_RE}`, "i"), (m, q) =>
    add("date_of_loss", "Date of loss", m[1], q, parseDate(m[1]), 0.95));

  // Letter date (FEMA)
  find(new RegExp(`Date of letter:\\s*${DATE_RE}`, "i"), (m, q) =>
    add("deadline", "Letter date (appeal clock starts)", m[1], q, `fema_letter_date:${parseDate(m[1])}`, 0.95));

  // Due dates (insurer)
  find(new RegExp(`by ${DATE_RE}`, "i"), (m, q) =>
    add("deadline", "Documents due to insurer", m[1], q, `insurance_due:${parseDate(m[1])}`, 0.9));

  // Appointments
  find(new RegExp(`inspection is scheduled for ${DATE_RE}(?: at ([0-9:]+ ?[AP]M))?`, "i"), (m, q) =>
    add("appointment", "Adjuster inspection", `${m[1]}${m[2] ? " at " + m[2] : ""}`, q, parseDate(m[1]), 0.92));

  // Money
  find(/TOTAL[ .]*\$([\d,]+\.\d{2})/, (m, q) =>
    add("money", "Repair estimate total", `$${m[1]}`, q, m[1].replace(/,/g, ""), 0.97));
  find(/hurricane deductible of \$([\d,]+)/i, (m, q) =>
    add("money", "Hurricane deductible", `$${m[1]}`, q, m[1].replace(/,/g, ""), 0.93));
  find(/como (\d+) dólares/i, (m, q) =>
    add("money", "Food lost in outage (estimated)", `$${m[1]}`, q, m[1], 0.8));
  find(/Interior drywall[^\n]*\$([\d,]+\.\d{2})/i, (m, q) =>
    add("money", "Interior repair line items", `$${m[1]}`, q, m[1].replace(/,/g, ""), 0.85));

  // Identifiers
  find(/claim (HO-[A-Z0-9-]+)/i, (m, q) => add("claim_number", "Insurance claim number", m[1], q, m[1]));
  find(/policy (HO\d-\d+)/i, (m, q) => add("policy_number", "Policy number", m[1], q, m[1]));
  find(/Registration ID:\s*([\d-]+)/i, (m, q) => add("fema_registration", "FEMA registration ID", m[1], q, m[1]));

  // Determinations and exclusions
  find(/Decision:\s*([A-Z]+)\s*—\s*([^.\n]+)/, (m, q) =>
    add("determination", "FEMA decision", `${m[1]}: ${m[2]}`, q, "fema_ineligible_info", 0.95));
  find(/could not verify[^.]*\((occupancy)\)/i, (m, q) =>
    add("determination", "Missing for FEMA", "Proof of occupancy", q, "missing:proof_of_occupancy", 0.95));
  find(/(flood or rising water is excluded)/i, (m, q) =>
    add("exclusion", "Policy exclusion", "Flood / rising water excluded", q, "flood_excluded", 0.9));

  // Damage (vision captions + estimate)
  find(/(missing shingles|exposed (?:wood )?decking|wind damage to roof)/i, (m, q) =>
    add("damage", "Roof damage", m[1], q, "roof_damage", 0.9));
  find(/(water line[^.]*|rain intrusion to living room|soaked)/i, (m, q) =>
    add("damage", "Interior water damage", m[1], q, "interior_water_damage", 0.85));

  // Needs (voice note, either language)
  find(/(concentrador de oxígeno|oxygen concentrator)/i, (m, q) =>
    add("need", "Power-dependent medical equipment", "Oxygen concentrator (Carmen, 71)", q, "medical_power", 0.9));
  find(/(perdimos toda la comida|lost (?:all )?(?:our )?food)/i, (m, q) =>
    add("need", "Food loss from outage", "Refrigerated food lost (4-day outage)", q, "food_loss", 0.88));
  find(/(No guardé los recibos)/i, (m, q) =>
    add("mentions_evidence", "No receipts kept", "Food receipts not available", q, "absent:loss_receipts", 0.8));
  find(/(factura de la luz[^.]*correo electrónico)/i, (m, q) =>
    add("mentions_evidence", "Has a utility bill (not uploaded)", "September electric bill in email", q, "has:proof_of_occupancy", 0.82));

  return { docId: doc.id, evidenceTypes: classify(doc, facts), facts, method: "rules" };
}

/** Which evidence categories a document can satisfy. */
export function classify(doc: CaseDocument, facts: Fact[]): EvidenceType[] {
  const out = new Set<EvidenceType>();
  if (doc.kind === "photo") out.add("damage_photo");
  if (doc.kind === "estimate") out.add("repair_estimate");
  if (doc.kind === "fema_letter") out.add("fema_determination");
  if (doc.kind === "insurance_email") out.add("insurance_correspondence");
  if (doc.kind === "utility_bill") out.add("proof_of_occupancy");
  if (doc.kind === "voice_note" && facts.some((f) => f.type === "need")) out.add("loss_statement");
  return [...out];
}
