import type { Lang } from "@/components/app/i18n";
import { TYPED_KINDS } from "@/lib/typedKinds";

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
  "Decide whether a low-interest SBA loan fits your family. Nothing is sent unless you approve it.":
    "Decidir si a su familia le conviene un préstamo de la SBA con interés bajo. No se envía nada a menos que usted lo apruebe.",
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
  "Proof of ownership (deed, mortgage statement or property tax bill)": "Prueba de propiedad (escritura, estado de hipoteca o recibo del impuesto)",
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
  "Powered medical equipment needs reliable power": "El equipo médico eléctrico necesita electricidad confiable",
  "Head of household": "Titular del hogar",
  "FEMA denied the application": "FEMA negó la solicitud",
  "letter from FEMA": "carta de FEMA",

  // Household-voice plan steps
  "Send FEMA your appeal, with proof that you lived in the home.": "Enviar a FEMA su apelación, con prueba de que vivía en la casa.",
  "Send your repair estimate and damage photos to your insurance company.": "Enviar su presupuesto de reparación y las fotos de los daños a su compañía de seguros.",
  "Ask 2-1-1 Texas to connect you with a food pantry near you.": "Pedir a 2-1-1 Texas que le conecte con un banco de comida cercano.",
  // Agents and what they did (the activity line)
  Coordinator: "Coordinador", "Evidence Agent": "Agente de documentos", "Recovery-Match Agent": "Agente de programas",
  "Packet Agent": "Agente de paquetes", "Follow-up Agent": "Agente de seguimiento", "Safety Agent": "Agente de seguridad",
  "Started case run": "Empezó a revisar el caso", "Fell back to rules": "Pasó al motor de reglas", "Claude skipped": "Dejó de usar Claude",
  "Verified proof of occupancy": "Comprobó la residencia", "Occupancy not verified": "No pudo comprobar la residencia",
  "Resolved people": "Identificó a las personas", "Built needs list": "Hizo la lista de necesidades", "Checked for conflicts": "Buscó datos que no coinciden",
  "Matched recovery pathways": "Encontró programas", "Scored evidence": "Revisó los documentos", "Built recovery plan": "Escribió el plan",
  "Applied approval gates": "Puso los controles de aprobación", "Updated recovery graph": "Actualizó el mapa del caso",
  "Approval recorded": "Guardó su aprobación", "Queued to sandbox outbox": "Lo puso en la bandeja de práctica", "Conflict resolved": "Guardó su respuesta",
  "Step failed": "Un paso falló", "Step skipped": "Se omitió un paso",
  "Sorting the new papers": "Ordenar los papeles nuevos", "Taking over this paper": "Encargarse de este papel", "Opening the gate": "Abrir el control",
  "Putting the draft in the practice outbox": "Poner el borrador en la bandeja de práctica",
  // Why a program matched
  "FEMA letter says ineligible for insufficient information": "La carta de FEMA dice que no califica por información insuficiente",
  "Wind damage to roof documented in photos and estimate": "Daño del viento al techo en las fotos y el presupuesto",
  "Repair estimate is larger than what insurance is likely to pay": "La reparación cuesta más de lo que el seguro probablemente pague",
  "Household lost refrigerated food during the outage": "La familia perdió comida refrigerada durante el apagón",

  // Document titles (the sample households)
  "Mortgage statement": "Estado de hipoteca",
  "60 days from the date on the FEMA letter": "60 días desde la fecha de la carta de FEMA",
  "Due date stated in the insurer's email": "Fecha límite que indica el correo de la aseguradora",
  "Doctor's critical care form": "Formulario de cuidado crítico del médico",
  "Driver license": "Licencia de conducir",
  "Kids' bedroom ceiling photo": "Foto del techo del cuarto de los niños",
  "Spoiled food photo": "Foto de la comida echada a perder",
  "Texas ID card": "Identificación de Texas",
  "Pay stub": "Talón de pago",
  "Apartment lease": "Contrato de renta del apartamento",
  "Pediatrician's letter": "Carta del pediatra",
  "Roof and garage photo": "Foto del techo y el garaje",
  "Back bedroom ceiling photo": "Foto del techo del cuarto de atrás",
  "Insurance claim letter": "Carta del seguro sobre el reclamo",
  "Warranty deed": "Escritura de la casa",
  "Insurance declarations page": "Página de declaraciones del seguro",
  "Credit union statement": "Estado de cuenta de la cooperativa de crédito",
  "This sample household's made-up documents are read by the offline rules engine, so the demo never depends on a model.":
    "Los documentos inventados de este hogar de ejemplo los lee el motor de reglas sin conexión, así que el ejemplo nunca depende de un modelo de IA.",
  "Please choose one of the values your documents show.": "Elija uno de los datos que muestran sus documentos.",
  "Unknown sample household.": "No existe ese hogar de ejemplo.",

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

  // Errors a person can see (src/lib/cases.ts, src/lib/store.ts, the API routes)
  "Add a file or a few words about what happened first.": "Primero agregue un archivo o unas palabras sobre lo que pasó.",
  "Add a file, type a document, or write a few words about what happened.": "Agregue un archivo, escriba un documento o cuente en pocas palabras lo que pasó.",
  "Only the sample case takes sample documents.": "Solo el caso de ejemplo usa documentos de ejemplo.",
  "Please agree to how BayouBridge handles your documents first.": "Primero acepte cómo BayouBridge maneja sus documentos.",
  "Please choose what kind of document you typed.": "Elija qué tipo de documento escribió.",
  "Please enter the address of the damaged home.": "Escriba la dirección de la casa dañada.",
  "The sample case uses synthetic documents only.": "El caso de ejemplo solo usa documentos inventados.",
  "The typed documents could not be read. Please try again.": "No pudimos leer los documentos escritos. Intente de nuevo.",
  "This case has expired or was deleted. Please start again.": "Este caso venció o se borró. Por favor empiece de nuevo.",
  "This case has expired or was deleted.": "Este caso venció o se borró.",
  "Case not found. Run the agents first.": "No encontramos el caso. Primero deje que trabajen los ayudantes.",
  "Case not found.": "No encontramos el caso.",
  "No packet has been drafted for this task yet.": "Todavía no hay un paquete preparado para este paso.",
  "Send the files as multipart/form-data.": "No se pudieron enviar los archivos. Intente de nuevo.",
  "The agent pipeline failed. See the server log.": "Los ayudantes tuvieron un problema y no terminaron. Intente de nuevo.",
  "This task doesn't send anything, so there is nothing to approve.": "Este paso no envía nada, así que no hay nada que aprobar.",
  "Unknown task. The plan may have changed; run the agents again.": "No encontramos este paso. Puede que el plan haya cambiado; deje que los ayudantes trabajen de nuevo.",
  "The agents couldn't finish.": "Los ayudantes no pudieron terminar.",
  "Failed to fetch": "No hay conexión con el servidor. Revise su internet e intente de nuevo.",

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
  [/^Household member(?:, (\d+))?(?:, uses (.+))?$/, (age, e) => ["Miembro del hogar", age, e && `usa ${equip(e)[1]}`].filter(Boolean).join(", ")],
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
  [/^Send (.+)'s critical care form to the electric provider$/, (n) => `Enviar el formulario de cuidado crítico de ${whose(n)} al proveedor de electricidad`],
  [/^Confirmed: (.+)$/, (v) => `Confirmado: ${v}`],
  [/^Note from (.+)$/, (n) => `Nota de ${n}`],
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
  // Errors with a name or number in them
  [/^(.+): please upload a photo \(JPEG, PNG, WebP\), a PDF or a text file\.$/, (f) => `${f}: suba una foto (JPEG, PNG, WebP), un PDF o un archivo de texto.`],
  [/^(.+) is larger than 8 MB\.$/, (f) => `${f} pesa más de 8 MB.`],
  [/^You can add up to (\d+) files\.$/, (n) => `Puede agregar hasta ${n} archivos.`],
  [/^You can type up to (\d+) documents\.$/, (n) => `Puede escribir hasta ${n} documentos.`],
  [/^(.+): please type a little more of what it says\.$/, (k) => `${tr(k, "es")}: escriba un poco más de lo que dice.`],
  [/^(.+): please keep it under (\d+) characters\.$/, (k, n) => `${tr(k, "es")}: use menos de ${n} caracteres.`],
  [/^This task is blocked\. (.+)$/, (d) => `Este paso está en espera. ${tr(d, "es")}`],
  [/^Upload failed \((\d+)\)$/, (n) => `No se pudo subir (error ${n}).`],
  [/^Server returned (\d+)$/, (n) => `El servidor respondió con un error (${n}).`],
  [/^(.+?): (.+)$/, (a, b) => { // "<task title>: <error>" from an approval
    const ta = spanish(a), tb = spanish(b);
    return ta && tb ? `${ta}: ${tb}` : undefined;
  }],
  [/^Unblocks (\d+) pathways?\. You mentioned you have it \((.+)\)\.$/, (n, h) => `Desbloquea ${n} programa${n === "1" ? "" : "s"}. Usted mencionó que lo tiene (${tr(h, "es")}).`],
  [/^We couldn't read (.+)\. Try a clearer photo, or type what it says with "Type a document"\.$/, (f) => `No pudimos leer ${f}. Intente con una foto más clara o escriba lo que dice con "Escribir un documento".`],
  [/^Our photo reader is switched off right now, so (.+) (?:wasn't|weren't) read\. You can type what (?:it says|they say) with "Type a document" instead\.$/, (f) => `Nuestro lector de fotos está apagado ahora, así que no se leyó ${f}. Puede escribir lo que dice con "Escribir un documento".`],
  [/^Read (.+)$/, (f) => `Leyó ${f}`], [/^Reused (.+)$/, (f) => `Reusó ${f}`],
  [/^Drafted packet for (.+)$/, (n) => `Preparó el paquete para ${tr(n, "es")}`], [/^Drafting papers for (.+)$/, (n) => `Preparar papeles para ${tr(n, "es")}`],
  [/^Back to the (.+)$/, (st) => `De vuelta a: ${st}`],
  [/^Household member uses (?:an? )?(.+)$/, (e) => `Un miembro del hogar usa ${EQUIPMENT[e.toLowerCase()]?.[1] ?? e}`],
  // Warnings from the coordinator
  [/^(.+) failed, so (.+)\.$/, (l, note) => `${tr(l, "es")}: falló, así que ${tr(note, "es")}.`],
  [/^(.+) failed \((.+)\)\.$/, (l, msg) => `${tr(l, "es")}: falló (${msg}).`],
  [/^(.+) was skipped\.$/, (l) => `${tr(l, "es")}: se omitió.`],
  [/^(\d+) steps could not start\.$/, (n) => `${n} pasos no pudieron empezar.`],
  [/^Reading (.+)$/, (f) => `Leer ${f}`],
];

/** Typed-document titles: "Utility bill" → "Factura de servicios". */
const KIND_TITLES: Record<string, string> = Object.fromEntries(Object.values(TYPED_KINDS).map((k) => [k.en, k.es]));

/** The Spanish for an agent-written string, or undefined when there is no entry. */
export function spanish(text: string): string | undefined {
  if (text in PHRASES) return PHRASES[text];
  if (text in KIND_TITLES) return KIND_TITLES[text];
  if (text in RELATIONS) return RELATIONS[text]; // an unnamed relative shown by relation
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
