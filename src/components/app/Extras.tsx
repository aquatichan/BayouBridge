"use client";

import { useEffect, useState } from "react";
import { tr } from "@/lib/es";
import { recoveryHtml, recoveryMarkdown } from "@/lib/packetDoc";
import type { ActivityEvent, CaseDocument, CaseState, EvidenceType, OutboxItem, PlanTask } from "@/lib/types";
import type { Lang } from "./i18n";

// Flow helpers for the results panel: overall progress, the one next thing to do,
// the deadlines on a timeline, why a step is waiting, the live helper feed, and the
// "Recovery complete" package.

const T = {
  en: {
    ready: "ready", stepsDone: (a: number, b: number) => `${a} of ${b} steps done`, nextUp: "Next up", show: "Show me",
    dropRest: (n: number) => `Drop the ${n === 1 ? "last paper" : `other ${n} papers`} in the pile too`, dropFirst: (h: string) => `Drop the ${h}'s papers into BayouBridge`, findIt: "Find the paper the helpers asked for and drop it in",
    addIt: (l: string) => `Add: ${l}`, answer: (q: string) => `Answer: ${q}`, approveIt: (x: string) => `Review and approve: ${x}`,
    exportIt: "Every step is done. Download the recovery package", deadlines: "Deadlines", today: "Today",
    inDays: (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`), ago: (n: number) => `${n} days ago`, sent: "approved",
    why: "Why is this waiting?", onFile: "On file", missing: "Missing", rule: (p: string, n: number) => `${p} asks for all ${n} of these.`, source: "Rule source",
    live: "Live activity", noActivity: "The helpers' work shows up here as it happens.",
    approveAll: (n: number) => `Approve all ${n} ready`, pkg: "Recovery package", pkgOpen: "Open / save as PDF", pkgMd: "Download (.md)",
    needed: "Needed", lightsUp: "This paper fills this step",
  },
  es: {
    ready: "listo", stepsDone: (a: number, b: number) => `${a} de ${b} pasos listos`, nextUp: "Lo siguiente", show: "Muéstreme",
    dropRest: (n: number) => `Ponga también ${n === 1 ? "el último papel" : `los otros ${n} papeles`} del montón`, dropFirst: (h: string) => `Ponga los papeles de ${/ household$/i.test(h) ? `la familia ${h.replace(/ household$/i, "")}` : "la familia"} en BayouBridge`, findIt: "Busque el papel que pidieron los ayudantes y póngalo",
    addIt: (l: string) => `Agregue: ${l}`, answer: (q: string) => `Conteste: ${q}`, approveIt: (x: string) => `Revise y apruebe: ${x}`,
    exportIt: "Todos los pasos están listos. Descargue el paquete de recuperación", deadlines: "Fechas límite", today: "Hoy",
    inDays: (n: number) => (n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`), ago: (n: number) => `hace ${n} días`, sent: "aprobado",
    why: "¿Por qué está en espera?", onFile: "Ya está", missing: "Falta", rule: (p: string, n: number) => `${p} pide estos ${n}.`, source: "Fuente de la regla",
    live: "Actividad en vivo", noActivity: "El trabajo de los ayudantes aparece aquí en el momento.",
    approveAll: (n: number) => `Aprobar los ${n} listos`, pkg: "Paquete de recuperación", pkgOpen: "Abrir / guardar como PDF", pkgMd: "Descargar (.md)",
    needed: "Lo piden", lightsUp: "Este papel completa este paso",
  },
};
export const extrasText = (lang: Lang) => T[lang];

/** Which evidence a kind of document can supply. */
export const EVIDENCE_OF: Partial<Record<CaseDocument["kind"], EvidenceType>> = {
  photo: "damage_photo", estimate: "repair_estimate", fema_letter: "fema_determination", insurance_email: "insurance_correspondence",
  insurance_policy: "insurance_policy", utility_bill: "proof_of_occupancy", bank_statement: "proof_of_occupancy", lease: "proof_of_occupancy",
  id_card: "proof_of_identity", medical_letter: "medical_need_documentation", receipt: "loss_receipts", deed: "proof_of_ownership", voice_note: "loss_statement",
};

