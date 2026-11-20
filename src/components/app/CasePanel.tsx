"use client";

import { useEffect, useRef, useState } from "react";
import { extractionLabel, extractionTooltip } from "@/lib/labels";
import type { ActivityEvent, CaseDocument, CaseState, ExtractionSummary, OutboxItem, PlanTask, TaskUpdate } from "@/lib/types";
import { KIND_FOR_EVIDENCE } from "@/lib/typedKinds";
import { DropZone, FilePicker, TypedDocEditor, type TypedDoc } from "./Onboarding";
import { Folder, PaperSheet } from "./Papers";
import { tr } from "@/lib/es";
import { STRINGS, type Lang } from "./i18n";

// The results panel of the immersive dashboard. It fills in as the agents finish.

const ICON: Record<CaseDocument["kind"], string> = {
  photo: "📷", estimate: "🧾", fema_letter: "✉️", insurance_email: "📧", voice_note: "🗣️", utility_bill: "💡",
  bank_statement: "🏦", lease: "🏠", id_card: "🪪", insurance_policy: "📄", medical_letter: "🩺", receipt: "🧾", deed: "📜", other: "📎",
};

type Tab = "next" | "programs" | "docs" | "household" | "outbox";

function fmt(iso: string, lang: Lang) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function CasePanel(props: {
  s: CaseState | null; events: ActivityEvent[]; tasks: Record<string, TaskUpdate>; running: boolean; lang: Lang;
  outbox: OutboxItem[]; sample: boolean;
  /** A sample case's documents still to come ("Your papers"), with the decoys mixed in. */
  papers: Paper[];
  onArrive: (docId: string) => void;
  /** The household confirms one value of a conflict. */
  onResolve: (conflictId: string, value: string) => void;
  /** Which extractor actually read the documents in the last run (null until a run finishes). */
  mode: ExtractionSummary | null; approving: string | null; approveError: string | null;
  onApprove: (t: PlanTask) => void; onUpload: (files: File[]) => void;
  /** The household typed out a document. */
  onType: (d: TypedDoc) => void;
  /** Files are on their way to the server (before the agents start reading). */
  uploading: boolean;
  /** Desktop only: fold the sidebar away. */
  onCollapse?: () => void;
}) {
  const { s, events, running, lang, outbox } = props;
  const t = STRINGS[lang];
  const [tab, setTab] = useState<Tab>("next");
  const [typing, setTyping] = useState(false);
  const has = (action: string) => events.some((e) => e.action === action);
  const read = new Set(events.filter((e) => /^(Read|Reused) /.test(e.action)).flatMap((e) => e.refs ?? []));
  const docs = s?.documents ?? [];
  const tabs: [Tab, string, number?][] = [
    ["next", t.tabs.next], ["programs", t.tabs.programs, s?.matches.length], ["docs", t.tabs.docs, docs.length],
    ["household", t.tabs.household], ["outbox", t.tabs.outbox, outbox.length],
  ];

  return (
    <section className="flex min-h-0 flex-col rounded-3xl border border-tide/15 bg-panel/80 backdrop-blur-xl md:h-full md:rounded-none md:border-0 md:bg-transparent md:backdrop-blur-none">
      <div className="flex items-center gap-1 border-b border-line p-2 md:px-3 md:pt-3">
      <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto pr-4 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none]" aria-label="Case">
        {tabs.map(([id, label, n]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === id ? "bg-tide text-night" : "text-muted hover:bg-bg"}`}>
            {label}{n ? <span className="ml-1 opacity-70">{n}</span> : null}
          </button>
        ))}
      </nav>
      {props.onCollapse && (
        <button onClick={props.onCollapse} aria-label="Hide panel" title="Hide panel"
          className="grid size-8 shrink-0 place-items-center rounded-full text-lg text-muted transition hover:bg-bayou-soft hover:text-tide">›</button>
      )}
      </div>

      <DropZone lang={lang} onDrop={props.onUpload} disabled={props.sample || !s || running || props.uploading} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {props.uploading && (
          <p role="status" className="flex items-center gap-2 rounded-2xl bg-bayou-soft p-3 text-sm font-semibold text-tide">
            <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />{t.sending}
          </p>
        )}
        {tab === "next" && <NextSteps {...props} has={has} read={read} />}

        {tab === "programs" && (s && has("Matched recovery pathways") ? s.matches.map((m) => (
          <article key={m.programId} className="rounded-2xl border border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">{tr(m.name, lang)}</h3>
              <span className="shrink-0 rounded-full bg-bayou-soft px-2 py-0.5 text-[11px] font-medium text-tide">{t.possibleMatch}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-bayou transition-all duration-700" style={{ width: `${m.readiness * 100}%` }} /></div>
            <div className="mt-1 flex justify-between gap-2 text-[11px] text-muted">
              <span>{t.onFile(Math.round(m.readiness * 100))}</span>
              {m.deadline && <span className="text-amber">{t.due(fmt(m.deadline.date, lang), Math.round((Date.parse(m.deadline.date) - Date.parse(s.today)) / 864e5))}</span>}
            </div>
            <ul className="mt-2 space-y-0.5 text-xs">
              {m.evidence.map((e) => <li key={e.type} className={e.satisfiedBy.length ? "" : "text-clay"}>{e.satisfiedBy.length ? "✅" : "⛔"} {tr(e.label, lang)}</li>)}
            </ul>
            <p className="mt-2 text-[11px] text-muted">{tr(m.caveat, lang)}</p>
            <a href={m.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-tide underline">{t.source}: {tr(m.source.label, lang)} ↗</a>
          </article>
        )) : <Waiting>{t.waitingResults}</Waiting>)}

        {tab === "docs" && (
          <>
            {props.mode && !running && (
              <p className="rounded-xl bg-bg px-3 py-2 text-[11px] leading-relaxed text-muted">
                <b className="text-ink">{t.extraction} {tr(extractionLabel(props.mode), lang)}.</b> {tr(extractionTooltip(props.mode), lang)}
              </p>
            )}
            <ul className="space-y-1.5">{docs.map((d) => <Doc key={d.id} d={d} s={s} lang={lang} read={read.has(d.id)} working={props.tasks[`extract:${d.id}`]?.status === "started"} />)}</ul>
            {!props.sample && s && (
              <div className="flex flex-wrap items-center gap-2">
                <FilePicker lang={lang} onPick={props.onUpload} label={`＋ ${t.addMore}`} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg" />
                <button type="button" onClick={() => setTyping((v) => !v)} aria-expanded={typing} disabled={running || props.uploading}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg disabled:opacity-50">⌨ {t.typeDoc}</button>
                <span className="hidden text-[11px] text-muted md:inline">{t.orDrag}</span>
              </div>
            )}
            {typing && <TypedDocEditor lang={lang} onAdd={(d) => { setTyping(false); props.onType(d); }} onCancel={() => setTyping(false)} />}
          </>
        )}

        {tab === "household" && (s && has("Resolved people") ? (
          <>
            <h3 className="text-sm font-semibold text-muted">{t.people}</h3>
            <ul className="space-y-1.5">{s.people.map((p) => (
              <li key={p.name} className="flex items-start justify-between gap-2 text-sm">
                <div><b>{p.name}</b>{p.aliases.length > 0 && <div className="text-xs text-amber">= {p.aliases.join(", ")}</div>}</div>
                <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-xs text-muted">{tr(p.role, lang)}</span>
              </li>))}
            </ul>
            {s.needs.length > 0 && <h3 className="pt-2 text-sm font-semibold text-muted">{t.needs}</h3>}
            <ul className="space-y-1">{s.needs.map((n) => (
              <li key={n.key} className="flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${n.urgency === "critical" ? "bg-clay" : n.urgency === "high" ? "bg-amber" : "bg-moss"}`} />{tr(n.label, lang)}
              </li>))}
            </ul>
            {s.conflicts.length > 0 && <h3 className="pt-2 text-sm font-semibold text-muted">{t.conflicts}</h3>}
            {s.conflicts.map((c) => (
              <p key={c.id} className={`rounded-xl p-2.5 text-sm ${c.resolved ? "bg-moss/15" : "bg-amber-soft/60"}`}>
                {c.question[lang]}{c.resolved && <b className="mt-1 block text-xs text-ink">✓ {t.confirmed}: {c.resolved}</b>}
              </p>
            ))}
          </>
        ) : <Waiting>{t.waitingResults}</Waiting>)}

        {tab === "outbox" && (outbox.length ? outbox.map((o) => (
          <article key={o.id} className="rounded-2xl border border-line p-3 text-xs">
            <b className="text-sm">{tr(o.packet.title, lang)}</b>
            <div className="text-muted">{t.to} {tr(o.packet.to, lang)} · {o.packet.attachments.map((a) => tr(a.title, lang)).join(", ")}</div>
            <p className="mt-1.5 rounded-lg bg-bg p-2 leading-relaxed">{o.packet.bilingualCover[lang]}</p>
          </article>
        )) : <Waiting>{t.outboxEmpty}</Waiting>)}


        {running && tab !== "next" && <p className="text-center text-[11px] text-muted">{t.working}…</p>}
      </div>
      </DropZone>
    </section>
  );
}


