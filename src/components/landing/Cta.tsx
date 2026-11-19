"use client";

import Link from "next/link";
import { LANDING, type Lang } from "./strings";

// Section 3. One line, one button, a small footer.
export default function Cta({ lang }: { lang: Lang }) {
  const t = LANDING[lang].cta;
  return (
    <section aria-labelledby="cta-title" className="relative z-10 bg-night px-2 pb-6 pt-28 text-cream md:px-3 md:pt-40">
      <div className="card-night mx-auto flex max-w-5xl flex-col items-center rounded-[32px] px-6 py-16 text-center md:py-24">
        <p className="eyebrow text-tide">{t.eyebrow}</p>
        <h2 id="cta-title" className="headline mt-5 text-[clamp(2.4rem,6vw,5rem)]">
          {t.title[0]}<span className="accent text-tide">{t.title[1]}</span>{t.title[2]}
        </h2>
        <Link href="/case?start=1" className="mt-9 rounded-full bg-sun px-7 py-3.5 text-sm font-semibold text-night shadow-[0_8px_30px_rgb(245_181_68/0.25)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sun">
          {t.button}
        </Link>
        <Link href="/case?sample=1" className="mt-4 text-sm text-tide underline-offset-4 hover:underline">{t.sample}</Link>
      </div>

      <footer id="privacy" className="mx-auto mt-10 flex max-w-5xl flex-col gap-3 px-2 pb-4 text-xs text-cream/60 md:flex-row md:items-start md:justify-between">
        <ul className="space-y-1">{t.footer.map((line) => <li key={line}>{line}</li>)}</ul>
        <Link href="/classic" className="shrink-0 text-tide underline-offset-4 hover:underline">{t.navigator} →</Link>
      </footer>
    </section>
  );
}
