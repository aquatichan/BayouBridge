"use client";

import { useInView } from "framer-motion";
import { useRef } from "react";
import type { Trace } from "./article";

// A terminal-style capture of the live stream: the real frames the server
// sends, one line at a time as the figure scrolls into view.

const KIND_CLASS: Record<Trace["lines"][number]["kind"], string> = {
  req: "text-sun",
  event: "text-tide",
  data: "text-cream/70",
  note: "text-cream/40 italic",
  gap: "",
};

export default function TraceFigure({ t }: { t: Trace }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const [head, ...rest] = t.title.split(". ");
  return (
    <figure ref={ref} className="mx-auto mt-14 max-w-[960px] font-sans">
      <figcaption className="text-[1.05rem] text-cream"><b>{head}.</b> {rest.join(". ")}</figcaption>
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#030b19] shadow-[0_20px_60px_rgb(0_0_0/0.35)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <i className="h-2.5 w-2.5 rounded-full bg-white/20" /><i className="h-2.5 w-2.5 rounded-full bg-white/20" /><i className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="ml-3 font-mono text-xs text-cream/45">{t.window}</span>
        </div>
        <pre className="overflow-x-auto px-5 py-4 font-mono text-[0.8rem] leading-[1.75]">
          <code>
            {t.lines.map((l, i) => (
              <span key={i} className={`block whitespace-pre transition-opacity duration-300 ${KIND_CLASS[l.kind]}`}
                style={{ opacity: seen ? 1 : 0, transitionDelay: `${i * 90}ms` }}>
                {l.kind === "gap" ? " " : l.text}
              </span>
            ))}
          </code>
        </pre>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-cream/60">{t.note}</p>
    </figure>
  );
}
