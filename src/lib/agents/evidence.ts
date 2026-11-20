import { EQUIPMENT_RE, findEquipment, KIN_WORDS, relativeOf } from "@/lib/equipment";
import { OCCUPANCY_KINDS, type CaseDocument, type EvidenceType, type ExtractionResult, type Fact, type FactType } from "@/lib/types";

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

const MONTHS_ES_EN: Record<string, string> = {
  enero: "January", febrero: "February", marzo: "March", abril: "April", mayo: "May", junio: "June", julio: "July",
  agosto: "August", septiembre: "September", setiembre: "September", octubre: "October", noviembre: "November", diciembre: "December",
};
const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const DATE_RE = "((?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},\\s*\\d{4})";

function lineOf(text: string, idx: number): string {
  const start = text.lastIndexOf("\n", idx) + 1;
  const end = text.indexOf("\n", idx);
  return text.slice(start, end === -1 ? undefined : end).trim();
}

/** The sentence (within its line) around `idx`. A typed story is often one long line. */
function sentenceOf(text: string, idx: number): string {
  const lineStart = text.lastIndexOf("\n", idx) + 1;
  const line = lineOf(text, idx);
  const offset = idx - lineStart - (text.slice(lineStart).length - text.slice(lineStart).trimStart().length);
  let start = 0;
  for (const m of line.matchAll(/[.!?]+\s+/g)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end > offset) return line.slice(start, m.index! + m[0].trimEnd().length).trim();
    start = end;
  }
  return line.slice(start).trim();
}

/** Free-form writing (a voice note, the household's own words, an unknown upload) rather than a form or letter. */
const isNarrative = (doc: CaseDocument) => doc.kind === "voice_note" || doc.kind === "other" || doc.source === "statement" || doc.source === "typed";

const MONTH_NAMES = "January|February|March|April|May|June|July|August|September|October|November|December";
const MONTH_ABBR: Record<string, string> = { jan: "january", feb: "february", mar: "march", apr: "april", jun: "june", jul: "july", aug: "august", sep: "september", sept: "september", oct: "october", nov: "november", dec: "december" };
const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";

/**
 * A date as people write it in a story: "October 9, 2026", "Oct. 9th", "9 de octubre (de 2026)", "10/9/2026".
 * Without a year, it is the most recent such date on or before the day the document arrived.
 */
