"use client";

import { useState } from "react";
import { extractionLabel, extractionTooltip } from "@/lib/labels";
import type { ActivityEvent, CaseDocument, CaseState, ExtractionSummary, OutboxItem, PlanTask, TaskUpdate } from "@/lib/types";
import { KIND_FOR_EVIDENCE } from "@/lib/typedKinds";
import { DropZone, FilePicker, TypedDocEditor, type TypedDoc } from "./Onboarding";
import PaperPile, { PaperThumb, type SamplePaper } from "./PaperPile";
import { tr } from "@/lib/es";
import { packetFileName, packetHtml, packetMarkdown } from "@/lib/packetDoc";
import { STRINGS, type Lang } from "./i18n";

// The results panel next to the office. It fills in as the agents finish.

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
  /** A sample case's papers still to drop in: the first pile, then what the family finds later. */
  pile: { title: string; body: string; papers: SamplePaper[] } | null;
  /** Papers dropped while the helpers were busy, waiting their turn. */
  queued: number;
  onDropPapers: (ids: string[]) => void;
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
              {m.deadline && (() => {
                const days = Math.round((Date.parse(m.deadline.date) - Date.parse(s.today)) / 864e5);
                return <span className={days < 0 ? "font-semibold text-clay" : "text-amber"}>{days < 0 ? t.overdue(fmt(m.deadline.date, lang)) : t.due(fmt(m.deadline.date, lang), days)}</span>;
              })()}
            </div>
            {m.reasons.filter((r) => !r.startsWith("Deadline")).slice(0, 1).map((r) => <p key={r} className="mt-1 text-[11px] text-muted">{t.why}: {tr(r, lang)}</p>)}
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
            {props.sample && props.pile && <p className="text-[11px] text-amber">👆 {t.laterHint}</p>}
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
                <div><b>{tr(p.name, lang)}</b>{p.aliases.length > 0 && <div className="text-xs text-amber">= {p.aliases.join(", ")}</div>}</div>
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
            <PacketActions item={o} lang={lang} s={s} />
          </article>
        )) : <Waiting>{t.outboxEmpty}</Waiting>)}


        {running && tab !== "next" && <p className="text-center text-[11px] text-muted">{t.working}…</p>}
      </div>
      </DropZone>
    </section>
  );
}


