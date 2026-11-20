"use client";

import Link from "next/link";
import type { Lang } from "@/components/landing/strings";

// The site footer: a closing line and a link to start, where to read more,
// the small print, and a big quiet wordmark. No card.

const STRINGS = {
  en: {
    kicker: "Ready when you are",
    line: ["Start with one ", "photo", "."],
    start: "Start a case",
    explore: "Explore",
    links: [["How it works", "/#how"], ["The details", "/details"], ["Privacy policy", "/privacy"], ["Look at the example case", "/case?sample=1"]],
    fine: "The small print",
    print: [
      "We point you to help you may qualify for. Only the agency can say yes.",
      "Nothing is sent anywhere without your OK.",
      "Your papers are kept for 2 hours at most, then deleted.",
    ],
    rights: "BayouBridge · Built for Teen Hacks Houston",
    made: "Aaron Qin, Miheer Parasnis, Reyansh Maheshwari · Made in Houston",
  },
  es: {
    kicker: "Cuando usted esté listo",
    line: ["Empiece con una ", "foto", "."],
    start: "Empezar un caso",
    explore: "Explore",
    links: [["Cómo funciona", "/#how"], ["Los detalles", "/details"], ["Política de privacidad", "/privacy"], ["Vea el caso de ejemplo", "/case?sample=1"]],
    fine: "La letra pequeña",
    print: [
      "Le indicamos ayuda para la que podría calificar. Solo la agencia puede aprobarla.",
      "Nada se envía sin su permiso.",
      "Sus papeles se guardan 2 horas como máximo y luego se borran.",
    ],
    rights: "BayouBridge · Hecho para Teen Hacks Houston",
    made: "Aaron Qin, Miheer Parasnis, Reyansh Maheshwari · Hecho en Houston",
  },
} as const;

export default function Footer({ lang }: { lang: Lang }) {
  const t = STRINGS[lang];
  return (
    <footer id="footer" className="relative z-10 px-[calc(var(--frame)+var(--gutter))] pb-[calc(var(--frame)+28px)] pt-28 text-cream md:pt-40">
      <div className="grid gap-12 border-t-[3px] border-cream/85 pt-10 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="kicker text-tide">{t.kicker}</p>
          <p className="headline mt-3 text-[clamp(2.4rem,5vw,4.25rem)]">
            {t.line[0]}<span className="accent text-tide">{t.line[1]}</span>{t.line[2]}
          </p>
          <Link href="/case?start=1" className="group mt-6 inline-flex items-center gap-2 text-lg font-semibold text-sun">
            {t.start}
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
        </div>
        <nav aria-label={t.explore}>
          <h2 className="font-serif text-lg italic text-cream/60">{t.explore}</h2>
          <ul className="mt-4 space-y-2.5">
            {t.links.map(([label, href]) => (
              <li key={href}><Link href={href} className="text-cream/85 underline-offset-4 transition hover:text-tide hover:underline">{label}</Link></li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="font-serif text-lg italic text-cream/60">{t.fine}</h2>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-cream/70">
            {t.print.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      </div>
      <div aria-hidden className="mt-20 overflow-hidden">
        <p className="select-none whitespace-nowrap font-serif text-[min(15rem,calc((100vw-2*(var(--frame)+var(--gutter)))/6))] font-extrabold leading-none tracking-[-0.06em] text-cream/[0.07]">BayouBridge</p>
      </div>
      <div className="mt-6 flex flex-col justify-between gap-2 border-t border-white/10 pt-5 text-sm text-cream/50 sm:flex-row">
        <span>{t.rights}</span>
        <span>{t.made}</span>
      </div>
    </footer>
  );
}
