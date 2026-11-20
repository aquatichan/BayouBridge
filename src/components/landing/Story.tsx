"use client";

import dynamic from "next/dynamic";
import { useInView, useMotionValueEvent, useScroll } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { FollowMode } from "@/components/office/OfficeScene";
import type { MascotId, OfficeDirector, OfficeSnapshot, StationId } from "@/lib/office/director";
import type { CaseState } from "@/lib/types";
import SpotlightCard from "@/components/bits/SpotlightCard";
import BlurText from "@/components/bits/BlurText";
import { tr } from "@/lib/es";
import { LANDING, type Lang } from "./strings";

// Section 2. A card slides up over the hero and sticks while you scroll through
// five steps. Left: the 3D office. Right: one work card per step; the active one
// is highlighted and the office reacts (camera + a mascot walking to its desk).

const Office = dynamic(() => import("@/components/office/Office"), { ssr: false, loading: () => null });

const STEPS = ["summary", "plan", "drafts", "missing", "unblocked"] as const;
type Step = (typeof STEPS)[number];

const FOLLOW: Record<Step, FollowMode> = { summary: "overview", plan: "coordinator", drafts: "approval", missing: "recovery", unblocked: "auto" };
const WALK: Partial<Record<Step, [MascotId, StationId]>> = { plan: ["coordinator", "desk"], drafts: ["approval", "packets"], missing: ["recovery", "phone"] };
const MASCOT_NAMES: Record<MascotId, { name: string; color: string }> = {
  coordinator: { name: "the Organizer", color: "#7fc1b4" }, evidence: { name: "the Paper Reader", color: "#9cc68f" },
  llm: { name: "the AI Reader", color: "#c4b2ec" }, recovery: { name: "the Help Finder", color: "#8fb6e0" }, approval: { name: "the Gatekeeper", color: "#f0a08e" },
};

const noSubscribe = () => () => {};

