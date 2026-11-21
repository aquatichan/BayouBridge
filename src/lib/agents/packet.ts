import { programs } from "@/data/resources";
import type { CaseState, Need, Packet, ProgramMatch } from "@/lib/types";
import { tr } from "@/lib/es";
import { NEED_EVIDENCE, PROGRAM_NEEDS } from "./recovery";

// Packet Agent: drafts what would be sent for a pathway whose evidence is
// complete. Pure and deterministic. A packet only ever goes to the sandbox
// outbox, and only after someone approves it on the server (a navigator, or
// the household in the app).

const list = (xs: string[], and: string) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`;

/** "Reyes household" → "del hogar Reyes"; a name the household typed stays as typed. */
const onBehalfEs = (name: string) => {
  if (/^(your household|su hogar)$/i.test(name)) return "de su hogar";
  const surname = name.match(/^(.+) household$/)?.[1];
  return surname ? `del hogar ${surname}` : `del hogar (${name})`;
};

/** "Reyes household" → "the Reyes household"; the app's default names → "the household"; a typed name stays as typed. */
const onBehalfEn = (name: string) =>
  /^(your household|su hogar)$/i.test(name) ? "the household" : /\bhousehold$/i.test(name) ? `the ${name}` : name;

export function buildPacket(
  match: ProgramMatch, state: Pick<CaseState, "documents" | "extractions" | "needs" | "householdName" | "address" | "disaster"> & Partial<Pick<CaseState, "people">>,
  /** Who approves it: a navigator (default) or, in the app, the household itself. */
  approver: "navigator" | "household" = "navigator",
): Packet {
  const program = programs.find((p) => p.id === match.programId);
  const to = program?.agency ?? match.name;

  // Attachments: every document that satisfies one of the pathway's required evidence types.
  const attachIds = [...new Set(match.evidence.flatMap((e) => e.satisfiedBy))];
  const attachments = attachIds.map((docId) => ({ docId, title: state.documents.find((d) => d.id === docId)?.title ?? docId }));

  // Citations: the facts behind the needs this pathway serves, the fact its deadline comes from,
  // and the billing period of any attached bill.
  const facts = state.extractions.flatMap((e) => e.facts);
  const keys = new Set(
    (PROGRAM_NEEDS[match.programId] ?? [])
      .filter((k) => state.needs.some((n: Need) => n.key === k))
      .flatMap((k) => NEED_EVIDENCE[k]),
  );
  const deadlineKey = program?.deadline?.fromFact;
  const cited = facts.filter((f) =>
    (f.normalized && keys.has(f.normalized))
    || (deadlineKey && f.normalized?.startsWith(deadlineKey + ":"))
    || (f.type === "billing_period" && attachIds.includes(f.docId))); // what makes a bill count as proof of occupancy
  const seenQuotes = new Set<string>();
  const citations = cited
    .filter((f) => !seenQuotes.has(f.quote) && seenQuotes.add(f.quote))
    .map((f) => ({ factId: f.id, quote: f.quote, docId: f.docId }));

  const titles = attachments.map((a) => a.title);
  const ok = match.evidence.filter((e) => e.satisfiedBy.length).length;
  const due = match.deadline ? ` The deadline we have on file is ${match.deadline.date}.` : "";
  const dueEs = match.deadline ? ` La fecha límite que tenemos es ${match.deadline.date}.` : "";

  // A FEMA appeal is a signed letter with the registration and disaster numbers, the reason, and what is enclosed.
  const fact = (type: string, label?: string) => state.extractions.flatMap((e) => e.facts).find((f) => f.type === type && (!label || f.label === label));
  const letter = match.programId === "fema-appeal" ? femaLetter({
    registration: fact("fema_registration")?.value, disaster: state.disaster.match(/DR-\d+-[A-Z]{2}/)?.[0],
    applicant: fact("person", "Person named")?.value ?? state.householdName.replace(/ household$/i, ""),
    address: state.address, letterDate: fact("deadline", "Letter date (appeal clock starts)")?.value,
    deadline: match.deadline?.date, encl: titles,
  }) : undefined;
  const form = letter ? occupancyDeclaration({
    applicant: fact("person", "Person named")?.value ?? state.householdName.replace(/ household$/i, ""),
    registration: fact("fema_registration")?.value, disaster: state.disaster.match(/DR-\d+-[A-Z]{2}/)?.[0],
    address: state.address, lossDate: fact("date_of_loss")?.value,
    members: (state.people ?? []).map((p) => p.name),
  }) : undefined;

  return {
    id: `packet:${match.programId}`,
    programId: match.programId,
    title: `${match.name}: packet`,
    to,
    summary: `${ok} of ${match.evidence.length} required documents attached, ${citations.length} cited facts. ${match.nextAction}`,
    attachments,
    citations,
    bilingualCover: {
      en: `To ${to}: on behalf of ${onBehalfEn(state.householdName)} at ${state.address}, we are sending ${attachments.length} document${attachments.length === 1 ? "" : "s"} for the ${match.name}: ${list(titles, "and")}.${due} Please let us know if you need anything else. ${approver === "household" ? "Prepared with BayouBridge and approved by the household before sending." : "Prepared by a community disaster-recovery navigator and reviewed before sending."}`,
      es: `Para ${tr(to, "es")}: en nombre ${onBehalfEs(state.householdName)} en ${state.address}, enviamos ${attachments.length} documento${attachments.length === 1 ? "" : "s"} para ${tr(match.name, "es")}: ${list(titles.map((x) => tr(x, "es")), "y")}.${dueEs} Avísenos si necesita algo más. ${approver === "household" ? "Preparado con BayouBridge y aprobado por la familia antes de enviarlo." : "Preparado por un navegador comunitario de recuperación y revisado antes de enviar."}`,
    },
    status: "draft",
    ...(letter ? { letter } : {}),
    ...(form ? { form } : {}),
  };
}

/**
 * A declarative statement of occupancy, filled in from the case. FEMA can accept a signed
 * statement when other proof of occupancy is hard to get; the household checks every line,
 * fills the blanks, and signs it. A mock-up for the demo, not an official FEMA form.
 */
function occupancyDeclaration(x: { applicant: string; registration?: string; disaster?: string; address: string; lossDate?: string; members: string[] }) {
  const reg = x.registration ?? "[registration number]", dis = x.disaster ?? "[disaster number]", loss = x.lossDate ?? "[date of the disaster]";
  const who = x.members.length ? x.members.map((m) => `  - ${m}`).join("\n") : "  - ______________________";
  return {
    en: `DECLARATIVE STATEMENT OF OCCUPANCY (draft, not an official FEMA form)\n\nApplicant: ${x.applicant}\nFEMA registration number: ${reg}\nDisaster number: ${dis}\nDamaged home: ${x.address}\n\nI lived at the address above as my primary residence on ${loss}, when the disaster struck.\nI lived there from ______________ (month/year) to the date of the disaster.\n\nPeople who lived in the home with me:\n${who}\n\nI declare that the information above is true and correct. I understand that a false statement to obtain federal disaster assistance is a crime.\n\nSignature: ______________________   Date: ______________\nPrinted name: ${x.applicant}`,
    es: `DECLARACIÓN DE RESIDENCIA (borrador, no es un formulario oficial de FEMA)\n\nSolicitante: ${x.applicant}\nNúmero de registro de FEMA: ${reg}\nNúmero de desastre: ${dis}\nCasa dañada: ${x.address}\n\nVivía en la dirección de arriba como mi residencia principal el ${loss}, cuando ocurrió el desastre.\nViví allí desde ______________ (mes/año) hasta la fecha del desastre.\n\nPersonas que vivían conmigo en la casa:\n${who}\n\nDeclaro que la información anterior es verdadera y correcta. Entiendo que dar información falsa para obtener asistencia federal por desastre es un delito.\n\nFirma: ______________________   Fecha: ______________\nNombre en letra de molde: ${x.applicant}`,
  };
}

/** The draft appeal letter. FEMA asks for it signed, within 60 days, naming the registration and disaster numbers. */
function femaLetter(x: { registration?: string; disaster?: string; applicant: string; address: string; letterDate?: string; deadline?: string; encl: string[] }) {
  const reg = x.registration ?? "[registration number]", dis = x.disaster ?? "[disaster number]";
  const list = x.encl.map((t) => `  - ${t}`).join("\n");
  const listEs = x.encl.map((t) => `  - ${tr(t, "es")}`).join("\n");
  return {
    en: `Federal Emergency Management Agency\nRE: Appeal of eligibility decision${x.letterDate ? ` dated ${x.letterDate}` : ""}\nRegistration number: ${reg}\nDisaster number: ${dis}\nDamaged home: ${x.address}\n\nTo whom it may concern:\n\nI am appealing the decision on my application. I lived in this home as my primary residence when the disaster struck, and I am enclosing documents that show it.\n\nEnclosed:\n${list}\n\n${x.deadline ? `I am sending this before the appeal deadline of ${x.deadline}.\n\n` : ""}Sincerely,\n\n______________________  (signature)\n${x.applicant}\nDate: ______________  Phone: ______________`,
    es: `Agencia Federal para el Manejo de Emergencias (FEMA)\nREF: Apelación de la decisión de elegibilidad${x.letterDate ? ` con fecha ${x.letterDate}` : ""}\nNúmero de registro: ${reg}\nNúmero de desastre: ${dis}\nCasa dañada: ${x.address}\n\nA quien corresponda:\n\nApelo la decisión sobre mi solicitud. Vivía en esta casa como mi residencia principal cuando ocurrió el desastre y adjunto documentos que lo demuestran.\n\nAdjuntos:\n${listEs}\n\n${x.deadline ? `Envío esta carta antes de la fecha límite de apelación, ${x.deadline}.\n\n` : ""}Atentamente,\n\n______________________  (firma)\n${x.applicant}\nFecha: ______________  Teléfono: ______________`,
  };
}
