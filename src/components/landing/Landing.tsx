"use client";

import { useEffect, useRef, useState } from "react";
import Cta from "./Cta";
import Hero from "./Hero";
import Nav from "./Nav";
import Story from "./Story";
import { LANG_KEY, type Lang } from "./strings";

// The landing page: hero video → the app, scroll by scroll → one call to action.
// It all sits in a rounded frame on a dark "desk" that stays put while you scroll.
export default function Landing() {
  const [lang, setLang] = useState<Lang>("en");
  const story = useRef<HTMLElement>(null);

  useEffect(() => {
    try { const l = localStorage.getItem(LANG_KEY); if (l === "es" || l === "en") setLang(l); } catch { /* storage off */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const chooseLang = (l: Lang) => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* storage off */ } };

  return (
    <main className="landing relative min-h-screen bg-night text-cream">
      {/* The frame: everything outside a rounded window is painted desk-dark, so the page reads like a card on a desk. */}
      <div aria-hidden className="pointer-events-none fixed inset-1.5 z-[70] rounded-[22px] ring-1 ring-white/10 md:inset-3 md:rounded-[34px]"
        style={{ boxShadow: "0 0 0 100vmax var(--desk)" }} />
      <Nav lang={lang} onLang={chooseLang} />
      <Hero lang={lang} next={story} />
      <Story lang={lang} sectionRef={story} />
      <Cta lang={lang} />
    </main>
  );
}
