import { DEMO_TODAY } from "@/data/household";
import { isDemoId, type DemoId } from "@/data/demoList";
import { DEMOS } from "@/data/demos";
import { runCase, type Extractor, type RunHooks } from "@/lib/agents/coordinator";
import { guessKind } from "@/lib/agents/evidence";
import { extractWithClaude, readUpload } from "@/lib/agents/llmExtract";
import { ExtractionError } from "@/lib/agents/util";
import { addDocuments, createSessionCase, getCase, saveRun, type UploadedFile } from "@/lib/store";
import type { CaseDocument, CaseState } from "@/lib/types";
import { isTypedKind, TYPED_CHARS, TYPED_KINDS, type TypedKind } from "@/lib/typedKinds";
import { claudeConfigured } from "@/lib/runDemo";

// Session cases for the consumer flow: a person's own uploads ("Start my case")
// or a private copy of the synthetic sample ("Try a sample case").

export const UPLOAD_LIMITS = {
  files: 10,
  bytes: 8 * 1024 * 1024,
  statementChars: 4000,
  /** What Claude can read. Phone photos are resized in the browser first (see the upload step). */
  types: new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain"]),
  /** Documents typed out by hand, per case, and how long each may be. */
  typed: 10,
  typedChars: TYPED_CHARS,
};

export type TypedDoc = { kind: TypedKind; text: string };

/** Reading a photo or PDF takes longer than text, so session runs get more time per document. */
const SESSION_LIMITS = { docMs: 45_000, runMs: 90_000, breakerAfter: 3 };

/**
 * Most Claude calls one case may make. Cases are anonymous, so this is what stops
 * one browser tab (or a script) from re-running a case to spend the API key.
 * Enough for every allowed upload to be read about three times.
 */
export const MAX_CLAUDE_READS = (UPLOAD_LIMITS.files + UPLOAD_LIMITS.typed + 1) * 3;

export class CaseError extends Error {
  constructor(public status: 400 | 404 | 413 | 415, message: string) { super(message); }
}

const today = () => new Date().toISOString().slice(0, 10);

export function createUserCase(input: { name?: unknown; address?: unknown; language?: unknown; consent?: unknown }): string {
  if (input.consent !== true) throw new CaseError(400, "Please agree to how BayouBridge handles your documents first.");
  const address = typeof input.address === "string" ? input.address.trim() : "";
  if (address.length < 5 || address.length > 200) throw new CaseError(400, "Please enter the address of the damaged home.");
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  const language = input.language === "es" ? "es" : "en";
  return createSessionCase({ name: name || (language === "es" ? "Su hogar" : "Your household"), address, language, sample: false });
}

/**
 * A private copy of one synthetic demo household (Reyes unless another is named).
 * `empty`: start with no papers; the app hands them to the person to drop in.
 */
export function createSampleCase(language: unknown, demo: unknown = "reyes", opts: { empty?: boolean } = {}): string {
  if (!isDemoId(demo)) throw new CaseError(400, "Unknown sample household.");
  const d = DEMOS[demo];
  return createSessionCase(
    { name: d.name, address: d.address, language: language === "es" ? "es" : "en", sample: true, demo },
    opts.empty ? [] : d.documents.map((x) => ({ ...x, source: "sample" as const })),
  );
}

/** What the browser needs to act out a sample case's "a document arrives" moments. */
export function sampleFollowUps(demo: DemoId | undefined) {
  return demo ? DEMOS[demo].followUps.map((f) => ({ id: f.doc.id, title: f.doc.title, provides: f.provides })) : [];
}

/**
 * A sample household's papers, for the pile the app hands out: the first batch
 * ("start") and the ones the family finds after the helpers ask ("later").
 * No document text: the browser only needs to show and name them.
 */
export function samplePapers(demo: DemoId | undefined) {
  if (!demo) return [];
  const d = DEMOS[demo];
  const card = (x: CaseDocument, stage: "start" | "later", provides?: string) =>
    ({ id: x.id, title: x.title, kind: x.kind, filename: x.filename, preview: x.preview, stage, provides });
  return [...d.documents.map((x) => card(x, "start")), ...d.followUps.map((f) => card(f.doc, "later", f.provides))];
}

