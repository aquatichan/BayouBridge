import type { Lang } from "@/components/app/i18n";

// Spanish for the text the agents write. The agents and the golden snapshots stay
// in English; the screen calls tr() at render time. The exact phrases come first,
// then patterns for the templates that carry names, numbers or dates. Text with no
// entry stays in English rather than breaking (tests/spanish.test.ts checks the
// demo households for gaps). Names, addresses, quotes and document text are never
// translated: they have to match the household's own papers.

const PHRASES: Record<string, string> = {
  // Programs (src/data/resources.ts)
  "FEMA Individual Assistance appeal": "Apelación de Asistencia Individual de FEMA",
  "Homeowners insurance claim (wind damage)": "Reclamo al seguro de vivienda (daño por viento)",
  "SBA disaster home loan": "Préstamo de la SBA por desastre para vivienda",
  "Critical care electric customer designation": "Registro como cliente eléctrico de cuidado crítico",
  "Food and immediate-needs referral (2-1-1 Texas)": "Referencia para comida y necesidades inmediatas (2-1-1 Texas)",
  "Possible match. FEMA decides eligibility. Check the appeal instructions in the household's own letter.":
    "Posible opción. FEMA decide quién califica. Revise las instrucciones de apelación en la carta que recibió.",
  "Possible match. Coverage depends on the policy. TDI can help if the household has a dispute.":
    "Posible opción. La cobertura depende de la póliza. El Departamento de Seguros de Texas (TDI) puede ayudar si hay un desacuerdo.",
  "Possible match. A loan must be repaid. The household decides whether to apply.":
    "Posible opción. Un préstamo se tiene que pagar. La familia decide si lo solicita.",
  "Possible match. A designation does not guarantee power during an outage. Keep a backup plan.":
    "Posible opción. El registro no garantiza la electricidad durante un apagón. Tenga un plan de respaldo.",
  "Referral only. Disaster food benefits are available only when the state activates them.":
    "Solo es una referencia. Los beneficios de comida por desastre solo existen cuando el estado los activa.",
  "Prepare a signed appeal letter with proof of occupancy attached.": "Preparar una carta de apelación firmada con el comprobante de residencia adjunto.",
  "Send the estimate and photos to the adjuster before the inspection.": "Enviar el presupuesto y las fotos al ajustador antes de la inspección.",
  "Talk with the family about whether a loan fits. Do not apply without their decision.": "Hablar con la familia sobre si le conviene un préstamo. No solicitarlo sin su decisión.",
  "Draft a referral message to a nearby food pantry partner.": "Redactar un mensaje de referencia para un banco de comida cercano.",
  "FEMA: Individual Assistance": "FEMA: Asistencia Individual",
  "Texas Department of Insurance": "Departamento de Seguros de Texas",
  "SBA: Disaster assistance": "SBA: Asistencia por desastre",
  "Public Utility Commission of Texas": "Comisión de Servicios Públicos de Texas",
  "2-1-1 Texas": "2-1-1 Texas",
  // Agencies (packet "To")
  FEMA: "FEMA",
  "Private insurer": "Aseguradora privada",
  "U.S. Small Business Administration": "Administración de Pequeños Negocios de EE. UU. (SBA)",
  "Retail electric provider (Public Utility Commission of Texas rules)": "Proveedor de electricidad (reglas de la Comisión de Servicios Públicos de Texas)",
  "2-1-1 Texas / United Way": "2-1-1 Texas / United Way",

  // Evidence (EVIDENCE_LABELS)
  "Photos of the damage": "Fotos de los daños",
  "Contractor repair estimate": "Presupuesto de reparación del contratista",
  "FEMA decision letter": "Carta de decisión de FEMA",
  "Insurance claim letter or email": "Carta o correo del seguro sobre el reclamo",
  "Insurance policy declarations page": "Página de declaraciones de la póliza de seguro",
  "Proof of occupancy (utility bill, lease, or bank statement)": "Comprobante de residencia (factura de servicios, contrato de renta o estado de cuenta)",
  "Photo ID": "Identificación con foto",
  "Statement describing losses": "Declaración de las pérdidas",
  "Receipts for lost items": "Recibos de las cosas perdidas",
  "Medical documentation of power-dependent equipment": "Documentación médica del equipo que necesita electricidad",

  // Plan (src/lib/agents/recovery.ts)
  "Packet is ready. A navigator must approve before anything is sent.": "El paquete está listo. Un trabajador social debe aprobarlo antes de enviar nada.",
  "Packet is ready. Nothing is sent until you approve it.": "El paquete está listo. No se envía nada hasta que usted lo apruebe.",
  "Date of loss": "Fecha del daño",
  "Policyholder name": "Nombre del asegurado",

  // Needs and people
  "FEMA said ineligible: occupancy not verified": "FEMA dijo que no califica: no se comprobó la residencia",
  "Roof wind damage": "Daño al techo por el viento",
  "Roof wind damage (tarped, not repaired)": "Daño al techo por el viento (con lona, sin reparar)",
  "Interior water damage": "Daño por agua dentro de la casa",
  "Food lost in power outage": "Comida perdida por el apagón",
  "Head of household": "Titular del hogar",
  "FEMA denied the application": "FEMA negó la solicitud",
  "FEMA letter": "carta de FEMA",

  // Document titles
  "Contractor estimate": "Presupuesto del contratista",
  "Insurance adjuster email": "Correo del ajustador del seguro",
  "Insurer email": "Correo de la aseguradora",
  "Roof damage photo": "Foto del daño al techo",
  "Roof photo": "Foto del techo",
  "In your own words": "En sus propias palabras",

  // Fact labels from the rules extractor (src/lib/agents/evidence.ts)
  "Adjuster inspection": "Inspección del ajustador",
  "Billing period": "Periodo de facturación",
  "Documents due to insurer": "Fecha límite de documentos para la aseguradora",
  "FEMA decision": "Decisión de FEMA",
  "FEMA registration ID": "Número de registro de FEMA",
  "Food loss from outage": "Comida perdida por el apagón",
  "Food lost in outage (estimated)": "Comida perdida en el apagón (estimado)",
  "Has a utility bill (not uploaded)": "Tiene una factura de servicios (sin subir)",
  "Household member (mother)": "Miembro del hogar (madre)",
  "Household member (son)": "Miembro del hogar (hijo)",
  "Hurricane deductible": "Deducible por huracán",
  "Insurance claim number": "Número de reclamo del seguro",
  "Interior repair line items": "Partidas de reparación interior",
  "Letter date (appeal clock starts)": "Fecha de la carta (empieza el plazo para apelar)",
  "Missing for FEMA": "Falta para FEMA",
  "No receipts kept": "No guardó recibos",
  "Person named": "Persona mencionada",
  "Policy exclusion": "Exclusión de la póliza",
  "Policy number": "Número de póliza",
  "Power-dependent medical equipment": "Equipo médico que necesita electricidad",
  "Property address": "Dirección de la propiedad",
  "Repair estimate total": "Total del presupuesto de reparación",
  "Roof damage": "Daño al techo",
  Housing: "Vivienda",
  "No insurance": "Sin seguro",
  "Has a FEMA letter (not uploaded)": "Tiene una carta de FEMA (sin subir)",
  // Fixed values the rules extractor writes
  "Rents the home": "Renta la casa",
  "Owns the home": "La casa es propia",
  "Denied (in the household's words)": "Negada (según la familia)",
  "No insurance policy": "Sin póliza de seguro",
  "Proof of occupancy": "Comprobante de residencia",
  "Flood / rising water excluded": "Excluye inundación o crecida de agua",
  "Food receipts not available": "No hay recibos de la comida",

  // Which extractor ran (src/lib/labels.ts)
  Claude: "Claude",
  "rules engine": "el motor de reglas",
  "Claude read every document. Its facts were checked against the document text and backstopped by the rules engine.":
    "Claude leyó todos los documentos. Cada dato se comprobó con el texto del documento, y el motor de reglas revisó que no faltara nada.",
  "No API key is set, so the offline rules engine read every document.":
    "Este servidor no tiene clave de Claude, así que el motor de reglas sin conexión leyó todos los documentos.",

  // Coordinator step labels and fallback notes (src/lib/agents/coordinator.ts)
  "Checking the bill's address and dates": "Revisar la dirección y las fechas de la factura",
  "Working out who's who": "Ver quién es quién",
  "Listing what the family needs": "Anotar lo que necesita la familia",
  "Looking for details that don't match": "Buscar datos que no coinciden",
  "Finding help that fits": "Buscar ayuda que le sirva",
  "Picking the next question": "Elegir la siguiente pregunta",
  "Writing the plan": "Escribir el plan",
  "Preparing drafts": "Preparar los borradores",
  "Holding drafts for your OK": "Guardar los borradores hasta su permiso",
  "Updating the case map": "Actualizar el mapa del caso",
  "this document's facts are missing from the case": "faltan en el caso los datos de este documento",
  "utility bills were not counted as proof of occupancy": "las facturas no se contaron como comprobante de residencia",
  "household members were not resolved": "no se identificó a los miembros del hogar",
  "documents were not checked for conflicts": "no se revisó si los documentos coinciden",
  "no follow-up question was picked": "no se eligió la siguiente pregunta",
  "no packets were drafted, so nothing can be approved": "no se prepararon paquetes, así que no hay nada que aprobar",
  "approval gates were not applied, so nothing can be approved in this run": "no se aplicaron los controles de aprobación, así que no se puede aprobar nada en esta revisión",
  "the recovery graph is empty": "el mapa de recuperación está vacío",
};

