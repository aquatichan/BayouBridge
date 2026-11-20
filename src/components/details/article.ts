// "The details": everything technical about BayouBridge, in one newspaper-style
// page. The rest of the site stays in plain language. Every number here comes
// from the code (coordinator.ts, llmExtract.ts, validate.ts, recovery.ts,
// cases.ts, store.ts, director.ts) and the test suite.

import type { Lang } from "@/components/landing/strings";

export interface Bar { label: string; value: number; display: string; tone: "tide" | "sun" }
export interface Figure { title: string; legend?: [string, string]; bars: Bar[]; note: string }
export interface FlowNode { title: string; sub?: string; tag?: string; tone?: "tide" | "sun" | "plain" }
/** One step of a flowchart: the nodes in a row happen side by side; `edge` labels the arrow down to the next row. */
export interface FlowRow { nodes: FlowNode[]; edge?: string }
export interface Flowchart { title: string; rows: FlowRow[]; note: string }
/** One task in the coordinator's graph. `wave` is the row (0-based); `col` the column; the stack look means "one per paper". */
export interface DagNode { id: string; label: string; sub?: string; wave: number; col: "l" | "c" | "r"; wide?: number; stack?: boolean; tone?: "tide" | "sun" | "plain" }
/** `edges` are [from, to, optional x where the arrow lands on the target]. */
export interface Dag { title: string; legend: { label: string; tone: "tide" | "sun" | "plain" }[]; waves: string[]; nodes: DagNode[]; edges: [string, string, number?][]; note: string }
export interface TraceLine { kind: "req" | "event" | "data" | "note" | "gap"; text: string }
export interface Trace { title: string; window: string; lines: TraceLine[]; note: string }
export interface Section { heading: string; paragraphs: string[]; figure?: Figure; figures?: Figure[]; flow?: Flowchart; dag?: Dag; trace?: Trace }

export interface Article {
  masthead: [string, string, string];
  title: string;
  deck: [string, string];
  ticker: string[];
  sections: Section[];
  colophon: string;
  back: string;
}


// ── Flowcharts ───────────────────────────────────────────────────────────────