/** What a plan step is still waiting on. */
export function missingOf(task: PlanTask, s: CaseState): EvidenceType[] {
  if (task.id.startsWith("task:collect:")) return [task.id.slice("task:collect:".length) as EvidenceType];
  if (task.status !== "blocked") return [];
  return s.matches.find((m) => m.programId === task.programId)?.evidence.filter((e) => !e.satisfiedBy.length).map((e) => e.type) ?? [];
}

// ── Dragging a paper lights up the steps it would fill ──────────────────────

const DRAG = "bb-drag";
export const announceDrag = (kinds: CaseDocument["kind"][] | null) => window.dispatchEvent(new CustomEvent(DRAG, { detail: kinds }));
export function useDraggedEvidence(): Set<EvidenceType> {
  const [ev, setEv] = useState<Set<EvidenceType>>(new Set());
  useEffect(() => {
    const on = (e: Event) => {
      const kinds = (e as CustomEvent<CaseDocument["kind"][] | null>).detail;
      setEv(new Set((kinds ?? []).map((k) => EVIDENCE_OF[k]).filter(Boolean) as EvidenceType[]));
    };
    window.addEventListener(DRAG, on);
    return () => window.removeEventListener(DRAG, on);
  }, []);
  return ev;
}

/** Scroll to a part of the panel and flash it, for "Show me". */
export function flash(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("bb-flash");
  void el.offsetWidth; // restart the animation
  el.classList.add("bb-flash");
}

// ── Progress ring ───────────────────────────────────────────────────────────

export function ProgressRing({ s, lang }: { s: CaseState; lang: Lang }) {
  const t = T[lang];
  if (!s.matches.length) return null; // nothing to measure yet: "100% ready" would be a lie
  const pct = s.evidenceScore;
  const done = s.plan.filter((x) => x.status === "done" || x.approved).length;
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
      <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0 -rotate-90" aria-hidden>
        <circle cx="34" cy="34" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-line" />
        <circle cx="34" cy="34" r={r} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
          className={pct === 100 ? "text-moss" : "text-bayou"} strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="min-w-0">
        <div className="text-2xl font-bold tabular-nums text-ink" aria-live="polite">{pct}% <span className="text-sm font-semibold text-muted">{t.ready}</span></div>
        <div className="text-xs text-muted">{t.stepsDone(done, s.plan.length)}</div>
      </div>
    </div>
  );
}

// ── Next up ─────────────────────────────────────────────────────────────────

export function NextUp({ s, lang, sample, hasPile, laterInPile, startLeft, household, running }: {
  s: CaseState | null; lang: Lang; sample: boolean; hasPile: boolean; laterInPile: boolean; startLeft: number; household: string; running: boolean;
}) {
  const t = T[lang];
  if (running) return null;
  let text: string | undefined, target: string | undefined;
  if (!s) { if (sample && hasPile) { text = t.dropFirst(household); target = "bb-pile"; } }
  else {
    const conflict = s.conflicts.find((c) => !c.resolved);
    const toApprove = s.plan.find((x) => x.status === "needs_approval" && !x.approved);
    const allDone = s.plan.length > 0 && s.plan.every((x) => x.status === "done" || x.approved) && s.matches.every((m) => m.readiness === 1);
    if (sample && startLeft > 0) { text = t.dropRest(startLeft); target = "bb-pile"; }
    else if (s.followUp && sample && laterInPile) { text = t.findIt; target = "bb-pile"; }
    else if (s.followUp && !sample) { text = t.addIt(tr(s.matches.flatMap((m) => m.evidence).find((e) => e.type === s.followUp!.evidence)?.label ?? "", lang)); target = "bb-followup"; }
    else if (conflict) { text = t.answer(conflict.question[lang]); target = `bb-task-task:${conflict.id}`; }
    else if (toApprove) { text = t.approveIt(tr(toApprove.title, lang)); target = `bb-task-${toApprove.id}`; }
    else if (allDone) { text = t.exportIt; target = "bb-export"; }
  }
  if (!text || !target) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-sun/50 bg-sun/10 p-3">
      <span aria-hidden className="relative flex size-2.5 shrink-0"><span className="absolute inline-flex size-full animate-ping rounded-full bg-sun opacity-70" /><span className="relative inline-flex size-2.5 rounded-full bg-sun" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber">{t.nextUp}</div>
        <div className="line-clamp-2 text-sm font-semibold text-ink">{text}</div>
      </div>
      <button type="button" onClick={() => flash(target!)} className="shrink-0 rounded-full bg-sun px-3 py-1 text-xs font-semibold text-night hover:brightness-105">{t.show}</button>
    </div>
  );
}

