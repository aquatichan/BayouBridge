# BayouBridge

After a hurricane, families in Houston end up with a pile of paperwork: a FEMA letter saying no, an insurance email with a deadline buried in it, a contractor's estimate, damage photos on a phone. Caseworkers spend hours sorting that pile before they can actually help anyone.

BayouBridge sorts it. You give it photos, letters, bills and your own description of what happened, in English or Spanish. It pulls out the facts, finds recovery programs that might fit, says which papers are still missing, asks for the one that would help most, and drafts the packets and letters. Then it waits. Nothing is sent until a person approves it, and even then it only goes to a practice outbox. It only ever says a program is a *possible match*; the agency decides who qualifies.

Every household, document, company and storm in this repo is made up. "Hurricane Delfina" and "DR-9999-TX" don't exist.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No API key is needed. To let it read photos and PDFs, put `ANTHROPIC_API_KEY=...` in `.env.local`. That's the only environment variable required to run it.

## Case storage (Redis, encrypted)

Every case is one value in a key-value store (`src/lib/kv.ts`, `src/lib/store.ts`):

- **With Redis configured**, every serverless instance shares the same cases, so they survive restarts, redeploys and cold starts. Case records are encrypted with AES-256-GCM before they leave the server (`src/lib/seal.ts`), and uploaded file bytes are encrypted and stored in ~400 KB chunks. Session cases carry a native 2-hour expiry that is pushed out each time the case is used; "Delete my case" deletes every key at once. Changes take a short per-case lock, so a double-clicked Approve queues a packet once.
- **Without Redis** (local dev, tests) it falls back to process memory, as before. Nothing is written to disk.

Set these on Vercel (add Upstash Redis from the Marketplace, which sets the first two for you):

- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (the `KV_REST_API_URL` / `KV_REST_API_TOKEN` names Vercel uses also work).
- `BAYOUBRIDGE_CASE_KEY` — **required whenever Redis is used**; the server refuses to store a case without it. A 64-hex-char (32-byte) key, a base64 32-byte key, or any passphrase (stretched with scrypt). Keep it in the environment only. Lose it and existing cases can't be opened.

Uploaded-file chunks expire 30 minutes after the case record would (and are re-extended while the case is in use), so they never vanish early; once a case is gone nothing can open them.

Open `/case` and pick one of two paths.

**Try a sample case.** Pick one of three made-up families:

| | Who | What happened |
|---|---|---|
| **Reyes** | Ana, her mother Carmen (on oxygen) and her son Luis. They own their home. | Roof torn open, living room flooded, oxygen lost power. FEMA said no. |
| **Johnson** | Denise, a single mom of three who rents. Her daughter Amara needs a nebulizer. No renters insurance. | Rain through the kids' ceiling, mold, food lost. FEMA said no. |
| **Nguyen** | Minh and Lan, retired, insured, house paid off. | An oak tree through the garage, roof damage, rain in the back bedroom. |

You get the family's pile of papers. Drag them into the BayouBridge box (or hit **Drop all in**) and watch the helpers in the office read them; each one shows what it's doing above its head. When the plan is ready, the helpers ask for what's missing and the family "finds" more papers to drop in. Answer the "which date is right?" questions, open **See what will be sent**, and approve each draft. You're done when every step is green. The panel also shows what each paper is used for. Sample families are always read by the rules engine, so the demo works without a key and never calls a model.

Damage photos show a picture when there's one at `public/demo/` (`johnson-bedroom.jpg`, `johnson-kitchen.jpg`, `nguyen-roof.jpg`, `nguyen-bedroom.jpg`; Reyes uses `roof.svg` and `living-room.svg`). Without one, a paper icon shows instead.

**Start my case.** Use it the way a survivor would: describe what happened, drag in photos and PDFs, or type out what a letter says if you don't have a picture of it. You can keep adding papers and it rereads only the new ones.

You can switch between English and Spanish at any point. `/details` explains how it works and `/privacy` is the privacy policy.

## How it works

