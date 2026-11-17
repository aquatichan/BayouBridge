"use client";

import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode, GraphNodeKind } from "@/lib/types";

const COL: Record<GraphNodeKind, number> = { document: 0, missing: 0, need: 1, program: 2, deadline: 3 };
const HEADERS = ["Evidence", "Needs", "Recovery pathways", "Deadlines"];
const W = 196, H = 46, GAP_X = 70, GAP_Y = 12, TOP = 30;

const STYLE: Record<GraphNodeKind, { fill: string; stroke: string; dash?: string; text: string }> = {
  document: { fill: "#fffdf8", stroke: "#c9c1ad", text: "#1d2b2a" },
  missing: { fill: "#f7e1da", stroke: "#b8462f", dash: "5 4", text: "#7a2a1a" },
  need: { fill: "#dcebe7", stroke: "#0f4c4a", text: "#0f4c4a" },
  program: { fill: "#0f4c4a", stroke: "#0f4c4a", text: "#ffffff" },
  deadline: { fill: "#f8ead0", stroke: "#b9791a", text: "#6b4508" },
};

function clip(s: string, n = 30) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default function RecoveryGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [hover, setHover] = useState<string | null>(null);

  const pos = useMemo(() => {
    const counts = [0, 0, 0, 0];
    const p = new Map<string, { x: number; y: number }>();
    // documents first, then missing evidence below them
    const ordered = [...nodes].sort((a, b) => (a.kind === "missing" ? 1 : 0) - (b.kind === "missing" ? 1 : 0));
    for (const n of ordered) {
      const c = COL[n.kind];
      p.set(n.id, { x: c * (W + GAP_X), y: TOP + counts[c]++ * (H + GAP_Y) });
    }
    return { p, height: TOP + Math.max(...counts) * (H + GAP_Y) };
  }, [nodes]);

  const linked = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    // walk both directions so hovering a document lights up everything it feeds
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of edges) {
        if (s.has(e.from) && !s.has(e.to) && (e.from === hover || nodes.find((n) => n.id === e.from)?.kind !== "document")) { s.add(e.to); grew = true; }
      }
    }
    for (const e of edges) if (e.to === hover) s.add(e.from);
    return s;
  }, [hover, edges, nodes]);

  const width = 4 * W + 3 * GAP_X;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${pos.height}`} className="min-w-[760px] w-full" role="img" aria-label="Recovery graph linking evidence to needs, pathways and deadlines">
        {HEADERS.map((h, i) => (
          <text key={h} x={i * (W + GAP_X)} y={14} fontSize="11" fontWeight="600" fill="#5d6b69" letterSpacing=".06em">{h.toUpperCase()}</text>
        ))}
        {edges.map((e, i) => {
          const a = pos.p.get(e.from), b = pos.p.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
          const on = !linked || (linked.has(e.from) && linked.has(e.to));
          const color = e.relation === "blocks" ? "#b8462f" : e.relation === "due" ? "#b9791a" : "#0f4c4a";
          return (
            <path key={i} d={`M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}`} fill="none"
              stroke={color} strokeWidth={on ? 1.6 : 1} strokeDasharray={e.relation === "blocks" ? "4 3" : undefined}
              opacity={on ? 0.75 : 0.1} />
          );
        })}
        {nodes.map((n) => {
          const p = pos.p.get(n.id)!;
          const s = STYLE[n.kind];
          const on = !linked || linked.has(n.id);
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={on ? 1 : 0.25}
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} className="cursor-default">
              <title>{`${n.label}${n.sub ? `\n${n.sub}` : ""}`}</title>
              <rect width={W} height={H} rx={9} fill={s.fill} stroke={s.stroke} strokeDasharray={s.dash} strokeWidth={1.3} />
              <text x={10} y={19} fontSize="12" fontWeight="600" fill={s.text}>{n.kind === "missing" ? "Missing: " : ""}{clip(n.label, n.kind === "missing" ? 21 : 30)}</text>
              {n.sub && <text x={10} y={35} fontSize="10.5" fill={s.text} opacity={0.75}>{clip(n.sub, 34)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