export const FLOWS: Record<Lang, { pipeline: Flowchart; fallback: Flowchart; bill: Flowchart }> = {
  en: {
    pipeline: {
      title: "Flowchart 1. From a photo to a plan",
      rows: [
        { nodes: [{ title: "Your papers", sub: "Photos, PDFs, letters and what you type", tone: "plain" }], edge: "all at once" },
        { nodes: [
          { title: "AI Reader", sub: "Reads photos and PDFs with Claude" },
          { title: "Paper Reader", sub: "Reads typed text with plain rules, in English and Spanish" },
        ], edge: "every detail must quote the paper" },
        { nodes: [{ title: "Checked and repaired", sub: "Bad quotes and values fixed or dropped; anything the rules found is added back" }] },
        { nodes: [
          { title: "Who’s who", sub: "Matches spellings of the same name" },
          { title: "What the family needs", sub: "Medical power first" },
          { title: "What doesn’t match", sub: "Dates and names that disagree" },
        ], edge: "plain code, same answer every time" },
        { nodes: [{ title: "Help that fits", sub: "5 kinds of help checked, each with its documents and deadline" }] },
        { nodes: [
          { title: "Next question", sub: "The one missing paper that unblocks the most" },
          { title: "Your plan", sub: "Ordered by safety, then deadline" },
        ], edge: "only for help with every document" },
        { nodes: [{ title: "Drafts for your OK", sub: "Papers to attach, quotes, a cover note in English and Spanish", tone: "sun" }], edge: "you approve" },
        { nodes: [{ title: "Practice outbox", sub: "Nothing is really sent", tone: "sun" }] },
      ],
      note: "Rows read top to bottom. Nodes side by side happen at the same time. Only the top two rows use AI; everything after is ordinary code.",
    },
    fallback: {
      title: "Flowchart 2. When the AI stumbles",
      rows: [
        { nodes: [{ title: "Ask Claude to read one paper", sub: "12 seconds per request, no retries", tone: "plain" }] },
        { nodes: [
          { tag: "In time, passes the checks", title: "Keep Claude’s details", sub: "Add anything the rules found that Claude missed" },
          { tag: "Too slow, refused, fails the checks or errors", title: "Rules reader takes over this paper", sub: "The activity log says why", tone: "sun" },
        ], edge: "count the failures in this run" },
        { nodes: [
          { tag: "Fewer than 2 (3 for your uploads)", title: "Next paper asks Claude as usual" },
          { tag: "2 or more (3 for your uploads)", title: "Circuit breaker trips", sub: "In-flight requests are cancelled; every remaining paper goes to the rules reader", tone: "sun" },
        ] },
        { nodes: [{ title: "The run always finishes", sub: "A step that fails carries on with a safe default and a warning, or skips what depends on it", tone: "tide" }] },
      ],
      note: "A bad key falls back in a fraction of a second; an unreachable server in about ten. Tests prove the offline path reaches the same plan as the AI path.",
    },
    bill: {
      title: "Flowchart 3. Does this bill count as proof of occupancy?",
      rows: [
        { nodes: [{ title: "A bill or bank statement is read", tone: "plain" }] },
        { nodes: [{ title: "Same street address as the damaged home?", sub: "“Lane” and “Ln” count as the same" }] },
        { nodes: [
          { tag: "Yes", title: "Does the billing period end before the earliest date of loss?", sub: "Any paper’s date counts; the earliest wins" },
          { tag: "No", title: "Doesn’t count", sub: "“The service address doesn’t match”", tone: "plain" },
        ] },
        { nodes: [
          { tag: "Yes", title: "Counts as proof of occupancy", sub: "FEMA appeal: 75% → 100%, drafted for your OK", tone: "sun" },
          { tag: "No", title: "Doesn’t count", sub: "“The billing period ends after the storm”", tone: "plain" },
        ] },
      ],
      note: "The reason is always shown. In the example, September 30 comes before October 9 and the address matches, so the appeal is unblocked.",
    },
  },
  es: {
    pipeline: {
      title: "Diagrama 1. De una foto a un plan",
      rows: [
        { nodes: [{ title: "Sus papeles", sub: "Fotos, PDF, cartas y lo que escriba", tone: "plain" }], edge: "todo a la vez" },
        { nodes: [
          { title: "Lector de IA", sub: "Lee fotos y PDF con Claude" },
          { title: "Lector de papeles", sub: "Lee texto con reglas sencillas, en inglés y español" },
        ], edge: "cada dato debe citar el papel" },
        { nodes: [{ title: "Revisado y reparado", sub: "Citas y valores malos se arreglan o se descartan; lo que encontraron las reglas se agrega" }] },
        { nodes: [
          { title: "Quién es quién", sub: "Une las distintas formas de un nombre" },
          { title: "Qué necesita la familia", sub: "Primero la electricidad médica" },
          { title: "Qué no coincide", sub: "Fechas y nombres que se contradicen" },
        ], edge: "código sencillo, siempre la misma respuesta" },
        { nodes: [{ title: "Ayuda que encaja", sub: "5 tipos de ayuda revisados, cada uno con sus documentos y plazo" }] },
        { nodes: [
          { title: "Siguiente pregunta", sub: "El papel que falta y que desbloquea más" },
          { title: "Su plan", sub: "Primero seguridad, luego plazos" },
        ], edge: "solo para ayuda con todos sus documentos" },
        { nodes: [{ title: "Borradores para su permiso", sub: "Papeles a adjuntar, citas, nota en inglés y español", tone: "sun" }], edge: "usted aprueba" },
        { nodes: [{ title: "Bandeja de práctica", sub: "Nada se envía de verdad", tone: "sun" }] },
      ],
      note: "Las filas se leen de arriba abajo. Lo que está lado a lado ocurre al mismo tiempo. Solo las dos primeras filas usan IA; el resto es código común.",
    },
    fallback: {
      title: "Diagrama 2. Cuando la IA tropieza",
      rows: [
        { nodes: [{ title: "Pedir a Claude que lea un papel", sub: "12 segundos por solicitud, sin reintentos", tone: "plain" }] },
        { nodes: [
          { tag: "A tiempo y pasa las revisiones", title: "Se conservan los datos de Claude", sub: "Se agrega lo que las reglas hallaron y Claude no" },
          { tag: "Tarda, lo rechaza, no pasa las revisiones o falla", title: "El lector de reglas toma el papel", sub: "El registro dice por qué", tone: "sun" },
        ], edge: "se cuentan las fallas de la corrida" },
        { nodes: [
          { tag: "Menos de 2 (3 con sus archivos)", title: "El siguiente papel le pregunta a Claude" },
          { tag: "2 o más (3 con sus archivos)", title: "Salta el interruptor", sub: "Se cancelan las solicitudes en curso; el resto va al lector de reglas", tone: "sun" },
        ] },
        { nodes: [{ title: "La corrida siempre termina", sub: "Un paso que falla sigue con un valor seguro y un aviso, o omite lo que depende de él", tone: "tide" }] },
      ],
      note: "Una clave mala cae en una fracción de segundo; un servidor inaccesible, en unos diez. Las pruebas demuestran que el camino sin IA llega al mismo plan.",
    },
    bill: {
      title: "Diagrama 3. ¿Esta factura sirve como prueba de residencia?",
      rows: [
        { nodes: [{ title: "Se lee una factura o estado de cuenta", tone: "plain" }] },
        { nodes: [{ title: "¿Misma calle que la casa dañada?", sub: "“Lane” y “Ln” cuentan como lo mismo" }] },
        { nodes: [
          { tag: "Sí", title: "¿El periodo termina antes de la primera fecha del daño?", sub: "Cuenta la fecha de cualquier papel; gana la más temprana" },
          { tag: "No", title: "No sirve", sub: "“La dirección del servicio no coincide”", tone: "plain" },
        ] },
        { nodes: [
          { tag: "Sí", title: "Sirve como prueba de residencia", sub: "Apelación a FEMA: 75% → 100%, lista para su permiso", tone: "sun" },
          { tag: "No", title: "No sirve", sub: "“El periodo termina después de la tormenta”", tone: "plain" },
        ] },
      ],
      note: "Siempre se muestra la razón. En el ejemplo, el 30 de septiembre es antes del 9 de octubre y la dirección coincide, así que la apelación se desbloquea.",
    },
  },
};

// ── Orchestration: the task graph, the failure path and the live stream ──────

const DAG_NODES_EN: DagNode[] = [
  { id: "extract", label: "Read each paper", sub: "all at once · AI or rules", wave: 0, col: "c", wide: 290, stack: true, tone: "tide" },
  { id: "occupancy", label: "Check the bill", sub: "address and dates", wave: 1, col: "l", tone: "tide" },
  { id: "people", label: "Who’s who", sub: "match the names", wave: 1, col: "r", tone: "tide" },
  { id: "needs", label: "What they need", sub: "coordinator", wave: 2, col: "c", tone: "plain" },
  { id: "conflicts", label: "What doesn’t match", sub: "dates and names", wave: 2, col: "r", tone: "tide" },
  { id: "match", label: "Help that fits", sub: "5 kinds, official sources", wave: 3, col: "c", tone: "tide" },
  { id: "gaps", label: "Next question", sub: "score each missing paper", wave: 4, col: "c", tone: "tide" },
  { id: "plan", label: "The plan", sub: "safety first, then deadline", wave: 5, col: "c", wide: 260, tone: "plain" },
  { id: "packet", label: "Draft packets", sub: "only with every document", wave: 6, col: "l", tone: "sun" },
  { id: "graph", label: "Case map", sub: "nodes and links", wave: 6, col: "r", tone: "plain" },
  { id: "safety", label: "Approval gates", sub: "nothing sends itself", wave: 7, col: "l", tone: "sun" },
];
const DAG_EDGES: Dag["edges"] = [
  ["extract", "occupancy"], ["extract", "people"], ["people", "needs", 520], ["people", "conflicts"],
  ["needs", "match"], ["occupancy", "match", 380], ["match", "gaps"], ["gaps", "plan"], ["conflicts", "plan", 560],
  ["plan", "packet"], ["plan", "graph"], ["packet", "safety"],
];