/** Which evidence a plan step is waiting on (none for steps that aren't waiting on a document). */
function missingFor(task: PlanTask, s: CaseState): { type: string; label: string }[] {
  if (task.id.startsWith("task:collect:")) {
    const type = task.id.slice("task:collect:".length);
    const e = s.matches.flatMap((m) => m.evidence).find((x) => x.type === type);
    return e ? [{ type, label: e.label }] : [];
  }
  if (task.status !== "blocked") return [];
  return s.matches.find((m) => m.programId === task.programId)?.evidence.filter((e) => !e.satisfiedBy.length).map((e) => ({ type: e.type, label: e.label })) ?? [];
}

const PAPER_MIME = "text/x-bayoubridge-paper";

/**
 * "Your papers": a sample case's missing documents, mixed with a few that don't help.
 * Drag one onto a waiting step (or tap it, then the step). The right one is added to
 * the case and the helpers re-read it; a wrong one gets a hint about what the step needs.
 */
function useTray(props: { s: CaseState | null; lang: Lang; papers: Paper[]; running: boolean; onArrive: (id: string) => void }) {
  const { s, lang, papers, running, onArrive } = props;
  const t = STRINGS[lang];
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ taskId: string; ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (f: { taskId: string; ok: boolean; text: string }) => {
    setFeedback(f);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), f.ok ? 2500 : 5000);
  };
  const attach = (key: string, task: PlanTask) => {
    if (!s || running) return;
    setPicked(null); setOver(null);
    const paper = papers.find((p) => p.key === key);
    if (!paper) return;
    const missing = missingFor(task, s);
    if (paper.id && paper.provides && missing.some((m) => m.type === paper.provides)) {
      say({ taskId: task.id, ok: true, text: t.rightOne });
      onArrive(paper.id);
    } else {
      say({ taskId: task.id, ok: false, text: t.notQuite(paper.title, missing.map((m) => tr(m.label, lang)).join(", ")) });
    }
  };
  const target = (task: PlanTask) => {
    if (!s || !papers.some((p) => p.id) || !missingFor(task, s).length) return null;
    return {
      active: over === task.id,
      picked,
      feedback: feedback?.taskId === task.id ? feedback : null,
      handlers: {
        onDragOver: (e: React.DragEvent) => { if ([...e.dataTransfer.types].includes(PAPER_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(task.id); } },
        onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); },
        onDrop: (e: React.DragEvent) => { const k = e.dataTransfer.getData(PAPER_MIME); if (k) { e.preventDefault(); attach(k, task); } },
      },
      attachPicked: () => picked && attach(picked, task),
    };
  };
  const tray = s && papers.some((p) => p.id) ? (
    <div className="rounded-2xl border border-amber/40 bg-amber-soft/30 p-3">
      <h3 className="text-sm font-semibold text-ink">🗂️ {t.trayTitle}</h3>
      <p className="mt-0.5 text-[11px] text-muted">{t.trayBody}</p>
      <ul className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 pt-3 [scrollbar-width:thin]">
        {papers.map((p, i) => (
          <li key={p.key} className="shrink-0">
            <button type="button" draggable={!running} disabled={running} aria-pressed={picked === p.key} aria-label={p.title}
              onDragStart={(e) => { e.dataTransfer.setData(PAPER_MIME, p.key); e.dataTransfer.effectAllowed = "copy"; setPicked(p.key); }}
              onDragEnd={() => setOver(null)}
              onClick={() => setPicked((k) => (k === p.key ? null : p.key))}
              className="group flex w-[84px] cursor-grab flex-col items-center gap-1 rounded-xl p-1 text-center outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-tide disabled:opacity-50">
              <span className="transition-transform group-hover:-translate-y-1"><PaperSheet icon={p.icon} seed={i + 1} lifted={picked === p.key} /></span>
              <span className={`line-clamp-2 text-[10px] font-medium leading-tight ${picked === p.key ? "text-tide" : "text-ink"}`}>{p.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
  return { tray, target };
}

export type Paper = { key: string; id?: string; provides?: string; icon: string; title: string };

function Waiting({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{children}</p>;
}

function NextSteps({ s, events, running, lang, sample, papers, approving, approveError, onApprove, onUpload, onType, uploading, onArrive, onResolve, has, read }: Parameters<typeof CasePanel>[0] & { has: (a: string) => boolean; read: Set<string> }) {
  const t = STRINGS[lang];
  const { tray, target } = useTray({ s, lang, papers, running, onArrive });
  const [typing, setTyping] = useState(false);
  const total = s?.documents.length ?? 0;
  const latest = events.at(-1);
  return (
    <>
      {running && (
        <div className="rounded-2xl bg-bayou-soft p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold text-tide">
            <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {total ? t.readingDocs(Math.min(read.size, total), total) : `${t.working}…`}
          </div>
          {latest && <p className="mt-1 text-xs text-muted">{t.latest}: {latest.agent} · {latest.action}</p>}
        </div>
      )}

      {s && s.warnings.length > 0 && !running && (
        <div role="status" className="rounded-2xl border border-amber/40 bg-amber-soft p-3 text-sm">
          <b className="text-amber">{t.warnings}</b>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-ink">{s.warnings.map((w, i) => <li key={i}>{tr(w, lang)}</li>)}</ul>
        </div>
      )}

      {s?.followUp && has("Scored evidence") && (
        <div className="rounded-2xl border border-bayou/40 bg-bayou-soft/40 p-3">
          <h3 className="text-sm font-semibold text-tide">{t.needFromYou}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink">{tr(s.followUp[lang], lang)}</p>
          <p className="mt-1 text-[11px] text-muted">{tr(s.followUp.why, lang)}</p>
          <div className="mt-2">
            {sample
              ? papers.some((p) => p.id) && <p className="text-xs font-medium text-amber">👇 {t.trayHint}</p>
              : (
                <div className="flex flex-wrap gap-2">
                  <FilePicker lang={lang} onPick={onUpload} label={`📎 ${t.uploadIt}`} className="rounded-full bg-bayou px-3 py-1.5 text-xs font-semibold text-white" />
                  <button type="button" onClick={() => setTyping((v) => !v)} aria-expanded={typing} disabled={running || uploading}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg disabled:opacity-50">⌨ {t.typeIt}</button>
                </div>
              )}
          </div>
          {!sample && typing && (
            <div className="mt-2">
              <TypedDocEditor key={s.followUp.evidence} lang={lang} initialKind={KIND_FOR_EVIDENCE[s.followUp.evidence]}
                onAdd={(d) => { setTyping(false); onType(d); }} onCancel={() => setTyping(false)} />
            </div>
          )}
        </div>
      )}

      {s && !running && s.plan.length > 0 && s.matches.every((m) => m.readiness === 1) && s.plan.every((x) => x.status === "done" || x.approved) && (
        <div role="status" className="rounded-2xl border border-moss/50 bg-moss/15 p-3">
          <h3 className="text-sm font-semibold text-ink">🎉 {t.allDoneTitle}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink">{t.allDoneBody(s.matches.length)}</p>
        </div>
      )}

      {sample && has("Built recovery plan") && tray}

      {s && has("Built recovery plan") && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">{t.plan}</h3>
          {approveError && <p role="alert" className="mb-2 rounded-xl bg-clay-soft p-2 text-xs text-clay">{approveError}</p>}
          <ol className="space-y-2">{s.plan.map((task) => {
            const drop = sample ? target(task) : null;
            return (
            <li key={task.id} {...drop?.handlers}
              className={`rounded-2xl border p-3 transition ${drop?.active ? "border-tide bg-tide/10" : drop ? "border-dashed border-amber/60" : "border-line"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm font-semibold">{tr(task.title, lang)}</div>
                {task.status === "blocked" && <span className="shrink-0 rounded-full bg-clay-soft px-2 py-0.5 text-[11px] text-clay">{t.blocked}</span>}
                {task.status === "ready" && <span className="shrink-0 rounded-full bg-bayou-soft px-2 py-0.5 text-[11px] text-tide">{t.ready}</span>}
                {task.status === "done" && <span className="shrink-0 rounded-full bg-moss px-2 py-0.5 text-[11px] font-medium text-night">✓ {t.done}</span>}
              </div>
              {(() => {
                const c = s.conflicts.find((x) => task.id === `task:${x.id}`);
                if (c && task.status !== "done") {
                  const choices = [...new Set(c.values.map((v) => v.value))];
                  return (
                    <>
                      <p className="mt-0.5 text-xs text-muted">{c.question[lang]}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {choices.map((v) => (
                          <button key={v} onClick={() => onResolve(c.id, v)} disabled={running}
                            className="rounded-full border border-tide/60 px-3 py-1 text-xs font-semibold text-tide hover:bg-tide hover:text-night disabled:opacity-50">{t.thisOne(v)}</button>
                        ))}
                      </div>
                    </>
                  );
                }
                return <p className="mt-0.5 text-xs text-muted">{task.due ? `${fmt(task.due, lang)} · ` : ""}{tr(task.detail, lang)}</p>;
              })()}
              {task.status === "needs_approval" && (task.approved
                ? <span className="mt-2 inline-block rounded-full bg-moss px-2.5 py-1 text-[11px] font-medium text-night">{t.approved}</span>
                : <button onClick={() => onApprove(task)} disabled={running || approving === task.id}
                  className="mt-2 rounded-full border border-tide/60 px-3 py-1 text-xs font-semibold text-tide hover:bg-tide hover:text-night disabled:opacity-50">{t.approve}</button>)}
              {drop && !drop.feedback && (
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={drop.attachPicked} disabled={running || !drop.picked}
                    aria-label={drop.picked ? t.attachHere(papers.find((p) => p.key === drop.picked)?.title ?? "") : t.dropPaper}
                    className={`rounded-lg transition ${drop.picked ? "animate-pulse cursor-pointer" : "cursor-default"}`}>
                    <Folder programId={task.id.startsWith("task:collect:") ? undefined : task.programId} open={drop.active || !!drop.picked} />
                  </button>
                  {drop.picked
                    ? <button onClick={drop.attachPicked} disabled={running} className="rounded-full bg-amber px-3 py-1 text-xs font-semibold text-night disabled:opacity-50">📎 {t.attachHere(papers.find((p) => p.key === drop.picked)?.title ?? "")}</button>
                    : <p className="text-[11px] font-medium text-amber">{t.dropPaper}</p>}
                </div>
              )}
              {drop?.feedback && (
                <p role="status" className={`mt-2 rounded-lg px-2 py-1.5 text-xs ${drop.feedback.ok ? "bg-moss/20 text-ink" : "bg-clay-soft text-clay"}`}>
                  {drop.feedback.ok ? "✓ " : ""}{drop.feedback.text}
                </p>
              )}
            </li>
            );
          })}</ol>
        </div>
      )}

      {!s?.plan.length && !running && !s && <Waiting>{t.waitingResults}</Waiting>}
    </>
  );
}

function Doc({ d, s, lang, read, working }: { d: CaseDocument; s: CaseState | null; lang: Lang; read: boolean; working: boolean }) {
  const t = STRINGS[lang];
  const [open, setOpen] = useState(false);
  const facts = s?.extractions.find((x) => x.docId === d.id)?.facts ?? [];
  return (
    <li className="rounded-xl border border-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm" aria-expanded={open}>
        <span aria-hidden>{ICON[d.kind]}</span>
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{tr(d.title, lang)}</span><span className="block truncate text-[11px] text-muted">{d.filename}</span></span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
          {working ? <span aria-hidden className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" /> : null}
          {read ? (d.text.trim() || facts.length ? t.facts(facts.length) : t.notRead) : working ? "…" : ""}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line p-2.5 text-xs">
          {d.text.trim() ? <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-bg p-2.5 text-[12px] leading-relaxed">{d.text}</p> : <p className="text-muted">{t.notRead}</p>}
          {facts.map((f) => <div key={f.id} className="flex justify-between gap-2"><span><b>{tr(f.label, lang)}</b>: {tr(f.value, lang)}</span></div>)}
        </div>
      )}
    </li>
  );
}
