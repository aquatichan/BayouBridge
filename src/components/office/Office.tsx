"use client";

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
  follow, interactive = true,
}: {
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
            className={`absolute left-0 top-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium will-change-transform ${focus.has(id) ? "bg-ink text-[11px] text-white" : "bg-white/50 text-[10px] text-muted/80"}`}>
            {STATIONS[id].name}
          </div>
        ))}
        {MASCOTS.map((m) => {
          const s = snap.mascots.find((x) => x.id === m.id);
          const on = followed === m.id;
          return (
            <div key={m.id} ref={label(`m:${m.id}`)} style={{ opacity: 0, ...(on ? { background: m.color } : {}) }}
              className={`absolute left-0 top-0 max-w-[240px] truncate whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-sm will-change-transform ${on ? "border-transparent text-white" : "border-white/70 bg-white/85 text-ink"}`}>
              {m.name}
              {s?.label && <span className={`ml-1 font-normal ${on ? "text-white/85" : "text-muted"}`}>· {s.label}</span>}
            </div>
          );
        })}
      </div>

      {hud && (
        <>
          <div className={`pointer-events-none absolute ${followClass} z-40 max-w-[min(360px,80%)] rounded-2xl border border-white/70 bg-white/85 px-3 py-2 text-xs shadow-sm backdrop-blur`} aria-live="polite">
            {def && f ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: def.color }} />
                  <span className="text-[11px] text-muted">{mode === "auto" ? "Watching the busiest helper" : "Watching"}</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-ink">{def.name}</div>
                <div className="text-muted">
                  {f.phase === "walking" && f.station ? <>Heading to the <b className="text-ink">{f.station}</b>{f.label ? ` · ${f.label}` : ""}</>
                    : f.phase === "working" ? <>{f.label} <span className="text-muted">at the {f.station}</span></>
                    : def.role}
                </div>
                {f.queued > 0 && <div className="mt-0.5 hidden text-[11px] text-amber sm:block">{f.queued} more task{f.queued > 1 ? "s" : ""} lined up</div>}
              </>
            ) : (
              <>
                <div className="text-[11px] text-muted">The office</div>
                <div className="text-ink">{snap.mascots.some((m) => m.phase !== "idle") ? "Your helpers are at work. Tap one to watch." : "Everyone is at their desk."}</div>
              </>
            )}
          </div>

          <div className={`absolute ${chipsClass} z-40 flex flex-wrap items-center justify-center gap-1`}>
            <button onClick={() => setMode("auto")} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm sm:px-2.5 sm:py-1 sm:text-[11px] ${mode === "auto" ? "bg-ink text-white" : "bg-white/85 text-ink"}`}>Auto</button>
            {MASCOTS.map((m) => {
              const s = snap.mascots.find((x) => x.id === m.id)!;
              const on = mode === m.id;
              return (
                <button key={m.id} onClick={() => setMode(m.id)} title={`${m.name}: ${m.role}`}
                  className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm sm:px-2.5 sm:py-1 sm:text-[11px] ${on ? "text-white" : "bg-white/85 text-ink"}`}
                  style={on ? { background: m.color } : undefined}>
                  <span className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : m.color }} />
                  {m.name}
                  <span className="hidden h-1 w-6 overflow-hidden rounded-full bg-black/10 sm:inline-block" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${(s.score / maxScore) * 100}%`, background: on ? "#fff" : m.color }} />
                  </span>
                </button>
              );
            })}
            <button onClick={() => setMode("overview")} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm sm:px-2.5 sm:py-1 sm:text-[11px] ${mode === "overview" ? "bg-ink text-white" : "bg-white/85 text-ink"}`}>Whole office</button>
          </div>
        </>
      )}
    </div>
  );
}

