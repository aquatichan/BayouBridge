"use client";

import Link from "next/link";
import type { Lang } from "@/components/landing/strings";

// The site footer: a closing line with a link to start, links, the small
// print, and a faint wordmark.

const STRINGS = {
  en: {
    line: "Have a FEMA letter or a photo of the damage? Start with that.",
    start: "Start a case",
    explore: "Pages",
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
    line: "¿Tiene una carta de FEMA o una foto de los daños? Empiece con eso.",
    start: "Empezar un caso",
    explore: "Páginas",
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
          <p className="headline max-w-[16ch] text-[clamp(2rem,4.2vw,3.6rem)]">{t.line}</p>
          <Link href="/case?start=1" className="group mt-6 inline-flex items-center gap-2 text-lg font-semibold text-sun">
            {t.start}
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>
        </div>
        <nav aria-label={t.explore}>
          <h2 className="text-sm font-semibold text-cream/60">{t.explore}</h2>
          <ul className="mt-4 space-y-2.5">
            {t.links.map(([label, href]) => (
              <li key={href}><Link href={href} className="text-cream/85 underline-offset-4 transition hover:text-tide hover:underline">{label}</Link></li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold text-cream/60">{t.fine}</h2>
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