const MONTHS: Record<string, string> = {
  January: "enero", February: "febrero", March: "marzo", April: "abril", May: "mayo", June: "junio", July: "julio",
  August: "agosto", September: "septiembre", October: "octubre", November: "noviembre", December: "diciembre",
};

/** Equipment named in needs, roles and plan text, with its article. Lowercase keys. */
const EQUIPMENT: Record<string, [article: "el" | "la", noun: string]> = {
  "oxygen concentrator": ["el", "concentrador de oxígeno"],
  oxygen: ["el", "oxígeno"],
  "cpap machine": ["la", "máquina CPAP"],
  "bipap machine": ["la", "máquina BiPAP"],
  "dialysis machine": ["la", "máquina de diálisis"],
  "home dialysis machine": ["la", "máquina de diálisis en casa"],
  nebulizer: ["el", "nebulizador"],
  ventilator: ["el", "respirador"],
  "power wheelchair": ["la", "silla de ruedas eléctrica"],
  "oxygen equipment": ["el", "equipo de oxígeno"],
  "feeding pump": ["la", "bomba de alimentación"],
  "suction machine": ["la", "máquina de succión"],
  "hospital bed": ["la", "cama de hospital"],
  "refrigerated insulin": ["la", "insulina refrigerada"],
  "electric wheelchair": ["la", "silla de ruedas eléctrica"],
  "insulin refrigerator": ["el", "refrigerador para la insulina"],
  "medical equipment": ["el", "equipo médico"],
  "powered medical equipment": ["el", "equipo médico eléctrico"],
};
const equip = (s: string): [string, string] => EQUIPMENT[s.toLowerCase()] ?? ["el", s];

