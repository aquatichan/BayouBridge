import { tr } from "@/lib/es";
import type { ActivityEvent, CaseState, OutboxItem } from "@/lib/types";

// A packet as a document you can read: Markdown to download, HTML to open or print
// to PDF. Both come from the same sections, in the reader's language.

type Lang = "en" | "es";

const H = {
  en: { to: "To", from: "From", status: "Status", approved: (by: string, at: string) => `Approved by ${by} on ${at}. Held in the practice outbox: nothing was sent.`,
    cover: "Cover note", letter: "Appeal letter (sign before sending)", form: "Declarative statement of occupancy (check, fill in and sign)", encl: "Enclosed documents", facts: "Facts cited, and where they come from",
    via: "via BayouBridge", note: "Prepared with BayouBridge, a hackathon prototype. Every household and document in the demo is made up. This is a possible match, not a decision: only the agency decides who qualifies." },
  es: { to: "Para", from: "De", status: "Estado", approved: (by: string, at: string) => `Aprobado por ${by === "You" ? "usted" : by} el ${at}. Guardado en la bandeja de práctica: no se envió nada.`,
    cover: "Nota de presentación", letter: "Carta de apelación (fírmela antes de enviarla)", form: "Declaración de residencia (revísela, complétela y fírmela)", encl: "Documentos adjuntos", facts: "Datos citados y de dónde vienen",
    via: "con BayouBridge", note: "Preparado con BayouBridge, un prototipo de hackathon. Todos los hogares y documentos del ejemplo son inventados. Es una opción posible, no una decisión: solo la agencia decide quién califica." },
};

interface Doc { title: string; meta: [string, string][]; sections: { heading: string; body: string; pre?: boolean; list?: string[] }[]; note: string }

function build(item: OutboxItem, lang: Lang, household: string, docTitle: (id: string) => string): Doc {
  const h = H[lang], p = item.packet;
  const at = new Date(item.queuedAt).toLocaleString(lang === "es" ? "es-US" : "en-US", { dateStyle: "long", timeStyle: "short" });
  const sections: Doc["sections"] = [{ heading: h.cover, body: p.bilingualCover[lang] }];
  if (p.letter) sections.push({ heading: h.letter, body: p.letter[lang], pre: true });
  if (p.form) sections.push({ heading: h.form, body: p.form[lang], pre: true });
  sections.push({ heading: h.encl, body: "", list: p.attachments.map((a) => tr(a.title, lang)) });
  if (p.citations.length) sections.push({ heading: h.facts, body: "", list: p.citations.map((c) => `“${c.quote}” (${tr(docTitle(c.docId), lang)})`) });
  return {
    title: tr(p.title, lang),
    meta: [[h.to, tr(p.to, lang)], [h.from, `${household} ${h.via}`], [h.status, h.approved(item.approvedBy, at)]],
    sections, note: h.note,
  };
}

export function packetMarkdown(item: OutboxItem, lang: Lang, household: string, docTitle: (id: string) => string): string {
  const d = build(item, lang, household, docTitle);
  return [
    `# ${d.title}`, "",
    ...d.meta.map(([k, v]) => `**${k}:** ${v}  `), "",
    ...d.sections.flatMap((s) => [
      `## ${s.heading}`, "",
      ...(s.pre ? ["```", s.body, "```"] : s.list ? s.list.map((x) => `- ${x}`) : [s.body]), "",
    ]),
    "---", "", `_${d.note}_`, "",
  ].join("\n");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function packetHtml(item: OutboxItem, lang: Lang, household: string, docTitle: (id: string) => string): string {
  const d = build(item, lang, household, docTitle);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.title)}</title>