export const DAGS: Record<Lang, Dag> = {
  en: {
    title: "Diagram 1. The task graph, wave by wave",
    legend: [{ label: "Reads and checks evidence", tone: "tide" }, { label: "Coordinator", tone: "plain" }, { label: "Drafts and safety", tone: "sun" }],
    waves: Array.from({ length: 8 }, (_, i) => `WAVE ${i + 1}`),
    nodes: DAG_NODES_EN,
    edges: DAG_EDGES,
    note: "Every box is a task that names the tasks it waits for. The coordinator starts everything that is ready, all at once, then looks again. With six papers and a bill to check that is 16 tasks in 8 waves, and the six readings run side by side, so reading costs one paper’s time, not six.",
  },
  es: {
    title: "Esquema 1. El grafo de tareas, ola por ola",
    legend: [{ label: "Lee y revisa evidencia", tone: "tide" }, { label: "Coordinador", tone: "plain" }, { label: "Borradores y seguridad", tone: "sun" }],
    waves: Array.from({ length: 8 }, (_, i) => `OLA ${i + 1}`),
    nodes: [
      { ...DAG_NODES_EN[0], label: "Leer cada papel", sub: "todos a la vez · IA o reglas" },
      { ...DAG_NODES_EN[1], label: "Revisar la factura", sub: "dirección y fechas" },
      { ...DAG_NODES_EN[2], label: "Quién es quién", sub: "unir los nombres" },
      { ...DAG_NODES_EN[3], label: "Qué necesitan", sub: "coordinador" },
      { ...DAG_NODES_EN[4], label: "Lo que no coincide", sub: "fechas y nombres" },
      { ...DAG_NODES_EN[5], label: "Ayuda que aplica", sub: "5 tipos, fuentes oficiales" },
      { ...DAG_NODES_EN[6], label: "Siguiente pregunta", sub: "puntúa cada papel faltante" },
      { ...DAG_NODES_EN[7], label: "El plan", sub: "primero seguridad, luego plazo" },
      { ...DAG_NODES_EN[8], label: "Borradores", sub: "solo con todos los papeles" },
      { ...DAG_NODES_EN[9], label: "Mapa del caso", sub: "nodos y enlaces" },
      { ...DAG_NODES_EN[10], label: "Puertas de aprobación", sub: "nada se envía solo" },
    ],
    edges: DAG_EDGES,
    note: "Cada caja es una tarea que nombra de cuáles depende. El coordinador arranca todo lo que está listo, a la vez, y vuelve a mirar. Con seis papeles y una factura por revisar son 16 tareas en 8 olas, y las seis lecturas corren en paralelo: leer cuesta el tiempo de un papel, no de seis.",
  },
};

export const STEP_FLOW: Record<Lang, Flowchart> = {
  en: {
    title: "Flowchart 4. When one step itself breaks",
    rows: [
      { nodes: [{ title: "A step throws an error", tone: "plain" }], edge: "the coordinator catches it" },
      { nodes: [
        { tag: "Has a safe default", title: "Use the default and warn", sub: "A paper, the bill check, who’s who, mismatches, the next question, drafts, approval gates, the case map", tone: "tide" },
        { tag: "No safe guess", title: "Mark it failed", sub: "What the family needs, the matches and the plan can’t be guessed", tone: "sun" },
      ], edge: "look at what depends on it" },
      { nodes: [
        { title: "Dependents carry on", sub: "They read the safe default; the app shows a warning" },
        { title: "Dependents are skipped", sub: "One log line each says which step didn’t finish", tone: "sun" },
      ] },
      { nodes: [{ title: "The run still finishes", sub: "A step that can never start is caught, not waited on forever", tone: "tide" }] },
    ],
    note: "Tests break steps on purpose and check that the run ends with a plan or a clear list of what was skipped.",
  },
  es: {
    title: "Diagrama 4. Cuando un paso mismo se rompe",
    rows: [
      { nodes: [{ title: "Un paso lanza un error", tone: "plain" }], edge: "el coordinador lo atrapa" },
      { nodes: [
        { tag: "Tiene valor seguro", title: "Usar el valor seguro y avisar", sub: "Un papel, la factura, quién es quién, desajustes, la siguiente pregunta, borradores, puertas de aprobación, el mapa", tone: "tide" },
        { tag: "No se puede adivinar", title: "Marcarlo como fallido", sub: "Lo que necesitan, las coincidencias y el plan no se pueden adivinar", tone: "sun" },
      ], edge: "ver qué depende de él" },
      { nodes: [
        { title: "Los dependientes siguen", sub: "Leen el valor seguro; la app muestra un aviso" },
        { title: "Los dependientes se omiten", sub: "Una línea del registro dice qué paso no terminó", tone: "sun" },
      ] },
      { nodes: [{ title: "La corrida igual termina", sub: "Un paso que nunca puede empezar se detecta, no se espera para siempre", tone: "tide" }] },
    ],
    note: "Las pruebas rompen pasos a propósito y comprueban que la corrida termine con un plan o una lista clara de lo omitido.",
  },
};

const TRACE_LINES: TraceLine[] = [
  { kind: "req", text: "POST /api/run/stream" },
  { kind: "gap", text: "" },
  { kind: "event", text: "event: agent" },
  { kind: "data", text: 'data: {"seq":1,"agent":"Coordinator","action":"Started case run","detail":"6 documents queued. 16 tasks in the graph."}' },
  { kind: "gap", text: "" },
  { kind: "event", text: "event: task" },
  { kind: "data", text: 'data: {"id":"extract:h2-roof-photo","agent":"Evidence Agent","label":"Reading PXL_0311.jpg","status":"started","via":"claude"}' },
  { kind: "gap", text: "" },
  { kind: "event", text: "event: task" },
  { kind: "data", text: 'data: {"id":"extract:h2-fema-letter","agent":"Evidence Agent","label":"Reading FEMA_Letter_Oct30.pdf","status":"started","via":"claude"}' },
  { kind: "note", text: ": …the other papers start in the same instant" },
  { kind: "gap", text: "" },
  { kind: "event", text: "event: task" },
  { kind: "data", text: 'data: {"id":"extract:h2-fema-letter","agent":"Evidence Agent","label":"Reading FEMA_Letter_Oct30.pdf","status":"started","via":"rules"}' },
  { kind: "note", text: ": same task announced again, now read by rules: Claude was too slow" },
  { kind: "gap", text: "" },
  { kind: "event", text: "event: state" },
  { kind: "data", text: 'data: {"extractions":[{"docId":"h2-roof-photo","method":"claude", …}]}' },
  { kind: "gap", text: "" },
  { kind: "note", text: ": keep-alive" },
  { kind: "gap", text: "" },
  { kind: "event", text: "event: done" },
  { kind: "data", text: 'data: {"state":{ … },"extraction":{"claude":5,"rules":1,"fellBack":1,"mode":"mixed"}}' },
];