// ── Deadline timeline ───────────────────────────────────────────────────────

export function DeadlineStrip({ s, lang }: { s: CaseState; lang: Lang }) {
  const t = T[lang];
  const days = (iso: string) => Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(s.today + "T12:00:00Z")) / 864e5);
  const items = [
    ...s.matches.filter((m) => m.deadline).map((m) => ({
      date: m.deadline!.date, label: tr(m.name, lang), sent: !!s.plan.find((x) => x.programId === m.programId)?.approved,
    })),
    ...s.extractions.flatMap((e) => e.facts).filter((f) => f.type === "appointment" && f.normalized)
      .map((f) => ({ date: f.normalized!, label: tr(f.label, lang), sent: false })),
  ].filter((x, i, all) => all.findIndex((y) => y.date === x.date && y.label === x.label) === i).sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) return null;
  const fmt = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div className="rounded-2xl border border-line p-3">
      <h3 className="text-sm font-semibold text-muted">⏳ {t.deadlines}</h3>
      <ol className="relative mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <span aria-hidden className="absolute left-0 right-0 top-[9px] h-px bg-line" />
        <li className="relative z-10 flex w-16 shrink-0 flex-col items-center text-center">
          <span className="size-[18px] rounded-full border-2 border-tide bg-night" />
          <span className="mt-1 text-[11px] font-semibold text-tide">{t.today}</span>
          <span className="text-[10px] text-muted">{fmt(s.today)}</span>
        </li>
        {items.map((x) => {
          const n = days(x.date);
          const tone = x.sent ? "bg-moss" : n < 0 ? "bg-clay" : n <= 7 ? "bg-amber" : "bg-bayou";
          return (
            <li key={x.date + x.label} className="relative z-10 flex w-28 shrink-0 flex-col items-center text-center">
              <span className="relative flex size-[18px]">
                {!x.sent && n >= 0 && n <= 7 && <span className={`absolute inline-flex size-full animate-ping rounded-full ${tone} opacity-60`} />}
                <span className={`relative inline-flex size-[18px] rounded-full ${tone}`} />
              </span>
              <span className="mt-1 text-[11px] font-semibold text-ink">{fmt(x.date)}</span>
              <span className={`text-[10px] font-semibold ${x.sent ? "text-moss" : n < 0 ? "text-clay" : n <= 7 ? "text-amber" : "text-muted"}`}>{x.sent ? `✓ ${t.sent}` : n < 0 ? t.ago(-n) : t.inDays(n)}</span>
              <span className="line-clamp-2 text-[10px] leading-tight text-muted">{x.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Why is this waiting? ────────────────────────────────────────────────────

export function WhyBlocked({ task, s, lang }: { task: PlanTask; s: CaseState; lang: Lang }) {
  const t = T[lang];
  const m = s.matches.find((x) => x.programId === task.programId);
  if (!m || task.status !== "blocked") return null;
  const title = (id: string) => tr(s.documents.find((d) => d.id === id)?.title ?? id, lang);
  return (
    <details className="mt-2 rounded-xl bg-bg/60 p-2 text-xs">
      <summary className="cursor-pointer font-semibold text-tide">{t.why}</summary>
      <ul className="mt-2 space-y-1">
        {m.evidence.map((e) => (
          <li key={e.type} className="flex items-start gap-2">
            <span aria-hidden className={e.satisfiedBy.length ? "text-moss" : "text-clay"}>{e.satisfiedBy.length ? "●" : "○"}</span>
            <span className="min-w-0">
              <b className={e.satisfiedBy.length ? "text-ink" : "text-clay"}>{tr(e.label, lang)}</b>
              <span className="block text-[11px] text-muted">{e.satisfiedBy.length ? `${t.onFile}: ${e.satisfiedBy.map(title).join(", ")}` : `${t.missing}${e.hint ? ` · ${e.hint}` : ""}`}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">{t.rule(tr(m.name, lang), m.evidence.length)}{m.deadline ? ` ${tr(m.deadline.basis, lang)}.` : ""}</p>
      <a href={m.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-medium text-tide underline">{t.source}: {tr(m.source.label, lang)} ↗</a>
    </details>
  );
}

// ── Live activity ───────────────────────────────────────────────────────────

const AGENT_COLOR: Record<string, string> = {
  Coordinator: "#7fc1b4", "Evidence Agent": "#9cc68f", "Recovery-Match Agent": "#8fb6e0", "Follow-up Agent": "#8fb6e0",
  "Packet Agent": "#f0a08e", "Safety Agent": "#f0a08e",
};

export function LiveFeed({ events, lang }: { events: ActivityEvent[]; lang: Lang }) {
  const t = T[lang];
  const last = events.slice(-8).reverse();
  return (
    <section className="rounded-2xl border border-line p-3" aria-live="polite">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted">
        <span aria-hidden className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-moss opacity-70" /><span className="relative inline-flex size-2 rounded-full bg-moss" /></span>
        {t.live}
      </h3>
      {last.length ? (
        <ol className="mt-2 space-y-1.5">
          {last.map((e, i) => (
            <li key={e.seq} className={`bb-feed-in flex gap-2 text-xs leading-snug ${i === 0 ? "text-ink" : "text-muted"}`}>
              <span aria-hidden className="mt-1 size-2 shrink-0 rounded-full" style={{ background: AGENT_COLOR[e.agent] ?? "#c4b2ec" }} />
              <span className="min-w-0"><b className={i === 0 ? "text-tide" : ""}>{tr(e.agent, lang)}</b> → {tr(e.action, lang)}
                {i === 0 && e.detail && <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted">{tr(e.detail, lang)}</span>}</span>
            </li>
          ))}
        </ol>
      ) : <p className="mt-1 text-xs text-muted">{t.noActivity}</p>}
    </section>
  );
}

// ── The recovery package ────────────────────────────────────────────────────

export function RecoveryPackage({ s, outbox, events, lang }: { s: CaseState; outbox: OutboxItem[]; events: ActivityEvent[]; lang: Lang }) {
  const t = T[lang];
  const download = () => {
    const url = URL.createObjectURL(new Blob([recoveryMarkdown(s, outbox, events, lang)], { type: "text/markdown;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `recovery-package-${s.householdName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const open = () => {
    const w = window.open("", "_blank");
    if (!w) return download(); // pop-up blocked: save the Markdown instead of doing nothing
    w.document.write(recoveryHtml(s, outbox, events, lang));
    w.document.close();
    setTimeout(() => w.print(), 300);
  };
  return (
    <div id="bb-export" className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-ink">📦 {t.pkg}</span>
      <button type="button" onClick={open} className="rounded-full bg-moss px-3 py-1 text-xs font-semibold text-night">{t.pkgOpen}</button>
      <button type="button" onClick={download} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink">{t.pkgMd}</button>
    </div>
  );
}
