// A paper sheet for the sample cases' paper pile. Plain inline SVG: a sheet with
// a folded corner, a few lines of "text" and a stamp with the document's icon.

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
