# BayouBridge

After a hurricane, a family usually isn't short on help. They're short on paperwork. There's a FEMA letter that says no, an insurance email with a deadline buried in it, a contractor's estimate, a phone full of damage photos, and nobody sure which pile matters most. Community caseworkers in Houston spend hours sorting exactly this before they can help anyone.

BayouBridge does that sorting. Hand it a household's photos, letters, bills and their own words (in English or Spanish), and a small team of AI helpers will:

- read everything and pull out the facts that matter,
- work out who's in the household and what they need,
- find the recovery programs that might fit,
- say what's still missing, and ask for the one thing that unlocks the most help,
- draft the packets and letters, and then **wait for a person to say OK**.

Nothing is ever sent anywhere on its own. Approved drafts go to a practice outbox, and BayouBridge only ever says a program is a *possible match*. The agency decides who qualifies.

Built for [Teen Hacks Houston](https://tripleh.devpost.com/). Every household, document, company and storm in this repo is made up. "Hurricane Delfina" and "DR-9999-TX" don't exist.

## Try it

```bash
npm install
npm run dev        # http://localhost:3000
```

Open `/case` and pick one of two paths.

**Try a sample case.** Choose one of three made-up families:

| | Who | What happened |
|---|---|---|
| **Reyes** | Ana, her mother Carmen (on oxygen) and her son Luis. They own their home. | Roof torn open, living room flooded, oxygen lost power. FEMA said no. |
| **Johnson** | Denise, a renting single mother of three. Her daughter Amara needs a nebulizer. No renters insurance. | Rain through the kids' ceiling, mold, food lost. FEMA said no. |
| **Nguyen** | Minh and Lan, retired, insured, home paid off. | An oak tree through the garage, roof damage, rain in the back bedroom. |

Each family starts with gaps. Their missing papers sit in a **Your papers** tray, mixed in with a few that don't help (a grocery receipt, a library card). Drag the right paper into the colored folder on the step that's waiting. Answer the "which date is right?" questions. Open **See what will be sent**, then approve each draft. When every step is green, you're done. Sample families are always read by a simple rules engine, so the demo works with no AI key and never calls a model.

**Start my case.** Use it like a real survivor would. Say what happened in your own words, drag in photos and PDFs, or type out what a letter says if you don't have a picture of it. The helpers keep reading as you add more.

Everything works in English and Spanish, and you can flip between them at any time.

`/details` explains how it all works, and `/privacy` is the privacy policy.

## What the helpers do

```
your papers ─▶ Evidence Agent ─▶ people · needs · conflicts ─▶ Recovery-Match Agent ─▶ Follow-up Agent ─▶ plan ─▶ Safety Agent
                (reads them)      (who's who, what doesn't match)  (programs that may fit)   (what's missing)           (holds drafts for you)
```

The only step that uses AI is reading. After that it's plain code that gives the same answer every time, and every fact can be traced back to a quote in one of your documents.

- **With a Claude key** (put `ANTHROPIC_API_KEY` in `.env.local`), Claude reads photos, PDFs and typed words. Its answers are checked: every quote has to really appear in the document, and anything it misses, the rules engine fills in. If Claude is slow, refuses or fails, that one document falls back to the rules engine and the run keeps going. The app always shows which one read your case.
- **Without a key**, the rules engine reads typed words and text files in English and Spanish: the storm date, roof and water damage, a FEMA denial, renting or owning, no insurance, family members and ages, medical equipment, outage length. Photos and PDFs can't be read without a key, and the app says so plainly.

## What a FEMA appeal needs

FEMA appeals are a signed letter, sent within 60 days of the decision letter's date. It names the registration and disaster numbers and comes with documents that fix whatever FEMA said was missing. BayouBridge mirrors that:

- It reads the letter date and counts the 60 days.
- Everyone needs the FEMA letter, proof they lived there (a bill, lease or bank statement dated before the storm, at the right address) and damage photos.
- **Owners** also show proof of ownership (deed, mortgage statement or tax bill). **Renters** show a statement of what they lost, since they don't repair the building.
- Once it's all there, it drafts the appeal letter in English and Spanish with the registration number, disaster number, enclosures and a signature line. FEMA needs it signed, so the household prints, signs and sends it.

The program rules are simplified for the demo and are not official guidance. Each program card links to its real source.

## Privacy

Real uploads need consent first. Files live in server memory only, never on disk or in a database, and are deleted after 2 hours or the moment you choose "Delete my case". Photos are shrunk on your device first, which also strips their location. With a Claude key set, photos and PDFs are sent to Anthropic to be read, and the app tells you so before you upload. Sample households never leave the server.

You can add up to 10 files (8 MB each; JPEG, PNG, WebP, GIF, PDF or plain text) and 10 typed documents per case.

## For developers

```bash
npm test                    # offline, a few seconds
UPDATE_GOLDEN=1 npm test    # accept an intended change to the rules-mode snapshot, then read the diff
npx tsx scripts/run-demo.ts johnson   # run the pipeline in the terminal (reyes, johnson or nguyen)
npx tsc --noEmit && npm run lint && npm run build
```

To build while `npm run dev` is running, use `NEXT_DIST_DIR=.next-verify npm run build`.

| Where | What |
|---|---|
| `src/app/page.tsx` | The scroll-driven landing page |
| `src/app/case/` | The household app (`?start=1` opens at consent, `?sample=johnson` opens a sample) |
| `src/app/api/` | Cases, uploads, the live run stream, approvals, conflict answers, the practice outbox |
| `src/components/app/` | Onboarding, the results panel, the papers and folders activity, English and Spanish text |
| `src/components/office/` | The 3D office where the helpers walk to their desks |
| `src/data/demos.ts` | The three sample households and their documents |
| `src/data/resources.ts` | The recovery programs, what each requires, and links to official sources |
| `src/lib/agents/` | The helpers: evidence (rules and Claude), validation, recovery matching, packets, and the coordinator that runs them as a task graph |
| `src/lib/es.ts` | The Spanish phrasebook for everything the helpers write |
| `tests/` | Golden snapshot, Claude-path stubs (timeouts, refusals, made-up quotes), intake, demo playthroughs and Spanish coverage |

If you change what the helpers write in English, `tests/spanish.test.ts` and `tests/demos.test.ts` will fail until `src/lib/es.ts` has the Spanish for it.
