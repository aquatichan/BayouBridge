"use client";

import { useEffect, useRef, useState } from "react";
import { ACCEPT, MAX_FILES, problemWith } from "@/lib/client/files";
import { STRINGS, type Lang } from "./i18n";

// The steps before the agents run: welcome, consent, your home, upload.
// Each is a card floating over the (idle) 3D office.

export function Card({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-gradient-to-b from-bg/20 via-bg/50 to-bg/80 p-4">
      <div className={`fade-up my-auto w-full ${wide ? "max-w-xl" : "max-w-lg"} rounded-3xl border border-tide/20 bg-panel/80 p-5 shadow-[0_0_0_1px_rgb(125_211_252/0.06),0_30px_80px_rgb(0_0_0/0.55),0_0_60px_rgb(47_143_216/0.15)] backdrop-blur-xl md:p-7`}>
        {children}
      </div>
    </div>
  );
}

const primary = "rounded-full bg-bayou px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 shadow-[0_0_24px_rgb(47_143_216/0.35)] disabled:opacity-50";
const secondary = "rounded-full border border-line bg-panel px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-tide/50";

export function Welcome({ lang, onStart, onSample, busy }: { lang: Lang; onStart: () => void; onSample: () => void; busy: boolean }) {
  const t = STRINGS[lang];
  return (
    <Card>
      <p className="font-serif text-lg italic text-tide">{t.tagline}</p>
      <h1 className="mt-1 text-2xl font-bold leading-tight text-ink md:text-3xl">{t.welcomeTitle}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">{t.welcomeBody}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className={primary} onClick={onStart} disabled={busy}>{t.start}</button>
        <button className={secondary} onClick={onSample} disabled={busy}>{t.sample}</button>
      </div>
      <p className="mt-2 text-xs text-muted">{t.sampleNote}</p>
      <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">{t.prototype}</p>
    </Card>
  );
}

export function Consent({ lang, onAgree, onBack }: { lang: Lang; onAgree: () => void; onBack: () => void }) {
  const t = STRINGS[lang];
  const [ok, setOk] = useState(false);
  return (
    <Card>
      <h2 className="text-xl font-bold text-ink">{t.consentTitle}</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
        {t.consent.map((c) => <li key={c} className="flex gap-2"><span aria-hidden className="mt-0.5 text-tide">●</span><span>{c}</span></li>)}
      </ul>
      <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl bg-bayou-soft p-3 text-sm font-semibold text-ink">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="h-4 w-4 accent-[#7dd3fc]" />
        {t.agree}
      </label>
      <div className="mt-4 flex justify-between gap-2">
        <button className={secondary} onClick={onBack}>{t.back}</button>
        <button className={primary} onClick={onAgree} disabled={!ok}>{t.continue}</button>
      </div>
    </Card>
  );
}

export function Home({ lang, onSubmit, onBack, busy, error }: {
  lang: Lang; onSubmit: (v: { address: string; name: string }) => void; onBack: () => void; busy: boolean; error?: string | null;
}) {
  const t = STRINGS[lang];
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  return (
    <Card>
      <h2 className="text-xl font-bold text-ink">{t.homeTitle}</h2>
      <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit({ address, name }); }}>
        <label className="block text-sm font-semibold text-ink">
          {t.address}
          <input required minLength={5} maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address"
            className="mt-1 w-full rounded-xl border border-line bg-bg/70 px-3 text-ink placeholder:text-muted/70 py-2.5 text-base font-normal outline-none focus:border-bayou" />
          <span className="mt-1 block text-xs font-normal text-muted">{t.addressHint}</span>
        </label>
        <label className="block text-sm font-semibold text-ink">
          {t.name}
          <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-bg/70 px-3 text-ink placeholder:text-muted/70 py-2.5 text-base font-normal outline-none focus:border-bayou" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-clay-soft p-2 text-xs text-clay">{error}</p>}
        <div className="flex justify-between gap-2 pt-1">
          <button type="button" className={secondary} onClick={onBack}>{t.back}</button>
          <button className={primary} disabled={busy || address.trim().length < 5}>{t.continue}</button>
        </div>
      </form>
    </Card>
  );
}

// ── Dictation (browser speech-to-text, where available) ─────────────────────

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type RecognitionCtor = new () => Recognition;

