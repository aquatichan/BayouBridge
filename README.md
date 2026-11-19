# BayouBridge

**Houston's disaster-recovery autopilot for community caseworkers.** BayouBridge turns a storm-affected household's messy photos, letters, emails and voice notes into organized evidence, matched recovery pathways, deadlines and a tracked plan. A navigator approves anything before it goes out.

Built for [Teen Hacks Houston](https://tripleh.devpost.com/). All households, documents, companies and storms in this repo are **synthetic**. "Hurricane Delfina" and "DR-9999-TX" do not exist.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

- `/` is the household app: **Start my case** (consent, your address, upload photos, letters and PDFs, or say what happened in your own words) or **Try a sample case** (the synthetic Reyes family). The agents then work the case in a 3D office: each mascot walks to its desk as its agent works, and the camera follows whoever is busiest. Results fill a side panel (a bottom sheet on phones): next steps with approvals, programs, documents, household and the practice outbox. English and Spanish.
- `/details` explains how everything works, in depth, in a newspaper-style page; `/privacy` is the privacy policy in the same format.

To build while `npm run dev` is running, use a separate output folder so the two don't overwrite each other: `NEXT_DIST_DIR=.next-verify npm run build`.

Optional: set `ANTHROPIC_API_KEY` in `.env.local` to have Claude do the document extraction (and to read uploaded photos and PDFs). Without a key, a rules-based extractor runs instead, so the demo always works offline. Everything after extraction is deterministic code.

`npx tsx scripts/run-demo.ts` runs the whole pipeline in the terminal and prints the agent log.

## Tests

```bash
npm test                     # node:test via tsx, offline, about 5 s
UPDATE_GOLDEN=1 npm test     # accept an intended change to the rules-mode output, then review the fixture diff
```

- `tests/golden.test.ts`: the offline demo run is snapshotted in `tests/fixtures/rules-demo.json`, plus the electric-bill re-run (FEMA appeal 75% → 100%).
- `tests/claude-path.test.ts`: the Claude path with stub extractors and no network: timeouts, the circuit breaker, refusals, hallucinated quotes, repairs, and the rules backstop.
- `tests/server.test.ts`: the approval gate (404/409/400, idempotent, survives a re-run) and the live event stream, calling the route handlers directly.

CI note: there is no GitHub Actions workflow yet. `npm ci && npx tsc --noEmit && npm run lint && npm test && npm run build` is the full check and needs no API key.

## How it works

```
documents ─▶ Evidence Agent ─▶ people · needs · conflicts ─▶ Recovery-Match Agent ─▶ Follow-up Agent ─▶ plan ─▶ Safety Agent
                (extract)        (entity resolution)          (rules + citations)    (gaps, best ask)          (approval gates)
```

| File | What it does |
|---|---|
| `src/data/household.ts` | The synthetic Reyes household and its 6 files (2 photos, estimate, FEMA letter, insurer email, Spanish voice note) |
| `src/data/resources.ts` | Curated recovery pathways. Each one has its trigger, required evidence, deadline rule and an official source link |
| `src/lib/agents/evidence.ts` | Evidence Agent: rules-based fact extraction and document classification |
| `src/lib/agents/llmExtract.ts` | Evidence Agent, Claude path (structured output). Used only when an API key is set |
| `src/lib/agents/validate.ts` | Checks Claude's facts against the document text and backfills anything the rules extractor finds |
| `src/lib/agents/packet.ts` | Packet Agent: drafts the attachments, citations and bilingual cover note for a ready pathway |
| `src/lib/agents/recovery.ts` | Entity resolution, conflict detection, rules engine, evidence score, best follow-up question, plan, recovery graph |
| `src/lib/agents/coordinator.ts` | Runs every step as a dependency graph and writes the activity log. Time limits and the rules fallback for Claude live here |
| `src/lib/store.ts` | In-memory, demo-grade case store: last run, approvals and the sandbox outbox. Resets on restart |
| `src/app/api/run/stream/route.ts` | Streams agent events live (Server-Sent Events). `src/app/api/run/route.ts` is the non-streaming fallback |
| `src/app/api/approve/route.ts` | The only place a task can be approved. Blocked tasks are refused (409) |
| `src/components/app/` | The household app: onboarding steps, the results panel, English/Spanish text |
| `src/components/office/` | The 3D office (React Three Fiber): mascots from `public/models/`, desks, follow camera, labels |
| `src/lib/office/director.ts` | Turns agent tasks into mascot walk-and-work jobs and picks who the camera follows. No 3D code, unit-tested |
| `src/lib/cases.ts` | Session cases: create (real or sample), uploads, running a case with Claude reading the files |
| `src/components/details/` | The newspaper-style pages: `/details` (how it all works) and `/privacy` |
| `src/components/bits/` | Animated components adapted from React Bits (aurora, blur-in text, count-up, spotlight cards, magnetic buttons) |
| `src/components/RecoveryGraph.tsx` | The evidence → needs → pathways → deadlines graph |

## Guardrails

- Recommendations are labeled "possible match" and link to their source. BayouBridge never claims eligibility.
- Nothing is sent or submitted without the household's approval. Sends go to a practice outbox only.
- The example case is made up (synthetic).
- Real uploads ("Start my case") need consent first. They are kept in server memory only, never on disk or in a database, and are deleted after 2 hours or at once with "Delete my case". With an `ANTHROPIC_API_KEY` set, photos and PDFs are sent to Anthropic's Claude API to be read; without one they aren't read at all, and the case says so. Photos are resized in the browser first, which also drops their GPS location. Document text is never logged.
- Limits: 10 files per case, 8 MB each; JPEG, PNG, WebP, GIF, PDF or plain text.

## Next slices

Upload center (real OCR/vision/speech-to-text), packet and PDF generation, approval center, sandbox inbox with simulated replies, bilingual household view.
