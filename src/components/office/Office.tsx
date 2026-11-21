"use client";

import { tr } from "@/lib/es";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MASCOTS, STATIONS, mascotDef, type MascotId, type OfficeDirector, type StationId } from "@/lib/office/director";
import type { FollowMode, ViewControl } from "./OfficeScene";

// The office view: the 3D scene plus a HUD saying who the camera follows and
// where they're headed. The scene is client-only (WebGL), loaded lazily.

const OfficeScene = dynamic(() => import("./OfficeScene"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Opening the office…</div>,
});

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="grid h-full place-items-center p-4 text-center text-sm text-muted">The 3D office couldn&apos;t load on this device. Everything else still works.</div>;
    return this.props.children;
  }
}

export default function Office({
  director, className = "", hud = true, followClass = "left-3 top-3", chipsClass = "inset-x-2 bottom-2", rightInset = 0,
  follow, interactive = true, lang = "en",
}: {
  /** Language of the overlay text. */
  lang?: "en" | "es";
  director: OfficeDirector; className?: string; hud?: boolean;
  /** Where the "Following" card and the agent chips sit (Tailwind position classes). */
  followClass?: string; chipsClass?: string;
  /** Pixels on the right covered by a panel, so the camera centers the subject in what's left. */
  rightInset?: number;
  /** Set to drive the camera from outside (e.g. the landing page's scroll story). */
  follow?: FollowMode;
  /** false: no drag-to-look or wheel zoom, so the office never captures page scrolling. */
  interactive?: boolean;
}) {
  const es = lang === "es";
  const L = (en: string) => (es ? OFFICE_ES[en] ?? tr(en, "es") : en);
  const snap = useSyncExternalStore(director.subscribe, director.getSnapshot, director.getSnapshot);
  const [chosen, setMode] = useState<FollowMode>("auto");
  const mode = follow ?? chosen;
  const view = useRef<ViewControl>({ az: 0, zoom: 1 });
  const box = useRef<HTMLDivElement>(null);
  // Name tags and station signs: ordinary DOM, positioned each frame by the scene.
  const labels = useRef(new Map<string, HTMLElement>());
  const label = (key: string) => (el: HTMLElement | null) => { if (el) labels.current.set(key, el); else labels.current.delete(key); };

  // Drag sideways to look around; scroll (or pinch-zoom trackpads) to zoom.
  useEffect(() => {
    const el = box.current;
    if (!el || !interactive) return;
    let down: { x: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX }; };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      view.current.az -= (e.clientX - down.x) * 0.006;
      down = { x: e.clientX };
    };
    const onUp = () => { down = null; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.zoom = Math.min(1.7, Math.max(0.55, view.current.zoom * (1 + e.deltaY * 0.001)));
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [interactive]);

  const followed = mode === "auto" ? snap.follow : mode === "overview" ? null : mode;
  const focus = new Set<StationId>(snap.mascots.filter((m) => m.destination && (m.phase !== "idle" || m.id === followed)).map((m) => m.destination!));
  const f = followed ? snap.mascots.find((m) => m.id === followed) : undefined;
  const def = followed ? mascotDef(followed) : undefined;
  const maxScore = Math.max(1, ...snap.mascots.map((m) => m.score));

  return (
    <div ref={box} className={`relative select-none overflow-hidden ${className}`} style={{ touchAction: "pan-y" }}>
      <SceneBoundary>
        <OfficeScene director={director} snap={snap} mode={mode} view={view} onPick={(id: MascotId) => setMode(id)} rightInset={rightInset} labels={labels} />
      </SceneBoundary>

      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
        {(Object.keys(STATIONS) as StationId[]).map((id) => (
          <div key={id} ref={label(`s:${id}`)} style={{ opacity: 0 }}
            className={`absolute left-0 top-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium will-change-transform ${focus.has(id) ? "border border-tide/60 bg-night/85 text-[11px] text-tide shadow-[0_0_16px_rgb(125_211_252/0.45)]" : "border border-tide/15 bg-night/55 text-[10px] text-muted"}`}>
            {L(STATIONS[id].name)}
          </div>
        ))}
        {MASCOTS.map((m) => {
          const s = snap.mascots.find((x) => x.id === m.id);
          const on = followed === m.id;
          // What they're doing right now, as a speech bubble over the name tag. Idle helpers show just their name.
          const doing = s && s.phase !== "idle" && s.label ? (s.phase === "walking" && s.station ? `${L("Heading to")} ${L(s.station)}: ${L(s.label)}` : L(s.label)) : null;
          return (
            <div key={m.id} ref={label(`m:${m.id}`)} style={{ opacity: 0 }}
              className="absolute left-0 top-0 flex w-max max-w-[220px] flex-col items-center gap-1 will-change-transform">
              {doing && (
                <span className="relative line-clamp-2 rounded-xl border bg-night/90 px-2 py-1 text-center text-[11px] font-medium leading-tight text-ink shadow-[0_6px_20px_rgb(0_0_0/0.45)] backdrop-blur-sm"
                  style={{ borderColor: m.color }}>
                  {doing}
                </span>
              )}
              <span style={on ? { background: m.color } : undefined}
                className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-sm ${on ? "border-transparent text-night shadow-[0_0_18px_currentColor]" : "border-tide/20 bg-night/75 text-ink backdrop-blur-sm"}`}>
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: on ? "#06142b" : m.color }} />
                {L(m.name)}
              </span>
            </div>
          );
        })}
      </div>

      {hud && (
        <>
          <div className={`pointer-events-none absolute ${followClass} z-40 max-w-[min(360px,80%)] rounded-2xl border border-tide/20 bg-night/70 px-3 py-2 text-xs shadow-[0_10px_40px_rgb(0_0_0/0.45),inset_0_0_30px_rgb(125_211_252/0.06)] backdrop-blur-md`} aria-live="polite">
            {def && f ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: def.color }} />
                  <span className="text-[11px] text-muted">{L(mode === "auto" ? "Watching the busiest helper" : "Watching")}</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-ink">{L(def.name)}</div>
                <div className="text-muted">
                  {f.phase === "walking" && f.station ? <>{L("Heading to")} <b className="text-ink">{L(f.station)}</b>{f.label ? ` · ${L(f.label)}` : ""}</>
                    : f.phase === "working" ? <>{L(f.label ?? "")} <span className="text-muted">· {L(f.station ?? "")}</span></>
                    : L(def.role)}
                </div>
                {f.queued > 0 && <div className="mt-0.5 hidden text-[11px] text-amber sm:block">{es ? `${f.queued} tarea${f.queued > 1 ? "s" : ""} más en fila` : `${f.queued} more task${f.queued > 1 ? "s" : ""} lined up`}</div>}
              </>
            ) : (
              <>
                <div className="text-[11px] text-muted">{L("The office")}</div>
                <div className="text-ink">{L(snap.mascots.some((m) => m.phase !== "idle") ? "Your helpers are at work. Tap one to watch." : "Everyone is at their desk.")}</div>
              </>
            )}
          </div>

          <div className={`absolute ${chipsClass} z-40 flex flex-wrap items-center justify-center gap-1`}>
            <button onClick={() => setMode("auto")} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm sm:px-2.5 sm:py-1 sm:text-[11px] ${mode === "auto" ? "bg-tide text-night" : "border border-tide/15 bg-night/70 text-ink backdrop-blur-md"}`}>{L("Auto")}</button>
            {MASCOTS.map((m) => {
              const s = snap.mascots.find((x) => x.id === m.id)!;
              const on = mode === m.id;
              return (
                <button key={m.id} onClick={() => setMode(m.id)} title={`${L(m.name)}: ${L(m.role)}`}
                  className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm sm:px-2.5 sm:py-1 sm:text-[11px] ${on ? "text-night" : "border border-tide/15 bg-night/70 text-ink backdrop-blur-md"}`}
                  style={on ? { background: m.color } : undefined}>
                  <span className="h-2 w-2 rounded-full" style={{ background: on ? "#06142b" : m.color, boxShadow: on ? undefined : `0 0 8px ${m.color}` }} />
                  {L(m.name)}
                  <span className="hidden h-1 w-6 overflow-hidden rounded-full bg-white/10 sm:inline-block" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${(s.score / maxScore) * 100}%`, background: on ? "#06142b" : m.color }} />
                  </span>
                </button>
              );
            })}
            <button onClick={() => setMode("overview")} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm sm:px-2.5 sm:py-1 sm:text-[11px] ${mode === "overview" ? "bg-tide text-night" : "border border-tide/15 bg-night/70 text-ink backdrop-blur-md"}`}>{L("Whole office")}</button>
          </div>
        </>
      )}
    </div>
  );
}


/** The office overlay in Spanish. Task labels fall back to the shared phrasebook. */
const OFFICE_ES: Record<string, string> = {
  Organizer: "Organizador", "Paper Reader": "Lector de papeles", "AI Reader": "Lector con IA", "Help Finder": "Buscador de ayuda", Gatekeeper: "Guardián",
  "Keeps the case moving and writes the plan": "Mantiene el caso en marcha y escribe el plan",
  "Reads your papers and checks the details": "Lee sus papeles y revisa los detalles",
  "Reads photos and letters with AI": "Lee fotos y cartas con IA",
  "Finds help you may qualify for and asks what's missing": "Busca ayuda para la que podría calificar y pregunta qué falta",
  "Prepares drafts and holds them until you say OK": "Prepara borradores y los guarda hasta que usted dé el visto bueno",
  "Planning desk": "Escritorio de planes", "Case map": "Mapa del caso", "Case board": "Tablero del caso", "Help library": "Biblioteca de ayuda",
  Phone: "Teléfono", "Drafts table": "Mesa de borradores", "Your OK gate": "Control de su aprobación", "Practice outbox": "Bandeja de práctica",
  "AI reading desk": "Mesa de lectura con IA", "Reading desk": "Mesa de lectura", "Mail tray": "Bandeja de correo", Records: "Archivo",
  "Watching the busiest helper": "Mirando al ayudante más ocupado", Watching: "Mirando", "Heading to": "Va hacia",
  "The office": "La oficina", "Your helpers are at work. Tap one to watch.": "Sus ayudantes están trabajando. Toque uno para verlo.",
  "Everyone is at their desk.": "Todos están en su escritorio.", Auto: "Auto", "Whole office": "Toda la oficina",
};
