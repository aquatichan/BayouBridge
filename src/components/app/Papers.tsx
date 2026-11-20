// Paper sheets and colored folders for the sample cases' "Your papers" activity.
// Plain inline SVG, no images: a sheet with a folded corner, a few lines of "text"
// and a stamp; a folder in the color of the pathway it belongs to.

/** Each pathway's folder color. Steps without a pathway (the follow-up ask) get amber. */
export const FOLDER_COLORS: Record<string, { back: string; front: string; ink: string }> = {
  "fema-appeal": { back: "#1d5fa8", front: "#2f8fd8", ink: "#e8f3fc" },
  "insurance-claim": { back: "#1f7a52", front: "#34a66f", ink: "#e6f7ee" },
  "sba-home-loan": { back: "#5b3fa0", front: "#7d5fd0", ink: "#f0ebfb" },
  "critical-care": { back: "#a8333f", front: "#d9505c", ink: "#fdecee" },
  "food-assistance": { back: "#b0621a", front: "#e08a35", ink: "#fdf1e4" },
  collect: { back: "#a87a12", front: "#e0a92e", ink: "#fdf6e2" },
};
export const folderColor = (programId?: string) => FOLDER_COLORS[programId ?? "collect"] ?? FOLDER_COLORS.collect;

/** A sheet of paper. `seed` gives each one its own tilt and line lengths, so a pile looks like a pile. */
export function PaperSheet({ icon, seed, lifted = false, stamp = "#2f8fd8" }: { icon: string; seed: number; lifted?: boolean; stamp?: string }) {
  const tilt = ((seed * 37) % 9) - 4; // -4°..4°
  const lines = [0, 1, 2, 3, 4].map((i) => 30 - ((seed * 7 + i * 11) % 14));
  return (
    <svg viewBox="0 0 64 80" width="64" height="80" aria-hidden
      className="drop-shadow-[0_6px_10px_rgb(0_0_0/0.35)] transition-transform duration-200"
      style={{ transform: `rotate(${lifted ? 0 : tilt}deg) translateY(${lifted ? -8 : 0}px) scale(${lifted ? 1.08 : 1})` }}>
      <path d="M4 2h42l14 14v60a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#f8f4ea" stroke="#d9d0bd" strokeWidth="1" />
      <path d="M46 2v12a2 2 0 0 0 2 2h12z" fill="#e6dfcd" stroke="#d9d0bd" strokeWidth="1" />
      <rect x="9" y="10" width="22" height="3" rx="1.5" fill="#b9ae96" />
      {lines.map((w, i) => <rect key={i} x="9" y={36 + i * 7} width={w + 16} height="2" rx="1" fill="#d3cab5" />)}
      <circle cx="18" cy="25" r="9" fill={stamp} opacity="0.16" />
      <text x="18" y="29" textAnchor="middle" fontSize="11">{icon}</text>
    </svg>
  );
}

/** A file folder. Open (front flap tipped forward) while a paper is dragged over it. */
export function Folder({ programId, open = false, size = 56 }: { programId?: string; open?: boolean; size?: number }) {
  const c = folderColor(programId);
  return (
    <svg viewBox="0 0 64 52" width={size} height={size * 52 / 64} aria-hidden className="shrink-0 overflow-visible">
      <path d="M4 8a3 3 0 0 1 3-3h16l5 5h29a3 3 0 0 1 3 3v33a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill={c.back} />
      <rect x="10" y="11" width="44" height="30" rx="1.5" fill="#f8f4ea" opacity={open ? 1 : 0.85}
        style={{ transform: open ? "translateY(-7px)" : "none", transition: "transform 200ms" }} />
      <path d="M2 20a3 3 0 0 1 3-3h54a3 3 0 0 1 3 3l-2 26a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill={c.front}
        style={{ transformOrigin: "32px 49px", transform: open ? "perspective(120px) rotateX(28deg)" : "none", transition: "transform 200ms" }} />
      <rect x="24" y="30" width="16" height="3" rx="1.5" fill={c.ink} opacity="0.7" />
    </svg>
  );
}
