"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MASCOTS, mascotDef, type MascotId, type OfficeDirector } from "@/lib/office/director";
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

export default function Office({ director, className = "", hud = true }: { director: OfficeDirector; className?: string; hud?: boolean }) {
  const snap = useSyncExternalStore(director.subscribe, director.getSnapshot, director.getSnapshot);
  const [mode, setMode] = useState<FollowMode>("auto");
  const view = useRef<ViewControl>({ az: 0, zoom: 1 });
  const box = useRef<HTMLDivElement>(null);

  // Drag sideways to look around; scroll (or pinch-zoom trackpads) to zoom.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
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
  }, []);

  const followed = mode === "auto" ? snap.follow : mode === "overview" ? null : mode;
  const f = followed ? snap.mascots.find((m) => m.id === followed) : undefined;
  const def = followed ? mascotDef(followed) : undefined;
  const maxScore = Math.max(1, ...snap.mascots.map((m) => m.score));

  return (
    <div ref={box} className={`relative select-none overflow-hidden ${className}`} style={{ touchAction: "pan-y" }}>
      <SceneBoundary>
        <OfficeScene director={director} snap={snap} mode={mode} view={view} onPick={(id: MascotId) => setMode(id)} />
      </SceneBoundary>

      {hud && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 z-40 max-w-[min(360px,80%)] rounded-2xl border border-white/70 bg-white/85 px-3 py-2 text-xs shadow-sm backdrop-blur" aria-live="polite">
            {def && f ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: def.color }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{mode === "auto" ? "Following the busiest agent" : "Following"}</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-ink">{def.name}</div>
                <div className="text-muted">
                  {f.phase === "walking" && f.station ? <>Walking to the <b className="text-ink">{f.station}</b>{f.label ? ` · ${f.label}` : ""}</>
                    : f.phase === "working" ? <>{f.label} <span className="text-muted">at the {f.station}</span></>
                    : def.role}
                </div>
                {f.queued > 0 && <div className="mt-0.5 text-[11px] text-amber">{f.queued} more task{f.queued > 1 ? "s" : ""} lined up</div>}
              </>
            ) : (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">The office</div>
                <div className="text-ink">{snap.mascots.some((m) => m.phase !== "idle") ? "Agents at work. Pick one to follow." : "Everyone is at their desk."}</div>
              </>
            )}
          </div>

          <div className="absolute inset-x-2 bottom-2 z-40 flex flex-wrap items-center justify-center gap-1">
            <button onClick={() => setMode("auto")} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${mode === "auto" ? "bg-ink text-white" : "bg-white/85 text-ink"}`}>Auto</button>
            {MASCOTS.map((m) => {
              const s = snap.mascots.find((x) => x.id === m.id)!;
              const on = mode === m.id;
              return (
                <button key={m.id} onClick={() => setMode(m.id)} title={`${m.name}: ${m.role}`}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${on ? "text-white" : "bg-white/85 text-ink"}`}
                  style={on ? { background: m.color } : undefined}>
                  <span className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : m.color }} />
                  {m.name}
                  <span className="h-1 w-6 overflow-hidden rounded-full bg-black/10" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${(s.score / maxScore) * 100}%`, background: on ? "#fff" : m.color }} />
                  </span>
                </button>
              );
            })}
            <button onClick={() => setMode("overview")} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${mode === "overview" ? "bg-ink text-white" : "bg-white/85 text-ink"}`}>Whole office</button>
          </div>
        </>
      )}
    </div>
  );
}