<style>
  body{font:15px/1.6 Georgia,serif;color:#1b1b1b;background:#fff;max-width:720px;margin:40px auto;padding:0 20px}
  h1{font-size:24px;margin:0 0 12px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .meta p{margin:2px 0}pre{white-space:pre-wrap;font:14px/1.6 Georgia,serif;background:#faf7ef;border:1px solid #e6dfcd;padding:14px}
  li{margin:4px 0}.note{margin-top:32px;color:#666;font-size:12px;font-style:italic}
  @media print{body{margin:0}}
</style></head><body>
<h1>${esc(d.title)}</h1>
<div class="meta">${d.meta.map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(v)}</p>`).join("")}</div>
${d.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.pre ? `<pre>${esc(s.body)}</pre>` : s.list ? `<ul>${s.list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>${esc(s.body)}</p>`}`).join("\n")}
<p class="note">${esc(d.note)}</p>
</body></html>`;
}

/** A safe file name for the download: "fema-individual-assistance-appeal.md". */
export const packetFileName = (item: OutboxItem) =>
  `${item.packet.title.replace(/: packet$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;

// ── The "Recovery complete" package: everything in one document ─────────────


const P = {
  en: { title: "Recovery package", ready: (n: number) => `${n}% of the documents the programs ask for are on file.`, steps: "Every step", done: "Done", approved: "Approved", waiting: "Waiting", todo: "To do",
    programs: "Programs", log: "What the helpers did", packets: "Approved packets", sticker: "Packed with care by the BayouBridge team." },
  es: { title: "Paquete de recuperación", ready: (n: number) => `El ${n}% de los documentos que piden los programas está listo.`, steps: "Todos los pasos", done: "Listo", approved: "Aprobado", waiting: "En espera", todo: "Pendiente",
    programs: "Programas", log: "Lo que hicieron los ayudantes", packets: "Paquetes aprobados", sticker: "Empacado con cariño por el equipo de BayouBridge." },
};

function packageParts(s: CaseState, outbox: OutboxItem[], events: ActivityEvent[], lang: Lang) {
  const t = P[lang];
  const status = (x: CaseState["plan"][number]) => (x.status === "done" ? t.done : x.approved ? t.approved : x.status === "blocked" ? t.waiting : t.todo);
  const title = (id: string) => s.documents.find((d) => d.id === id)?.title ?? id;
  return {
    t, title,
    steps: s.plan.map((x) => `${x.status === "done" || x.approved ? "☑" : "☐"} ${tr(x.title, lang)} (${status(x)})`),
    programs: s.matches.map((m) => `${tr(m.name, lang)}: ${Math.round(m.readiness * 100)}%${m.deadline ? ` · ${m.deadline.date}` : ""}`),
    log: events.map((e) => `${tr(e.agent, lang)}: ${tr(e.action, lang)}`),
  };
}

export function recoveryMarkdown(s: CaseState, outbox: OutboxItem[], events: ActivityEvent[], lang: Lang): string {
  const { t, title, steps, programs, log } = packageParts(s, outbox, events, lang);
  return [
    `# ${t.title}: ${s.householdName}`, "", `${s.address}  `, `${t.ready(s.evidenceScore)}`, "",
    `## ${t.programs}`, "", ...programs.map((x) => `- ${x}`), "",
    `## ${t.steps}`, "", ...steps.map((x) => `- ${x}`), "",
    `## ${t.packets}`, "", ...outbox.flatMap((o) => [packetMarkdown(o, lang, s.householdName, title).replace(/^# /, "### "), ""]),
    `## ${t.log}`, "", ...log.map((x, i) => `${i + 1}. ${x}`), "",
    `_${t.sticker}_`, "",
  ].join("\n");
}

export function recoveryHtml(s: CaseState, outbox: OutboxItem[], events: ActivityEvent[], lang: Lang): string {
  const { t, title, steps, programs, log } = packageParts(s, outbox, events, lang);
  const packetBodies = outbox.map((o) => packetHtml(o, lang, s.householdName, title).replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, "").replace(/<h1>/g, '<h2 class="pk">').replace(/<\/h1>/g, "</h2>"));
  const li = (xs: string[]) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title>
<style>body{font:15px/1.6 Georgia,serif;color:#1b1b1b;background:#fff;max-width:760px;margin:40px auto;padding:0 20px}h1{font-size:26px;margin:0}h2{font-size:17px;margin:30px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
h2.pk{border:0;margin-top:40px;font-size:19px;page-break-before:always}pre{white-space:pre-wrap;font:14px/1.6 Georgia,serif;background:#faf7ef;border:1px solid #e6dfcd;padding:14px}.note{color:#666;font-size:12px;font-style:italic}
.sticker{margin-top:36px;color:#7a5129;font-size:13px}ol li,ul li{margin:3px 0}</style></head><body>
<h1>${esc(t.title)}: ${esc(s.householdName)}</h1><p>${esc(s.address)}<br><b>${esc(t.ready(s.evidenceScore))}</b></p>
<h2>${esc(t.programs)}</h2>${li(programs)}<h2>${esc(t.steps)}</h2>${li(steps)}
${packetBodies.join("\n")}
<h2>${esc(t.log)}</h2><ol>${log.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
<p class="sticker">${esc(t.sticker)}</p></body></html>`;
}
