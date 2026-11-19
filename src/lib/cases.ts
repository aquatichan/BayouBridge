import { DEMO_TODAY, documents as sampleDocuments, household as sampleHousehold } from "@/data/household";
import { runCase, type Extractor, type RunHooks } from "@/lib/agents/coordinator";
import { extractWithClaude, readUpload } from "@/lib/agents/llmExtract";
import { addDocuments, createSessionCase, getCase, saveRun, type UploadedFile } from "@/lib/store";
import type { CaseDocument, CaseState } from "@/lib/types";
import { claudeConfigured } from "@/lib/runDemo";

// Session cases for the consumer flow: a person's own uploads ("Start my case")
// or a private copy of the synthetic sample ("Try a sample case").

export const UPLOAD_LIMITS = {
  files: 10,
  bytes: 8 * 1024 * 1024,
  statementChars: 4000,
  /** What Claude can read. Phone photos are resized in the browser first (see the upload step). */
  types: new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain"]),
};

/** Reading a photo or PDF takes longer than text, so session runs get more time per document. */
const SESSION_LIMITS = { docMs: 45_000, runMs: 90_000, breakerAfter: 3 };

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

export function createSampleCase(language: unknown): string {
  return createSessionCase(
    { name: sampleHousehold.name, address: sampleHousehold.address, language: language === "es" ? "es" : "en", sample: true },
    sampleDocuments.map((d) => ({ ...d, source: "sample" as const })),
  );
}

const cleanName = (name: string) => name.split(/[\\/]/).pop()!.replace(/[^\w.\- ()]/g, "_").slice(0, 80) || "upload";

/** Store uploaded files (and the household's own words) on a case. Returns the new documents. */
export async function addUploads(caseId: string, files: File[], statement?: string): Promise<CaseDocument[]> {
  const rec = getCase(caseId);
  if (!rec?.profile) throw new CaseError(404, "This case has expired or was deleted. Please start again.");
  if (rec.profile.sample) throw new CaseError(400, "The sample case uses synthetic documents only.");
  const existing = rec.documents.filter((d) => d.source === "upload").length;
  if (existing + files.length > UPLOAD_LIMITS.files) throw new CaseError(413, `You can add up to ${UPLOAD_LIMITS.files} files.`);

  const added: { doc: CaseDocument; file?: UploadedFile }[] = [];
  for (const f of files) {
    const mime = f.type === "image/jpg" ? "image/jpeg" : f.type;
    if (!UPLOAD_LIMITS.types.has(mime)) throw new CaseError(415, `${cleanName(f.name)}: please upload a photo (JPEG, PNG, WebP), a PDF or a text file.`);
    if (f.size > UPLOAD_LIMITS.bytes) throw new CaseError(413, `${cleanName(f.name)} is larger than 8 MB.`);
    const filename = cleanName(f.name);
    added.push({
      doc: {
        id: `up-${crypto.randomUUID().slice(0, 8)}`, kind: mime.startsWith("image/") ? "photo" : "other",
        title: filename, filename, mime, receivedAt: today(), text: "", language: rec.profile.language, source: "upload",
      },
      file: { mime, data: Buffer.from(await f.arrayBuffer()) },
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
  if (!added.length) throw new CaseError(400, "Add a file or a few words about what happened.");
  addDocuments(caseId, added);
  return added.map((a) => a.doc);
}

/**
 * Run the agents on a session case. With `incremental`, documents read in the
 * last run are reused, so only new uploads are read (and paid for) again.
 */
export async function runSessionCase(caseId: string, opts: { incremental?: boolean } & RunHooks = {}): Promise<CaseState> {
  const { incremental, ...hooks } = opts;
  const rec = getCase(caseId);
  if (!rec?.profile) throw new CaseError(404, "This case has expired or was deleted. Please start again.");
  if (!rec.documents.length) throw new CaseError(400, "Add a file or a few words about what happened first.");
  const p = rec.profile;
  const base = {
    caseId,
    householdName: p.name,
    address: p.address,
    disaster: p.sample ? sampleHousehold.disaster : "Storm recovery case",
    today: p.sample ? DEMO_TODAY : today(),
    documents: rec.documents,
    reuse: incremental ? rec.state?.extractions : undefined,
    limits: SESSION_LIMITS,
  };
  const files = rec.files;
  // Uploaded files are read from their bytes; typed words and sample documents from their text.
  const extractor: Extractor = (d, o) => {
    const file = files.get(d.id);
    return file ? readUpload(d, file, o) : extractWithClaude(d, o);
  };

  let state: CaseState;
  if (!claudeConfigured()) state = await runCase({ ...base, ...hooks });
  else {
    try {
      state = await runCase({ ...base, ...hooks, extractor });
    } catch (err) {
      console.error("[BayouBridge] Claude run failed, rerunning with the rules engine:", err instanceof Error ? err.message : err);
      state = await runCase(base);
    }
  }

  // Say plainly which uploads couldn't be read, and why.
  const unread = state.documents.filter((d) => d.source === "upload" && !d.text.trim());
  if (unread.length) {
    const names = unread.map((d) => d.filename).join(", ");
    state.warnings.push(claudeConfigured()
      ? `We couldn't read ${names}. Try a clearer photo, or type what it says in "your own words".`
      : `Photos and PDFs need Claude to read them, and this server has no Claude API key. ${names} ${unread.length === 1 ? "was" : "were"} not read. You can type what ${unread.length === 1 ? "it says" : "they say"} in "your own words" instead.`);
  }
  return saveRun(state);
}
