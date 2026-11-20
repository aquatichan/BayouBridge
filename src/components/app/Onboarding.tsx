"use client";

import { useEffect, useRef, useState } from "react";
import { ACCEPT, MAX_FILES, problemWith } from "@/lib/client/files";
import { TYPED_CHARS, TYPED_KINDS, type TypedKind } from "@/lib/typedKinds";
import { DEMO_CARDS, type DemoId } from "@/data/demoList";
import { tr } from "@/lib/es";
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
        {error && <p role="alert" className="rounded-xl bg-clay-soft p-2 text-xs text-clay">{tr(error, lang)}</p>}
        <div className="flex justify-between gap-2 pt-1">
          <button type="button" className={secondary} onClick={onBack}>{t.back}</button>
          <button className={primary} disabled={busy || address.trim().length < 5}>{t.continue}</button>
        </div>
      </form>
    </Card>
  );
}

/** The three sample households, each a card with who they are and what happened. */
export function SamplePicker({ lang, busy, onPick, onBack }: { lang: Lang; busy: boolean; onPick: (d: DemoId) => void; onBack: () => void }) {
  const t = STRINGS[lang];
  return (
    <Card wide>
      <h2 className="text-xl font-bold text-ink">{t.samplesTitle}</h2>
      <p className="mt-1 text-sm text-muted">{t.samplesBody}</p>
      <ul className="mt-4 space-y-2">
        {DEMO_CARDS.map((d) => (
          <li key={d.id}>
            <button onClick={() => onPick(d.id)} disabled={busy}
              className="group w-full rounded-2xl border border-line bg-bg/50 p-3 text-left transition hover:border-tide/60 disabled:opacity-50">
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-sm text-ink">{d.name}</b>
                <span className="shrink-0 text-xs font-semibold text-tide group-hover:underline">{t.openSample} →</span>
              </div>
              <p className="text-[11px] text-muted">{d.address}</p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-ink">
                <li>👪 {d.people[lang]}</li>
                <li>🏠 {d.home[lang]}</li>
                <li>💵 {d.money[lang]}</li>
                <li>🌀 {d.damage[lang]}</li>
              </ul>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button className={secondary} onClick={onBack}>{t.back}</button>
        <span className="text-[11px] text-muted">{t.sampleNote}</span>
      </div>
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

export type TypedDoc = { kind: TypedKind; text: string };

// ── Drag and drop, and typing a document out ───────────────────────────────

/** Accepts files dropped anywhere on it, with a clear "drop here" overlay. */
export function DropZone({ lang, onDrop, children, className = "", disabled = false }: {
  lang: Lang; onDrop: (files: File[]) => void; children: React.ReactNode; className?: string; disabled?: boolean;
}) {
  const t = STRINGS[lang];
  const [over, setOver] = useState(false);
  const hasFiles = (e: React.DragEvent) => !disabled && [...e.dataTransfer.types].includes("Files");
  return (
    <div className={`relative ${className}`}
      onDragEnter={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver(true); } }}
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); setOver(false); onDrop([...e.dataTransfer.files]); }}>
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-bayou bg-panel/90 text-sm font-semibold text-tide">
          ⬇ {t.dropHere}
        </div>
      )}
    </div>
  );
}