export const TRACES: Record<Lang, Trace> = {
  en: {
    title: "Capture 1. A run, as it arrives in the browser",
    window: "text/event-stream · trimmed",
    lines: TRACE_LINES,
    note: "Five kinds of frame: task (a step started or finished), agent (one activity-log line), state (the slice a step just produced), done (the final state, the one to trust) and error. It is a POST, so the browser reads the stream itself instead of using EventSource. The numbers in the last frame are an example.",
  },
  es: {
    title: "Captura 1. Una corrida, tal como llega al navegador",
    window: "text/event-stream · recortado",
    lines: TRACE_LINES.map((l) => (
      l.text.startsWith(": …the other") ? { ...l, text: ": …los demás papeles empiezan en el mismo instante" }
      : l.text.startsWith(": same task") ? { ...l, text: ": la misma tarea anunciada de nuevo, ahora leída con reglas: Claude tardó demasiado" }
      : l
    )),
    note: "Cinco tipos de mensaje: task (un paso empezó o terminó), agent (una línea del registro), state (la parte que un paso acaba de producir), done (el estado final, el que vale) y error. Es un POST, así que el navegador lee la transmisión por sí mismo en vez de usar EventSource. Los números del último mensaje son un ejemplo.",
  },
};


const en: Article = {
  masthead: ["BayouBridge Houston", "The Details", "November 2026"],
  title: "Under the Hood",
  deck: ["AI reads the paperwork. Plain rules make every decision,", "and nothing leaves without a person saying yes."],
  ticker: [
    "6 papers in the example case", "5 kinds of help checked", "12-second request limit", "15 seconds per paper, then rules take over",
    "2 strikes and the AI steps aside", "60-day FEMA appeal clock", "142 minutes of casework, estimated", "39 automated tests", "files deleted after 2 hours",
  ],
  sections: [
    {
      heading: "What happens when you add a paper?",
      flow: FLOWS.en.pipeline,
      paragraphs: [
        "Every photo, letter or note becomes a document with text. For a typed note that text is yours. For a photo or a PDF, the Evidence Agent sends the file to Claude (Anthropic's Opus 5.5 model, effort set to low) and asks for four things back in a fixed shape: what kind of document it is, a short title, its language, and the lines that matter for disaster recovery copied exactly as written: names, addresses, dates, amounts, decisions, deadlines, claim and policy numbers. A photo of damage with no printed words gets two to five plain sentences describing what is visible.",
        "Claude then lists facts from that text. Each fact has a type (date of loss, money, damage, need, deadline and ten others), a label, a value, a machine-friendly normalized value and the exact quote it came from. The answer is checked against a schema before BayouBridge uses it; anything that doesn't fit the schema is treated as a failed read.",
        "Text documents in the example case are read the same way. With no API key on the server, a rules-based reader does the job instead: a set of patterns that finds the same kinds of facts in English and Spanish, so the demo works fully offline.",
      ],
    },
    {
      heading: "Why trust what the AI read?",
      paragraphs: [
        "Because BayouBridge doesn't take its word for it. Every fact must quote the document. Before comparing, both sides are normalized: case, spacing, curly quotes, dashes and the long dot leaders on estimates. If a quote can't be found, BayouBridge tries once to repair it with the line that actually contains the value, and lowers its confidence to 80 percent of what Claude claimed. Otherwise the fact is dropped and the drop is logged.",
        "Normalized values are checked too. Dates must be real calendar dates in year-month-day form. Deadlines must say whether they come from a FEMA letter or an insurer. Money must be a plain number under one of the four labels the rules engine reads. Damage, needs, decisions and exclusions must be one of the keys the rules know. Where a value is wrong but fixable from the fact's own words, it is repaired; where it isn't, it is dropped.",
        "Finally a backstop runs: the rules reader goes over the same text, and anything it finds that Claude missed is added back. The AI can add to what the offline path finds, but it can never take anything away. Tests prove that Claude output equal to the rules output produces an identical case, down to the plan.",
      ],
    },
    {
      heading: "What if the AI is slow, wrong or offline?",
      flow: FLOWS.en.fallback,
      paragraphs: [
        "Each request to Claude has a 12-second limit and no automatic retries. On top of that, the coordinator gives each paper 15 seconds and the whole run 30 seconds of AI time. Reading a photo or PDF gets 40 seconds per request, and in a case you start yourself each paper gets 45 seconds and the run 90. When a read times out, is refused, returns something that fails the checks, or errors, that one paper falls back to the rules reader and the activity log says why.",
        "After two fallbacks in one run (three for real uploads) a circuit breaker trips: calls still in flight are cancelled and every remaining paper goes straight to rules. A bad key falls back in a fraction of a second; an unreachable server in about ten. And if a whole step of the pipeline ever throws, the run continues: steps with a safe default (no conflicts, an empty map, no drafts) carry on with a warning, steps without one skip what depends on them, and the run always finishes.",
      ],
      figure: {
        title: "Figure 1. Seconds the AI gets before rules take over",
        legend: ["Example case, typed text", "Your own case, photos and PDFs"],
        bars: [
          { label: "One request, text", value: 12, display: "12 s", tone: "tide" },
          { label: "One request, photo or PDF", value: 40, display: "40 s", tone: "sun" },
          { label: "One paper, example", value: 15, display: "15 s", tone: "tide" },
          { label: "One paper, your case", value: 45, display: "45 s", tone: "sun" },
          { label: "Whole run, example", value: 30, display: "30 s", tone: "tide" },
          { label: "Whole run, your case", value: 90, display: "90 s", tone: "sun" },
        ],
        note: "Papers are read in parallel, so the worst case is about one paper's limit, not the sum. Two failures (three for uploads) send every remaining paper to the rules reader.",
      },
    },
    {
      heading: "Who decides what help fits?",
      paragraphs: [
        "Not the AI. After reading, every step is plain code that gives the same answer every time. It works out who is in the household (matching spellings like Ana Reyes and Anna Reyes-Ortega), lists needs by urgency (power for medical equipment first), and flags details that disagree, such as FEMA saying the storm hit on October 9 and the insurer saying October 10.",
        "It then checks five kinds of help, each written from an official source: a FEMA appeal, the homeowners insurance claim, an SBA disaster loan, the utility's critical-care list and a 2-1-1 food referral. Each has triggers, a list of documents it needs and, where there is one, a deadline rule: 60 days from the date on a FEMA letter, or the due date in the insurer's email. Readiness is simply the share of required documents on file. Everything is labeled a possible match; only the agency decides eligibility.",
        "The one question BayouBridge asks next is scored, too: one point for each kind of help a missing document would unblock, more as a deadline gets close, five more if the household already said they have it, and two more if it helps someone who depends on medical power.",
      ],
      figure: {
        title: "Figure 2. Minutes of casework, example case",
        bars: [
          { label: "Reading 6 papers", value: 48, display: "48 min", tone: "tide" },
          { label: "Finding help that fits", value: 25, display: "25 min", tone: "tide" },
          { label: "Preparing 2 drafts", value: 24, display: "24 min", tone: "tide" },
          { label: "Writing the plan", value: 15, display: "15 min", tone: "tide" },
          { label: "Checking mismatches", value: 10, display: "10 min", tone: "tide" },
          { label: "Picking the next question", value: 10, display: "10 min", tone: "tide" },
          { label: "Who's who, case map", value: 10, display: "10 min", tone: "tide" },
        ],
        note: "Estimates of time a caseworker would spend by hand, 142 minutes in all. They are placeholders until navigator interviews replace them.",
      },
    },
    {
      heading: "How does one electric bill unblock an appeal?",
      flow: FLOWS.en.bill,
      paragraphs: [
        "In the example, FEMA turned the family down because it couldn't verify they lived in the home. The appeal needs four documents and has three, so it sits at 75 percent. The voice note mentions that September's electric bill is in an email, so that becomes the one question to ask.",
        "When the bill arrives only the bill is read; the other six papers are reused from the last run. A bill counts as proof of occupancy only if its service address matches the damaged home and its billing period ends before the earliest date of loss any document gives. September 30 comes before October 9, the address matches, and the appeal moves to 100 percent and becomes a draft waiting for approval. A bill for a different street, or one dated after the storm, is rejected with the reason shown.",
      ],
    },
    {
      heading: "How do the agents work together?",
      dag: DAGS.en,
      flow: STEP_FLOW.en,
      trace: TRACES.en,
      paragraphs: [
        "There is no manager model deciding who goes next. The coordinator is a small scheduler: a list of tasks, each naming the tasks it depends on. It starts everything that is ready at once, waits for that wave to settle, and looks again. Reading the papers is wave one, and because each paper is independent, all of them start in the same instant.",
        "Between waves the only thing shared is one case record. Each task reads what earlier tasks wrote, fills in its own slice (readings, people, needs, matches, plan, drafts) and publishes just that slice, so the screen updates the moment a step finishes instead of at the end. Every step also writes a line to the activity log, and those same lines move the characters in the office.",
        "A step that fails does not stop the run. Steps with a safe default carry on with it and add a warning. Steps with no safe guess are marked failed and everything that depends on them is skipped, with a log line that says why. A task that can never start, because something it needs is missing, is caught instead of waited on forever.",
        "The browser follows along over server-sent events, so there is no polling and no WebSocket. Log lines are spaced at least a quarter of a second apart, so a run that finishes in milliseconds is still watchable; real Claude delays are never padded. A keep-alive goes out every ten seconds, and if the browser disconnects, an abort signal cancels any Claude call still in flight.",
      ],
    },
    {
      heading: "Who can send anything?",
      paragraphs: [
        "Only you, and only to a practice outbox. For each kind of help that has every document it needs, the Packet Agent prepares a draft: the papers to attach, the quotes that support it, and a cover note in English and Spanish. A safety step marks every outgoing task as needing approval, and the only way to approve it is a server request that checks the plan the server itself produced. Unknown cases and tasks are refused, a task still waiting on documents is refused, a task that sends nothing is refused, and approving twice does nothing new.",
        "Task identities come from what they are about, not their position in a list, so an approval still points at the right task after a new document reshuffles the plan. Nothing in BayouBridge makes a network call except the request to read a document.",
      ],
    },
    {
      heading: "Where do my papers go?",
      paragraphs: [
        "Into the memory of one server, and nowhere else: no database and no files on disk. Each case has a random id that can’t be guessed, expires two hours after its last use, and can be deleted at once. At most 200 cases are kept. Uploads are limited to 10 files of 8 MB each, as JPEG, PNG, WebP, GIF, PDF or plain text, and photos are shrunk to 1,600 pixels in your browser before they are sent, which also strips their location data. Document text is never written to the logs. With a key set, photos and PDFs are sent to Anthropic's API to be read; without one they are not read at all, and the case says so.",
      ],
    },
    {
      heading: "What are the little characters doing?",
      paragraphs: [
        "They are the agents. Each step of the pipeline reports when it starts and finishes over a live stream (server-sent events, with at least 250 milliseconds between messages so a fast run is still watchable, a keep-alive every 10 seconds, and a plain request as a fallback). A small director turns those reports into jobs: walk to a desk, work there for at least 0.65 seconds, move on. Desks sit on a ring around an open floor so no one walks through furniture, characters hurry up to 3.2 times their normal pace when work piles up, and the camera follows whoever has the most going on, without flicking between two close calls.",
        "The office is drawn with React Three Fiber and loads only when you scroll near it. On the home page it runs the example case right in your browser, with the rules reader, so showing it costs nothing.",
      ],
    },
    {
      heading: "By the numbers",
      paragraphs: [
        "Everything below comes from running the example case, a made-up family with six papers, through the real pipeline. The first chart shows how much each paper gave up. The insurer’s email is the richest, with nine details: the policyholder’s name, the date of loss, the due date, the inspection appointment, the hurricane deductible, the policy number, the flood exclusion and the claim number, which appears twice, in the subject line and in the text. A damage photo gives only two or three, because a photo has few words to quote.",
        "The second chart is the electric bill’s effect. Before it arrives the family has 63 percent of the documents their five kinds of help ask for. After, it is 75 percent, and the one help that was blocked, the FEMA appeal, is complete. Nothing else moves: the bill only counts toward the appeal, so the other four pieces of help stay where they were.",
      ],
      figures: [
        {
          title: "Figure 3. Details found in each example paper",
          bars: [
            { label: "Insurance email", value: 9, display: "9", tone: "tide" },
            { label: "Voice note (Spanish)", value: 8, display: "8", tone: "tide" },
            { label: "FEMA letter", value: 7, display: "7", tone: "tide" },
            { label: "Repair estimate", value: 6, display: "6", tone: "tide" },
            { label: "Roof photo", value: 3, display: "3", tone: "tide" },
            { label: "Electric bill (arrives later)", value: 3, display: "3", tone: "sun" },
            { label: "Living room photo", value: 2, display: "2", tone: "tide" },
          ],
          note: "Names, addresses, dates, amounts, claim numbers, damage and needs. 35 details in all from six papers, plus 3 from the bill.",
        },
        {
          title: "Figure 4. Share of documents on file, by kind of help",
          legend: ["Before the electric bill", "After it arrives"],
          bars: [
            { label: "Insurance claim", value: 100, display: "100%", tone: "tide" },
            { label: "Food referral", value: 100, display: "100%", tone: "tide" },
            { label: "FEMA appeal, before", value: 75, display: "75%", tone: "tide" },
            { label: "FEMA appeal, after", value: 100, display: "100%", tone: "sun" },
            { label: "SBA loan", value: 67, display: "67%", tone: "tide" },
            { label: "Critical-care list", value: 0, display: "0%", tone: "tide" },
          ],
          note: "The critical-care list still needs a doctor’s form, which is why the next question after the bill is “Who is Carmen’s doctor?”",
        },
      ],
    },
    {
      heading: "How do we know it works?",
      paragraphs: [
        "Thirty-nine automated tests run in about five seconds without any network. A golden snapshot pins every line of the example case's output, from facts to plan to cover notes, so wording can't drift by accident. Other tests feed the AI path fake answers: one that never replies, one that invents a quote, one with broken dates, one with nothing at all. They check the approval rules and the live stream, make a step fail on purpose, and run a second made-up family through the same code to prove nothing about the Reyes family is built in.",
      ],
    },
  ],
  colophon: "BayouBridge was built for Teen Hacks Houston. The example family, their papers and the storm are made up.",
  back: "← Back to BayouBridge",
};

