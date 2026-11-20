"use client";

import Link from "next/link";
import { LANDING, type Lang } from "./strings";
import Image from "next/image";

// Floating pill navigation, the same size everywhere and sized to what's in it.
export default function Nav({ lang, onLang, base = "" }: { lang: Lang; onLang: (l: Lang) => void; base?: string }) {
  const t = LANDING[lang].nav;
  return (
    <nav aria-label="Main" style={{ top: "calc(var(--frame) + 12px)" }}
      className="fixed left-1/2 z-[80] flex w-max max-w-[calc(100%-2*var(--frame)-24px)] -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-night/75 p-1.5 text-cream shadow-[0_10px_40px_rgb(0_0_0/0.35)] backdrop-blur-md">
      <Link href={`${base}/#top`} className="flex shrink-0 items-center gap-2 rounded-full pr-1 focus-visible:outline-2 focus-visible:outline-tide">
        <Image src="/logo.png" alt="" width={28} height={28} className="size-7 shrink-0" />
        <span className="hidden whitespace-nowrap text-sm font-semibold tracking-tight sm:inline">BayouBridge</span>
      </Link>
      <div className="hidden items-center whitespace-nowrap text-sm text-cream/60 md:flex">
        <Link href={`${base}/#how`} className="rounded-full px-3 py-1.5 transition hover:text-tide">{t.how}</Link>
        <Link href="/case?sample=1" className="rounded-full px-3 py-1.5 transition hover:text-tide">{t.example}</Link>
        <Link href="/details" className="rounded-full px-3 py-1.5 transition hover:text-tide">{t.details}</Link>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
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