const cleanName = (name: string) => name.split(/[\\/]/).pop()!.replace(/[^\w.\- ()]/g, "_").slice(0, 80) || "upload";

/** Check typed documents from a request body; throws a CaseError a person can act on. */
export function parseTyped(raw: unknown): TypedDoc[] {
  if (raw === undefined || raw === null || raw === "") return [];
  let list: unknown = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw); } catch { throw new CaseError(400, "The typed documents could not be read. Please try again."); }
  }
  if (!Array.isArray(list)) throw new CaseError(400, "The typed documents could not be read. Please try again.");
  return list.map((x) => {
    const kind = (x as { kind?: unknown })?.kind;
    const text = typeof (x as { text?: unknown })?.text === "string" ? ((x as { text: string }).text).trim() : "";
    if (!isTypedKind(kind)) throw new CaseError(400, "Please choose what kind of document you typed.");
    const name = TYPED_KINDS[kind].en;
    if (text.length < UPLOAD_LIMITS.typedChars.min) throw new CaseError(400, `${name}: please type a little more of what it says.`);
    if (text.length > UPLOAD_LIMITS.typedChars.max) throw new CaseError(413, `${name}: please keep it under ${UPLOAD_LIMITS.typedChars.max} characters.`);
    return { kind, text };
  });
}

/** Store uploaded files, typed documents and the household's own words on a case. Returns the new documents. */
export async function addUploads(caseId: string, files: File[], statement?: string, typed: TypedDoc[] = []): Promise<CaseDocument[]> {
  const rec = getCase(caseId);
  if (!rec?.profile) throw new CaseError(404, "This case has expired or was deleted. Please start again.");
  if (rec.profile.sample) throw new CaseError(400, "The sample case uses synthetic documents only.");
  const existing = rec.documents.filter((d) => d.source === "upload").length;
  if (existing + files.length > UPLOAD_LIMITS.files) throw new CaseError(413, `You can add up to ${UPLOAD_LIMITS.files} files.`);
  const typedSoFar = rec.documents.filter((d) => d.source === "typed").length;
  if (typedSoFar + typed.length > UPLOAD_LIMITS.typed) throw new CaseError(413, `You can type up to ${UPLOAD_LIMITS.typed} documents.`);

  const added: { doc: CaseDocument; file?: UploadedFile }[] = [];
  for (const f of files) {
    const mime = f.type === "image/jpg" ? "image/jpeg" : f.type;
    if (!UPLOAD_LIMITS.types.has(mime)) throw new CaseError(415, `${cleanName(f.name)}: please upload a photo (JPEG, PNG, WebP), a PDF or a text file.`);
    if (f.size > UPLOAD_LIMITS.bytes) throw new CaseError(413, `${cleanName(f.name)} is larger than 8 MB.`);
    const filename = cleanName(f.name);
    const data = Buffer.from(await f.arrayBuffer());
    // A text file can be read right here, so the offline rules engine reads it too. Claude still reads the file when a key is set.
    const text = mime === "text/plain" ? data.toString("utf8").replace(/^\uFEFF/, "").slice(0, 20_000) : "";
    added.push({
      doc: {
        id: `up-${crypto.randomUUID().slice(0, 8)}`, kind: mime.startsWith("image/") ? "photo" : text ? guessKind(text) : "other",
        title: filename, filename, mime, receivedAt: today(), text, language: rec.profile.language, source: "upload",
      },
      file: { mime, data },
    });
  }
  for (const d of typed) {
    added.push({
      doc: {
        id: `ty-${crypto.randomUUID().slice(0, 8)}`, kind: d.kind, title: TYPED_KINDS[d.kind][rec.profile.language],
        filename: `${d.kind.replace(/_/g, "-")}-typed.txt`, mime: "text/plain", receivedAt: today(), text: d.text.slice(0, UPLOAD_LIMITS.typedChars.max),
        language: rec.profile.language, source: "typed",
      },
    });
  }
  const words = statement?.trim().slice(0, UPLOAD_LIMITS.statementChars);
  if (words) {
    added.push({
      doc: {
        id: `st-${crypto.randomUUID().slice(0, 8)}`, kind: "voice_note", title: rec.profile.language === "es" ? "En sus propias palabras" : "In your own words",
        filename: "your-words.txt", mime: "text/plain", receivedAt: today(), text: words, language: rec.profile.language, source: "statement",
      },
    });
  }
  if (!added.length) throw new CaseError(400, "Add a file, type a document, or write a few words about what happened.");
  addDocuments(caseId, added);
  return added.map((a) => a.doc);
}

