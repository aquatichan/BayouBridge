// Powered medical equipment and the relatives who use it, read from what a
// household wrote in English or Spanish. Shared by the rules extractor and the
// plan wording, so "My husband uses a CPAP machine" and "Mi esposo usa un CPAP"
// both come out as a CPAP machine used by the husband.

const L = "\\p{L}";
const word = (src: string) => new RegExp(`(?<![${L}])(?:${src})(?![${L}])`, "iu");

/** Most specific first: "oxygen concentrator" before "oxygen". English names. */
const EQUIPMENT: [RegExp, string][] = [
  [word("oxygen concentrator|concentrador de ox[ií]geno"), "Oxygen concentrator"],
  [word("oxygen|ox[ií]geno"), "Oxygen equipment"],
  [word("bipap"), "BiPAP machine"],
  [word("cpap"), "CPAP machine"],
  [word("nebuli[sz]er|nebulizador"), "Nebulizer"],
  [word("ventilator|respirador|ventilador mec[aá]nico"), "Ventilator"],
  [word("dialysis(?: machine)?|(?:m[aá]quina de )?di[aá]lisis"), "Dialysis machine"],
  [word("(?:power|electric|motorized) wheelchair|silla de ruedas (?:el[eé]ctrica|motorizada)"), "Power wheelchair"],
  [word("feeding pump|bomba de alimentaci[oó]n"), "Feeding pump"],
  [word("suction machine|m[aá]quina de succi[oó]n"), "Suction machine"],
  [word("hospital bed|cama de hospital"), "Hospital bed"],
  [word("insulin|insulina"), "Refrigerated insulin"],
];

/** The equipment named in a piece of text, by its English name. */
export function findEquipment(text: string): string | undefined {
  return EQUIPMENT.find(([re]) => re.test(text))?.[1];
}

/** One pattern that matches any equipment name, for finding it in a document. */
export const EQUIPMENT_RE = new RegExp(EQUIPMENT.map(([re]) => re.source).join("|"), "giu");

const RELATIVES: [RegExp, string][] = [
  [word("husband|esposo|marido"), "husband"],
  [word("wife|esposa"), "wife"],
  [word("grandmother|grandma|abuela|abuelita"), "grandmother"],
  [word("grandfather|grandpa|abuelo|abuelito"), "grandfather"],
  [word("mother|mom|mum|mam[aá]|madre"), "mother"],
  [word("father|dad|pap[aá]|padre"), "father"],
  [word("daughter|hija"), "daughter"],
  [word("(?:my|our|his|her|the) son|hijo"), "son"], // bare "son" is also Spanish for "they are"
];

/** The sentence of `text` that mentions powered equipment, if any. */
export function equipmentSentence(text: string): string | undefined {
  return text.split(/(?<=[.!?])\s+|\n+/).find((s) => findEquipment(s));
}

/** The relative named in the same sentence as the equipment: "My husband uses a CPAP" → "husband". */
export function equipmentUser(text: string): string | undefined {
  const s = equipmentSentence(text);
  return s ? RELATIVES.find(([re]) => re.test(s))?.[1] : undefined;
}
