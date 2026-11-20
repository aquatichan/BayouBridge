"use client";

import Link from "next/link";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Frame, useLang } from "@/components/landing/Landing";
import Nav from "@/components/landing/Nav";
import Footer from "@/components/site/Footer";
import type { Lang } from "@/components/landing/strings";
import Dag from "./Dag";
import Flow from "./Flow";
import Trace from "./Trace";
import type { Article, Figure as FigureData } from "./article";

// Newspaper-style pages ("The details" and the privacy policy): masthead, a big
// serif title, a ticker, then columns with drop caps and figures.

const caps = "font-serif [font-variant-caps:all-small-caps] tracking-[0.18em] text-[1.05rem]";

function Figure({ f }: { f: FigureData }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const max = Math.max(...f.bars.map((b) => b.value));
  const [head, ...rest] = f.title.split(". ");
  return (
    <figure ref={ref} className="font-sans">
      <figcaption className="text-[1.05rem] text-cream"><b>{head}.</b> {rest.join(". ")}</figcaption>
      {f.legend && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-cream/70">
          <span className="flex items-center gap-2"><i className="h-3.5 w-3.5 rounded-[4px] bg-tide" />{f.legend[0]}</span>
          <span className="flex items-center gap-2"><i className="h-3.5 w-3.5 rounded-[4px] bg-sun" />{f.legend[1]}</span>
        </div>
      )}
      <dl className="mt-5 grid grid-cols-[minmax(0,auto)_1fr] items-center gap-x-4 gap-y-3">
        {f.bars.map((b, i) => (
          <div key={`${b.label}-${i}`} className="contents">
            <dt className="text-right text-sm leading-tight text-cream/75">{b.label}</dt>
            <dd className="flex items-center gap-3 border-l border-white/20 pl-2">
              <span className={`h-6 rounded-[6px] transition-[width] duration-1000 ease-[cubic-bezier(.2,.8,.2,1)] ${b.tone === "sun" ? "bg-sun" : "bg-tide"}`}
                style={{ width: seen ? `${(b.value / max) * 72}%` : "0%", transitionDelay: `${i * 80}ms` }} />
              <span className="whitespace-nowrap text-sm font-semibold text-cream">{b.display}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-sm leading-relaxed text-cream/60">{f.note}</p>
    </figure>
  );
}

/** A newspaper-style page: used for "The details" and the privacy policy. */
export default function Newspaper({ article }: { article: Record<Lang, Article> }) {
  const [lang, setLang] = useLang();
  const a = article[lang];
  const ticker = [...a.ticker, ...a.ticker];
  return (
    <main className="landing relative min-h-screen bg-night text-cream">
      <Frame />
      <Nav lang={lang} onLang={setLang} base="/" />
      <article className="mx-auto max-w-[1240px] px-[calc(var(--frame)+var(--gutter))] pb-0 pt-[calc(var(--frame)+104px)]">
        <header>
          <div className={`flex items-center justify-between gap-4 border-b border-white/15 border-t-[3px] border-t-cream/90 py-3 text-cream/80 ${caps}`}>
            <span>{a.masthead[0]}</span>
            <span className="hidden sm:inline">{a.masthead[1]}</span>
            <span>{a.masthead[2]}</span>
          </div>
          <h1 className="mt-6 text-center font-serif text-[clamp(3.6rem,13vw,10.5rem)] font-extrabold leading-[0.9] tracking-[-0.03em] text-[#e8eefb]">{a.title}</h1>
          <p className="mx-auto mt-8 max-w-[820px] text-center font-serif text-[clamp(1.25rem,2.4vw,1.9rem)] italic leading-snug text-cream/75">
            {a.deck[0]}<br className="hidden md:block" /> {a.deck[1]}
          </p>
          <div className="mt-10 overflow-hidden border-y border-white/15 py-3" aria-label={a.ticker.join(" · ")}>
            <div aria-hidden className={`ticker flex w-max items-center gap-8 whitespace-nowrap text-cream/85 ${caps}`}>
              {ticker.map((t, i) => <span key={i} className="flex items-center gap-8">{t}<i className="h-2 w-2 rounded-full bg-tide" /></span>)}
            </div>
          </div>
        </header>

        {a.sections.map((s) => {
          const figures = s.figures ?? (s.figure ? [s.figure] : []);
          return (
          <section key={s.heading} className="mt-16 border-t border-white/15 pt-10 md:mt-20">
            <h2 className="font-serif text-[clamp(2rem,4.4vw,3.6rem)] font-bold leading-[1.02] tracking-[-0.02em] text-[#e8eefb]">{s.heading}</h2>
            <div className={`mt-8 ${figures.length ? "grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]" : ""}`}>
              <div className={`font-serif text-[1.18rem] leading-[1.75] text-cream/90 [column-gap:3rem] [column-rule:1px_solid_rgb(255_255_255/0.12)] ${figures.length ? "md:columns-2" : "md:columns-2 lg:columns-3"}`}>
                {s.paragraphs.map((p, i) => (
                  <p key={i} className={`mb-6 break-inside-avoid-column ${i === 0 ? "first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:text-[4.4rem] first-letter:font-bold first-letter:leading-[0.8] first-letter:text-tide" : ""}`}>{p}</p>
                ))}
              </div>
              {figures.length > 0 && <div className="space-y-12">{figures.map((f) => <Figure key={f.title} f={f} />)}</div>}
            </div>
            {s.dag && <Dag d={s.dag} />}
            {s.flow && <Flow f={s.flow} />}
            {s.trace && <Trace t={s.trace} />}
          </section>
          );
        })}

        <div className="mt-16 flex flex-col gap-4 border-t border-white/15 pt-6 text-sm text-cream/60 md:flex-row md:items-center md:justify-between">
          <p className="font-serif text-base italic">{a.colophon}</p>
          <Link href="/" className="text-tide underline-offset-4 hover:underline">{a.back}</Link>
        </div>
      </article>
      <Footer lang={lang} />
    </main>
  );
}