function useDictation(lang: Lang, onText: (text: string) => void) {
  const [Ctor, setCtor] = useState<RecognitionCtor | null>(null);
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const push = useRef(onText);
  useEffect(() => { push.current = onText; }, [onText]);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    setCtor(() => w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null);
    return () => rec.current?.stop();
  }, []);
  const toggle = () => {
    if (!Ctor) return;
    if (on) { rec.current?.stop(); return; }
    const r = new Ctor();
    r.lang = lang === "es" ? "es-US" : "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) push.current(e.results[i][0].transcript.trim());
    };
    r.onend = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return { supported: Boolean(Ctor), on, toggle };
}

// ── Upload ──────────────────────────────────────────────────────────────────

export function FilePicker({ lang, onPick, label, capture = false, className = secondary }: {
  lang: Lang; onPick: (files: File[]) => void; label: string; capture?: boolean; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()} lang={lang}>{label}</button>
      <input ref={input} type="file" className="hidden" multiple={!capture} accept={capture ? "image/*" : ACCEPT}
        {...(capture ? { capture: "environment" as const } : {})}
        onChange={(e) => { onPick([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </>
  );
}

export function Upload({ lang, claudeOn, onSubmit, busy, error }: {
  lang: Lang; claudeOn: boolean | null; onSubmit: (files: File[], statement: string) => void; busy: boolean; error?: string | null;
}) {
  const t = STRINGS[lang];
  const [files, setFiles] = useState<{ file: File; url?: string }[]>([]);
  const [words, setWords] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const dictation = useDictation(lang, (text) => setWords((w) => (w ? `${w} ${text}` : text)));
  const urls = useRef(new Set<string>());
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (picked: File[]) => {
    const issues: string[] = [];
    const ok: { file: File; url?: string }[] = [];
    for (const f of picked) {
      // HEIC/HEIF get converted when the photo is shrunk (Safari), so let them through here.
      const p = /image\/hei[cf]/.test(f.type) ? undefined : problemWith(f, lang);
      if (p) { issues.push(p); continue; }
      const url = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
      if (url) urls.current.add(url);
      ok.push({ file: f, url });
    }
    setProblems(issues);
    setFiles((cur) => [...cur, ...ok].slice(0, MAX_FILES));
  };

  return (
    <Card wide>
      <h2 className="text-xl font-bold text-ink">{t.uploadTitle}</h2>
      <p className="mt-1 text-sm text-muted">{t.uploadBody}</p>
      {claudeOn === false && <p className="mt-3 rounded-xl bg-amber-soft p-2.5 text-xs text-ink">{t.noReader}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <FilePicker lang={lang} onPick={add} label={`＋ ${t.addFiles}`} />
        <FilePicker lang={lang} onPick={add} label={`📷 ${t.takePhoto}`} capture />
      </div>
      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map(({ file, url }, i) => (
            <li key={`${file.name}-${i}`} className="group relative overflow-hidden rounded-xl border border-line bg-bg">
              {url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={url} alt={file.name} className="aspect-square w-full object-cover" />
                : <div className="grid aspect-square place-items-center p-2 text-center text-[11px] text-muted">📄<br />{file.name}</div>}
              <button type="button" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`${t.remove} ${file.name}`}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white">✕</button>
            </li>
          ))}
        </ul>
      )}
      {problems.map((p) => <p key={p} className="mt-2 text-xs text-clay">{p}</p>)}

      <label className="mt-4 block text-sm font-semibold text-ink">
        {t.yourWords}
        <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={4} maxLength={4000} placeholder={t.yourWordsHint}
          className="mt-1 w-full rounded-xl border border-line bg-bg/70 px-3 text-ink placeholder:text-muted/70 py-2 text-base font-normal outline-none focus:border-bayou" />
      </label>
      {dictation.supported && (
        <button type="button" onClick={dictation.toggle}
          className={`mt-1 rounded-full px-3 py-1 text-xs font-semibold ${dictation.on ? "bg-clay text-white" : "bg-bg text-ink"}`}>
          {dictation.on ? `■ ${t.stopDictating}` : `🎙 ${t.dictate}`}
        </button>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl bg-clay-soft p-2 text-xs text-clay">{error}</p>}
      <div className="mt-5 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{t.files(files.length)}</span>
        <button className={primary} disabled={busy || (!files.length && !words.trim())} onClick={() => onSubmit(files.map((f) => f.file), words)}>
          {busy ? `${t.working}…` : t.go}
        </button>
      </div>
    </Card>
  );
}
