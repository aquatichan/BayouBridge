"use client";

import { useState } from "react";
import type { ActivityEvent, CaseDocument, CaseState, OutboxItem, PlanTask, TaskUpdate } from "@/lib/types";
import { FilePicker } from "./Onboarding";
import { tr } from "@/lib/es";
import { STRINGS, type Lang } from "./i18n";

// The results panel of the immersive dashboard. It fills in as the agents finish.

const ICON: Record<CaseDocument["kind"], string> = {
  photo: "📷", estimate: "🧾", fema_letter: "✉️", insurance_email: "📧", voice_note: "🗣️", utility_bill: "💡",
  bank_statement: "🏦", lease: "🏠", id_card: "🪪", insurance_policy: "📄", medical_letter: "🩺", receipt: "🧾", other: "📎",
};

type Tab = "next" | "programs" | "docs" | "household" | "outbox";

function fmt(iso: string, lang: Lang) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function CasePanel(props: {
  s: CaseState | null; events: ActivityEvent[]; tasks: Record<string, TaskUpdate>; running: boolean; lang: Lang;
  outbox: OutboxItem[]; sample: boolean; billPending: boolean; approving: string | null; approveError: string | null;
  onApprove: (t: PlanTask) => void; onUpload: (files: File[]) => void; onBill: () => void;
  /** Desktop only: fold the sidebar away. */
  onCollapse?: () => void;
}) {
  const { s, events, running, lang, outbox } = props;
  const t = STRINGS[lang];
  const [tab, setTab] = useState<Tab>("next");
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
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
            <ul className="space-y-1.5">{docs.map((d) => <Doc key={d.id} d={d} s={s} lang={lang} read={read.has(d.id)} working={props.tasks[`extract:${d.id}`]?.status === "started"} />)}</ul>
            {!props.sample && s && <FilePicker lang={lang} onPick={props.onUpload} label={`＋ ${t.addMore}`} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg" />}
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
            {s.conflicts.map((c) => <p key={c.id} className="rounded-xl bg-amber-soft/60 p-2.5 text-sm">{c.question[lang]}</p>)}
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
    </section>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{children}</p>;
}

function NextSteps({ s, events, running, lang, sample, billPending, approving, approveError, onApprove, onUpload, onBill, has, read }: Parameters<typeof CasePanel>[0] & { has: (a: string) => boolean; read: Set<string> }) {
  const t = STRINGS[lang];
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
              ? billPending && <button disabled={running} onClick={onBill} className="rounded-full bg-amber px-3 py-1.5 text-xs font-semibold text-night disabled:opacity-50">💡 {t.billArrives}</button>
              : <FilePicker lang={lang} onPick={onUpload} label={`📎 ${t.uploadIt}`} className="rounded-full bg-bayou px-3 py-1.5 text-xs font-semibold text-white" />}
          </div>
        </div>
      )}

      {s && has("Built recovery plan") && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">{t.plan}</h3>
          {approveError && <p role="alert" className="mb-2 rounded-xl bg-clay-soft p-2 text-xs text-clay">{approveError}</p>}
          <ol className="space-y-2">{s.plan.map((task) => (
            <li key={task.id} className="rounded-2xl border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm font-semibold">{tr(task.title, lang)}</div>
                {task.status === "blocked" && <span className="shrink-0 rounded-full bg-clay-soft px-2 py-0.5 text-[11px] text-clay">{t.blocked}</span>}
                {task.status === "ready" && <span className="shrink-0 rounded-full bg-bayou-soft px-2 py-0.5 text-[11px] text-tide">{t.ready}</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted">{task.due ? `${fmt(task.due, lang)} · ` : ""}{s.conflicts.find((c) => task.id === `task:${c.id}`)?.question[lang] ?? tr(task.detail, lang)}</p>
              {task.status === "needs_approval" && (task.approved
                ? <span className="mt-2 inline-block rounded-full bg-moss px-2.5 py-1 text-[11px] font-medium text-night">{t.approved}</span>
                : <button onClick={() => onApprove(task)} disabled={running || approving === task.id}
                  className="mt-2 rounded-full border border-tide/60 px-3 py-1 text-xs font-semibold text-tide hover:bg-tide hover:text-night disabled:opacity-50">{t.approve}</button>)}
            </li>
          ))}</ol>
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
          {facts.map((f) => <div key={f.id} className="flex justify-between gap-2"><span><b>{tr(f.label, lang)}</b>: {f.value}</span></div>)}
        </div>
      )}
    </li>
  );
}
