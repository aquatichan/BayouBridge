// Landing page copy, English and Spanish, in plain language. Headlines are
// split into [before, accent, after]: the accent word is set in serif italic.

export type Lang = "en" | "es";
export type Headline = [string, string, string];

const en = {
  nav: { how: "How it works", details: "The details", start: "Start a case" },
  hero: {
    kicker: "Teen Hacks Houston — For Houston families rebuilding after a storm",
    title: ["Get the recovery help you’re ", "owed", "."] as Headline,
    sub: "Snap photos of your damage and your letters. BayouBridge sorts them, finds help you may qualify for, and tells you the one thing to do next.",
    start: "Start a case",
    how: "See how it works",
    hint: "Scroll",
    stats: [
      { to: 60, suffix: " days", label: "to appeal a FEMA decision" },
      { to: 2, prefix: "~", suffix: " hours", label: "of paperwork done for you" },
      { to: 0, suffix: "", label: "papers sent without your OK" },
    ],
    videoLabel: "A flooded Houston street at night, then someone sorting storm paperwork at a table.",
  },
  story: {
    kicker: "How it works",
    title: ["Five helpers. One ", "case", "."] as Headline,
    note: "A made-up family, the Reyes household, shown here as an example.",
    loading: "Opening the office…",
    steps: {
      summary: { label: "Your case at a glance", badge: "Example" },
      plan: { label: "Your plan", badge: (n: number) => `${n} steps` },
      drafts: { label: "Ready for your OK", badge: "Your call" },
      missing: { label: "One thing missing", badge: "Needed" },
      unblocked: { label: "Unblocked", badge: "Ready", waiting: "Waiting" },
    },
    summary: (docs: number) => `${docs} papers read: damage photos, a repair estimate, a FEMA letter, an insurance email and a voice note in Spanish.`,
    summaryStats: (programs: number) => `${programs} kinds of help this family may qualify for`,
    owners: { Navigator: "Caseworker", Household: "You", BayouBridge: "BayouBridge" } as Record<string, string>,
    attachments: (n: number) => `${n} paper${n === 1 ? "" : "s"}`,
    nothingSent: "Nothing goes out until you say so.",
    blocks: (program: string) => `Holding up the ${program}.`,
    arriving: "Keep scrolling: the electric bill is on its way…",
    arrived: "The September electric bill came in. It shows the family lived there before the storm.",
    ready: (program: string) => `${program}: everything needed is here.`,
    office: { overview: "The whole office", following: "Watching" },
    jobs: {
      plan: (n: number) => `Writing a ${n}-step plan`,
      drafts: (n: number) => `Preparing ${n} drafts`,
      missing: "Asking for the electric bill",
      gate: "Opening the gate",
    },
  },
};

type Strings = typeof en;

const es: Strings = {
  nav: { how: "Cómo funciona", details: "Los detalles", start: "Empezar un caso" },
  hero: {
    kicker: "Para familias de Houston que se recuperan de una tormenta",
    title: ["Reciba la ayuda que le ", "corresponde", "."],
    sub: "Tome fotos de los daños y de sus cartas. BayouBridge las ordena, encuentra ayuda para la que podría calificar y le dice lo siguiente que debe hacer.",
    start: "Empezar un caso",
    how: "Ver cómo funciona",
    hint: "Deslice",
    stats: [
      { to: 60, suffix: " días", label: "para apelar una decisión de FEMA" },
      { to: 2, prefix: "~", suffix: " horas", label: "de papeleo hecho por usted" },
      { to: 0, suffix: "", label: "papeles enviados sin su permiso" },
    ],
    videoLabel: "Una calle inundada de Houston de noche y luego alguien ordenando papeles en una mesa.",
  },
  story: {
    kicker: "Cómo funciona",
    title: ["Cinco ayudantes. Un ", "caso", "."],
    note: "Una familia inventada, el hogar Reyes, como ejemplo.",
    loading: "Abriendo la oficina…",
    steps: {
      summary: { label: "Su caso de un vistazo", badge: "Ejemplo" },
      plan: { label: "Su plan", badge: (n: number) => `${n} pasos` },
      drafts: { label: "Listo para su permiso", badge: "Usted decide" },
      missing: { label: "Falta una cosa", badge: "Se necesita" },
      unblocked: { label: "Desbloqueado", badge: "Listo", waiting: "En espera" },
    },
    summary: (docs: number) => `${docs} papeles leídos: fotos de los daños, un presupuesto, una carta de FEMA, un correo del seguro y una nota de voz en español.`,
    summaryStats: (programs: number) => `${programs} tipos de ayuda para los que esta familia podría calificar`,
    owners: { Navigator: "Trabajador social", Household: "Usted", BayouBridge: "BayouBridge" },
    attachments: (n: number) => `${n} papel${n === 1 ? "" : "es"}`,
    nothingSent: "Nada sale hasta que usted lo diga.",
    blocks: (program: string) => `Detiene: ${program}.`,
    arriving: "Siga deslizando: la factura de la luz está por llegar…",
    arrived: "Llegó la factura de la luz de septiembre. Muestra que la familia vivía allí antes de la tormenta.",
    ready: (program: string) => `${program}: ya está todo lo necesario.`,
    office: { overview: "Toda la oficina", following: "Mirando a" },
    jobs: {
      plan: (n: number) => `Escribiendo un plan de ${n} pasos`,
      drafts: (n: number) => `Preparando ${n} borradores`,
      missing: "Pidiendo la factura de la luz",
      gate: "Abriendo la puerta",
    },
  }
};

export const LANDING: Record<Lang, Strings> = { en, es };
export const LANG_KEY = "bayoubridge.lang"; // shared with the app at /case, so the choice carries over