export default function Story({ lang, sectionRef }: { lang: Lang; sectionRef: RefObject<HTMLElement | null> }) {
  const t = LANDING[lang].story;

  // Which step: from how far you've scrolled through this tall section.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const [index, setIndex] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const i = Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)));
    setIndex((prev) => (prev === i ? prev : i));
  });
  const step = STEPS[index];

  // Load the office and run the sample case only once this section is close.
  const near = useInView(sectionRef, { once: true, margin: "0px 0px 50% 0px" });
  const [director, setDirector] = useState<OfficeDirector | null>(null);
  const [before, setBefore] = useState<CaseState | null>(null);
  const [after, setAfter] = useState<CaseState | null>(null);
  useEffect(() => {
    if (!near) return;
    let live = true;
    Promise.all([import("@/lib/office/director"), import("./story-run")]).then(async ([{ OfficeDirector }, run]) => {
      if (!live) return;
      const d = new OfficeDirector();
      d.newRun(6);
      setDirector(d);
      const s = await run.runSample({ onTask: (u) => d.onTask(u), onEvent: (e) => d.onEvent(e) });
      if (live) setBefore(s);
    });
    return () => { live = false; };
  }, [near]);

  // The office reacts to the highlighted card: someone walks to the desk that card is about.
  useEffect(() => {
    if (!director || !before) return;
    const walk = WALK[step];
    if (!walk) return;
    const [mascot, station] = walk;
    const key = `story:${step}`;
    const m = director.mascots[mascot];
    if (m.job?.key === key || m.queue.some((j) => j.key === key)) return;
    const label = step === "plan" ? t.jobs.plan(before.plan.length) : step === "drafts" ? t.jobs.drafts(before.packets.length) : t.jobs.missing;
    director.addJob(mascot, { key, station, label, done: true, minMs: 2500 });
  }, [step, director, before, t]);

  // The last card: the electric bill arrives, only it gets read, and the FEMA appeal unblocks.
  const billStarted = useRef(false);
  const gateLabel = useRef(t.jobs.gate);
  gateLabel.current = t.jobs.gate;
  useEffect(() => {
    if (step !== "unblocked" || !director || !before || billStarted.current) return;
    billStarted.current = true;
    import("./story-run").then(async (run) => {
      director.newRun(1);
      const s = await run.runWithBill(before, { onTask: (u) => director.onTask(u), onEvent: (e) => director.onEvent(e) });
      setAfter(s);
      // Then Approval Gates opens the gate for the appeal (the arm lifts).
      window.setTimeout(() => director.addJob("approval", { key: "approve", station: "gate", label: gateLabel.current, done: true, minMs: 3500 }), 1200);
    });
  }, [step, director, before]);

  const snap = useSyncExternalStore<OfficeSnapshot | null>(director?.subscribe ?? noSubscribe, () => director?.getSnapshot() ?? null, () => null);
  const follow = FOLLOW[step];
  const followed = follow === "auto" ? snap?.follow ?? null : follow === "overview" ? null : follow;
  const followedLabel = followed ? snap?.mascots.find((x) => x.id === followed)?.label : undefined;
  const unblocked = step === "unblocked" && !!after;

  // Keep the active card in the middle of the column.
  const column = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const cards = useRef<(HTMLLIElement | null)[]>([]);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const update = () => {
      const c = column.current, l = list.current, el = cards.current[index];
      if (!c || !l || !el) return;
      const centered = c.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2);
      setShift(Math.min(0, Math.max(Math.min(0, c.clientHeight - l.offsetHeight), centered)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [index, before, after, lang]);

  const fema = before?.matches.find((m) => m.programId === "fema-appeal");
  const femaAfter = after?.matches.find((m) => m.programId === "fema-appeal");

  return (
    <section ref={sectionRef} id="how" aria-labelledby="story-title" className="relative z-10" style={{ height: `calc(100svh + ${STEPS.length} * 72svh)` }}>
      <div className="sticky top-0 h-[100svh] px-[var(--frame)] pb-[var(--frame)] pt-[calc(var(--frame)+76px)]">
        <div className="card-night flex h-full flex-col gap-4 rounded-[var(--radius)] p-3 text-cream md:grid md:grid-cols-[minmax(0,1fr)_minmax(300px,34%)] md:gap-6 md:p-6">

          {/* The office */}
          <div className={`relative min-h-0 flex-[1_1_46%] overflow-hidden rounded-[20px] border transition-shadow duration-700 md:h-full ${unblocked ? "border-sun/70 shadow-[0_0_70px_rgb(245_181_68/0.28)]" : "border-white/10"}`}>
            {director
              ? <Office director={director} hud={false} follow={follow} interactive={false} className="h-full w-full" />
              : <div className="grid h-full place-items-center bg-[#f5f1e8] text-sm text-[#5d6b69]">{t.loading}</div>}
            <div className="pointer-events-none absolute bottom-3 left-3 z-30 flex max-w-[85%] items-center gap-2 rounded-full bg-night/80 px-3 py-1.5 text-xs text-cream backdrop-blur" aria-live="polite">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: followed ? MASCOT_NAMES[followed].color : "#7dd3fc" }} />
              <span className="truncate">
                {followed ? <><b>{t.office.following} {MASCOT_NAMES[followed].name}</b>{followedLabel ? ` · ${followedLabel}` : ""}</> : <b>{t.office.overview}</b>}
              </span>
            </div>
          </div>

          {/* The work cards */}
          <div className="flex min-h-0 flex-1 flex-col md:h-full">
            <div className="px-1 pt-1 md:pt-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="kicker text-tide">{t.kicker}</p>
                <p className="text-sm tabular-nums text-cream/60">{index + 1} of {STEPS.length}</p>
              </div>
              <h2 id="story-title" className="mt-2 hidden md:block">
                <BlurText key={lang} text={t.title.join("").trim()} animateBy="words" trigger="view" delay={60}
                  accent={[t.title.join("").trim().split(/\s+/).length - 1]} accentClassName="accent text-tide"
                  className="headline text-[clamp(1.6rem,2.6vw,2.6rem)]" />
              </h2>
              <p className="mt-2 hidden text-sm text-cream/60 md:block">{t.note}</p>
            </div>

            <div ref={column} className="relative mt-4 min-h-0 flex-1 overflow-hidden md:mt-6">
              <ol ref={list} className="relative space-y-3 motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-[cubic-bezier(.2,.8,.2,1)]" style={{ transform: `translateY(${shift}px)` }}>
                {STEPS.map((key, i) => {
                  const active = i === index;
                  const glow = key === "unblocked" && unblocked;
                  return (
                    <li key={key} ref={(el) => { cards.current[i] = el; }} aria-current={active ? "step" : undefined}
                      className={`origin-center transition duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${active ? "scale-100 opacity-100" : "scale-[0.94] opacity-35"} ${glow ? "unlock" : ""}`}>
                      <SpotlightCard theme="dark" spotlightColor={glow ? "rgba(245,181,68,0.35)" : "rgba(125,211,252,0.25)"}
                        className={`rounded-[22px] p-5 ${glow ? "ring-1 ring-sun/70" : active ? "ring-1 ring-tide/40" : ""}`}
                        style={{ "--spotlight-card-surface": "linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.015)), #0d3156" } as React.CSSProperties}>
                        <Card step={key} t={t} lang={lang} before={before} fema={fema} femaAfter={femaAfter} unblocked={glow} />
                      </SpotlightCard>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type T = (typeof LANDING)["en"]["story"];
type Match = CaseState["matches"][number] | undefined;

function Badge({ children, tone = "tide" }: { children: React.ReactNode; tone?: "tide" | "sun" | "plain" }) {
  const cls = tone === "sun" ? "bg-sun text-night" : tone === "plain" ? "border border-white/15 text-cream/70" : "bg-tide/15 text-tide";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

function Card({ step, t, lang, before, fema, femaAfter, unblocked }: {
  step: Step; t: T; lang: Lang; before: CaseState | null; fema: Match; femaAfter: Match; unblocked: boolean;
}) {
  const s = t.steps[step];
  const head = (badge: React.ReactNode) => (
    <div className="mb-2 flex items-start justify-between gap-3">
      <h3 className="text-base font-semibold tracking-tight md:text-lg">{s.label}</h3>
      {badge}
    </div>
  );
  if (!before) return <>{head(<Badge tone="plain">…</Badge>)}<div className="h-10 animate-pulse rounded-xl bg-white/5" /></>;

  switch (step) {
    case "summary":
      return (
        <>
          {head(<Badge>{t.steps.summary.badge}</Badge>)}
          <p className="line-clamp-2 text-sm leading-relaxed text-cream/60">{t.summary(before.documents.length)}</p>
          <p className="mt-1 line-clamp-1 text-sm text-cream">{t.summaryStats(before.matches.length)}</p>
        </>
      );
    case "plan":
      return (
        <>
          {head(<Badge>{t.steps.plan.badge(before.plan.length)}</Badge>)}
          <ul className="space-y-1.5 text-sm">
            {before.plan.slice(0, 3).map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3">
                <span className="line-clamp-1 text-cream/80">{tr(task.title, lang)}</span>
                <span className="shrink-0 text-xs font-medium text-tide">{t.owners[task.owner] ?? task.owner}</span>
              </li>
            ))}
          </ul>
        </>
      );
    case "drafts":
      return (
        <>
          {head(<Badge>{t.steps.drafts.badge}</Badge>)}
          <ul className="space-y-1 text-sm">
            {before.packets.slice(0, 2).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="line-clamp-1 text-cream/80">{tr(p.title.replace(/: packet$/, ""), lang)}</span>
                <span className="shrink-0 text-xs text-cream/60">{t.attachments(p.attachments.length)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm text-cream">{t.nothingSent}</p>
        </>
      );
    case "missing":
      return (
        <>
          {head(<Badge tone="plain">{t.steps.missing.badge}</Badge>)}
          <p className="line-clamp-1 text-sm text-cream">{fema?.blockedBy[0] ? tr(fema.blockedBy[0], lang) : "—"}</p>
          <p className="line-clamp-2 text-sm leading-relaxed text-cream/60">{before.followUp?.[lang] ?? (fema ? t.blocks(tr(fema.name, lang)) : "")}</p>
        </>
      );
    case "unblocked": {
      const pct = Math.round(((unblocked ? femaAfter : fema)?.readiness ?? 0) * 100);
      return (
        <>
          {head(unblocked ? <Badge tone="sun">{t.steps.unblocked.badge}</Badge> : <Badge tone="plain">{t.steps.unblocked.waiting}</Badge>)}
          <p className="line-clamp-2 text-sm leading-relaxed text-cream/60">{unblocked ? t.arrived : t.arriving}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full transition-[width] duration-1000 ease-out ${unblocked ? "bg-sun" : "bg-tide"}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-sm font-semibold tabular-nums ${unblocked ? "text-sun" : "text-cream/60"}`}>{pct}%</span>
          </div>
          {unblocked && femaAfter && <p className="mt-1 line-clamp-1 text-sm text-cream">{t.ready(tr(femaAfter.name, lang))}</p>}
        </>
      );
    }
  }
}
