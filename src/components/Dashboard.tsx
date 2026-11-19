"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityEvent, AgentName, CaseDocument, CaseState, ExtractionSummary, OutboxItem, PlanTask, TaskUpdate } from "@/lib/types";
import { extractionLabel, extractionTooltip } from "@/lib/labels";
import RecoveryGraph from "./RecoveryGraph";
import Office from "./office/Office";
import { OfficeDirector } from "@/lib/office/director";

type Household = { caseId: string; name: string; address: string; disaster: string };

const AGENT_COLOR: Record<AgentName, string> = {
  Coordinator: "bg-bayou text-white",
  "Evidence Agent": "bg-moss text-white",
  "Recovery-Match Agent": "bg-[#2f5d8a] text-white",
  "Packet Agent": "bg-[#6b4f8a] text-white",
  "Follow-up Agent": "bg-amber text-white",
  "Safety Agent": "bg-clay text-white",
};

const KIND_ICON: Record<CaseDocument["kind"], string> = {
  photo: "📷", estimate: "🧾", fema_letter: "✉️", insurance_email: "📧", voice_note: "🎙️", utility_bill: "💡",
  bank_statement: "🏦", lease: "🏠", id_card: "🪪", insurance_policy: "📄", medical_letter: "🩺", receipt: "🧾", other: "📎",
};

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function daysLeft(today: string, iso: string) {
  return Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
}

function Card({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-panel p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Spinner() {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />;
}

/** Split an SSE text buffer into complete frames; returns the frames and the unfinished rest. */
function parseSSE(buf: string): { frames: { event: string; data: string }[]; rest: string } {
  const frames: { event: string; data: string }[] = [];
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const raw = buf.slice(0, i);
    buf = buf.slice(i + 2);
    let event = "message";
    const data: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) frames.push({ event, data: data.join("\n") }); // comment-only frames are keep-alives
  }
  return { frames, rest: buf };
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{children}</p>;
}