/** Pick a document type and type what it says. Checks it the same way the server does. */
export function TypedDocEditor({ lang, onAdd, onCancel, initialKind }: {
  lang: Lang; onAdd: (d: TypedDoc) => void; onCancel?: () => void; initialKind?: TypedKind;
}) {
  const t = STRINGS[lang];
  const [kind, setKind] = useState<TypedKind | "">(initialKind ?? "");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = () => {
    if (!kind) return setProblem(t.pickTypeFirst);
    if (text.trim().length < TYPED_CHARS.min) return setProblem(t.typedTooShort);
    onAdd({ kind, text: text.trim() });
    setText(""); setProblem(null);
    if (!initialKind) setKind("");
  };
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-bg/50 p-3">
      <label className="block text-xs font-semibold text-ink">
        {t.docType}
        <select value={kind} onChange={(e) => { setKind(e.target.value as TypedKind); setProblem(null); }}
          className="mt-1 w-full rounded-xl border border-line bg-bg/70 px-3 py-2 text-sm font-normal text-ink outline-none focus:border-bayou">
          <option value="">{t.pickType}</option>
          {(Object.keys(TYPED_KINDS) as TypedKind[]).map((k) => <option key={k} value={k}>{TYPED_KINDS[k][lang]}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold text-ink">
        {t.docText}
        <textarea value={text} onChange={(e) => { setText(e.target.value); setProblem(null); }} rows={4} maxLength={TYPED_CHARS.max}
          placeholder={kind ? TYPED_KINDS[kind].hint[lang] : t.typeDocBody}
          className="mt-1 w-full rounded-xl border border-line bg-bg/70 px-3 py-2 text-sm font-normal text-ink placeholder:text-muted/70 outline-none focus:border-bayou" />
      </label>
      {problem && <p role="alert" className="text-xs text-clay">{problem}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink">{t.cancel}</button>}
        <button type="button" onClick={submit} className="rounded-full bg-bayou px-3 py-1.5 text-xs font-semibold text-white">{t.addTyped}</button>
      </div>
    </div>
  );
}

/** Split picked files into the ones the server will take and plain-language reasons for the rest. */
export function checkFiles(picked: File[], lang: Lang, room: number): { ok: File[]; problems: string[] } {
  const problems: string[] = [];
  const ok: File[] = [];
  for (const f of picked) {
    // HEIC/HEIF get converted when the photo is shrunk (Safari), so let them through here.
    const p = /image\/hei[cf]/.test(f.type) ? undefined : problemWith(f, lang);
    if (p) problems.push(p);
    else ok.push(f);
  }
  if (ok.length > room) problems.push(STRINGS[lang].tooMany(MAX_FILES));
  return { ok: ok.slice(0, Math.max(0, room)), problems };
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
  lang: Lang; claudeOn: boolean | null; onSubmit: (files: File[], statement: string, typed: TypedDoc[]) => void; busy: boolean; error?: string | null;
}) {
  const t = STRINGS[lang];
  const [files, setFiles] = useState<{ file: File; url?: string }[]>([]);
  const [typed, setTyped] = useState<TypedDoc[]>([]);
  const [typing, setTyping] = useState(false);
  const [words, setWords] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const dictation = useDictation(lang, (text) => setWords((w) => (w ? `${w} ${text}` : text)));
  const urls = useRef(new Set<string>());
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (picked: File[]) => {
    const { ok, problems: issues } = checkFiles(picked, lang, MAX_FILES - files.length);
    setProblems(issues);
    setFiles((cur) => [...cur, ...ok.map((file) => {
      const url = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (url) urls.current.add(url);
      return { file, url };
    })]);
  };

  return (
    <Card wide>
      <DropZone lang={lang} onDrop={add}>
      <h2 className="text-xl font-bold text-ink">{t.uploadTitle}</h2>
      <p className="mt-1 text-sm text-muted">{t.uploadBody}</p>
      {claudeOn === false && <p className="mt-3 rounded-xl bg-amber-soft p-2.5 text-xs text-ink">{t.noReader}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line p-3">
        <FilePicker lang={lang} onPick={add} label={`＋ ${t.addFiles}`} />
        <FilePicker lang={lang} onPick={add} label={`📷 ${t.takePhoto}`} capture />
        <button type="button" className={secondary} onClick={() => setTyping((v) => !v)} aria-expanded={typing}>⌨ {t.typeDoc}</button>
        <span className="hidden text-xs text-muted md:inline">{t.orDrag}</span>
      </div>
      {typing && (
        <div className="mt-3">
          <TypedDocEditor lang={lang} onAdd={(d) => { setTyped((cur) => [...cur, d]); setTyping(false); }} onCancel={() => setTyping(false)} />
        </div>
      )}
      {typed.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {typed.map((d, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl border border-line bg-bg px-3 py-2 text-xs">
              <span aria-hidden>⌨</span>
              <span className="min-w-0 flex-1"><b className="text-ink">{TYPED_KINDS[d.kind][lang]}</b> <span className="text-muted">· {t.typed}</span>
                <span className="block truncate text-muted">{d.text}</span></span>
              <button type="button" onClick={() => setTyped((cur) => cur.filter((_, j) => j !== i))} aria-label={`${t.remove} ${TYPED_KINDS[d.kind][lang]}`} className="text-muted hover:text-clay">✕</button>
            </li>
          ))}
        </ul>
      )}
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

      {error && <p role="alert" className="mt-3 rounded-xl bg-clay-soft p-2 text-xs text-clay">{tr(error, lang)}</p>}
      <div className="mt-5 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{t.files(files.length + typed.length)}</span>
        <button className={primary} disabled={busy || (!files.length && !typed.length && !words.trim())} onClick={() => onSubmit(files.map((f) => f.file), words, typed)}>
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />{t.sending}
            </span>
          ) : t.go}
        </button>
      </div>
      </DropZone>
    </Card>
  );
}
