"use client";

import Link from "next/link";
import { LANDING, type Lang } from "./strings";

// Floating pill navigation: logo, a few links, EN/ES, and the primary action.
export default function Nav({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  const t = LANDING[lang].nav;
  return (
    <nav aria-label="Main" className="fixed left-1/2 top-4 z-[80] flex w-[min(1040px,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-night/70 py-1.5 pl-1.5 pr-1.5 text-cream shadow-[0_10px_40px_rgb(0_0_0/0.35)] backdrop-blur-md md:top-6">
      <a href="#top" className="flex items-center gap-2 rounded-full pr-2 focus-visible:outline-2 focus-visible:outline-tide">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[30%]" />
        <span className="text-sm font-semibold tracking-tight">BayouBridge</span>
      </a>
      <div className="ml-2 hidden items-center gap-1 text-sm text-cream/60 md:flex">
        <a href="#how" className="rounded-full px-3 py-1.5 transition hover:text-tide">{t.how}</a>
        <a href="#privacy" className="rounded-full px-3 py-1.5 transition hover:text-tide">{t.privacy}</a>
        <Link href="/classic" className="rounded-full px-3 py-1.5 transition hover:text-tide">{t.navigator}</Link>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex overflow-hidden rounded-full border border-white/10 text-xs" role="group" aria-label="Language">
          {(["en", "es"] as const).map((l) => (
            <button key={l} onClick={() => onLang(l)} aria-pressed={lang === l}
              className={`px-2.5 py-1.5 font-mono font-semibold transition ${lang === l ? "bg-cream text-night" : "text-cream/60 hover:text-cream"}`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <Link href="/case?start=1" className="rounded-full bg-sun px-4 py-2 text-sm font-semibold text-night transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
          {t.start}
        </Link>
      </div>
    </nav>
  );
}
