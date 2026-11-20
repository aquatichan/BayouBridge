import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as createCase } from "../src/app/api/cases/route";
import { POST as upload } from "../src/app/api/cases/[id]/documents/route";
import { guessKind } from "../src/lib/agents/evidence";
import { runSessionCase } from "../src/lib/cases";
import { spanish } from "../src/lib/es";
import { TYPED_KINDS } from "../src/lib/typedKinds";
import type { CaseDocument } from "../src/lib/types";

// Intake (Phase 2): typed-in documents of every kind and plain-text uploads, read
// offline by the rules engine. No key, no network.
delete process.env.ANTHROPIC_API_KEY;

const ADDRESS = "2210 Telephone Rd, Houston, TX 77023";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function newCase(language: "en" | "es" = "en") {
  const r = await createCase(new Request("http://test/api/cases", { method: "POST", body: JSON.stringify({ consent: true, address: ADDRESS, language }) }));
  return (await r.json()).caseId as string;
}
async function send(id: string, parts: { files?: File[]; statement?: string; typed?: unknown }) {
  const form = new FormData();
  for (const f of parts.files ?? []) form.append("files", f);
  if (parts.statement) form.append("statement", parts.statement);
  if (parts.typed !== undefined) form.append("typed", typeof parts.typed === "string" ? parts.typed : JSON.stringify(parts.typed));
  const r = await upload(new Request(`http://test/api/cases/${id}/documents`, { method: "POST", body: form }), params(id));
  return { status: r.status, body: await r.json() };
}

test("typed documents are checked: a known kind, enough words, not too many", async () => {
  const id = await newCase();
  assert.equal((await send(id, { typed: [{ kind: "passport", text: "A long enough description." }] })).status, 400);
  assert.equal((await send(id, { typed: [{ kind: "fema_letter", text: "short" }] })).status, 400);
  assert.equal((await send(id, { typed: [{ kind: "fema_letter", text: "x".repeat(4001) }] })).status, 413);
  assert.equal((await send(id, { typed: "{not json" })).status, 400);
  assert.equal((await send(id, { typed: Array.from({ length: 11 }, () => ({ kind: "other", text: "Some words about it." })) })).status, 413);
  const ok = await send(id, { typed: [{ kind: "lease", text: "Lease for 2210 Telephone Rd, Houston, TX 77023. Landlord: Bayou Rentals." }] });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.documents.map((d: CaseDocument) => [d.kind, d.title, d.source]), [["lease", "Lease", "typed"]]);
});

test("a whole case typed in, offline: the FEMA appeal reaches 100% and is ready to approve", async () => {
  const id = await newCase();
  const r = await send(id, {
    statement: "Hurricane Delfina hit on October 9, 2026 and tore shingles off our roof. Rain came into the living room. We own our house.",
    typed: [
      { kind: "fema_letter", text: "Letter dated October 30, 2026. Registration 4417-22-0091. Decision: ineligible, FEMA could not verify that I lived at the home." },
      { kind: "utility_bill", text: "CenterPoint electric bill. Service address 2210 Telephone Rd. Billing period September 1 to September 30, 2026." },
      { kind: "photo", text: "Photo of the roof: missing shingles and exposed decking. Water stain on the living room ceiling." },
      { kind: "estimate", text: "Gulf Coast Roofing estimate: replace roof and living room drywall. Total $11,250." },
    ],
  });
  assert.equal(r.status, 200);
  const s = await runSessionCase(id);
  const fema = s.matches.find((m) => m.programId === "fema-appeal")!;
  assert.equal(fema.readiness, 1, JSON.stringify(fema.evidence));
  assert.equal(fema.deadline?.date, "2026-12-29", "60 days from the typed letter date");
  assert.equal(s.plan.find((t) => t.id === "task:fema-appeal")?.status, "needs_approval");
  assert(s.events.some((e) => e.action === "Verified proof of occupancy"));
  assert.equal(s.extraction.mode, "rules");
});

test("a typed lease is proof of occupancy for a renter", async () => {
  const id = await newCase();
  await send(id, {
    statement: "We rent. FEMA denied us after the storm on October 9.",
    typed: [{ kind: "lease", text: "Residential lease for 2210 Telephone Rd, Apt 4, Houston, TX 77023, from June 1, 2025 to May 31, 2027." }],
  });
  const s = await runSessionCase(id);
  const ev = s.matches.find((m) => m.programId === "fema-appeal")!.evidence.find((e) => e.type === "proof_of_occupancy")!;
  assert.equal(ev.satisfiedBy.length, 1);
});

test("a plain-text upload is read offline, and its kind guessed from its words", async () => {
  const id = await newCase();
  const letter = "FEMA\nDate of letter: October 30, 2026\nRegistration ID: 4417-22-0091\nDecision: INELIGIBLE — Insufficient information.";
  const r = await send(id, { files: [new File([letter], "fema.txt", { type: "text/plain" })] });
  assert.equal(r.body.documents[0].kind, "fema_letter");
  const s = await runSessionCase(id);
  assert(s.extractions[0].facts.some((f) => f.normalized === "fema_letter_date:2026-10-30"));
  assert(!s.warnings.some((w) => w.includes("fema.txt")), "no 'couldn't read' warning for a text file");
  assert.equal(guessKind("Billing period: Sept 1 - Sept 30. Service address 1 Main St"), "utility_bill");
  assert.equal(guessKind("Grocery list"), "other");
});

test("every intake error and document type has Spanish", () => {
  const messages = [
    "Please choose what kind of document you typed.", "The typed documents could not be read. Please try again.",
    "FEMA letter: please type a little more of what it says.", "Lease: please keep it under 4000 characters.",
    "You can type up to 10 documents.", "You can add up to 10 files.", "roof.heic is larger than 8 MB.",
    "app.exe: please upload a photo (JPEG, PNG, WebP), a PDF or a text file.",
    "Add a file, type a document, or write a few words about what happened.", "This case has expired or was deleted. Please start again.",
    "This task is blocked. Waiting on: Photo ID", "Send the estimate and photos to the adjuster before the inspection.: Unknown task. The plan may have changed; run the agents again.",
    "Failed to fetch", "Upload failed (502)",
  ];
  assert.deepEqual(messages.filter((m) => spanish(m) === undefined), []);
  assert.equal(spanish("FEMA letter: please type a little more of what it says."), "Carta de FEMA: escriba un poco más de lo que dice.");
  for (const k of Object.values(TYPED_KINDS)) assert.equal(spanish(k.en), k.es);
});