const ROOMS: Record<string, string> = {
  "living room": "la sala", kitchen: "la cocina", bedroom: "el dormitorio", bathroom: "el baño", garage: "el garaje",
  "dining room": "el comedor", hallway: "el pasillo", attic: "el ático",
};
const RELATIONS: Record<string, string> = {
  Mother: "Madre", Father: "Padre", Son: "Hijo", Daughter: "Hija", Grandmother: "Abuela", Grandfather: "Abuelo",
  Spouse: "Cónyuge", Wife: "Esposa", Husband: "Esposo", Child: "Hijo/a", Partner: "Pareja",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const RELATIVE_ES: Record<string, string> = {
  mother: "mamá", father: "papá", wife: "esposa", husband: "esposo", daughter: "hija", son: "hijo", grandmother: "abuela", grandfather: "abuelo",
};
/** "Carmen" stays; "your husband" / "the husband" → "su esposo"; "the household member" → "su familiar". */
const whose = (name: string) => {
  if (name === "the household member") return "su familiar";
  const rel = name.match(/^(?:your|the) (\w+)$/)?.[1];
  return rel && RELATIVE_ES[rel] ? `su ${RELATIVE_ES[rel]}` : name;
};
const billEs = (month?: string) => `factura de la luz${month && MONTHS[month] ? ` de ${MONTHS[month]}` : ""}`;

/** Every known phrase inside a longer string, e.g. a comma-joined list of evidence labels. */
const inside = (s: string) =>
  Object.keys(PHRASES).sort((a, b) => b.length - a.length).reduce((acc, k) => acc.split(k).join(PHRASES[k]), s);

const PATTERNS: [RegExp, (...m: string[]) => string | undefined][] = [
  // Needs
  [/^(.+) needs reliable power$/, (e) => `${cap(equip(e)[1])} necesita electricidad confiable`],
  [/^Food lost in (\d+)-day outage$/, (n) => `Comida perdida en un apagón de ${n} días`],
  [/^(.+) water damage$/, (r) => (ROOMS[r.toLowerCase()] ? `Daño por agua en ${ROOMS[r.toLowerCase()]}` : undefined)],
  [/^(.+) water damage photo$/, (r) => (ROOMS[r.toLowerCase()] ? `Foto del daño por agua en ${ROOMS[r.toLowerCase()]}` : undefined)],
  // People: "Mother, 71, uses oxygen"
  [/^(\w+)(?:, (\d+))?(?:, uses (.+))?$/, (rel, age, e) =>
    RELATIONS[rel] ? [RELATIONS[rel], age, e && `usa ${equip(e)[1]}`].filter(Boolean).join(", ") : undefined],
  // Plan
  [/^Get (.+)'s doctor to sign the critical care form$/, (n) => `Pedirle al médico de ${whose(n)} que firme el formulario de cuidado crítico`],
  [/^Ask (.+)'s doctor to fill out the provider's critical care form\.$/, (n) => `Pedirle al médico de ${whose(n)} que llene el formulario de cuidado crítico del proveedor.`],
  [/^(Her|His|Their|.+'s) (.+) needs power\. Also make a backup plan for the next outage\.$/, (who, e) => {
    const [art, noun] = equip(e);
    const subject = /^(Her|His|Their)$/.test(who) ? `Su ${noun}` : `${cap(art)} ${noun} de ${who.slice(0, -2)}`;
    return `${subject} necesita electricidad. Haga también un plan de respaldo para el próximo apagón.`;
  }],
  [/^Resolve conflict: (.+)$/, (f) => `Resolver diferencia: ${tr(f, "es")}`],
  [/^Collect: (.+)$/, (l) => `Conseguir: ${tr(l, "es")}`],
  [/^Waiting on: (.+)$/, (l) => `Falta: ${inside(l)}`],
  [/^Unblocks (\d+) pathways?\.(?: The household already mentioned having it \((.+)\)\.)?$/, (n, hint) =>
    `Desbloquea ${n} programa${n === "1" ? "" : "s"}.${hint ? ` La familia ya mencionó que lo tiene (${tr(hint, "es")}).` : ""}`],
  [/^(?:(\w+) )?electric bill in email$/i, (m) => `${billEs(m)} en su correo`],
  [/^(\w+) electric bill$/, (m) => (MONTHS[m] ? cap(billEs(m)) : undefined)],
  [/^Voice note from (.+?)( \(Spanish\))?$/, (n, sp) => `Nota de voz de ${n}${sp ? " (en español)" : ""}`],
  // Fact labels and values with a relative or equipment in them
  [/^Household member \((\w+)\)$/, (r) => (RELATIVE_ES[r] ? `Miembro del hogar (${RELATIVE_ES[r]})` : undefined)],
  [/^Refrigerated food lost \((?:(\d+)-day outage|power outage)\)$/, (n) => `Comida refrigerada perdida (${n ? `apagón de ${n} días` : "apagón"})`],
  [/^(.+?) \((\p{Lu}[^,)]*, \d+|\w+(?: member)?)\)$/u, (e, who) => {
    const known = EQUIPMENT[e.toLowerCase()];
    if (!known) return undefined;
    return `${cap(known[1])} (${who === "household member" ? "familiar" : RELATIVE_ES[who] ?? who})`;
  }],
  // Packets
  [/^(.+): packet$/, (p) => `${tr(p, "es")}: paquete`],
  // Follow-up fallback question, already Spanish but with an English label inside
  [/^¿Puede compartir: (.+)\?$/, (l) => `¿Puede compartir: ${tr(l, "es")}?`],
  // Which extractor ran
  [/^Claude (\d+) · rules (\d+)$/, (c, r) => `Claude ${c} · reglas ${r}`],
  [/^(?:All (\d+) documents|(\d+) of (\d+) documents) fell back to the offline rules engine because Claude timed out, refused, returned unusable output or errored\. The agent log shows the reason for each\.$/,
    (all, n, of) => `${all ? `Los ${all} documentos pasaron` : `${n} de ${of} documentos pasaron`} al motor de reglas sin conexión porque Claude tardó demasiado, se negó, dio una respuesta inservible o falló. El registro de los agentes muestra el motivo de cada uno.`],
  // Warnings from the coordinator
  [/^(.+) failed, so (.+)\.$/, (l, note) => `${tr(l, "es")}: falló, así que ${tr(note, "es")}.`],
  [/^(.+) failed \((.+)\)\.$/, (l, msg) => `${tr(l, "es")}: falló (${msg}).`],
  [/^(.+) was skipped\.$/, (l) => `${tr(l, "es")}: se omitió.`],
  [/^(\d+) steps could not start\.$/, (n) => `${n} pasos no pudieron empezar.`],
  [/^Reading (.+)$/, (f) => `Leer ${f}`],
];

/** The Spanish for an agent-written string, or undefined when there is no entry. */
export function spanish(text: string): string | undefined {
  if (text in PHRASES) return PHRASES[text];
  for (const [re, fn] of PATTERNS) {
    const m = text.match(re);
    if (m) {
      const out = fn(...m.slice(1));
      if (out !== undefined) return out;
    }
  }
  return undefined;
}

/** Agent-written text in the reader's language. Falls back to the English. */
export function tr(text: string, lang: Lang): string {
  return lang === "es" ? spanish(text) ?? text : text;
}
