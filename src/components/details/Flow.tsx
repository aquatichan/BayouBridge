"use client";

import { useInView } from "framer-motion";
import { useRef } from "react";
import type { Flowchart, FlowNode } from "./article";

// A top-to-bottom flowchart made of plain HTML boxes: each row is a step,
// boxes side by side happen at the same time, and the arrows between rows can
// carry a short label. Boxes fade in one after another as it scrolls into view
// (instantly for people who prefer less motion).

const TONE: Record<NonNullable<FlowNode["tone"]>, string> = {
  tide: "border-tide/40 bg-tide/[0.08]",
  sun: "border-sun/60 bg-sun/[0.09] shadow-[0_0_36px_rgb(245_181_68/0.12)]",
  plain: "border-white/10 bg-white/[0.03]",
};
const TAG: Record<NonNullable<FlowNode["tone"]>, string> = { tide: "text-tide", sun: "text-sun", plain: "text-cream/60" };

function Arrow({ label, shown, delay }: { label?: string; shown: boolean; delay: number }) {
  return (
    <div aria-hidden className="flex flex-col items-center py-1 transition-opacity duration-500" style={{ opacity: shown ? 1 : 0, transitionDelay: `${delay}ms` }}>
      <span className="h-5 w-px bg-white/25" />
      {label && <span className="my-1 rounded-full bg-night px-3 py-0.5 font-serif text-sm italic text-cream/60">{label}</span>}
      {label && <span className="h-3 w-px bg-white/25" />}
      <svg width="12" height="8" viewBox="0 0 12 8" className="text-white/40"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

export default function Flow({ f }: { f: Flowchart }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const [head, ...rest] = f.title.split(". ");
  let step = 0;
  return (
    <figure ref={ref} className="mx-auto mt-14 max-w-[960px] font-sans">
      <figcaption className="text-[1.05rem] text-cream"><b>{head}.</b> {rest.join(". ")}</figcaption>
      <div className="mt-6 flex flex-col items-stretch rounded-[var(--radius)] border border-white/10 bg-white/[0.02] p-5 md:p-8">
        {f.rows.map((row, ri) => {
          const delay = step * 120;
          step += row.nodes.length;
          return (
            <div key={ri} className="flex flex-col">
              <div className={`grid gap-3 ${row.nodes.length === 1 ? "mx-auto w-full max-w-[460px]" : row.nodes.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                {row.nodes.map((n, ni) => {
                  const tone = n.tone ?? "tide";
                  return (
                    <div key={ni} className={`rounded-[18px] border p-4 transition duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${TONE[tone]} ${seen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
                      style={{ transitionDelay: `${delay + ni * 120}ms` }}>
                      {n.tag && <p className={`mb-1 font-serif text-sm italic ${TAG[tone]}`}>{n.tag}</p>}
                      <p className="font-semibold leading-snug text-cream">{n.title}</p>
                      {n.sub && <p className="mt-1 text-sm leading-relaxed text-cream/60">{n.sub}</p>}
                    </div>
                  );
                })}
              </div>
              {ri < f.rows.length - 1 && <Arrow label={row.edge} shown={seen} delay={delay + 200} />}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-cream/60">{f.note}</p>
    </figure>
  );
}