export function storyDate(s: string, receivedAt: string): { text: string; iso: string } | undefined {
  const iso = (y: number | undefined, mo: number, d: number) => {
    if (!mo || mo > 12 || !d || d > 31) return undefined;
    const [ry, rm, rd] = receivedAt.split("-").map(Number);
    const year = y ?? (mo * 100 + d > rm * 100 + rd ? ry - 1 : ry);
    return `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const en = s.match(new RegExp(`\\b(${MONTH_NAMES}|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, "i"));
  if (en) {
    const name = en[1].toLowerCase();
    const mo = MONTHS[MONTH_ABBR[name] ?? name];
    const v = iso(en[3] ? Number(en[3]) : undefined, mo, Number(en[2]));
    if (v) return { text: en[0], iso: v };
  }
  const es = s.match(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MESES})(?:\\s+(?:de|del)\\s+(\\d{4}))?`, "i"));
  if (es) {
    const v = iso(es[3] ? Number(es[3]) : undefined, MONTHS[MONTHS_ES_EN[es[2].toLowerCase()].toLowerCase()], Number(es[1]));
    if (v) return { text: es[0], iso: v };
  }
  const num = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (num) {
    const y = num[3] ? Number(num[3].length === 2 ? `20${num[3]}` : num[3]) : undefined;
    const v = iso(y, Number(num[1]), Number(num[2])); // US order: month/day
    if (v) return { text: num[0], iso: v };
  }
  return undefined;
}

export function extractWithRules(doc: CaseDocument): ExtractionResult {
  const t = doc.text;
  const facts: Fact[] = [];
  let n = 0;
  const add = (type: FactType, label: string, value: string, quote: string, normalized?: string, confidence = 0.9) =>
    facts.push({ id: `${doc.id}#f${++n}`, docId: doc.id, type, label, value, normalized, confidence, quote });

  // Letters and forms quote the line a fact is on; free-form writing quotes the sentence,
  // so facts about different people in one long paragraph keep their own quotes.
  const narrative = isNarrative(doc);
  const quoteAt = (idx: number) => (narrative ? sentenceOf(t, idx) : lineOf(t, idx));
  const find = (re: RegExp, fn: (m: RegExpMatchArray, quote: string) => void) => {
    for (const m of t.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) {
      fn(m, quoteAt(m.index ?? 0));
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
  find(/(\d{3,5} [A-Z][A-Za-z ]+ (?:Ln|St|Ave|Dr|Rd|Blvd|Lane|Street|Avenue|Drive|Road|Boulevard|Ct|Court|Way|Pl|Place|Pkwy|Parkway|Cir|Circle|Trl|Trail)\b(?:,? (?:Apt\.?|Unit|#) ?[A-Za-z0-9-]+)?(?:, [A-Z][a-zA-Z ]+, TX \d{5})?)/, (m, q) =>
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

  // Billing period (utility bills): the end date shows whether the bill pre-dates the storm
  find(new RegExp(`(?:Billing|Statement) period:\\s*${DATE_RE}\\s*(?:–|—|-|to|through)\\s*${DATE_RE}`, "i"), (m, q) =>
    add("billing_period", "Billing period", `${m[1]} – ${m[2]}`, q, `billing_end:${parseDate(m[2])}`, 0.95));

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
  find(/(water line[^.]*|rain intrusion(?: to [a-z ]+)?|soaked)/i, (m, q) =>
    add("damage", "Interior water damage", m[1], q, "interior_water_damage", 0.85));

  // Needs (voice note, either language)
  // Powered medical equipment, and who uses it: the person named with an age in the same sentence.
  // Who: a person named with an age in the same sentence, else the relative named there ("my husband").
  find(EQUIPMENT_RE, (m, q) => {
    const s = sentenceOf(t, m.index ?? 0);
    const who = s.match(/([A-ZÁÉÍÓÚ][a-záéíóúñ]+)(?: [A-ZÁÉÍÓÚ][a-záéíóúñ]+)?,? (?:tiene|is) (\d{1,3})\b/);
    const kin = s.match(new RegExp(`(?<![\\p{L}])(?:my|our|mi|nuestr[oa])\\s+(${KIN_WORDS})(?![\\p{L}])`, "iu"))?.[1];
    const equipment = findEquipment(m[0]) ?? m[0];
    if (facts.some((f) => f.normalized === "medical_power" && f.quote === q && f.value.startsWith(equipment))) return; // "oxygen ... oxygen" in one sentence
    add("need", "Power-dependent medical equipment", `${equipment} (${who ? `${who[1]}, ${who[2]}` : kin ? relativeOf(kin) : "household member"})`, q, "medical_power", 0.9);
  });
  find(/(perdimos (?:toda )?la comida|se (?:nos )?(?:echó a perder|pudrió|dañó) (?:toda )?la comida|lost (?:all )?(?:of )?(?:our |the |my )?(?:food|groceries)|food (?:spoiled|went bad|rotted|was ruined)|spoiled food)/i, (m, q) => {
    const outage = new RegExp(`(?:without|no|lost|sin|se fue la|nos quedamos sin)\\s+(?:power|electricity|luz|electricidad)[^.]{0,30}?\\b(\\d+|[a-z]+) (?:días|days)\\b|\\b(\\d+|[a-z]+) (?:días|days) (?:without|with no|sin) (?:power|electricity|luz|electricidad)`, "i");
    const o = narrative ? t.match(outage) : null;
    const days = (q.match(/\b(\d+|[a-z]+) (?:días|days)\b/i)?.[1] ?? o?.[1] ?? o?.[2])?.toLowerCase();
    const n = days ? Number(days) || NUMBER_WORDS[days] : undefined;
    add("need", "Food loss from outage", `Refrigerated food lost (${n ? `${n}-day outage` : "power outage"})`, q, "food_loss", 0.88);
  });
  find(/(No guardé los recibos)/i, (m, q) =>
    add("mentions_evidence", "No receipts kept", "Food receipts not available", q, "absent:loss_receipts", 0.8));
  find(/(factura de la luz[^.]*correo electrónico|electric bill[^.]*email)/i, (m, q) => {
    const es = m[1].match(/de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i)?.[1];
    const month = es ? MONTHS_ES_EN[es.toLowerCase()] : q.match(/(January|February|March|April|May|June|July|August|September|October|November|December) electric bill/)?.[1];
    add("mentions_evidence", "Has a utility bill (not uploaded)", `${month ? `${month} ` : ""}electric bill in email`, q, "has:proof_of_occupancy", 0.82);
  });

  if (narrative) {
    storyFacts(doc, facts, add);
    typedDocFacts(doc, facts, add);
  }

  return { docId: doc.id, evidenceTypes: classify(doc, facts), facts, method: "rules" };
}

/**
 * What a typed-in letter, bill or estimate says, written the way people write it rather than
 * the way the letters print it: "the letter is dated Oct 30", "send them by November 24",
 * "bill for Sept 1 to Sept 30", "the estimate is $12,400", "claim number HO-1234".
 */
function typedDocFacts(doc: CaseDocument, facts: Fact[], add: Add) {
  const sentences = doc.text.split("\n").flatMap((l) => l.split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter(Boolean);
  const hasType = (type: FactType, prefix = "") => facts.some((f) => f.type === type && (f.normalized ?? "").startsWith(prefix));
  /** Every date in a sentence, in order. */
  const datesIn = (s: string) => {
    const found: { text: string; iso: string }[] = [];
    let tail = s;
    for (let d = storyDate(tail, doc.receivedAt); d; d = storyDate(tail, doc.receivedAt)) {
      found.push(d);
      tail = tail.slice(tail.indexOf(d.text) + d.text.length);
    }
    return found;
  };
  const money = (s: string) => s.match(/\$\s?([\d,]+(?:\.\d{2})?)/)?.[1]?.replace(/,/g, "");
  const dollars = (n: string) => `$${Number(n).toLocaleString("en-US")}`;
  const idAfter = (s: string, words: string) =>
    s.match(new RegExp(`\\b(?:${words})\\s*(?:number|no\\.?|#|n[uú]mero|id)?\\s*(?:is|es|:)?\\s*#?([A-Z0-9][A-Z0-9-]{4,})`, "i"))?.[1];

  for (const s of sentences) {
    const dates = datesIn(s);
    if (doc.kind === "fema_letter" && !hasType("deadline", "fema_letter_date:") && dates[0] && /letter|dated|date|sent|carta|fecha|envi/i.test(s)) {
      add("deadline", "Letter date (appeal clock starts)", dates[0].text, s, `fema_letter_date:${dates[0].iso}`, 0.8);
    }
    if (doc.kind === "insurance_email" && !hasType("deadline", "insurance_due:") && dates[0] && /\bby\b|before|due|deadline|no later|antes del?|para el|fecha l[ií]mite/i.test(s)) {
      add("deadline", "Documents due to insurer", dates[0].text, s, `insurance_due:${dates[0].iso}`, 0.8);
    }
    if (doc.kind === "insurance_email" && !hasType("appointment") && dates[0] && /inspect|adjuster|visit|inspecci|ajustador|visita/i.test(s) && !/\bby\b|due/i.test(s)) {
      add("appointment", "Adjuster inspection", dates[0].text, s, dates[0].iso, 0.75);
    }
    if ((doc.kind === "utility_bill" || doc.kind === "bank_statement") && !hasType("billing_period") && dates.length
      && /period|from|through|\bto\b|bill|statement|periodo|\bdel\b|\bal\b|factura|estado/i.test(s)) {
      add("billing_period", "Billing period", dates.map((d) => d.text).join(" – "), s, `billing_end:${dates[dates.length - 1].iso}`, 0.8);
    }
    const amount = money(s);
    if (doc.kind === "estimate" && amount && !facts.some((f) => f.label === "Repair estimate total") && /total|estimat|quote|presupuesto|cotizaci|cost/i.test(s)) {
      add("money", "Repair estimate total", dollars(amount), s, amount, 0.8);
    }
    if (amount && !facts.some((f) => f.label === "Hurricane deductible") && /deductible|deducible/i.test(s)) {
      add("money", "Hurricane deductible", dollars(amount), s, amount, 0.75);
    }
    const claim = idAfter(s, "claim|reclamo");
    if (claim && /\d/.test(claim) && !hasType("claim_number")) add("claim_number", "Insurance claim number", claim, s, claim, 0.8);
    const policy = idAfter(s, "policy|p[oó]liza");
    if (policy && /\d/.test(policy) && !hasType("policy_number")) add("policy_number", "Policy number", policy, s, policy, 0.8);
    const reg = idAfter(s, "registration|registro(?: de FEMA)?");
    if (reg && /^\d[\d-]{6,}$/.test(reg) && !hasType("fema_registration")) add("fema_registration", "FEMA registration ID", reg, s, reg, 0.8);
    if (doc.kind === "fema_letter" && !hasType("determination", "missing:") && /verify|occupan|lived|live there|comprobar|viv[ií]a/i.test(s)) {
      add("determination", "Missing for FEMA", "Proof of occupancy", s, "missing:proof_of_occupancy", 0.75);
    }
    if (doc.kind === "fema_letter" && !hasType("determination", "fema_ineligible") && /ineligible|not eligible|denied|insufficient|no (?:es )?elegible|neg[oó]|informaci[oó]n insuficiente/i.test(s)) {
      add("determination", "FEMA decision", "Ineligible (as typed by the household)", s, "fema_ineligible_info", 0.75);
    }
  }
}

/** What kind of document a plain-text file probably is, from its words. Claude decides when it reads the file. */
export function guessKind(text: string): CaseDocument["kind"] {
  const t = text.toLowerCase();
  if (/\bfema\b/.test(t) && /decision|eligib|registration|determinaci|registro/.test(t)) return "fema_letter";
  if (/billing period|service address|kwh|amount due|statement period|periodo de facturaci/.test(t)) return /\bbank\b|banco|account balance/.test(t) ? "bank_statement" : "utility_bill";
  if (/\blease\b|landlord|tenant|contrato de (?:renta|arrendamiento)|arrendador/.test(t)) return "lease";
  if (/declarations? page|coverage a\b|policy period/.test(t)) return "insurance_policy";
  if (/\bclaim\b|adjuster|\breclamo\b|ajustador/.test(t)) return "insurance_email";
  if (/estimate|line items?|labor|presupuesto|cotizaci/.test(t)) return "estimate";
  if (/driver.?s license|identification card|licencia de conducir/.test(t)) return "id_card";
  if (/physician|\bdr\.|doctor|m[eé]dico/.test(t) && findEquipment(t)) return "medical_letter";
  if (/receipt|recibo/.test(t)) return "receipt";
  return "other";
}

type Add = (type: FactType, label: string, value: string, quote: string, normalized?: string, confidence?: number) => void;

/**
 * Facts from a household's own words, in English or Spanish: "The wind ripped shingles off
 * our roof", "FEMA nos negó la ayuda", "We rent", "my daughter Maya is 8". Each fact quotes
 * its sentence. Facts the letter-style rules above already found are not repeated.
 */
function storyFacts(doc: CaseDocument, facts: Fact[], add: Add) {
  const text = doc.text;
  const sentences = text.split("\n").flatMap((l) => l.split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter(Boolean);
  const has = (normalized: string) => facts.some((f) => f.normalized === normalized);
  // Names need real capitals, so these patterns are case-sensitive (with "i", \p{Lu} matches lowercase too).
  const NAME = "\\p{Lu}[\\p{Ll}'’-]+(?:\\s\\p{Lu}[\\p{Ll}'’-]+)?";
  const either = (alts: string) => alts.split("|").map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join("|");
  const KIN = either(KIN_WORDS);
  let tenure: string | undefined;

  for (const s of sentences) {
    // The applicant: "My name is Maria Lopez", "I'm Maria Lopez", "Me llamo María López"
    const me = s.match(new RegExp(`(?:${either("my name is|i am|i'm|this is|me llamo|mi nombre es|soy")})\\s+(\\p{Lu}[\\p{Ll}'’-]+(?:[ -]\\p{Lu}[\\p{Ll}'’-]+)+)`, "u"));
    if (me && !facts.some((f) => f.type === "person" && f.value === me[1])) add("person", "Person named", me[1], s, undefined, 0.85);

    // Relatives with a name, and an age if given: "my daughter Maya is 8", "mi hijo Leo, de 5 años"
    for (const k of s.matchAll(new RegExp(`(?<![\\p{L}])(?:${either("my|our|mi|mis|nuestro|nuestra|nuestros|nuestras")})\\s+(${KIN}),?\\s+(${NAME})(?:,?\\s+(?:who\\s+)?(?:is|tiene|de)\\s+(\\d{1,3}))?`, "gu"))) {
      const role = relativeOf(k[1]);
      const name = k[2];
      if (!role || facts.some((f) => f.type === "person" && f.value.replace(/ \(age \d+\)/, "") === name)) continue;
      add("person", `Household member (${role})`, k[3] ? `${name} (age ${k[3]})` : name, s, `role:${role}`, 0.8);
    }

    // When the storm hit
    if (!facts.some((f) => f.type === "date_of_loss") && /hurricane|storm|tornado|flood|landfall|\bhit\b|wind|hurac[aá]n|tormenta|inundaci|peg[oó]|golpe[oó]|lleg[oó]/i.test(s)) {
      const d = storyDate(s, doc.receivedAt);
      if (d) add("date_of_loss", "Date of loss", d.text, s, d.iso, 0.8);
    }

    // Roof and interior water damage
    if (!has("roof_damage") && /\broofs?\b|shingles?|\btecho|\btejas?\b/i.test(s)
      && /rip|tore|torn|blew|blown|off\b|damag|hole|leak|missing|fell|collaps|tarp|se llev[oó]|da[ñn]|rot[oa]|hoyo|gotera|lona|se cay[oó]|arranc/i.test(s)) {
      add("damage", "Roof damage", s.length > 120 ? `${s.slice(0, 117)}...` : s, s, "roof_damage", 0.75);
    }
    if (!has("interior_water_damage") && /\b(?:rain|water|flood(?:ed|ing)?|leak(?:ed|ing|s)?|soaked|wet|mold|mould)\b|agua|inund|moj|gotera|moho/i.test(s)
      && /came in|got in|\binto\b|inside|kitchen|living room|bedroom|bathroom|floor|ceiling|carpet|drywall|walls?\b|entr[oó]|adentro|dentro|sala|cocina|cuarto|rec[aá]mara|ba[ñn]o|piso|techo|pared|alfombra/i.test(s)
      && !/water bill|factura del agua/i.test(s)) {
      add("damage", "Interior water damage", s.length > 120 ? `${s.slice(0, 117)}...` : s, s, "interior_water_damage", 0.75);
    }

    // FEMA said no
    if (/\bFEMA\b/.test(s) && /denied|denial|rejected|turned (?:us |me )?down|not eligible|ineligible|neg[oó]|rechaz|no (?:califica|calificamos|calificaba|calific[aá]bamos)|no nos (?:dio|dieron|aprob)/i.test(s)) {
      if (!has("fema_ineligible_info")) add("determination", "FEMA decision", "Denied (in the household's words)", s, "fema_ineligible_info", 0.75);
      if (!has("missing:proof_of_occupancy") && /lived|live there|occupancy|proof of (?:address|residence)|comprobante|domicilio|viv[ií]amos/i.test(s)) {
        add("determination", "Missing for FEMA", "Proof of occupancy", s, "missing:proof_of_occupancy", 0.7);
      }
      if (!has("has:fema_determination") && /letter|carta/i.test(s)) add("mentions_evidence", "Has a FEMA letter (not uploaded)", "letter from FEMA", s, "has:fema_determination", 0.75);
    }

    // Rent or own
    const renter = /\b(?:we|i)\s+(?:rent|are renting|lease)\b|\b(?:our|my|the)\s+(?:landlord|lease)\b|\brenters?\b|\btenants?\b|rentamos|alquilamos|\brento\b|\balquilo\b|(?:el|la|nuestro|nuestra|mi)\s+(?:due[ñn]o|due[ñn]a|casero|casera|arrendador)|inquilin/i.test(s);
    const owner = /\b(?:we|i)\s+own\b|\bour own (?:home|house)\b|\bhomeowners?\b(?! insurance)|\bmortgage\b|\bwe bought\b|(?:somos|soy)\s+(?:los\s+)?(?:due[ñn]os?|propietari)|(?:la casa|el apartamento) es (?:nuestra|m[ií]a)|hipoteca/i.test(s);
    if (renter !== owner && !tenure) {
      tenure = renter ? "renter" : "owner";
      add("tenure", "Housing", renter ? "Rents the home" : "Owns the home", s, tenure, 0.8);
    }

    // No insurance
    if (!has("absent:insurance_policy") && /\b(?:no|don'?t|do not|didn'?t|did not)\s+(?:have\s+)?(?:any\s+)?(?:home\s+|renters?\s+|homeowners?\s+)?insurance\b|(?:no tenemos|no ten[ií]amos|sin)\s+(?:ning[uú]n\s+)?seguro/i.test(s)) {
      add("mentions_evidence", "No insurance", "No insurance policy", s, "absent:insurance_policy", 0.8);
    }
  }
}

/** Household context that some evidence needs before it counts (see occupancyCheck). */
export interface ClassifyContext {
  /** The damaged home's address. */
  address: string;
  /** Earliest date of loss across all documents (ISO), if any document states one. */
  dateOfLoss?: string;
}

const SUFFIX: Record<string, string> = {
  lane: "ln", street: "st", avenue: "ave", drive: "dr", road: "rd", boulevard: "blvd", court: "ct", place: "pl", parkway: "pkwy", circle: "cir", trail: "trl",
};
/** "1847 Cypress Bayou Lane, Houston" → "1847cypressbayouln": street line only, suffixes abbreviated. */
export function streetKey(address: string): string {
  return address.split(",")[0].toLowerCase().split(/\s+/).map((w) => SUFFIX[w.replace(/\./g, "")] ?? w).join("").replace(/[^a-z0-9]/g, "");
}

/**
 * A utility bill is proof of occupancy only if its service address is the
 * damaged home and its billing period ends before the date of loss (FEMA asks
 * for proof dated before the disaster).
 */
export function occupancyCheck(facts: Fact[], ctx: ClassifyContext, kind?: CaseDocument["kind"]): { ok: boolean; reason: string } {
  // The street line only, without an apartment number, on both sides.
  const noApt = (a: string) => a.replace(/,?\s*(?:apt\.?|unit|#)\s*[a-z0-9-]+/i, "");
  const home = streetKey(noApt(ctx.address));
  const addressOk = facts.some((f) => f.type === "address" && streetKey(noApt(f.value)) === home);
  if (kind === "lease") {
    return addressOk ? { ok: true, reason: `the lease is for ${ctx.address.split(",")[0]}` } : { ok: false, reason: `the lease address does not match ${ctx.address.split(",")[0]}` };
  }
  const end = facts.find((f) => f.type === "billing_period" && f.normalized?.startsWith("billing_end:"))?.normalized?.slice(12);
  if (!addressOk) return { ok: false, reason: `the service address does not match ${ctx.address.split(",")[0]}` };
  if (!end) return { ok: false, reason: "no billing period found on the bill" };
  if (!ctx.dateOfLoss) return { ok: false, reason: "no date of loss on file to compare the billing period with" };
  if (end >= ctx.dateOfLoss) return { ok: false, reason: `the billing period ends ${end}, not before the date of loss (${ctx.dateOfLoss})` };
  return { ok: true, reason: `service address matches ${ctx.address.split(",")[0]} and the billing period ends ${end}, before the earliest date of loss (${ctx.dateOfLoss})` };
}

/**
 * Which evidence categories a document can satisfy. A utility bill needs the
 * household context (address and date of loss), so without `ctx` it is left
 * unclassified until the coordinator's occupancy check runs.
 */
export function classify(doc: CaseDocument, facts: Fact[], ctx?: ClassifyContext): EvidenceType[] {
  const out = new Set<EvidenceType>();
  if (doc.kind === "photo") out.add("damage_photo");
  if (doc.kind === "estimate") out.add("repair_estimate");
  if (doc.kind === "fema_letter") out.add("fema_determination");
  if (doc.kind === "insurance_email") out.add("insurance_correspondence");
  if (OCCUPANCY_KINDS.includes(doc.kind) && ctx && occupancyCheck(facts, ctx, doc.kind).ok) out.add("proof_of_occupancy");
  if (doc.kind === "id_card") out.add("proof_of_identity");
  if (doc.kind === "insurance_policy") out.add("insurance_policy");
  if (doc.kind === "medical_letter") out.add("medical_need_documentation");
  if (doc.kind === "receipt") out.add("loss_receipts");
  // What the household says it lost, in its own words: a voice note, a statement, or a typed note.
  if ((doc.kind === "voice_note" || doc.source === "statement" || (doc.source === "typed" && doc.kind === "other")) && facts.some((f) => f.type === "need")) out.add("loss_statement");
  return [...out];
}