```
your papers ─▶ Evidence Agent ─▶ people · needs · conflicts ─▶ Recovery-Match Agent ─▶ Follow-up Agent ─▶ plan ─▶ Safety Agent
                (reads them)      (who's who, what doesn't match)  (programs that may fit)   (what's missing)           (holds drafts for you)
```

AI is only used to read papers. Everything after that is plain code that gives the same answer every time, and every fact links back to a quote from one of the papers.

- **With a key**, Claude reads photos, PDFs and typed text. We check what it returns: every quote has to actually appear in the document, and anything Claude missed that the rules engine finds gets added back. If Claude is slow, refuses or errors on a document, the rules engine reads that document instead and the run keeps going. The app shows which one read each paper.
- **Without a key**, the rules engine reads typed text and text files in English and Spanish: storm date, roof and water damage, a FEMA denial, renting or owning, no insurance, family members and ages, medical equipment, how long the power was out. It can't read photos or PDFs, and the app says so.

## FEMA appeals

A FEMA appeal is a signed letter sent within 60 days of the decision letter's date. It lists the registration and disaster numbers and includes documents that fix whatever FEMA said was missing. BayouBridge follows that:

- It reads the letter's date and counts 60 days from it.
- Everyone needs the FEMA letter, damage photos, and proof they lived there: a bill, lease or bank statement for that address, dated before the storm.
- Owners also need proof of ownership (deed, mortgage statement or tax bill). Renters need a statement of what they lost instead, since they don't repair the building.
- Once everything is there, it drafts the letter in English and Spanish with the registration number, disaster number, enclosures and a signature line. FEMA requires a signature, so the family prints, signs and mails it.

The program rules are simplified for the demo and aren't official guidance. Each program card links to its real source.

## Privacy

Uploading your own papers requires agreeing to a consent screen first. Files are kept encrypted (AES-256-GCM) in Redis when it is configured, or in server memory when it isn't, and are deleted after 2 hours of inactivity or as soon as you hit "Delete my case". Photos are shrunk in your browser before upload, which also strips location data. With a key set, photos and PDFs are sent to Anthropic to be read, and the app tells you that before you upload. Sample families never leave the server.

Limits per case: 10 files (8 MB each; JPEG, PNG, WebP, GIF, PDF or plain text), 10 typed documents, and 63 Claude reads. Cases are anonymous, so the read cap is what keeps someone from rerunning a case to spend the API key. Requests to `/api/run` without a case id run the shared demo case on the rules engine only.

---

## For developers

```bash
npm test                    # offline, about five seconds
UPDATE_GOLDEN=1 npm test    # accept an intended change to the rules-mode snapshot, then read the diff
npx tsx scripts/run-demo.ts johnson   # run the pipeline in the terminal (reyes, johnson or nguyen)
npx tsc --noEmit && npm run lint && npm run build
```

`scripts/run-demo.ts reyes` is the only place the shared demo case is read with Claude (when a key is set). To build while `npm run dev` is running, use `NEXT_DIST_DIR=.next-verify npm run build`.

| Where | What |
|---|---|
| `src/app/page.tsx` | The scroll-driven landing page |
| `src/app/case/` | The app (`?start=1` opens at consent, `?sample=johnson` opens a sample) |
| `src/app/api/[...path]/` | The one API route. It hands each request to a handler in `src/server/api/` (cases, uploads, the live run stream, approvals, conflict answers, the practice outbox) |
| `src/components/app/` | Onboarding, the results panel, the sample paper pile, English and Spanish text |
| `src/components/office/` | The 3D office where the helpers walk to their desks |
| `src/data/demos.ts` | The three sample households and their documents |
| `src/data/resources.ts` | The recovery programs: what each one needs, which needs it serves, links to official sources |
| `src/lib/agents/` | Evidence (rules and Claude), validation, recovery matching, packets, and the coordinator that runs them as a task graph |
| `src/lib/es.ts` | Spanish for everything the helpers write |
| `tests/` | Golden snapshot, Claude-path stubs (timeouts, refusals, made-up quotes), intake, demo playthroughs, Spanish coverage, API hardening |

If you change what the helpers write in English, `tests/spanish.test.ts` and `tests/demos.test.ts` will fail until `src/lib/es.ts` has the Spanish for it.