export default function Dashboard({ household, documents, followUps, today }: {
  household: Household; documents: CaseDocument[]; followUps: CaseDocument[]; today: string;
}) {
  const [state, setState] = useState<CaseState | null>(null);
  const [mode, setMode] = useState<ExtractionSummary | null>(null);
  // `events` is the activity feed shown so far; `queue` holds events still to replay
  // (only used by the non-streaming fallback). `tasks` is live agent status from the stream.
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [queue, setQueue] = useState<ActivityEvent[]>([]);
  const [tasks, setTasks] = useState<Record<string, TaskUpdate>>({});
  const [fetching, setFetching] = useState(false);
  const running = fetching || queue.length > 0;
  const [error, setError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "es">("en");
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [approving, setApproving] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const feedRef = useRef<HTMLOListElement>(null);
  // Drives the 3D office: every task and event becomes a mascot walking somewhere to work.
  const director = useMemo(() => new OfficeDirector(), []);

  /**
   * Run the agents. With `addDocumentIds` (a follow-up document arriving) the
   * dashboard stays on screen, the cards update in place and the new run's
   * events are appended to the log. Otherwise it starts from a clean slate.
   */
  async function run(addDocumentIds?: string[]) {
    const followUp = Boolean(addDocumentIds?.length);
    const before = followUp ? events : []; // a follow-up run's events are appended to these
    setFetching(true); setError(null); setQueue([]); setTasks({});
    setApproveError(null);
    director.newRun(followUp ? addDocumentIds!.length : documents.length);
    if (!followUp) { setState(null); setEvents([]); setMode(null); }
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(followUp ? { addDocumentIds } : {}),
    };
    try {
      if (!(await runStreamed(init, before, followUp))) await runReplayed(init, before);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFetching(false); setTasks({});
    }
  }

  /** Live run over SSE. Returns false (without throwing) if streaming isn't available, so the caller can fall back. */
  async function runStreamed(init: RequestInit, before: ActivityEvent[], followUp: boolean): Promise<boolean> {
    let res: Response;
    try { res = await fetch("/api/run/stream", init); } catch { return false; }
    if (res.status === 400) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Bad request");
    if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("text/event-stream")) return false;
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return false; // the stream ended without a "done" frame
        const parsed = parseSSE(buf + value);
        buf = parsed.rest;
        for (const f of parsed.frames) {
          const data = JSON.parse(f.data);
          if (f.event === "task") { director.onTask(data as TaskUpdate); setTasks((t) => ({ ...t, [data.id]: data as TaskUpdate })); }
          else if (f.event === "agent") { director.onEvent(data as ActivityEvent); setEvents((ev) => [...ev, data as ActivityEvent]); }
          else if (f.event === "state") {
            const part = data as Partial<CaseState>;
            setState((prev) => {
              // The first frame is the empty starting state. On a follow-up run keep the
              // current cards and take only the new document list; slices replace the rest.
              if (part.caseId && prev && followUp) return { ...prev, documents: part.documents ?? prev.documents };
              return { ...(prev ?? (part as CaseState)), ...part };
            });
          } else if (f.event === "done") {
            const d = data as { state: CaseState; extraction: ExtractionSummary };
            setState(d.state); setMode(d.extraction); setEvents([...before, ...d.state.events]);
            return true;
          } else if (f.event === "error") return false;
        }
      }
    } catch {
      return false;
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  /** Fallback: run on /api/run and replay the finished log one event at a time. */
  async function runReplayed(init: RequestInit, before: ActivityEvent[]) {
    const res = await fetch("/api/run", init);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = (await res.json()) as { state: CaseState; extraction: ExtractionSummary };
    setEvents(before); setState(data.state); setMode(data.state.extraction ?? data.extraction); setQueue(data.state.events);
  }

  // Replay the agent log one event at a time so the run is watchable.
  useEffect(() => {
    if (!queue.length) return;
    const t = setTimeout(() => {
      director.onEvent(queue[0]);
      setEvents((ev) => [...ev, queue[0]]);
      setQueue((q) => q.slice(1));
    }, events.length === 0 ? 150 : 420);
    return () => clearTimeout(t);
  }, [queue, events.length, director]);

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }); }, [events]);

  const has = (action: string) => events.some((e) => e.action === action);
  const readDocs = new Set(events.filter((e) => e.action.startsWith("Read ") || e.action.startsWith("Reused ")).flatMap((e) => e.refs ?? []));
  const minutes = events.reduce((s, e) => s + (e.minutesSaved ?? 0), 0);
  // Agents working right now. A document's spinner stops as soon as its "Read" event is in.
  const working = Object.values(tasks).filter((t) => t.status === "started" && !(t.id.startsWith("extract:") && readDocs.has(t.id.slice(8))));

  const s = state;
  const docs = s?.documents ?? documents;
  const doc = openDoc ? docs.find((d) => d.id === openDoc) : null;
  const docFacts = s?.extractions.find((x) => x.docId === openDoc)?.facts ?? [];

  // The synthetic electric bill the Follow-up Agent is asking for, if it hasn't arrived yet.
  const bill = followUps.find((d) => d.kind === "utility_bill" && !docs.some((x) => x.id === d.id));
  const canSendBill = Boolean(s && !running && bill && s.followUp?.evidence === "proof_of_occupancy");
  const fema = s?.matches.find((m) => m.programId === "fema-appeal");
  const cheer = !running && fema?.readiness === 1 && docs.length > documents.length
    ? "The FEMA appeal has every document it needs now." : undefined;

  // The sandbox outbox lives on the server, so it is still there after a page refresh.
  useEffect(() => {
    fetch(`/api/outbox?caseId=${encodeURIComponent(household.caseId)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: OutboxItem[] }) => setOutbox(d.items))
      .catch(() => {});
  }, [household.caseId]);

  /** Approval is recorded by the server, which checks the task against the plan it produced. */
  async function approve(t: PlanTask) {
    setApproveError(null); setApproving(t.id);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: household.caseId, taskId: t.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Server returned ${res.status}`);
      const { task, events: approvalEvents, item } = data as { task: PlanTask; events: ActivityEvent[]; item: OutboxItem };
      setState((prev) => prev && {
        ...prev,
        plan: prev.plan.map((x) => (x.id === task.id ? task : x)),
        packets: prev.packets.map((p) => (p.id === item.packet.id ? item.packet : p)),
      });
      approvalEvents.forEach((e) => director.onEvent(e));
      setEvents((ev) => [...ev, ...approvalEvents]);
      setOutbox((o) => (o.some((x) => x.id === item.id) ? o : [...o, item]));
    } catch (e) {
      setApproveError(`Couldn't approve "${t.title}": ${(e as Error).message}`);
    } finally {
      setApproving(null);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-line bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
              <rect width="32" height="32" rx="8" fill="#0f4c4a" />
              <path d="M5 20 Q16 6 27 20" stroke="#f5f1e8" strokeWidth="2.2" fill="none" />
              <path d="M9 20v-4M13 20v-7M16 20v-8M19 20v-7M23 20v-4" stroke="#f5f1e8" strokeWidth="1.4" />
              <path d="M3 24 q3 -2 6 0 t6 0 t6 0 t6 0 t3 0" stroke="#7fc1b4" strokeWidth="1.8" fill="none" />
            </svg>
            <div>
              <div className="text-lg font-bold leading-none text-bayou">BayouBridge</div>
              <div className="text-[11px] text-muted">Disaster-recovery casework autopilot</div>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-amber-soft px-2.5 py-1 font-medium text-amber">Synthetic demo data</span>
            <span className="rounded-full border border-line px-2.5 py-1 text-muted">Demo date {fmtDate(today)}</span>
            {mode && <span className="rounded-full border border-line px-2.5 py-1 text-muted" title={extractionTooltip(mode)}>Extraction: {extractionLabel(mode)}</span>}
            <span className="rounded-full bg-bayou-soft px-2.5 py-1 font-semibold text-bayou" title="Estimated minutes of manual casework done by agents">
              ⏱ {minutes} min saved
            </span>
            <button onClick={() => run()} disabled={running}
              className="rounded-full bg-bayou px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b3a39] disabled:opacity-60">
              {running ? "Agents working…" : s ? "Run again" : "Run agents"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        {error && <p className="rounded-xl bg-clay-soft p-3 text-sm text-clay">Run failed: {error}</p>}
        {s && s.warnings?.length > 0 && (
          <div role="status" className="rounded-xl border border-amber/40 bg-amber-soft p-3 text-sm text-ink">
            <b className="text-amber">Some steps didn&apos;t finish.</b> The rest of the case is still usable. Check these before acting:
            <ul className="mt-1 list-disc pl-5 text-xs text-muted">{s.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        {/* The office: the agents at work, in 3D */}
        <section className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_1px_0_rgba(0,0,0,0.03)]">
          <Office director={director} className="h-[340px] md:h-[480px]" />
        </section>

        {/* Case header */}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted">Case {household.caseId} · {household.disaster}</p>
            <h1 className="text-2xl font-bold text-ink">{household.name}</h1>
            <p className="text-sm text-muted">{household.address}</p>
          </div>
          {s && has("Scored evidence") && (
            <div className="fade-up flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-2">
              <div className="relative h-12 w-12">
                <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#e2dccd" strokeWidth="4" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#0f4c4a" strokeWidth="4" strokeDasharray={`${(s.evidenceScore / 100) * 94.2} 94.2`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 grid place-items-center text-xs font-bold">{s.evidenceScore}%</span>
              </div>
              <div className="text-xs">
                <div className="font-semibold">Evidence on file</div>
                <div className="text-muted">across {s.matches.length} pathways</div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Household */}
          <Card title="Household">
            {s && has("Resolved people") ? (
              <ul className="fade-up space-y-2">
                {s.people.map((p) => (
                  <li key={p.name} className="flex items-start justify-between gap-2 text-sm">
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      {p.aliases.length > 0 && <div className="text-xs text-amber">Also appears as: {p.aliases.join(", ")}</div>}
                    </div>
                    <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-xs text-muted">{p.role}</span>
                  </li>
                ))}
              </ul>
            ) : <Waiting>People are pulled from the documents.</Waiting>}
          </Card>

          {/* Urgent needs */}
          <Card title="Urgent needs">
            {s && has("Built needs list") ? (
              <ul className="fade-up space-y-2">
                {s.needs.map((n) => (
                  <li key={n.key} className="flex items-center gap-2 text-sm">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${n.urgency === "critical" ? "bg-clay" : n.urgency === "high" ? "bg-amber" : "bg-moss"}`} />
                    <span className="flex-1">{n.label}</span>
                    <span className="text-xs text-muted">{n.supportedBy.length} source{n.supportedBy.length > 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <Waiting>Needs come from damage, letters and the voice note.</Waiting>}
          </Card>

          {/* Next question */}
          <Card title="Best next question" right={
            <div className="flex overflow-hidden rounded-full border border-line text-xs">
              {(["en", "es"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-0.5 ${lang === l ? "bg-bayou text-white" : "text-muted"}`}>{l === "en" ? "English" : "Español"}</button>
              ))}
            </div>
          }>
            {cheer && (
              <p role="status" className="fade-up mb-2 flex items-center gap-2 rounded-xl bg-moss p-3 text-sm font-semibold text-white">
                <span aria-hidden>🔓</span>{cheer}
              </p>
            )}
            {s?.followUp && has("Scored evidence") ? (
              <div className="fade-up space-y-2">
                <p className="rounded-xl bg-bayou-soft p-3 text-sm leading-relaxed text-ink">“{s.followUp[lang]}”</p>
                <p className="text-xs text-muted">Why this one: {s.followUp.why}</p>
                {canSendBill && bill && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                    <button onClick={() => run([bill.id])} disabled={running}
                      className="rounded-full bg-amber px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-60">
                      💡 Electric bill arrives
                    </button>
                    <span className="text-[11px] text-muted">Simulates the household forwarding “{bill.title}” (synthetic).</span>
                  </div>
                )}
              </div>
            ) : <Waiting>The Follow-up Agent asks for the one thing that unblocks the most.</Waiting>}
          </Card>
        </div>

        {/* Graph */}
        <Card title="Recovery graph" right={<span className="text-xs text-muted">Hover a box to trace it. Red dashed = missing evidence blocking a pathway.</span>}>
          {s && has("Updated recovery graph") ? (
            <div className="fade-up"><RecoveryGraph nodes={s.graph.nodes} edges={s.graph.edges} /></div>
          ) : <Waiting>The graph links every document to the needs, pathways and deadlines it supports.</Waiting>}
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* Pathways */}
            <Card title="Possible recovery pathways" right={<span className="text-xs text-muted">From a curated, cited source list. Not eligibility decisions.</span>}>
              {s && has("Matched recovery pathways") ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {s.matches.map((m) => (
                    <article key={m.programId} className="fade-up flex flex-col rounded-xl border border-line p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold">{m.name}</h3>
                        <span className="shrink-0 rounded-full bg-bayou-soft px-2 py-0.5 text-[11px] font-medium text-bayou">Possible match</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-bayou transition-all duration-700" style={{ width: `${m.readiness * 100}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-muted">
                        <span>{Math.round(m.readiness * 100)}% of evidence on file</span>
                        {m.deadline && <span className={daysLeft(today, m.deadline.date) <= 7 ? "font-semibold text-clay" : "text-amber"}>Due {fmtDate(m.deadline.date)} · {daysLeft(today, m.deadline.date)} days</span>}
                      </div>
                      <ul className="mt-2 space-y-1 text-xs">
                        {m.evidence.map((e) => (
                          <li key={e.type} className="flex gap-1.5">
                            <span>{e.satisfiedBy.length ? "✅" : "⛔"}</span>
                            <span className={e.satisfiedBy.length ? "" : "text-clay"}>
                              {e.label}
                              {e.hint && <span className="block text-amber">Household says they have it: {e.hint}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-muted">{m.caveat}</p>
                      <a href={m.source.url} target="_blank" rel="noreferrer" className="mt-auto pt-2 text-xs font-medium text-bayou underline underline-offset-2">Source: {m.source.label} ↗</a>
                    </article>
                  ))}
                </div>
              ) : <Waiting>The Recovery-Match Agent checks rules for each pathway. It doesn&apos;t guess.</Waiting>}
            </Card>

            {/* Conflicts */}
            {s && has("Checked for conflicts") && s.conflicts.length > 0 && (
              <Card title="Conflicts found" className="fade-up">
                <div className="grid gap-3 md:grid-cols-2">
                  {s.conflicts.map((c) => (
                    <div key={c.id} className="rounded-xl border border-amber/40 bg-amber-soft/50 p-3 text-sm">
                      <div className="font-semibold">{c.field}</div>
                      <ul className="my-1 text-xs">
                        {c.values.map((v, i) => (
                          <li key={i}><b>{v.value}</b> <span className="text-muted">in {docs.find((d) => d.id === v.docId)?.title}</span></li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted">{c.impact}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Plan */}
            <Card title="Recovery plan" right={<span className="text-xs text-muted">Nothing goes out without approval</span>}>
              {approveError && <p role="alert" className="mb-2 rounded-xl bg-clay-soft p-2 text-xs text-clay">{approveError}</p>}
              {s && has("Built recovery plan") ? (
                <ol className="space-y-2">
                  {s.plan.map((t, i) => (
                    <li key={t.id} className="fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg text-xs font-bold text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{t.title}</div>
                        <div className="text-xs text-muted">{t.owner}{t.due ? ` · due ${fmtDate(t.due)}` : ""} · {t.detail}</div>
                      </div>
                      {t.status === "blocked" && <span className="rounded-full bg-clay-soft px-2 py-0.5 text-[11px] font-medium text-clay">Blocked</span>}
                      {t.status === "ready" && <span className="rounded-full bg-bayou-soft px-2 py-0.5 text-[11px] font-medium text-bayou">Ready</span>}
                      {t.status === "needs_approval" && (t.approved
                        ? <span className="rounded-full bg-moss px-2 py-0.5 text-[11px] font-medium text-white">Approved · in sandbox outbox</span>
                        : <button onClick={() => approve(t)} disabled={running || approving === t.id} className="rounded-full border border-bayou px-3 py-1 text-xs font-semibold text-bayou hover:bg-bayou hover:text-white disabled:opacity-50">Approve</button>)}
                    </li>
                  ))}
                </ol>
              ) : <Waiting>Tasks are ordered by safety, then deadline.</Waiting>}
            </Card>
          </div>

          <div className="space-y-4">
            {/* Activity */}
            <Card title="Agent activity">
              {working.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1" aria-live="polite">
                  {working.map((t) => (
                    <span key={t.id} className="flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[10px] text-muted">
                      <Spinner /> {t.agent}: {t.label}
                    </span>
                  ))}
                </div>
              )}
              {events.length ? (
                <ol ref={feedRef} className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {events.map((e, i) => (
                    <li key={i} className="fade-up text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${AGENT_COLOR[e.agent]}`}>{e.agent}</span>
                        <span className="font-semibold">{e.action}</span>
                        {e.minutesSaved ? <span className="ml-auto text-muted">+{e.minutesSaved}m</span> : null}
                      </div>
                      <p className="mt-0.5 text-muted">{e.detail}</p>
                    </li>
                  ))}
                </ol>
              ) : <Waiting>Press <b>Run agents</b> to start the case.</Waiting>}
            </Card>

            {/* Sandbox outbox */}
            <Card title={`Sandbox outbox (${outbox.length})`} right={<span className="text-xs text-muted">Simulated. Nothing is sent.</span>}>
              {outbox.length ? (
                <ul className="space-y-2">
                  {outbox.map((o) => (
                    <li key={o.id} className="fade-up rounded-xl border border-line p-2.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <b className="text-sm">{o.packet.title}</b>
                        <span className="shrink-0 rounded-full bg-moss px-2 py-0.5 text-[10px] font-medium text-white">Queued</span>
                      </div>
                      <div className="text-muted">To {o.packet.to} · approved by {o.approvedBy}</div>
                      <div className="mt-1 text-muted">Attached: {o.packet.attachments.map((a) => a.title).join(", ")}</div>
                      <p className="mt-1.5 rounded-lg bg-bg p-2 leading-relaxed">{o.packet.bilingualCover[lang]}</p>
                    </li>
                  ))}
                </ul>
              ) : <Waiting>Approved packets wait here. BayouBridge never sends anything for real.</Waiting>}
            </Card>

            {/* Evidence locker */}
            <Card title={`Uploaded files (${docs.length})`}>
              <ul className="space-y-1.5">
                {docs.map((d) => {
                  const read = readDocs.has(d.id);
                  const n = s?.extractions.find((x) => x.docId === d.id)?.facts.length ?? 0;
                  return (
                    <li key={d.id}>
                      <button onClick={() => setOpenDoc(d.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-bg">
                        <span aria-hidden>{KIND_ICON[d.kind]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{d.title}</span>
                          <span className="block truncate text-[11px] text-muted">{d.filename}{d.language === "es" ? " · Spanish" : ""}</span>
                        </span>
                        <span className={`flex items-center gap-1 text-[11px] ${read ? "text-moss" : "text-muted"}`}>
                          {read ? (n ? `${n} facts` : "read") : tasks[`extract:${d.id}`]?.status === "started" ? <><Spinner /> reading…</> : "queued"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>
      </main>

      {/* Document drawer */}
      {doc && (
        <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={() => setOpenDoc(null)}>
          <aside className="fade-up h-full w-full max-w-lg overflow-y-auto bg-panel p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{doc.title}</h2>
                <p className="text-xs text-muted">{doc.filename} · received {fmtDate(doc.receivedAt)}</p>
              </div>
              <button onClick={() => setOpenDoc(null)} className="rounded-full border border-line px-3 py-1 text-sm">Close</button>
            </div>
            {doc.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.preview} alt={`Synthetic illustration: ${doc.title}`} className="mb-3 w-full rounded-xl border border-line" />
            )}
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{doc.kind === "voice_note" ? "Transcript" : doc.kind === "photo" ? "Vision description" : "Text (OCR)"}</h3>
            <pre className="whitespace-pre-wrap rounded-xl bg-bg p-3 font-mono text-[12px] leading-relaxed">
              {doc.text.split("\n").map((line, i) => {
                const hit = docFacts.some((f) => f.quote && line.includes(f.quote.slice(0, 40)));
                return <span key={i} className={hit ? "rounded bg-amber-soft" : ""}>{line}{"\n"}</span>;
              })}
            </pre>
            <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Extracted facts</h3>
            {docFacts.length ? (
              <ul className="space-y-1.5">
                {docFacts.map((f) => (
                  <li key={f.id} className="rounded-lg border border-line p-2 text-xs">
                    <div className="flex justify-between gap-2"><b>{f.label}</b><span className="text-muted">{Math.round(f.confidence * 100)}%</span></div>
                    <div>{f.value}</div>
                  </li>
                ))}
              </ul>
            ) : <Waiting>Run the agents to extract facts from this file.</Waiting>}
          </aside>
        </div>
      )}

      <footer className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3 px-4 pb-6 pt-2 text-xs text-muted">
        <p className="max-w-2xl">
          BayouBridge uses only synthetic households and fabricated documents. It suggests possible pathways from cited
          sources and never decides eligibility or submits anything without a person&apos;s approval.
        </p>
      </footer>
    </div>
  );
}
