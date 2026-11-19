// Landing page copy, English and Spanish. Headlines are split into
// [before, accent, after]: the accent word is set in serif italic.

export type Lang = "en" | "es";
export type Headline = [string, string, string];

const en = {
  nav: { how: "How it works", privacy: "Privacy", navigator: "Navigator view", start: "Start a case" },
  hero: {
    eyebrow: "Disaster recovery · Houston",
    title: ["Get Houston families the recovery aid they’re ", "owed", "."] as Headline,
    sub: "BayouBridge reads a family’s storm paperwork, finds the programs they may qualify for, and tells them the one thing to do next.",
    start: "Start a case",
    how: "See how it works",
    stats: [
      { n: "60", unit: "days", label: "to appeal a FEMA decision" },
      { n: "~2", unit: "hrs", label: "of casework per family, done by the agents (est.)" },
      { n: "0", unit: "", label: "documents sent without your OK" },
    ],
    scroll: "Scroll",
    videoLabel: "A flooded Houston street at night, then someone sorting storm paperwork at a kitchen table.",
  },
  story: {
    eyebrow: "02 · The app",
    title: ["Five agents. One case ", "file", "."] as Headline,
    note: "Sample case · the synthetic Reyes household · running in your browser",
    loading: "Opening the office…",
    steps: {
      summary: { label: "Case summary", badge: "Sample case" },
      plan: { label: "The plan", badge: (n: number) => `${n} steps` },
      drafts: { label: "Drafts waiting for approval", badge: "Needs your OK" },
      missing: { label: "Missing document", badge: "Blocking" },
      unblocked: { label: "Unblocked", badge: "Unblocked", waiting: "Waiting" },
    },
    summary: (docs: number) => `${docs} documents read: damage photos, a repair estimate, a FEMA letter, an insurer email and a Spanish voice note.`,
    summaryStats: (programs: number, score: number) => `${programs} possible programs · ${score}% of evidence on file`,
    owners: { Navigator: "Navigator", Household: "You", BayouBridge: "BayouBridge" } as Record<string, string>,
    attachments: (n: number) => `${n} attachment${n === 1 ? "" : "s"}`,
    nothingSent: "Nothing is sent until you approve it.",
    blocks: (program: string) => `Blocks the ${program}.`,
    arriving: "Keep scrolling: the electric bill arrives…",
    arrived: "The September electric bill arrived. It proves the family lived there before the storm.",
    ready: (program: string) => `${program}: every document on file, ready for your approval.`,
    office: { overview: "The whole office", following: "Following" },
    jobs: {
      plan: (n: number) => `Planning ${n} steps`,
      drafts: (n: number) => `Drafting ${n} packets`,
      missing: "Asking for the electric bill",
      gate: "Opening the gate for the appeal",
    },
  },
  cta: {
    eyebrow: "03 · Your turn",
    title: ["Start with one ", "photo", "."] as Headline,
    button: "Start a case",
    sample: "or open the sample case",
    footer: [
      "A Teen Hacks Houston prototype.",
      "Programs are possible matches; only the agency decides eligibility.",
      "Your files stay in memory for up to 2 hours, then they’re deleted.",
    ],
    navigator: "Navigator view",
  },
};

type Strings = typeof en;

const es: Strings = {
  nav: { how: "Cómo funciona", privacy: "Privacidad", navigator: "Vista del navegador", start: "Empezar un caso" },
  hero: {
    eyebrow: "Recuperación de desastres · Houston",
    title: ["Que las familias de Houston reciban la ayuda que les ", "corresponde", "."],
    sub: "BayouBridge lee los papeles de la tormenta de una familia, encuentra los programas para los que podría calificar y le dice lo siguiente que debe hacer.",
    start: "Empezar un caso",
    how: "Ver cómo funciona",
    stats: [
      { n: "60", unit: "días", label: "para apelar una decisión de FEMA" },
      { n: "~2", unit: "h", label: "de trabajo por familia, hecho por los agentes (est.)" },
      { n: "0", unit: "", label: "documentos enviados sin su permiso" },
    ],
    scroll: "Deslice",
    videoLabel: "Una calle inundada de Houston de noche y luego alguien ordenando papeles de la tormenta en una mesa.",
  },
  story: {
    eyebrow: "02 · La app",
    title: ["Cinco agentes. Un ", "expediente", "."],
    note: "Caso de ejemplo · el hogar Reyes (inventado) · funcionando en su navegador",
    loading: "Abriendo la oficina…",
    steps: {
      summary: { label: "Resumen del caso", badge: "Caso de ejemplo" },
      plan: { label: "El plan", badge: (n: number) => `${n} pasos` },
      drafts: { label: "Borradores esperando aprobación", badge: "Necesita su permiso" },
      missing: { label: "Documento que falta", badge: "Bloquea" },
      unblocked: { label: "Desbloqueado", badge: "Desbloqueado", waiting: "En espera" },
    },
    summary: (docs: number) => `${docs} documentos leídos: fotos de los daños, un presupuesto, una carta de FEMA, un correo de la aseguradora y una nota de voz en español.`,
    summaryStats: (programs: number, score: number) => `${programs} programas posibles · ${score}% de la evidencia lista`,
    owners: { Navigator: "Navegador", Household: "Usted", BayouBridge: "BayouBridge" },
    attachments: (n: number) => `${n} adjunto${n === 1 ? "" : "s"}`,
    nothingSent: "Nada se envía hasta que usted lo apruebe.",
    blocks: (program: string) => `Bloquea: ${program}.`,
    arriving: "Siga deslizando: llega la factura de la luz…",
    arrived: "Llegó la factura de la luz de septiembre. Demuestra que la familia vivía allí antes de la tormenta.",
    ready: (program: string) => `${program}: todos los documentos listos para su aprobación.`,
    office: { overview: "Toda la oficina", following: "Siguiendo a" },
    jobs: {
      plan: (n: number) => `Planeando ${n} pasos`,
      drafts: (n: number) => `Preparando ${n} paquetes`,
      missing: "Pidiendo la factura de la luz",
      gate: "Abriendo la puerta para la apelación",
    },
  },
  cta: {
    eyebrow: "03 · Su turno",
    title: ["Empiece con una ", "foto", "."],
    button: "Empezar un caso",
    sample: "o abra el caso de ejemplo",
    footer: [
      "Un prototipo de Teen Hacks Houston.",
      "Los programas son opciones posibles; solo la agencia decide si usted califica.",
      "Sus archivos se guardan en memoria hasta 2 horas y luego se borran.",
    ],
    navigator: "Vista del navegador",
  },
};

export const LANDING: Record<Lang, Strings> = { en, es };
export const LANG_KEY = "bayoubridge.lang"; // shared with the app at /case, so the choice carries over
