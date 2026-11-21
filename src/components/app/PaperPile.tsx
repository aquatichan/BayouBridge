"use client";

import { useEffect, useState } from "react";
import { tr } from "@/lib/es";
import type { CaseDocument } from "@/lib/types";
import { STRINGS, type Lang } from "./i18n";
import { announceDrag } from "./Extras";
import { PaperSheet } from "./Papers";

// A sample household's papers, handed to the person to drop into BayouBridge.
// Drag one or several into the box, or drop them all in with one button. The
// helpers start reading as soon as papers land.

export type SamplePaper = {
  id: string; title: string; kind: CaseDocument["kind"]; filename: string; preview?: string;
  /** "start": the family's first pile. "later": what they find after the helpers ask for something. */
  stage: "start" | "later";
};

export const KIND_ICON: Record<CaseDocument["kind"], string> = {
  photo: "📷", estimate: "🧾", fema_letter: "✉️", insurance_email: "📧", voice_note: "🗣️", utility_bill: "💡",
  bank_statement: "🏦", lease: "🏠", id_card: "🪪", insurance_policy: "📄", medical_letter: "🩺", receipt: "🧾", deed: "📜", other: "📎",
};

const MIME = "text/x-bayoubridge-papers";

/** A photo's picture if there is one, else a paper sheet with the document's icon. */
export function PaperThumb({ p, seed, lifted = false, size = "md" }: { p: Pick<SamplePaper, "kind" | "preview">; seed: number; lifted?: boolean; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState(false);
  const box = size === "sm" ? "h-10 w-12" : "h-[80px] w-[96px]";
  if (p.preview && !broken) {
    return (
      // A plain img: these are small local files, and a missing one just falls back to the sheet.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={p.preview} alt="" onError={() => setBroken(true)}
        className={`${box} rounded-md border-2 border-[#f8f4ea] object-cover shadow-[0_6px_10px_rgb(0_0_0/0.35)] transition-transform duration-200`}
        style={{ transform: `rotate(${lifted ? 0 : ((seed * 37) % 7) - 3}deg) translateY(${lifted ? -6 : 0}px)` }} />
    );
  }
  return size === "sm"
    ? <span aria-hidden className="grid h-10 w-12 place-items-center rounded-md bg-[#f8f4ea] text-lg shadow">{KIND_ICON[p.kind]}</span>
    : <PaperSheet icon={KIND_ICON[p.kind]} seed={seed} lifted={lifted} />;
}

export default function PaperPile({ lang, title, body, papers, busy, queued, onDrop, neededKinds = [], neededLabel = "" }: {
  lang: Lang; title: string; body: string; papers: SamplePaper[];
  /** Kinds of paper the helpers just asked for: marked so a first-time viewer knows what to drag. */
  neededKinds?: string[]; neededLabel?: string;
  /** The helpers are reading: drops still work, they wait their turn. */
  busy: boolean; queued: number; onDrop: (ids: string[]) => void;
}) {
  const t = STRINGS[lang];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [over, setOver] = useState(false);
  // Tapped (not dragged) papers light up the steps they would fill, for touch screens.
  useEffect(() => { announceDrag(picked.size ? papers.filter((p) => picked.has(p.id)).map((p) => p.kind) : null); }, [picked, papers]);
  const drop = (ids: string[]) => {
    const ok = ids.filter((id) => papers.some((p) => p.id === id));
    if (!ok.length) return;
    setPicked(new Set());
    onDrop(ok);
  };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section className="rounded-2xl border border-amber/40 bg-amber-soft/30 p-3" aria-label={title}>
      <h3 className="text-sm font-semibold text-ink">🗂️ {title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>

      <ul className="-mx-1 mt-2 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2 px-1 pt-2">
        {papers.map((p, i) => {
          const on = picked.has(p.id);
          return (
            <li key={p.id}>
              <button type="button" draggable aria-pressed={on} title={t.kindInfo[p.kind]}
                onDragStart={(e) => {
                  const ids = on ? [...picked] : [p.id];
                  e.dataTransfer.setData(MIME, JSON.stringify(ids));
                  e.dataTransfer.effectAllowed = "copy";
                  announceDrag(papers.filter((x) => ids.includes(x.id)).map((x) => x.kind));
                }}
                onDragEnd={() => announceDrag(null)}
                onClick={() => toggle(p.id)}
                className={`group flex w-full cursor-grab flex-col items-center gap-1 rounded-xl p-1.5 text-center outline-none transition active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-tide ${on ? "bg-tide/15 ring-1 ring-tide/60" : "hover:bg-white/5"}`}>
                <span className="relative grid h-[86px] place-items-center transition-transform group-hover:-translate-y-1">
                  <PaperThumb p={p} seed={i + 1} lifted={on} />
                  {neededKinds.includes(p.kind) && <span className="absolute -right-1 -top-1 animate-pulse rounded-full bg-sun px-1.5 py-0.5 text-[9px] font-bold text-night shadow">{neededLabel}</span>}
                </span>
                <span className={`line-clamp-2 text-[11px] font-semibold leading-tight ${on ? "text-tide" : "text-ink"}`}>{tr(p.title, lang)}</span>
                <span className="line-clamp-2 text-[10px] leading-tight text-muted">{t.kindInfo[p.kind]}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div role="button" tabIndex={0} aria-label={t.dropBox}
        onClick={() => picked.size && drop([...picked])}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && picked.size) { e.preventDefault(); drop([...picked]); } }}
        onDragOver={(e) => { if ([...e.dataTransfer.types].includes(MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
        onDrop={(e) => {
          setOver(false);
          const raw = e.dataTransfer.getData(MIME);
          if (!raw) return;
          e.preventDefault();
          try { drop(JSON.parse(raw) as string[]); } catch { /* not ours */ }
        }}
        className={`mt-3 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-3 py-5 text-center transition ${over ? "scale-[1.02] border-tide bg-tide/15" : picked.size ? "cursor-pointer border-tide/70 bg-tide/5" : "border-tide/35"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className={`size-9 transition ${over ? "scale-110" : ""}`} />
        <span className="text-sm font-semibold text-ink">{picked.size ? t.dropSelected(picked.size) : t.dropBox}</span>
        <span className="text-[11px] text-muted">{busy ? t.dropWhileBusy : t.dropBoxHint}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => drop(papers.map((p) => p.id))}
          className="rounded-full bg-sun px-4 py-1.5 text-xs font-semibold text-night shadow-[0_6px_20px_rgb(245_181_68/0.25)] hover:brightness-105">
          {t.dropAll(papers.length)}
        </button>
        {queued > 0 && <span className="text-[11px] font-medium text-amber">{t.queued(queued)}</span>}
      </div>
    </section>
  );
}
