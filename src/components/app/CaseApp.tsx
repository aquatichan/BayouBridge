"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Office from "@/components/office/Office";
import Image from "next/image";
import { MAX_FILES, shrinkImage } from "@/lib/client/files";
import { RunError, streamRun } from "@/lib/client/stream";
import { OfficeDirector } from "@/lib/office/director";
import type { ActivityEvent, CaseState, ExtractionSummary, OutboxItem, PlanTask, TaskUpdate } from "@/lib/types";
import CasePanel from "./CasePanel";
import { checkFiles, Consent, Home, SamplePicker, Upload, Welcome, type TypedDoc } from "./Onboarding";
import type { DemoId } from "@/data/demoList";
import { tr } from "@/lib/es";
import { extractionLabel, extractionTooltip } from "@/lib/labels";
import { STRINGS, type Lang } from "./i18n";

// The consumer app: welcome → consent → your home → upload → the office.
// The 3D office is always there: idle behind the first steps, then the
// immersive dashboard where you watch the agents work your case.

type Step = "welcome" | "samples" | "consent" | "home" | "upload" | "office";
/** A sample household's "a document arrives" moments: which document fills which gap. */
type SampleFollowUp = { id: string; title: string; provides: string };
const SESSION_KEY = "bayoubridge.case";
const LANG_KEY = "bayoubridge.lang";
const SIDE_MIN = 340, SIDE_MAX = 640, SIDE_RAIL = 56; // desktop sidebar: resizable between min/max, or collapsed to a rail
const SIDE_KEY = "bayoubridge.sidebar";

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

/** Where the app opens: its own welcome, straight to consent ("Start a case"), or the sample picker. */
export type CaseAppStart = "welcome" | "consent" | "sample";