/**
 * Run the agents on a session case. With `incremental`, documents read in the
 * last run are reused, so only new uploads are read (and paid for) again.
 */
export async function runSessionCase(caseId: string, opts: { incremental?: boolean; addDocumentIds?: string[] } & RunHooks = {}): Promise<CaseState> {
  const { incremental, addDocumentIds, ...hooks } = opts;
  const rec = getCase(caseId);
  if (!rec?.profile) throw new CaseError(404, "This case has expired or was deleted. Please start again.");
  // A sample case takes its own household's synthetic papers by id, in any order the person drops them.
  const demo = rec.profile.sample ? DEMOS[rec.profile.demo ?? "reyes"] : undefined;
  if (addDocumentIds?.length) {
    if (!demo) throw new CaseError(400, "Only the sample case takes sample documents.");
    const all = [...demo.documents, ...demo.followUps.map((f) => f.doc)];
    for (const d of all) {
      if (addDocumentIds.includes(d.id) && !rec.documents.some((x) => x.id === d.id)) rec.documents.push({ ...d, source: "sample" });
    }
    // Keep the household's own order, so results don't depend on the order of the drops.
    const order = (id: string) => all.findIndex((d) => d.id === id);
    rec.documents.sort((a, b) => order(a.id) - order(b.id));
  }
  if (!rec.documents.length) throw new CaseError(400, "Add a file or a few words about what happened first.");
  const p = rec.profile;
  const base = {
    caseId,
    householdName: p.name,
    address: p.address,
    disaster: demo ? demo.disaster : "Storm recovery case",
    today: demo ? DEMO_TODAY : today(),
    documents: [...rec.documents],
    reuse: incremental ? rec.state?.extractions : undefined,
    limits: SESSION_LIMITS,
    approver: "household" as const, // in the consumer app the household approves what goes out
  };
  const files = rec.files;
  // Uploaded files are read from their bytes; typed words from their text.
  const extractor: Extractor = async (d, o) => {
    // `?? 0`: a record kept across a dev-server reload may predate this counter.
    const used = rec.claudeReads ?? 0;
    if (used >= MAX_CLAUDE_READS) throw new ExtractionError("error", "this case has used up its Claude reads");
    rec.claudeReads = used + 1;
    const file = files.get(d.id);
    return file ? readUpload(d, file, o) : extractWithClaude(d, o);
  };

  let state: CaseState;
  // Sample households are synthetic text written for the rules engine: they never wait on, or pay for, a model.
  if (demo) state = await runCase({ ...base, ...hooks });
  else if (!claudeConfigured()) state = await runCase({ ...base, ...hooks });
  else {
    try {
      state = await runCase({ ...base, ...hooks, extractor });
    } catch (err) {
      console.error("[BayouBridge] Claude run failed, rerunning with the rules engine:", err instanceof Error ? err.message : err);
      state = await runCase(base);
    }
  }

  if (demo) state.extraction = { ...state.extraction, sample: true };
  // Say plainly which uploads couldn't be read, and why.
  const unread = state.documents.filter((d) => d.source === "upload" && !d.text.trim());
  if (unread.length) {
    const names = unread.map((d) => d.filename).join(", ");
    state.warnings.push(claudeConfigured()
      ? `We couldn't read ${names}. Try a clearer photo, or type what it says with "Type a document".`
      : `Our photo reader is switched off right now, so ${names} ${unread.length === 1 ? "wasn't" : "weren't"} read. You can type what ${unread.length === 1 ? "it says" : "they say"} with "Type a document" instead.`);
  }
  return saveRun(state);
}