const es: Article = {
  masthead: ["BayouBridge Houston", "Los Detalles", "Noviembre 2026"],
  title: "Por Dentro",
  deck: ["La IA lee los papeles. Reglas sencillas toman cada decisión,", "y nada sale sin que una persona diga que sí."],
  ticker: [
    "6 papeles en el caso de ejemplo", "5 tipos de ayuda revisados", "12 segundos por solicitud", "15 segundos por papel y luego entran las reglas",
    "2 fallas y la IA se hace a un lado", "60 días para apelar a FEMA", "142 minutos de trabajo, estimados", "39 pruebas automáticas", "archivos borrados a las 2 horas",
  ],
  sections: [
    {
      heading: "¿Qué pasa cuando agrega un papel?",
      flow: FLOWS.es.pipeline,
      paragraphs: [
        "Cada foto, carta o nota se convierte en un documento con texto. Si es una nota escrita, el texto es suyo. Si es una foto o un PDF, el Agente de Evidencia envía el archivo a Claude (el modelo Opus 5.5 de Anthropic, con esfuerzo bajo) y le pide cuatro cosas en un formato fijo: qué tipo de documento es, un título corto, su idioma y las líneas que importan para la recuperación, copiadas tal como están: nombres, direcciones, fechas, montos, decisiones, plazos y números de reclamo y de póliza. Una foto de daños sin texto recibe de dos a cinco frases sencillas que describen lo que se ve.",
        "Luego Claude lista los datos de ese texto. Cada dato tiene un tipo (fecha del daño, dinero, daño, necesidad, plazo y diez más), una etiqueta, un valor, un valor normalizado y la cita exacta de donde salió. La respuesta se revisa contra un esquema antes de usarla; lo que no encaja se trata como una lectura fallida.",
        "Los documentos de texto del caso de ejemplo se leen igual. Sin clave de API en el servidor, un lector basado en reglas hace el trabajo: patrones que encuentran los mismos tipos de datos en inglés y en español, así que la demostración funciona sin internet.",
      ],
    },
    {
      heading: "¿Por qué confiar en lo que leyó la IA?",
      paragraphs: [
        "Porque BayouBridge no le cree sin más. Cada dato debe citar el documento. Antes de comparar, se normalizan mayúsculas, espacios, comillas, guiones y las filas de puntos de los presupuestos. Si la cita no aparece, BayouBridge intenta una vez repararla con la línea que de verdad contiene el valor y baja la confianza al 80 por ciento. Si no, el dato se descarta y se anota.",
        "También se revisan los valores normalizados. Las fechas deben ser fechas reales. Los plazos deben decir si vienen de una carta de FEMA o del seguro. El dinero debe ser un número con una de las cuatro etiquetas que leen las reglas. Daños, necesidades, decisiones y exclusiones deben ser claves conocidas. Si un valor está mal pero se puede arreglar con las propias palabras del dato, se arregla; si no, se descarta.",
        "Al final corre un respaldo: el lector de reglas lee el mismo texto y todo lo que encuentra que Claude no vio se agrega. La IA puede sumar a lo que encuentra el camino sin internet, pero nunca quitar. Las pruebas demuestran que una respuesta de Claude igual a la de las reglas produce exactamente el mismo caso.",
      ],
    },
    {
      heading: "¿Y si la IA tarda, se equivoca o no responde?",
      flow: FLOWS.es.fallback,
      paragraphs: [
        "Cada solicitud a Claude tiene un límite de 12 segundos y ningún reintento. Además, el coordinador da a cada papel 15 segundos y a toda la corrida 30 segundos de IA. Leer una foto o un PDF tiene 40 segundos por solicitud, y en un caso que usted empieza cada papel tiene 45 segundos y la corrida 90. Si una lectura se pasa del tiempo, es rechazada, no pasa las revisiones o da error, ese papel pasa al lector de reglas y el registro dice por qué.",
        "Tras dos fallas en una corrida (tres con archivos reales) salta un interruptor: se cancelan las solicitudes en curso y los papeles restantes van directo a las reglas. Una clave mala cae en una fracción de segundo; un servidor inaccesible, en unos diez. Y si un paso completo falla, la corrida sigue: los pasos con un valor seguro continúan con un aviso, los demás omiten lo que depende de ellos, y la corrida siempre termina.",
      ],
      figure: {
        title: "Figura 1. Segundos que tiene la IA antes de que entren las reglas",
        legend: ["Caso de ejemplo, texto", "Su propio caso, fotos y PDF"],
        bars: [
          { label: "Una solicitud, texto", value: 12, display: "12 s", tone: "tide" },
          { label: "Una solicitud, foto o PDF", value: 40, display: "40 s", tone: "sun" },
          { label: "Un papel, ejemplo", value: 15, display: "15 s", tone: "tide" },
          { label: "Un papel, su caso", value: 45, display: "45 s", tone: "sun" },
          { label: "Toda la corrida, ejemplo", value: 30, display: "30 s", tone: "tide" },
          { label: "Toda la corrida, su caso", value: 90, display: "90 s", tone: "sun" },
        ],
        note: "Los papeles se leen en paralelo, así que el peor caso es el límite de un papel, no la suma. Dos fallas (tres con archivos) mandan el resto al lector de reglas.",
      },
    },
    {
      heading: "¿Quién decide qué ayuda le corresponde?",
      paragraphs: [
        "La IA no. Después de leer, cada paso es código sencillo que da siempre la misma respuesta. Identifica quién vive en el hogar (une nombres como Ana Reyes y Anna Reyes-Ortega), ordena las necesidades por urgencia (primero la electricidad para equipo médico) y marca los datos que no coinciden, como FEMA diciendo 9 de octubre y el seguro 10 de octubre.",
        "Luego revisa cinco tipos de ayuda, cada uno escrito a partir de una fuente oficial: una apelación a FEMA, el reclamo al seguro de la casa, un préstamo de desastre de la SBA, la lista de cuidado crítico de la compañía eléctrica y una referencia de comida del 2-1-1. Cada uno tiene condiciones, una lista de documentos y, si aplica, un plazo: 60 días desde la fecha de la carta de FEMA, o la fecha que pide el seguro. Estar listo es simplemente la parte de los documentos que ya están. Todo se presenta como una opción posible; solo la agencia decide.",
        "La única pregunta que hace después también tiene puntaje: un punto por cada tipo de ayuda que desbloquearía, más si un plazo se acerca, cinco más si la familia ya dijo que lo tiene y dos más si ayuda a alguien que depende de electricidad para su salud.",
      ],
      figure: {
        title: "Figura 2. Minutos de trabajo, caso de ejemplo",
        bars: [
          { label: "Leer 6 papeles", value: 48, display: "48 min", tone: "tide" },
          { label: "Buscar ayuda que encaje", value: 25, display: "25 min", tone: "tide" },
          { label: "Preparar 2 borradores", value: 24, display: "24 min", tone: "tide" },
          { label: "Escribir el plan", value: 15, display: "15 min", tone: "tide" },
          { label: "Revisar diferencias", value: 10, display: "10 min", tone: "tide" },
          { label: "Elegir la siguiente pregunta", value: 10, display: "10 min", tone: "tide" },
          { label: "Quién es quién, mapa del caso", value: 10, display: "10 min", tone: "tide" },
        ],
        note: "Estimados del tiempo que tomaría a mano, 142 minutos en total. Se reemplazarán con entrevistas a trabajadores sociales.",
      },
    },
    {
      heading: "¿Cómo desbloquea una factura de luz una apelación?",
      flow: FLOWS.es.bill,
      paragraphs: [
        "En el ejemplo, FEMA rechazó a la familia porque no pudo comprobar que vivían en la casa. La apelación necesita cuatro documentos y tiene tres: está al 75 por ciento. La nota de voz menciona que la factura de luz de septiembre está en un correo, así que esa es la pregunta.",
        "Cuando llega la factura, solo se lee la factura; los otros seis papeles se reutilizan. Una factura sirve como prueba solo si la dirección coincide con la casa dañada y el periodo termina antes de la primera fecha del daño. El 30 de septiembre es antes del 9 de octubre, la dirección coincide y la apelación pasa al 100 por ciento, lista para su aprobación. Una factura de otra calle, o posterior a la tormenta, se rechaza mostrando la razón.",
      ],
    },
    {
      heading: "¿Cómo trabajan juntos los agentes?",
      dag: DAGS.es,
      flow: STEP_FLOW.es,
      trace: TRACES.es,
      paragraphs: [
        "No hay un modelo jefe que decida quién sigue. El coordinador es un planificador pequeño: una lista de tareas, cada una con las tareas de las que depende. Arranca todo lo que está listo a la vez, espera a que esa ola termine y vuelve a mirar. Leer los papeles es la primera ola, y como cada papel es independiente, todos empiezan en el mismo instante.",
        "Entre olas lo único compartido es un expediente del caso. Cada tarea lee lo que escribieron las anteriores, completa su parte (lecturas, personas, necesidades, coincidencias, plan, borradores) y publica solo esa parte, así la pantalla se actualiza en cuanto termina un paso y no al final. Cada paso también escribe una línea en el registro de actividad, y esas mismas líneas mueven a los personajes de la oficina.",
        "Un paso que falla no detiene la corrida. Los pasos con un valor seguro siguen con él y agregan un aviso. Los pasos que no se pueden adivinar se marcan como fallidos y todo lo que depende de ellos se omite, con una línea del registro que explica por qué. Una tarea que nunca puede empezar, porque le falta algo, se detecta en lugar de esperarla para siempre.",
        "El navegador sigue la corrida con eventos enviados por el servidor, sin sondeos ni WebSocket. Las líneas del registro se separan al menos un cuarto de segundo, para que una corrida que termina en milisegundos se pueda ver; las demoras reales de Claude nunca se rellenan. Cada diez segundos sale una señal de vida, y si el navegador se desconecta, una señal de aborto cancela cualquier llamada a Claude en curso.",
      ],
    },
    {
      heading: "¿Quién puede enviar algo?",
      paragraphs: [
        "Solo usted, y solo a una bandeja de práctica. Para cada tipo de ayuda con todos sus documentos, el Agente de Paquetes prepara un borrador: los papeles que se adjuntan, las citas que lo respaldan y una nota en inglés y en español. Un paso de seguridad marca cada envío como pendiente de aprobación, y la única forma de aprobarlo es una solicitud al servidor que revisa el plan que el propio servidor hizo. Se rechazan casos y tareas desconocidos, tareas que esperan documentos y tareas que no envían nada; aprobar dos veces no hace nada nuevo.",
        "Las tareas se identifican por su contenido y no por su posición, así que una aprobación sigue apuntando a la tarea correcta aunque llegue un documento nuevo. BayouBridge no hace ninguna llamada de red salvo la de leer un documento.",
      ],
    },
    {
      heading: "¿A dónde van mis papeles?",
      paragraphs: [
        "A la memoria de un servidor y a ningún otro lado: sin base de datos ni archivos en disco. Cada caso tiene un identificador aleatorio imposible de adivinar, vence dos horas después de su último uso y se puede borrar al instante. Se guardan como máximo 200 casos. Puede subir 10 archivos de hasta 8 MB, en JPEG, PNG, WebP, GIF, PDF o texto, y las fotos se reducen a 1.600 píxeles en su navegador antes de enviarse, lo que también borra su ubicación. El texto de los documentos nunca se escribe en los registros. Con una clave, las fotos y PDF se envían a la API de Anthropic para leerlos; sin ella no se leen, y el caso lo dice.",
      ],
    },
    {
      heading: "¿Qué hacen los personajes?",
      paragraphs: [
        "Son los agentes. Cada paso avisa cuándo empieza y termina por una transmisión en vivo (eventos del servidor, con al menos 250 milisegundos entre mensajes para que se pueda seguir, una señal cada 10 segundos y una solicitud simple como respaldo). Un pequeño director convierte esos avisos en trabajos: caminar a un escritorio, trabajar al menos 0,65 segundos y seguir. Los escritorios forman un anillo alrededor de un piso abierto para que nadie atraviese muebles, los personajes se apuran hasta 3,2 veces cuando se acumula el trabajo, y la cámara sigue al más ocupado sin saltar entre dos.",
        "La oficina se dibuja con React Three Fiber y solo se carga cuando usted se acerca. En la página principal corre el caso de ejemplo en su propio navegador, con el lector de reglas, así que mostrarla no cuesta nada.",
      ],
    },
    {
      heading: "En números",
      paragraphs: [
        "Todo lo que sigue sale de pasar el caso de ejemplo, una familia inventada con seis papeles, por el proceso real. La primera gráfica muestra cuánto dio cada papel. El correo del seguro es el más rico, con nueve datos: el nombre del asegurado, la fecha del daño, la fecha límite, la cita de inspección, el deducible por huracán, el número de póliza, la exclusión por inundación y el número de reclamo, que aparece dos veces, en el asunto y en el texto. Una foto de daños da solo dos o tres, porque tiene pocas palabras que citar.",
        "La segunda gráfica es el efecto de la factura de luz. Antes de llegar, la familia tiene el 63 por ciento de los documentos que piden sus cinco tipos de ayuda. Después, el 75 por ciento, y la única ayuda que estaba detenida, la apelación a FEMA, queda completa. Nada más cambia: la factura solo cuenta para la apelación, así que las otras cuatro ayudas se quedan como estaban.",
      ],
      figures: [
        {
          title: "Figura 3. Datos encontrados en cada papel de ejemplo",
          bars: [
            { label: "Correo del seguro", value: 9, display: "9", tone: "tide" },
            { label: "Nota de voz (español)", value: 8, display: "8", tone: "tide" },
            { label: "Carta de FEMA", value: 7, display: "7", tone: "tide" },
            { label: "Presupuesto", value: 6, display: "6", tone: "tide" },
            { label: "Foto del techo", value: 3, display: "3", tone: "tide" },
            { label: "Factura de luz (llega después)", value: 3, display: "3", tone: "sun" },
            { label: "Foto de la sala", value: 2, display: "2", tone: "tide" },
          ],
          note: "Nombres, direcciones, fechas, montos, números de reclamo, daños y necesidades. 35 datos en total de seis papeles, más 3 de la factura.",
        },
        {
          title: "Figura 4. Parte de los documentos listos, por tipo de ayuda",
          legend: ["Antes de la factura de luz", "Después de que llega"],
          bars: [
            { label: "Reclamo al seguro", value: 100, display: "100%", tone: "tide" },
            { label: "Referencia de comida", value: 100, display: "100%", tone: "tide" },
            { label: "Apelación a FEMA, antes", value: 75, display: "75%", tone: "tide" },
            { label: "Apelación a FEMA, después", value: 100, display: "100%", tone: "sun" },
            { label: "Préstamo de la SBA", value: 67, display: "67%", tone: "tide" },
            { label: "Lista de cuidado crítico", value: 0, display: "0%", tone: "tide" },
          ],
          note: "La lista de cuidado crítico aún necesita el formulario de un médico, por eso la siguiente pregunta tras la factura es “¿Quién es el médico de Carmen?”",
        },
      ],
    },
    {
      heading: "¿Cómo sabemos que funciona?",
      paragraphs: [
        "Treinta y nueve pruebas automáticas corren en unos cinco segundos sin internet. Una prueba de referencia fija cada línea del resultado del caso de ejemplo para que nada cambie por accidente. Otras le dan a la IA respuestas falsas: una que nunca contesta, una que inventa una cita, una con fechas rotas, una vacía. Revisan las reglas de aprobación y la transmisión en vivo, hacen fallar un paso a propósito y pasan a una segunda familia inventada por el mismo código para probar que nada de la familia Reyes está escrito a mano.",
      ],
    },
  ],
  colophon: "BayouBridge se hizo para Teen Hacks Houston. La familia de ejemplo, sus papeles y la tormenta son inventados.",
  back: "← Volver a BayouBridge",
};

export const ARTICLE: Record<Lang, Article> = { en, es };
