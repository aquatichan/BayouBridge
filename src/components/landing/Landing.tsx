"use client";

import { useEffect, useRef, useState } from "react";
import Backdrop from "./Backdrop";
import Hero from "./Hero";
import Nav from "./Nav";
import Story from "./Story";
import Footer from "@/components/site/Footer";
import { LANG_KEY, type Lang } from "./strings";

/** Language for the landing and the details page; remembered and shared with /case. */
export function useLang() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try { const l = localStorage.getItem(LANG_KEY); if (l === "es" || l === "en") setLang(l); } catch { /* storage off */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const choose = (l: Lang) => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* storage off */ } };
  return [lang, choose] as const;
}

/** The rounded page frame with a cream border; outside it, the page edge is painted dark. */
export function Frame() {
  return (
    <div aria-hidden className="pointer-events-none fixed z-[70] rounded-[calc(var(--radius)+6px)] border-2 border-cream/85"
      style={{ inset: "var(--frame)", boxShadow: "0 0 0 100vmax var(--desk)" }} />
  );
}

// The landing page: video → the app, scroll by scroll → the footer.
export default function Landing() {
  const [lang, setLang] = useLang();
  const story = useRef<HTMLElement>(null);
  return (
    <main className="landing relative min-h-screen bg-night text-cream">
      <Backdrop />
      <Frame />
      <Nav lang={lang} onLang={setLang} />
      {/* The hero stays put only while the story plays over it; then both scroll away to the footer. */}
      <div className="relative">
        <Hero lang={lang} next={story} />
        <Story lang={lang} sectionRef={story} />
      </div>
      <Footer lang={lang} />
    </main>
  );
}
