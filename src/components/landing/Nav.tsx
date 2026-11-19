"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LANDING, type Lang } from "./strings";
import LogoMark from "@/components/site/LogoMark";

// Floating pill navigation. Wide at the top of the page; once you scroll it
// shrinks to a compact pill (logo, language, Start), and grows back on hover/focus.
export default function Nav({ lang, onLang, base = "" }: { lang: Lang; onLang: (l: Lang) => void; base?: string }) {
  const t = LANDING[lang].nav;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const compact = scrolled && !open;

  return (
    <nav aria-label="Main"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      style={{ top: "calc(var(--frame) + 12px)" }}
      className={`fixed left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-night/75 p-1.5 text-cream shadow-[0_10px_40px_rgb(0_0_0/0.35)] backdrop-blur-md transition-[width,background-color] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${compact ? "w-[min(360px,calc(100%-2*var(--frame)-24px))]" : "w-[min(1040px,calc(100%-2*var(--frame)-24px))]"}`}>
      <Link href={`${base}/#top`} className="flex shrink-0 items-center gap-2 rounded-full pr-1 focus-visible:outline-2 focus-visible:outline-tide">
        <LogoMark size={28} className="shrink-0" />
        <span className={`overflow-hidden whitespace-nowrap text-sm font-semibold tracking-tight transition-[max-width,opacity] duration-500 ${compact ? "max-w-0 opacity-0 sm:max-w-[120px] sm:opacity-100" : "max-w-[120px]"}`}>BayouBridge</span>
      </Link>
      <div className={`hidden items-center overflow-hidden whitespace-nowrap text-sm text-cream/60 transition-[max-width,opacity] duration-500 md:flex ${compact ? "max-w-0 opacity-0" : "ml-2 max-w-[480px] opacity-100"}`}>
        <Link href={`${base}/#how`} className="rounded-full px-3 py-1.5 transition hover:text-tide">{t.how}</Link>
        <Link href="/details" className="rounded-full px-3 py-1.5 transition hover:text-tide">{t.details}</Link>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <div className="flex overflow-hidden rounded-full border border-white/10 text-xs" role="group" aria-label="Language">
          {(["en", "es"] as const).map((l) => (
            <button key={l} onClick={() => onLang(l)} aria-pressed={lang === l}
              className={`px-2.5 py-1.5 font-semibold transition ${lang === l ? "bg-cream text-night" : "text-cream/60 hover:text-cream"}`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <Link href="/case?start=1" className="whitespace-nowrap rounded-full bg-sun px-4 py-2 text-sm font-semibold text-night transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
          {t.start}
        </Link>
      </div>
    </nav>
  );
}
