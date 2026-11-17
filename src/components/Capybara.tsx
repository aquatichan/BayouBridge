"use client";

import { useState } from "react";

// 🤫 Capi the capybara hides in the reeds at the bottom of the page.
// Hover to make Capi peek out, click to say hi.
export default function Capybara({ minutesSaved }: { minutesSaved: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex items-end">
      {open && (
        <div className="fade-up absolute bottom-12 left-1/2 w-56 -translate-x-1/2 rounded-xl border border-line bg-panel p-3 text-xs text-ink shadow-lg">
          <b>Hi, I&apos;m Capi.</b> Capybaras stay calm in a flood, and so can you.
          {minutesSaved > 0 ? ` Your agents saved about ${minutesSaved} minutes. Take a water break.` : " Run the agents and take a water break."}
          <span className="block text-muted">¡Tranquilo como un capibara!</span>
        </div>
      )}
      <button
        type="button"
        aria-label="A capybara hiding in the reeds"
        title="…is something in the reeds?"
        onClick={() => setOpen((o) => !o)}
        className="group relative h-10 w-16 overflow-hidden"
      >
        <svg viewBox="0 0 64 40" className="absolute bottom-[-14px] left-0 h-10 w-16 transition-transform duration-300 group-hover:-translate-y-3">
          <ellipse cx="30" cy="28" rx="20" ry="11" fill="#9a6b45" />
          <ellipse cx="47" cy="22" rx="11" ry="8.5" fill="#a5764e" />
          <rect x="53" y="20" width="8" height="7" rx="3.5" fill="#7d5536" />
          <circle cx="47" cy="18" r="1.6" fill="#1d1d1d" />
          <ellipse cx="41" cy="14.5" rx="2.6" ry="2" fill="#7d5536" />
          <rect x="44" y="6" width="6" height="5" rx="2.5" fill="#f2a541" />
          <path d="M47 6 q3 -4 5 -1" stroke="#4f7d4d" strokeWidth="1.5" fill="none" />
        </svg>
        <svg viewBox="0 0 64 40" className="pointer-events-none absolute inset-0 h-10 w-16">
          <path d="M4 40 q2 -22 6 -30 M12 40 q0 -18 -3 -26 M20 40 q1 -16 5 -22 M30 40 q-1 -14 2 -20 M58 40 q-2 -20 2 -28 M50 40 q2 -12 -2 -18" stroke="#4f7d4d" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>
  );
}
