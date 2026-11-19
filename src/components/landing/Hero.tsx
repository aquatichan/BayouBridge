"use client";

import Image from "next/image";
import { m, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type RefObject } from "react";
import { LANDING, type Lang } from "./strings";

// Section 1. Full-screen video under a navy gradient. As the story card
// slides up over it, the hero shrinks a little and dims (stacked cards).

export default function Hero({ lang, next }: { lang: Lang; next: RefObject<HTMLElement | null> }) {
  const t = LANDING[lang].hero;
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: next, offset: ["start end", "start start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);
  const radius = useTransform(scrollYProgress, [0, 1], [0, 32]);
  const dim = useTransform(scrollYProgress, [0, 1], [0, 0.6]);

  // The poster is the first big paint; the video is attached once the page has settled.
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setSrc("/hero.mp4"));
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setSrc("/hero.mp4"), 400);
    return () => window.clearTimeout(id);
  }, [reduced]);

  // No need to decode video frames nobody can see.
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const el = video.current;
    if (!el || !src) return;
    if (v > 0.98 && !el.paused) el.pause();
    else if (v <= 0.98 && el.paused) el.play().catch(() => {});
  });

  return (
    <section id="top" className="sticky top-0 h-[100svh] overflow-hidden" aria-labelledby="hero-title">
      <m.div style={{ scale, borderRadius: radius }} className="absolute inset-0 origin-[50%_30%] overflow-hidden bg-night">
        <Image src="/hero-poster.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
        {src && !reduced && (
          <video ref={video} src={src} muted autoPlay loop playsInline preload="auto" aria-label={t.videoLabel}
            onPlaying={() => setPlaying(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${playing ? "opacity-100" : "opacity-0"}`} />
        )}
        {/* Navy at 75% on the left, fading to nothing on the right, plus a little at the bottom for the stats. */}
        <div className="absolute inset-0 bg-gradient-to-r from-night/75 via-night/45 to-night/0" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-night/85 to-night/0" />
        <m.div style={{ opacity: dim }} className="absolute inset-0 bg-night" />

        <div className="relative flex h-full flex-col px-6 pb-6 pt-28 text-cream md:px-14 md:pb-10 md:pt-36">
          <div className="max-w-[min(680px,100%)]">
            <p className="eyebrow text-tide">{t.eyebrow}</p>
            <h1 id="hero-title" className="headline mt-5 text-[clamp(2.4rem,min(5.6vw,9vh),5.4rem)]">
              {t.title[0]}<span className="accent text-tide">{t.title[1]}</span>{t.title[2]}
            </h1>
            <p className="mt-5 max-w-[520px] text-base leading-relaxed text-cream/60 md:text-lg">{t.sub}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/case?start=1" className="rounded-full bg-sun px-6 py-3 text-sm font-semibold text-night shadow-[0_8px_30px_rgb(245_181_68/0.25)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
                {t.start}
              </a>
              <a href="#how" className="rounded-full border border-cream/30 px-6 py-3 text-sm font-semibold text-cream transition hover:border-tide hover:text-tide">
                {t.how}
              </a>
            </div>
          </div>

          <div className="mt-auto flex items-end gap-6">
            <dl className="grid flex-1 grid-cols-3 gap-4 border-t border-white/10 pt-5 md:gap-10">
              {t.stats.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="headline text-[clamp(1.8rem,4vw,3.4rem)] tabular-nums">{s.n}</span>
                    {s.unit && <span className="ml-1 font-serif text-[clamp(1rem,1.6vw,1.5rem)] italic text-cream/80">{s.unit}</span>}
                    <span className="eyebrow mt-2 block text-[0.8rem] leading-snug text-cream/60">{s.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <a href="#how" className="hidden flex-col items-center gap-2 pb-1 text-cream/60 hover:text-tide md:flex" aria-label={t.how}>
              <span className="eyebrow text-[0.75rem]">{t.scroll}</span>
              <span className="relative h-10 w-px overflow-hidden bg-white/15"><span className="scroll-cue absolute inset-x-0 top-0 h-1/2 bg-tide" /></span>
            </a>
          </div>
        </div>
      </m.div>
    </section>
  );
}
