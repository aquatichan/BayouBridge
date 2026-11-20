"use client";

import { useInView } from "framer-motion";
import { useRef } from "react";
import type { Dag, DagNode } from "./article";

// The coordinator's task graph, drawn as SVG. Each row is a "wave": every task
// in it has all its dependencies done, so they start together. Edges draw in
// wave by wave as the figure scrolls into view (instantly with reduced motion,
// via the global CSS rule).

const W = 900;
const NODE_H = 58;
const ROW = 98;
const TOP = 46;
const COLS = { l: 205, c: 450, r: 695 } as const;

const FILL: Record<NonNullable<DagNode["tone"]>, { fill: string; stroke: string; text: string }> = {
  tide: { fill: "rgb(125 211 252 / 0.10)", stroke: "rgb(125 211 252 / 0.55)", text: "#7dd3fc" },
  sun: { fill: "rgb(245 181 68 / 0.11)", stroke: "rgb(245 181 68 / 0.7)", text: "#f5b544" },
  plain: { fill: "rgb(255 255 255 / 0.05)", stroke: "rgb(255 255 255 / 0.28)", text: "rgb(242 238 230 / 0.75)" },
};

const geom = (n: DagNode) => {
  const w = n.wide ?? 188;
  return { x: COLS[n.col] - w / 2, y: TOP + n.wave * ROW, w };
};

export default function DagFigure({ d }: { d: Dag }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const [head, ...rest] = d.title.split(". ");
  const height = TOP + d.waves.length * ROW - 18;
  const delay = (wave: number) => `${wave * 260}ms`;

  return (
    <figure ref={ref} className="mx-auto mt-14 max-w-[960px] font-sans">
      <figcaption className="text-[1.05rem] text-cream"><b>{head}.</b> {rest.join(". ")}</figcaption>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-cream/70">
        {d.legend.map((l) => (
          <span key={l.label} className="flex items-center gap-2">
            <i className="h-3.5 w-3.5 rounded-[4px] border" style={{ background: FILL[l.tone].fill, borderColor: FILL[l.tone].stroke }} />{l.label}
          </span>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={d.title} className="block min-w-[660px] w-full">
          {/* wave rails */}
          {d.waves.map((label, i) => (
            <g key={label}>
              <line x1="16" x2={W - 16} y1={TOP + i * ROW - 20} y2={TOP + i * ROW - 20} stroke="rgb(255 255 255 / 0.06)" strokeDasharray="2 6" />
              <text x="20" y={TOP + i * ROW - 6} fontSize="11" fill="rgb(242 238 230 / 0.45)" style={{ letterSpacing: "0.14em" }}>{label}</text>
            </g>
          ))}
          {/* edges */}
          {d.edges.map(([from, to, via], i) => {
            const a = byId.get(from)!, b = byId.get(to)!;
            const ga = geom(a), gb = geom(b);
            const x1 = COLS[a.col], y1 = ga.y + NODE_H;
            const x2 = via ?? COLS[b.col], y2 = gb.y;
            const my = y1 + (y2 - y1) * 0.55;
            return (
              <path key={i} d={`M${x1} ${y1} C${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - 5}`} pathLength={1} fill="none"
                stroke="rgb(242 238 230 / 0.4)" strokeWidth="1.5" markerEnd="url(#dag-arrow)"
                style={{ strokeDasharray: 1, strokeDashoffset: seen ? 0 : 1, opacity: seen ? 1 : 0, transition: "stroke-dashoffset 900ms ease, opacity 200ms ease", transitionDelay: delay(b.wave - 1) }} />
            );
          })}
          <defs>
            <marker id="dag-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1l6 4-6 4" fill="none" stroke="rgb(242 238 230 / 0.55)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {/* nodes */}
          {d.nodes.map((n) => {
            const g = geom(n), t = FILL[n.tone ?? "plain"];
            return (
              <g key={n.id} style={{ opacity: seen ? 1 : 0, transition: "opacity 600ms ease", transitionDelay: delay(n.wave) }}>
                {n.stack && [2, 1].map((k) => (
                  <rect key={k} x={g.x + k * 7} y={g.y - k * 6} width={g.w} height={NODE_H} rx="12" fill="#06142b" stroke={t.stroke} opacity={0.35 + (2 - k) * 0.2} />
                ))}
                <rect x={g.x} y={g.y} width={g.w} height={NODE_H} rx="12" fill="#06142b" />
                <rect x={g.x} y={g.y} width={g.w} height={NODE_H} rx="12" fill={t.fill} stroke={t.stroke} />
                <text x={g.x + g.w / 2} y={g.y + (n.sub ? 24 : 34)} textAnchor="middle" fontSize="14.5" fontWeight="600" fill="#f2eee6">{n.label}</text>
                {n.sub && <text x={g.x + g.w / 2} y={g.y + 43} textAnchor="middle" fontSize="11.5" fill={t.text}>{n.sub}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-cream/60">{d.note}</p>
    </figure>
  );
}