export default function CaseApp({ start = "welcome", demo }: { start?: CaseAppStart; demo?: DemoId }) {
  const wide = useWide();
  // The desktop sidebar: drag its left edge to resize, or fold it to a rail. Remembered per browser.
  const [sideW, setSideW] = useState(420);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SIDE_KEY) ?? "null");
      if (v && typeof v.w === "number") { setSideW(Math.min(SIDE_MAX, Math.max(SIDE_MIN, v.w))); setCollapsed(!!v.c); }
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem(SIDE_KEY, JSON.stringify({ w: sideW, c: collapsed })); } catch {} }, [sideW, collapsed]);
  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const w = window.innerWidth - ev.clientX;
      if (w < SIDE_MIN - 90) { setCollapsed(true); return; } // drag far enough right and it folds away
      setCollapsed(false);
      setSideW(Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)));
    };
    const up = () => { setDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const [lang, setLang] = useState<Lang>("en");
  const t = STRINGS[lang];
  const [step, setStep] = useState<Step>("welcome");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [sample, setSample] = useState(false);
  const [household, setHousehold] = useState<{ name: string; address: string } | null>(null);
  const [followUps, setFollowUps] = useState<SampleFollowUp[]>([]);
  const [state, setState] = useState<CaseState | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [tasks, setTasks] = useState<Record<string, TaskUpdate>>({});
  const [mode, setMode] = useState<ExtractionSummary | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [claudeOn, setClaudeOn] = useState<boolean | null>(null);
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
      const d = (await r.json()) as { profile: { name: string; address: string; sample: boolean }; state: CaseState | null; followUps: SampleFollowUp[] };
      setCaseId(id); setSample(d.profile.sample); setHousehold(d.profile); setFollowUps(d.followUps ?? []);
      if (d.state) {
        setState(d.state); setMode(d.state.extraction); setEvents(d.state.events); setStep("office");
        fetch(`/api/outbox?caseId=${id}`).then((x) => x.json()).then((o: { items: OutboxItem[] }) => setOutbox(o.items)).catch(() => {});
      } else if (!d.profile.sample) setStep("upload");
    }).catch(() => {});
  }, []);
  const chooseLang = (l: Lang) => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* storage off */ } };

  // Arriving from the landing page's buttons: skip the welcome card.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || start === "welcome") return;
    opened.current = true;
    if (start === "consent") setStep((s) => (s === "welcome" ? "consent" : s));
    else if (demo) void startSample(demo);
    else setStep((s) => (s === "welcome" ? "samples" : s));
    // startSample is a plain function of this render; this runs once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  /** Run the agents, live. `incremental` reuses what was already read; `newDocs` is how many papers land in the inbox. */
  const run = useCallback(async (id: string, opts: { incremental?: boolean; newDocs: number; addDocumentIds?: string[] }) => {
    const before = opts.incremental ? eventsRef.current : [];
    setRunning(true); setError(null); setApproveError(null); setTasks({});
    if (!opts.incremental) { setState(null); setEvents([]); setMode(null); }
    director.newRun(opts.newDocs);
    const body = { caseId: id, incremental: opts.incremental, addDocumentIds: opts.addDocumentIds };
    const finish = (final: CaseState, extraction: ExtractionSummary) => {
      setState(final); setMode(extraction); setEvents([...before, ...final.events]);
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
  }, [director]);

  async function startSample(which: DemoId) {
    setBusy(true); setError(null);
    try {
      const d = await postJSON<{ caseId: string; profile: { name: string; address: string }; followUps: SampleFollowUp[]; documentCount: number }>(
        "/api/cases", { sample: true, demo: which, language: lang });
      store.set(SESSION_KEY, d.caseId);
      setCaseId(d.caseId); setSample(true); setHousehold(d.profile); setFollowUps(d.followUps); setOutbox([]);
      setStep("office");
      await run(d.caseId, { newDocs: d.documentCount });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  /** The household confirms which of two values is right (a date, a spelling). */
  async function resolve(conflictId: string, value: string) {
    if (!caseId) return;
    setApproveError(null);
    try {
      const d = await postJSON<{ conflicts: CaseState["conflicts"]; plan: PlanTask[]; events: ActivityEvent[] }>("/api/resolve", { caseId, conflictId, value });
      d.events.forEach((e) => director.onEvent(e));
      setState((prev) => prev && { ...prev, conflicts: d.conflicts, plan: d.plan });
      setEvents((x) => [...x, ...d.events]);
    } catch (e) { setApproveError((e as Error).message); }
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

  async function sendFiles(id: string, files: File[], statement = "", typed: TypedDoc[] = []) {
    const form = new FormData();
    for (const f of await Promise.all(files.map(shrinkImage))) form.append("files", f);
    if (statement.trim()) form.append("statement", statement);
    if (typed.length) form.append("typed", JSON.stringify(typed));
    const res = await fetch(`/api/cases/${id}/documents`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `Upload failed (${res.status})`);
    return (data as { documents: unknown[] }).documents.length;
  }

  async function upload(files: File[], statement: string, typed: TypedDoc[]) {
    if (!caseId) return;
    setBusy(true); setError(null);
    try {
      const n = await sendFiles(caseId, files, statement, typed);
      setStep("office");
      await run(caseId, { newDocs: n });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  /** A document arrives later (the one the Follow-up Agent asked for, or any other): read just it, then update the case. */
  async function followUp(picked: File[], typed: TypedDoc[] = []) {
    if (!caseId || running || uploading) return;
    const uploaded = state?.documents.filter((d) => d.source === "upload").length ?? 0;
    const { ok, problems } = checkFiles(picked, lang, MAX_FILES - uploaded);
    setError(problems.length ? problems.join(" ") : null); setNotice(null);
    if (!ok.length && !typed.length) return;
    setUploading(true);
    try {
      const n = await sendFiles(caseId, ok, "", typed);
      setUploading(false);
      setNotice(t.added(n));
      await run(caseId, { incremental: true, newDocs: n });
      setNotice(null);
    } catch (e) { setError((e as Error).message); } finally { setUploading(false); }
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
      setApproveError(`${tr(task.title, lang)}: ${(e as Error).message}`);
    } finally { setApproving(null); }
  }

  async function forget() {
    if (!sample && !window.confirm(t.deleteConfirm)) return;
    setMenu(false);
    if (caseId) await fetch(`/api/cases/${caseId}`, { method: "DELETE" }).catch(() => {});
    store.del(SESSION_KEY);
    setCaseId(null); setState(null); setEvents([]); setOutbox([]); setMode(null); setHousehold(null); setFollowUps([]);
    director.newRun(0);
    setStep("welcome");
    if (!sample) setNotice(t.deleted);
  }

  const minutes = events.reduce((n, e) => n + (e.minutesSaved ?? 0), 0);
  // In a sample case, the document that fills the gap the Follow-up Agent asked about can "arrive".
  const nextSample = (sample && state?.followUp && followUps.find((f) => f.provides === state.followUp!.evidence && !state.documents.some((d) => d.id === f.id))) || null;
  const inOffice = step === "office";
  const sideOpen = !collapsed;
  const side = inOffice && wide ? (sideOpen ? sideW : SIDE_RAIL) : 0;

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden" style={{ ["--side" as string]: `${side}px` }}>
      {/* The office. Full screen on desktop; the top half of the screen on phones. */}
      <Office
        director={director}
        hud={inOffice}
        className="relative h-[56vh] md:fixed md:inset-0 md:h-auto"
        followClass="left-3 top-16 md:left-4 md:top-20"
        chipsClass="inset-x-2 bottom-2 md:left-4 md:right-[calc(var(--side)+16px)] md:bottom-4 transition-[right] duration-300"
        rightInset={side}
      />

      {/* Top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 px-3 py-2 transition-[right] duration-300 md:right-[var(--side)] md:px-4 md:py-3">
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-tide/15 bg-panel/75 shadow-[0_8px_30px_rgb(0_0_0/0.4)] backdrop-blur-md py-1 pl-1 pr-3">
          <Link href="/" aria-label="BayouBridge home" className="shrink-0">
            <Image src="/logo.png" alt="" width={28} height={28} className="size-7 shrink-0" />
          </Link>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-bold text-ink">BayouBridge</div>
            {household && inOffice && <div className="hidden truncate text-[11px] text-muted sm:block">{household.name} · {household.address}</div>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          {inOffice && minutes > 0 && <span className="hidden whitespace-nowrap rounded-full bg-bayou-soft px-2.5 py-1 font-semibold text-tide shadow-sm lg:inline">⏱ {t.minutes(minutes)}</span>}
          {inOffice && mode && !running && (
            <span title={tr(extractionTooltip(mode), lang)}
              className="hidden whitespace-nowrap rounded-full border border-tide/15 bg-panel/75 px-2.5 py-1 font-medium text-muted shadow-sm backdrop-blur-md sm:inline">
              {t.extraction} <b className="text-ink">{tr(extractionLabel(mode), lang)}</b>
            </span>
          )}
          {sample && inOffice && <span className="whitespace-nowrap rounded-full bg-amber-soft px-2.5 py-1 font-medium text-amber shadow-sm" title={t.sampleNote}>{wide && !sideOpen ? t.sampleNote.split(".")[0] : t.sampleShort}</span>}
          <div className="flex overflow-hidden rounded-full border border-tide/15 bg-panel/75 shadow-[0_8px_30px_rgb(0_0_0/0.4)] backdrop-blur-md">
            {(["en", "es"] as const).map((l) => (
              <button key={l} onClick={() => chooseLang(l)} className={`px-2.5 py-1 font-semibold ${lang === l ? "bg-bayou text-white" : "text-muted"}`}>{l.toUpperCase()}</button>
            ))}
          </div>
          {inOffice && (
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu} className="rounded-full border border-tide/15 bg-panel/75 shadow-[0_8px_30px_rgb(0_0_0/0.4)] backdrop-blur-md px-2.5 py-1 font-bold text-ink">⋯</button>
              {menu && (
                <div className="absolute right-0 top-9 w-48 overflow-hidden rounded-xl border border-tide/15 bg-panel/95 text-sm shadow-[0_20px_50px_rgb(0_0_0/0.5)] backdrop-blur-md">
                  <button onClick={forget} className="block w-full px-3 py-2 text-left hover:bg-bg">{sample ? t.menu.restart : t.menu.delete}</button>
                  <Link href="/details" className="block px-3 py-2 hover:bg-bg">{t.menu.details}</Link>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {(error || notice) && (
        <div role="alert" className="fixed inset-x-0 top-16 z-50 mx-auto w-fit max-w-[92vw] rounded-full bg-ink px-4 py-2 text-xs text-night shadow-lg md:top-4">
          {error ? `${t.error}: ${tr(error, lang)}` : notice}
          <button onClick={() => { setError(null); setNotice(null); }} className="ml-3 opacity-70" aria-label="Dismiss">✕</button>
        </div>
      )}

      {step === "welcome" && <Welcome lang={lang} busy={busy} onStart={() => { setNotice(null); setStep("consent"); }} onSample={() => setStep("samples")} />}
      {step === "samples" && <SamplePicker lang={lang} busy={busy} onPick={startSample} onBack={() => setStep("welcome")} />}
      {step === "consent" && <Consent lang={lang} onAgree={() => setStep("home")} onBack={() => setStep("welcome")} />}
      {step === "home" && <Home lang={lang} busy={busy} error={error} onSubmit={createCase} onBack={() => setStep("consent")} />}
      {step === "upload" && <Upload lang={lang} claudeOn={claudeOn} busy={busy} error={error} onSubmit={upload} />}

      {inOffice && (
        <aside aria-label={t.tabs.next}
          className="relative z-30 p-3 md:fixed md:inset-y-0 md:right-0 md:flex md:flex-col md:border-l md:border-tide/15 md:bg-night/80 md:p-0 md:shadow-[-30px_0_80px_rgb(0_0_0/0.45)] md:backdrop-blur-xl"
          style={wide ? { width: side, transition: dragging ? "none" : "width 300ms cubic-bezier(.2,.8,.2,1)" } : undefined}>
          {wide && sideOpen && (
            <div role="separator" aria-orientation="vertical" aria-label="Resize panel" tabIndex={0}
              onPointerDown={startDrag} onDoubleClick={() => setSideW(420)}
              onKeyDown={(e) => { if (e.key === "ArrowLeft") setSideW((w) => Math.min(SIDE_MAX, w + 24)); if (e.key === "ArrowRight") setSideW((w) => Math.max(SIDE_MIN, w - 24)); }}
              className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize">
              <span className="absolute inset-y-0 left-1/2 w-px bg-tide/0 transition group-hover:bg-tide/60 group-focus-visible:bg-tide" />
            </div>
          )}
          {wide && !sideOpen ? (
            <button onClick={() => setCollapsed(false)} aria-label="Open panel" title="Open panel"
              className="flex h-full w-full flex-col items-center gap-3 pt-5 text-muted transition hover:text-tide">
              <span className="grid size-9 place-items-center rounded-full border border-tide/20 text-lg">‹</span>
              <span className="text-xs font-semibold [writing-mode:vertical-rl]">{t.tabs.next}</span>
            </button>
          ) : (
            <CasePanel
              s={state} events={events} tasks={tasks} running={running} lang={lang} outbox={outbox} sample={sample} mode={mode}
              nextSample={nextSample} approving={approving} approveError={approveError} onResolve={resolve}
              onApprove={approve} onUpload={(files) => followUp(files)} onType={(d) => followUp([], [d])} uploading={uploading}
              onArrive={(id) => caseId && run(caseId, { incremental: true, newDocs: 1, addDocumentIds: [id] })}
              onCollapse={wide ? () => setCollapsed(true) : undefined}
            />
          )}
        </aside>
      )}
    </div>
  );
}
