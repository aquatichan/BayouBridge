import { EVIDENCE_LABELS } from "@/data/resources";
import type { CaseDocument, Fact } from "@/lib/types";
import { extractWithRules, parseDate } from "./evidence";

// Evidence Agent - checks Claude's facts before the rules engine sees them.
// 1. Every fact must quote the document (or be repaired to the line that holds its value).
// 2. Every `normalized` value must be one recovery.ts can read (or be repaired from the text).
// 3. Anything the offline rules extractor finds that Claude missed is added back,
//    so Claude can add to what the offline path finds but never reduce it.

/** The money labels recovery.ts looks up in factValue(). */
export const MONEY_LABELS = [
  "Repair estimate total",
  "Hurricane deductible",
  "Food lost in outage (estimated)",
  "Interior repair line items",
] as const;

const EVIDENCE_TYPES = new Set(Object.keys(EVIDENCE_LABELS));

/** Canonical form for quote matching: Unicode, curly quotes, dashes, dot leaders, whitespace and case. */
export function normText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\.{3,}/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isIsoDate(s: string | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const firstDate = (...xs: (string | undefined)[]) => {
  for (const x of xs) {
    const d = x ? parseDate(x) : undefined;
    if (isIsoDate(d)) return d;
  }
  return undefined;
};

/** Map a fact to a key by its own words, trying normalized, then label, value and quote. */
function byKeyword(f: Fact, table: [RegExp, string][]): string | undefined {
  for (const field of [f.normalized ?? "", f.label, f.value, f.quote]) {
    const hit = table.find(([re]) => re.test(field.toLowerCase()));
    if (hit) return hit[1];
  }
  return undefined;
}

function moneyLabel(label: string): string | undefined {
  const exact = MONEY_LABELS.find((m) => m.toLowerCase() === label.trim().toLowerCase());
  if (exact) return exact;
  const l = label.toLowerCase();
  if (/deductible/.test(l)) return "Hurricane deductible";
  if (/food|comida/.test(l)) return "Food lost in outage (estimated)";
  if (/interior|drywall/.test(l)) return "Interior repair line items";
  if (/total/.test(l) && /estimate|repair|^total$/.test(l)) return "Repair estimate total";
  if (/^(estimate|repair estimate)$/.test(l.trim())) return "Repair estimate total";
  return undefined;
}

const toNumber = (s: string | undefined) => {
  const m = s?.replace(/[$,\s]/g, "").match(/^\d+(?:\.\d+)?$/);
  return m ? m[0] : undefined;
};

type Checked = { fact: Fact; repaired?: string } | { drop: string };

/** Make `normalized` (and money labels) match what recovery.ts reads, or say why the fact can't be used. */
function checkNormalized(doc: CaseDocument, f: Fact): Checked {
  const n = f.normalized;
  const fix = (normalized: string | undefined, what: string): Checked =>
    normalized === n ? { fact: f } : { fact: { ...f, normalized }, repaired: what };

  switch (f.type) {
    case "date_of_loss":
    case "appointment": {
      if (isIsoDate(n)) return { fact: f };
      const d = firstDate(n, f.value, f.quote);
      return d ? fix(d, `date ${JSON.stringify(n ?? "")} → ${d}`) : { drop: "no readable date" };
    }
    case "deadline": {
      const m = n?.match(/^(fema_letter_date|insurance_due):(.*)$/);
      const prefix = m?.[1]
        ?? (doc.kind === "fema_letter" ? "fema_letter_date" : doc.kind === "insurance_email" ? "insurance_due" : undefined);
      const date = isIsoDate(m?.[2]) ? m![2] : firstDate(m?.[2], n, f.value, f.quote);
      if (!prefix || !date) return { drop: "deadline is not a letter date or insurer due date" };
      return fix(`${prefix}:${date}`, `deadline → ${prefix}:${date}`);
    }
    case "money": {
      const label = moneyLabel(f.label);
      if (!label) return { drop: "not one of the amounts the rules engine uses" };
      const num = toNumber(n) ?? toNumber(f.value.match(/\$?\s*[\d,]+(?:\.\d+)?/)?.[0]);
      if (!num) return { drop: "no readable amount" };
      if (label === f.label && num === n) return { fact: f };
      return { fact: { ...f, label, normalized: num }, repaired: `amount → ${label}: ${num}` };
    }
    case "damage": {
      if (n === "roof_damage" || n === "interior_water_damage") return { fact: f };
      const k = byKeyword(f, [[/roof|shingle|decking|techo/, "roof_damage"], [/water|rain|soak|drywall|carpet|agua|moj/, "interior_water_damage"]]);
      return k ? fix(k, `damage → ${k}`) : { drop: "unknown damage kind" };
    }
    case "need": {
      if (n === "medical_power" || n === "food_loss") return { fact: f };
      const k = byKeyword(f, [[/oxygen|ox[ií]geno|medical|m[eé]dic|concentrat/, "medical_power"], [/food|comida|refrigerat/, "food_loss"]]);
      return k ? fix(k, `need → ${k}`) : { drop: "unknown need" };
    }
    case "determination": {
      if (n === "fema_ineligible_info" || n === "missing:proof_of_occupancy") return { fact: f };
      const k = byKeyword(f, [[/occupancy|primary residence/, "missing:proof_of_occupancy"], [/ineligible|insufficient/, "fema_ineligible_info"]]);
      return k ? fix(k, `determination → ${k}`) : { drop: "unknown determination" };
    }
    case "exclusion": {
      if (n === "flood_excluded") return { fact: f };
      return byKeyword(f, [[/flood|rising water|inundaci/, "flood_excluded"]]) ? fix("flood_excluded", "exclusion → flood_excluded") : { drop: "unknown exclusion" };
    }
    case "mentions_evidence": {
      const m = n?.match(/^(has|absent):(\w+)$/);
      if (m && EVIDENCE_TYPES.has(m[2])) return { fact: f };
      if (!m) return { drop: "not has:/absent: an evidence type" };
      const k = byKeyword({ ...f, normalized: m[2] }, [
        [/utility|bill|lease|occupancy|factura/, "proof_of_occupancy"],
        [/receipt|recibo/, "loss_receipts"],
        [/\bid\b|license|identity|identifica/, "proof_of_identity"],
        [/doctor|medical|m[eé]dic/, "medical_need_documentation"],
      ]);
      return k ? fix(`${m[1]}:${k}`, `evidence → ${m[1]}:${k}`) : { drop: "unknown evidence type" };
    }
    case "billing_period": {
      if (/^billing_end:\d{4}-\d{2}-\d{2}$/.test(n ?? "") && isIsoDate(n!.slice(12))) return { fact: f };
      // The end of the period is the last date in "September 1, 2026 – September 30, 2026".
      const last = (s: string | undefined) => s?.split(/\s+(?:[–—-]|to|through|hasta|al)\s+/i).pop();
      const d = firstDate(last(n?.replace(/^billing_end:/, "")), last(f.value), last(f.quote));
      return d ? fix(`billing_end:${d}`, `billing period → billing_end:${d}`) : { drop: "no readable billing period end" };
    }
    case "person": {
      if (!n || n === "role:mother" || n === "role:son") return { fact: f };
      const k = byKeyword(f, [[/mother|madre|mam[aá]/, "role:mother"], [/\bson\b|hijo/, "role:son"], [/applicant|head|self|main|policyholder|customer/, ""]]);
      return k !== undefined ? fix(k || undefined, `person role → ${k || "main applicant"}`) : { drop: "unknown household role" };
    }
    default:
      return { fact: f };
  }
}

/** Keep only facts that quote the document and carry values the rules engine can read. */
export function validateFacts(doc: CaseDocument, facts: Fact[]): { facts: Fact[]; issues: string[] } {
  const issues: string[] = [];
  const docNorm = normText(doc.text);
  const lines = doc.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: Fact[] = [];
  const seen = new Set<string>();

  for (const raw of facts) {
    let f: Fact = { ...raw, confidence: Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0.5 };

    // 1. Quote check, with one repair: the line of the document that holds the value.
    const q = normText(f.quote);
    if (!q || !docNorm.includes(q)) {
      const candidates = [normText(f.value), normText(f.value.replace(/^\$/, ""))].filter((v) => v.length >= 3);
      const line = lines.find((l) => candidates.some((v) => normText(l).includes(v)));
      if (!line) {
        issues.push(`dropped: ${f.label}: quote not found in the document`);
        continue;
      }
      f = { ...f, quote: line, confidence: f.confidence * 0.8 };
      issues.push(`repaired: ${f.label}: quote replaced with the line that contains the value`);
    }

    // 2. Normalized-value check.
    const checked = checkNormalized(doc, f);
    if ("drop" in checked) {
      issues.push(`dropped: ${f.label}: ${checked.drop}`);
      continue;
    }
    f = checked.fact;
    if (checked.repaired) issues.push(`repaired: ${f.label}: ${checked.repaired}`);

    // 3. De-duplicate. Value is part of the key: one line can hold two different
    //    facts (e.g. "missing shingles" and "exposed wood decking").
    const key = `${f.type}|${f.normalized ?? ""}|${normText(f.value)}|${normText(f.quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return { facts: out, issues };
}

const street = (s: string) => normText(s.split(",")[0]).replace(/[^a-z0-9]/g, "");

/** What "the same fact" means to the rules engine: the keys recovery.ts actually reads. */
export function coverageKey(f: Fact): string {
  switch (f.type) {
    case "money": return `money:${f.label}`;
    case "address": return `address:${street(f.value)}`;
    case "claim_number":
    case "policy_number":
    case "fema_registration": return `${f.type}:${f.value.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
    default: return `${f.type}:${f.normalized ?? ""}`;
  }
}

/** Add every rules-engine fact whose key Claude's facts don't cover. */
export function fillFromRules(doc: CaseDocument, facts: Fact[]): { facts: Fact[]; issues: string[] } {
  const have = new Set(facts.map(coverageKey));
  const out = [...facts];
  const issues: string[] = [];
  for (const r of extractWithRules(doc).facts) {
    const k = coverageKey(r);
    if (have.has(k)) continue;
    have.add(k);
    out.push(r);
    issues.push(`filled from rules: ${r.label}`);
  }
  return { facts: out, issues };
}

/** ", 2 repaired, 1 dropped, 1 filled from rules" for the activity log ("" when nothing changed). */
export function summarizeIssues(issues: string[] | undefined): string {
  if (!issues?.length) return "";
  const count = (prefix: string) => issues.filter((i) => i.startsWith(prefix)).length;
  const parts = [
    [count("repaired:"), "repaired"],
    [count("dropped:"), "dropped"],
    [count("filled from rules:"), "filled from rules"],
  ].filter(([n]) => n) as [number, string][];
  return parts.map(([n, what]) => `, ${n} ${what}`).join("");
}
