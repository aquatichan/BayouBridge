"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Capybara from "@/components/Capybara";
import Office from "@/components/office/Office";
import { shrinkImage } from "@/lib/client/files";
import { RunError, streamRun } from "@/lib/client/stream";
import { extractionLabel } from "@/lib/labels";
import { OfficeDirector } from "@/lib/office/director";
import type { ActivityEvent, CaseState, ExtractionSummary, OutboxItem, PlanTask, TaskUpdate } from "@/lib/types";
import CasePanel from "./CasePanel";
import { Consent, Home, Upload, Welcome } from "./Onboarding";
import { STRINGS, type Lang } from "./i18n";

// The consumer app: welcome → consent → your home → upload → the office.
// The 3D office is always there: idle behind the first steps, then the
// immersive dashboard where you watch the agents work your case.

type Step = "welcome" | "consent" | "home" | "upload" | "office";
const SESSION_KEY = "bayoubridge.case";
const LANG_KEY = "bayoubridge.lang";
const PANEL_PX = 432; // desktop panel width + margin, so the camera centers in the rest

const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { sessionStorage.removeItem(k); } catch { /* private mode */ } },
};

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Server returned ${res.status}`);
  return data as T;
}

/** True on screens wide enough for the side panel (Tailwind's md breakpoint). */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

export default function CaseApp() {
  const wide = useWide();
  const [lang, setLang] = useState<Lang>("en");
  const t = STRINGS[lang];
  const [step, setStep] = useState<Step>("welcome");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [sample, setSample] = useState(false);
  const [household, setHousehold] = useState<{ name: string; address: string } | null>(null);
  const [state, setState] = useState<CaseState | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [tasks, setTasks] = useState<Record<string, TaskUpdate>>({});
  const [mode, setMode] = useState<ExtractionSummary | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [claudeOn, setClaudeOn] = useState<boolean | null>(null);
  const [cheer, setCheer] = useState<string | undefined>();
  const [menu, setMenu] = useState(false);
  const director = useMemo(() => new OfficeDirector(), []);
  const eventsRef = useRef<ActivityEvent[]>([]);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // Language, whether this server can read photos, and picking a case back up after a reload.
  useEffect(() => {
    try { const l = localStorage.getItem(LANG_KEY); if (l === "es" || l === "en") setLang(l); } catch { /* storage off */ }
    fetch("/api/status").then((r) => r.json()).then((d: { claude: boolean }) => setClaudeOn(d.claude)).catch(() => setClaudeOn(null));
    const id = store.get(SESSION_KEY);
    if (!id) return;
    fetch(`/api/cases/${id}`).then(async (r) => {
      if (!r.ok) { store.del(SESSION_KEY); return; }
      const d = (await r.json()) as { profile: { name: string; address: string; sample: boolean }; state: CaseState | null };
      setCaseId(id); setSample(d.profile.sample); setHousehold(d.profile);
      if (d.state) {
        setState(d.state); setMode(d.state.extraction); setEvents(d.state.events); setStep("office");
        fetch(`/api/outbox?caseId=${id}`).then((x) => x.json()).then((o: { items: OutboxItem[] }) => setOutbox(o.items)).catch(() => {});
      } else if (!d.profile.sample) setStep("upload");
    }).catch(() => {});
  }, []);
  const chooseLang = (l: Lang) => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* storage off */ } };

  /** Run the agents, live. `incremental` reuses what was already read; `newDocs` is how many papers land in the inbox. */
  const run = useCallback(async (id: string, opts: { incremental?: boolean; newDocs: number; addDocumentIds?: string[] }) => {
    const before = opts.incremental ? eventsRef.current : [];
    const blockedBefore = new Set(state?.matches.filter((m) => m.blocked).map((m) => m.programId) ?? []);
    setRunning(true); setError(null); setApproveError(null); setTasks({}); setCheer(undefined);
    if (!opts.incremental) { setState(null); setEvents([]); }
    director.newRun(opts.newDocs);
    const body = { caseId: id, incremental: opts.incremental, addDocumentIds: opts.addDocumentIds };
    const finish = (final: CaseState, extraction: ExtractionSummary) => {
      setState(final); setMode(extraction); setEvents([...before, ...final.events]);
      // A follow-up document just unblocked a pathway: Capi celebrates.
      const unblocked = final.matches.find((m) => blockedBefore.has(m.programId) && !m.blocked);
      if (opts.incremental && unblocked) setCheer(`${unblocked.name}: 100%`);
    };
    try {
      const streamed = await streamRun(body, {
        task: (u) => { director.onTask(u); setTasks((x) => ({ ...x, [u.id]: u })); },
        agent: (e) => { director.onEvent(e); setEvents((x) => [...x, e]); },
        state: (part) => setState((prev) => {
          if (part.caseId && prev && opts.incremental) return { ...prev, documents: part.documents ?? prev.documents };
          return { ...(prev ?? (part as CaseState)), ...part };
        }),
        done: (d) => finish(d.state, d.extraction),
      });
      if (!streamed) {
        // No live stream (blocked by a proxy, say): run it in one request and let the office act it out.
        const d = await postJSON<{ state: CaseState; extraction: ExtractionSummary }>("/api/run", body);
        d.state.events.forEach((e) => director.onEvent(e));
        finish(d.state, d.extraction);
      }
    } catch (e) {
      setError(e instanceof RunError || e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false); setTasks({});
    }
  }, [director, state]);

  async function startSample() {
    setBusy(true); setError(null);
    try {
      const { caseId: id } = await postJSON<{ caseId: string }>("/api/cases", { sample: true, language: lang });
      store.set(SESSION_KEY, id);
      setCaseId(id); setSample(true); setHousehold({ name: "Reyes household", address: "1847 Cypress Bayou Ln, Houston, TX 77093" }); setOutbox([]);
      setStep("office");
      await run(id, { newDocs: 6 });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function createCase(v: { address: string; name: string }) {
    setBusy(true); setError(null);
    try {
      const { caseId: id } = await postJSON<{ caseId: string }>("/api/cases", { consent: true, address: v.address, name: v.name, language: lang });
      store.set(SESSION_KEY, id);
      setCaseId(id); setSample(false); setHousehold({ name: v.name || t.tabs.household, address: v.address }); setOutbox([]);
      setStep("upload");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function sendFiles(id: string, files: File[], statement = "") {
    const form = new FormData();
    for (const f of await Promise.all(files.map(shrinkImage))) form.append("files", f);
    if (statement.trim()) form.append("statement", statement);
    const res = await fetch(`/api/cases/${id}/documents`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `Upload failed (${res.status})`);
    return (data as { documents: unknown[] }).documents.length;
  }

  async function upload(files: File[], statement: string) {
    if (!caseId) return;
    setBusy(true); setError(null);
    try {
      const n = await sendFiles(caseId, files, statement);
      setStep("office");
      await run(caseId, { newDocs: n });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  /** A document arrives later (the one the Follow-up Agent asked for): read just it, then update the case. */
  async function followUp(files: File[]) {
    if (!caseId || !files.length) return;
    setError(null);
    try {
      const n = await sendFiles(caseId, files);
      await run(caseId, { incremental: true, newDocs: n });
    } catch (e) { setError((e as Error).message); }
  }

  async function approve(task: PlanTask) {
    if (!caseId) return;
    setApproveError(null); setApproving(task.id);
    try {
      const d = await postJSON<{ task: PlanTask; events: ActivityEvent[]; item: OutboxItem }>("/api/approve", { caseId, taskId: task.id });
      d.events.forEach((e) => director.onEvent(e));
      setState((prev) => prev && {
        ...prev,
        plan: prev.plan.map((x) => (x.id === d.task.id ? d.task : x)),
        packets: prev.packets.map((p) => (p.id === d.item.packet.id ? d.item.packet : p)),
      });
      setEvents((x) => [...x, ...d.events]);
      setOutbox((o) => (o.some((x) => x.id === d.item.id) ? o : [...o, d.item]));
    } catch (e) {
      setApproveError(`${task.title}: ${(e as Error).message}`);
    } finally { setApproving(null); }
  }

  async function forget() {
    if (!sample && !window.confirm(t.deleteConfirm)) return;
    setMenu(false);
    if (caseId) await fetch(`/api/cases/${caseId}`, { method: "DELETE" }).catch(() => {});
    store.del(SESSION_KEY);
    setCaseId(null); setState(null); setEvents([]); setOutbox([]); setMode(null); setHousehold(null); setCheer(undefined);
    director.newRun(0);
    setStep("welcome");
    if (!sample) setNotice(t.deleted);
  }

  const minutes = events.reduce((n, e) => n + (e.minutesSaved ?? 0), 0);
  const billPending = sample && !!state && state.followUp?.evidence === "proof_of_occupancy" && !state.documents.some((d) => d.kind === "utility_bill");
  const inOffice = step === "office";

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden">
      {/* The office. Full screen on desktop; the top half of the screen on phones. */}
      <Office
        director={director}
        hud={inOffice}
        className="relative h-[56vh] md:fixed md:inset-0 md:h-auto"
        followClass="left-3 top-16 md:left-4 md:top-20"
        chipsClass="inset-x-2 bottom-2 md:left-4 md:right-[452px] md:bottom-4"
        rightInset={inOffice && wide ? PANEL_PX : 0}
      />

      {/* Top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 px-3 py-2 md:px-4 md:py-3">
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/70 bg-panel/90 py-1 pl-1 pr-3 shadow-sm backdrop-blur">
          <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden>
            <rect width="32" height="32" rx="16" fill="#0f4c4a" />
            <path d="M5 20 Q16 6 27 20" stroke="#f5f1e8" strokeWidth="2.2" fill="none" />
            <path d="M3 24 q3 -2 6 0 t6 0 t6 0 t6 0 t3 0" stroke="#7fc1b4" strokeWidth="1.8" fill="none" />
          </svg>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-bold text-bayou">BayouBridge</div>
            {household && inOffice && <div className="hidden truncate text-[11px] text-muted sm:block">{household.name} · {household.address}</div>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          {inOffice && mode && <span className="hidden rounded-full border border-white/70 bg-panel/90 px-2.5 py-1 text-muted shadow-sm backdrop-blur sm:inline">{t.extraction}: {extractionLabel(mode)}</span>}
          {inOffice && minutes > 0 && <span className="hidden rounded-full bg-bayou-soft px-2.5 py-1 font-semibold text-bayou shadow-sm sm:inline">⏱ {t.minutes(minutes)}</span>}
          {sample && inOffice && <span className="whitespace-nowrap rounded-full bg-amber-soft px-2.5 py-1 font-medium text-amber shadow-sm" title={t.sampleNote}>{wide ? t.sampleNote.split(".")[0] : t.sampleShort}</span>}
          <div className="flex overflow-hidden rounded-full border border-white/70 bg-panel/90 shadow-sm backdrop-blur">
            {(["en", "es"] as const).map((l) => (
              <button key={l} onClick={() => chooseLang(l)} className={`px-2.5 py-1 font-semibold ${lang === l ? "bg-bayou text-white" : "text-muted"}`}>{l.toUpperCase()}</button>
            ))}
          </div>
          {inOffice && (
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu} className="rounded-full border border-white/70 bg-panel/90 px-2.5 py-1 font-bold shadow-sm backdrop-blur">⋯</button>
              {menu && (
                <div className="absolute right-0 top-9 w-48 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-lg">
                  <button onClick={forget} className="block w-full px-3 py-2 text-left hover:bg-bg">{sample ? t.menu.restart : t.menu.delete}</button>
                  <Link href="/classic" className="block px-3 py-2 hover:bg-bg">{t.menu.classic}</Link>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {(error || notice) && (
        <div role="alert" className="fixed inset-x-0 top-16 z-50 mx-auto w-fit max-w-[92vw] rounded-full bg-ink px-4 py-2 text-xs text-white shadow-lg md:top-4">
          {error ? `${t.error}: ${error}` : notice}
          <button onClick={() => { setError(null); setNotice(null); }} className="ml-3 opacity-70" aria-label="Dismiss">✕</button>
        </div>
      )}

      {step === "welcome" && <Welcome lang={lang} busy={busy} onStart={() => { setNotice(null); setStep("consent"); }} onSample={startSample} />}
      {step === "consent" && <Consent lang={lang} onAgree={() => setStep("home")} onBack={() => setStep("welcome")} />}
      {step === "home" && <Home lang={lang} busy={busy} error={error} onSubmit={createCase} onBack={() => setStep("consent")} />}
      {step === "upload" && <Upload lang={lang} claudeOn={claudeOn} busy={busy} error={error} onSubmit={upload} />}

      {inOffice && (
        <div className="relative z-30 p-3 md:fixed md:bottom-4 md:right-4 md:top-20 md:flex md:w-[420px] md:flex-col md:p-0">
          <CasePanel
            s={state} events={events} tasks={tasks} running={running} lang={lang} outbox={outbox} sample={sample}
            billPending={billPending} approving={approving} approveError={approveError}
            onApprove={approve} onUpload={followUp}
            onBill={() => caseId && run(caseId, { incremental: true, newDocs: 1, addDocumentIds: ["doc-electric-bill"] })}
          />
        </div>
      )}

      <div className="fixed bottom-3 right-3 z-40 md:bottom-4 md:right-[452px]">
        <Capybara minutesSaved={minutes} cheer={cheer} />
      </div>
    </div>
  );
}
