"use client";

import Image from "next/image";
import { m, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type RefObject } from "react";
import BlurText from "@/components/bits/BlurText";
import CountUp from "@/components/bits/CountUp";
import Magnet from "@/components/bits/Magnet";
import { LANDING, type Lang } from "./strings";

// Section 1. Full-screen video under a navy gradient, the headline on the
// left, three numbers along the bottom. It stays put while the story card
// slides up over it; as that happens it eases back, rounds its corners and dims.

export default function Hero({ lang, next }: { lang: Lang; next: RefObject<HTMLElement | null> }) {
  const t = LANDING[lang].hero;
  const reduced = useReducedMotion();

  // The poster paints first; the video takes over once the page has settled.
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    const go = () => setSrc("/hero.mp4");
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(go); return () => w.cancelIdleCallback?.(id); }
    const id = window.setTimeout(go, 400);
    return () => window.clearTimeout(id);
  }, [reduced]);

  // Stacked cards: as the story slides over, the hero shrinks a touch, rounds and dims.
  const { scrollYProgress } = useScroll({ target: next, offset: ["start end", "start start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.93]);
  const radius = useTransform(scrollYProgress, [0, 1], [0, 36]);
  const dim = useTransform(scrollYProgress, [0, 1], [0, 0.65]);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const el = video.current;
    if (!el) return;
    if (v > 0.98 && !el.paused) el.pause();
    else if (v <= 0.98 && el.paused) el.play().catch(() => {});
  });

  return (
    <section id="top" aria-labelledby="hero-title" className="sticky top-0 h-[100svh] overflow-hidden">
      <m.div style={{ scale, borderRadius: radius }} className="absolute inset-0 origin-[50%_30%] overflow-hidden bg-night">
        {/* Scaled from the top-left so the clip's corner watermark stays out of frame. */}
        <div className="absolute inset-0 origin-top-left scale-[1.12]">
          <Image src="/hero-poster.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
          {src && (
            <video ref={video} src={src} muted autoPlay loop playsInline preload="auto" aria-label={t.videoLabel}
              onPlaying={() => setPlaying(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${playing ? "opacity-100" : "opacity-0"}`} />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-night/80 via-night/45 to-night/0" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-night/90 via-night/40 to-night/0" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-night/60 to-night/0" />
        <m.div aria-hidden style={{ opacity: dim }} className="absolute inset-0 bg-night" />

        <div className="relative flex h-full flex-col px-[calc(var(--frame)+var(--gutter))] pb-[calc(var(--frame)+28px)] pt-[calc(var(--frame)+120px)] text-cream md:pt-[calc(var(--frame)+150px)]">
          <div className="max-w-[min(760px,100%)]">
            <p className="kicker text-tide">{t.kicker}</p>
            <h1 id="hero-title" className="mt-5">
              <BlurText key={lang} text={t.title} animateBy="words" direction="bottom" delay={70} trigger="load"
                className="headline text-[clamp(2.6rem,min(6vw,10vh),5.75rem)]" />
            </h1>
            <p className="mt-6 max-w-[540px] text-base leading-relaxed text-cream/70 md:text-lg">{t.sub}</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Magnet padding={40} magnetStrength={3} disabled={!!reduced}>
                <a href="/case?start=1" className="inline-block rounded-full bg-sun px-7 py-3.5 text-sm font-semibold text-night shadow-[0_10px_34px_rgb(245_181_68/0.3)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
                  {t.start}
                </a>
              </Magnet>
              <a href="/case?sample=1" className="rounded-full border-2 border-tide/70 bg-tide/10 px-7 py-3.5 text-sm font-semibold text-tide backdrop-blur-sm transition hover:bg-tide hover:text-night">{t.example}</a>
              <a href="#how" className="px-3 py-3.5 text-sm font-semibold text-cream/80 underline-offset-4 transition hover:text-tide hover:underline">{t.how}</a>
            </div>
            <p className="mt-3 text-xs text-cream/55">{t.exampleNote}</p>
          </div>

          <div className="mt-auto flex items-end gap-8">
            <dl className="grid flex-1 grid-cols-3 divide-x divide-white/10 border-t border-white/15">
              {t.stats.map((s, i) => (
                <div key={s.label} className={`pt-5 ${i === 0 ? "pr-4" : "px-4 md:px-8"}`}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="headline text-[clamp(1.9rem,4.2vw,3.6rem)] tabular-nums">
                      {"prefix" in s && s.prefix}<CountUp to={s.to} duration={1.8} delay={0.4} trigger="load" />
                    </span>
                    <span className="ml-1 text-[clamp(1rem,1.7vw,1.6rem)] font-medium text-cream/80">{s.suffix}</span>
                    <span className="mt-2 block text-sm leading-snug text-cream/60">{s.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <a href="#how" aria-label={t.how} className="hidden flex-col items-center gap-2 pb-1 text-cream/60 transition hover:text-tide md:flex">
              <span className="text-xs tracking-wide">{t.hint}</span>
              <span className="relative h-12 w-px overflow-hidden bg-white/15"><span className="scroll-cue absolute inset-x-0 top-0 h-1/2 bg-tide" /></span>
            </a>
          </div>
        </div>
      </m.div>
    </section>
  );
}