/** Open an approved packet as a readable document, download it as Markdown, or print it to PDF. */
function PacketActions({ item, lang, s }: { item: OutboxItem; lang: Lang; s: CaseState | null }) {
  const t = STRINGS[lang];
  const household = s?.householdName ?? "";
  const docTitle = (id: string) => s?.documents.find((d) => d.id === id)?.title ?? id;
  const open = (print: boolean) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(packetHtml(item, lang, household, docTitle));
    w.document.close();
    if (print) setTimeout(() => w.print(), 300); // let the written document lay out first
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([packetMarkdown(item, lang, household, docTitle)], { type: "text/markdown;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: packetFileName(item) });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const btn = "rounded-full border border-line px-3 py-1 text-[11px] font-semibold text-ink hover:border-tide/60 hover:text-tide";
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <button type="button" onClick={() => open(false)} className={btn}>📄 {t.openDoc}</button>
      <button type="button" onClick={download} className={btn}>⬇ {t.downloadMd}</button>
      <button type="button" onClick={() => open(true)} className={btn}>🖨 {t.savePdf}</button>
    </div>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{children}</p>;
}

function NextSteps({ s, events, running, lang, sample, pile, queued, onDropPapers, approving, approveError, onApprove, onUpload, onType, uploading, onResolve, has, read }: Parameters<typeof CasePanel>[0] & { has: (a: string) => boolean; read: Set<string> }) {
  const t = STRINGS[lang];
  const [typing, setTyping] = useState(false);
  const total = s?.documents.length ?? 0;
  return (
    <>
      {sample && pile && (
        <PaperPile lang={lang} title={pile.title} body={pile.body} papers={pile.papers} busy={running} queued={queued} onDrop={onDropPapers} />
      )}

      {running && (
        <div className="rounded-2xl bg-bayou-soft p-3 text-sm" aria-live="polite">
          <div className="flex items-center gap-2 font-semibold text-tide">
            <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {total ? t.readingDocs(Math.min(read.size, total), total) : `${t.working}…`}
          </div>
          <Feed events={events} lang={lang} />
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
              ? pile && pile.papers[0]?.stage === "later" && <p className="text-xs font-medium text-amber">👆 {t.laterHint}</p>
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

      {s && has("Built recovery plan") && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">{t.plan}</h3>
          {approveError && <p role="alert" className="mb-2 rounded-xl bg-clay-soft p-2 text-xs text-clay">{approveError}</p>}
          <ol className="space-y-2">{s.plan.map((task) => {
            return (
            <li key={task.id} className="rounded-2xl border border-line p-3 transition">
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
              {task.status === "needs_approval" && !task.approved && (() => {
                const p = s.packets.find((x) => x.programId === task.programId);
                return p && (
                  <details className="mt-2 rounded-xl bg-bg/60 p-2 text-xs">
                    <summary className="cursor-pointer font-semibold text-tide">{t.preview}</summary>
                    <p className="mt-1.5"><b>{t.to}:</b> {tr(p.to, lang)}</p>
                    <p className="mt-0.5"><b>{t.attached}:</b> {p.attachments.map((a) => tr(a.title, lang)).join(", ")}</p>
                    <p className="mt-1.5 leading-relaxed text-ink">{p.bilingualCover[lang]}</p>
                    {p.letter && (
                      <>
                        <p className="mt-2 font-semibold">{t.letterTitle}</p>
                        <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-panel p-2 font-sans text-[11px] leading-relaxed">{p.letter[lang]}</pre>
                        <p className="mt-1 text-[11px] text-amber">{t.letterSign}</p>
                      </>
                    )}
                    <p className="mt-1.5 text-[11px] text-muted">{t.previewNote}</p>
                  </details>
                );
              })()}
            </li>
            );
          })}</ol>
        </div>
      )}

      {s && has("Built recovery plan") && s.documents.length > 0 && <PaperUses s={s} lang={lang} />}

      {!s?.plan.length && !running && !s && !pile && <Waiting>{t.waitingResults}</Waiting>}
      {s && !running && !s.plan.length && has("Built recovery plan") && <Waiting>{t.noPlan}</Waiting>}
    </>
  );
}

/** The last few activity-log lines, newest first, as plain sentences. */
function Feed({ events, lang }: { events: ActivityEvent[]; lang: Lang }) {
  const last = events.slice(-4).reverse();
  if (!last.length) return null;
  return (
    <ol className="mt-2 space-y-1.5 border-t border-tide/15 pt-2">
      {last.map((e, i) => (
        <li key={e.seq} className={`text-xs leading-snug ${i === 0 ? "text-ink" : "text-muted"}`}>
          <b className={i === 0 ? "text-tide" : ""}>{tr(e.agent, lang)}</b> · {tr(e.action, lang)}
          {i === 0 && e.detail && <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted">{tr(e.detail, lang)}</span>}
        </li>
      ))}
    </ol>
  );
}

/** Which kinds of help a document counts toward, and as what. */
function usesOf(docId: string, s: CaseState) {
  return s.matches.flatMap((m) => m.evidence.filter((e) => e.satisfiedBy.includes(docId)).map((e) => ({ program: m.name, programId: m.programId, as: e.label })));
}

/** "What each paper is used for": every document and the help it counts toward. */
function PaperUses({ s, lang }: { s: CaseState; lang: Lang }) {
  const t = STRINGS[lang];
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold text-muted">{t.usedTitle}</h3>
      <ul className="space-y-1.5">
        {s.documents.map((d, i) => {
          const uses = usesOf(d.id, s);
          return (
            <li key={d.id} className="flex items-start gap-2.5 rounded-xl border border-line p-2">
              <PaperThumb p={d} seed={i + 1} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">{tr(d.title, lang)}</div>
                {uses.length ? (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {uses.map((u) => (
                      <li key={u.programId + u.as} title={tr(u.as, lang)} className="rounded-full bg-bayou-soft px-2 py-0.5 text-[10px] font-medium text-tide">{tr(u.program, lang)}</li>
                    ))}
                  </ul>
                ) : <p className="mt-0.5 text-[10px] text-muted">{t.notUsed}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
          {s && read && (() => {
            const uses = usesOf(d.id, s);
            return <p className="text-[11px] text-muted"><b className="text-ink">{t.usedFor}:</b> {uses.length ? uses.map((u) => `${tr(u.program, lang)} (${tr(u.as, lang)})`).join("; ") : t.notUsed}</p>;
          })()}
          {facts.map((f) => <div key={f.id} className="flex justify-between gap-2"><span><b>{tr(f.label, lang)}</b>: {tr(f.value, lang)}</span></div>)}
        </div>
      )}
    </li>
  );
}
