import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CaseDocument, ExtractionResult, Fact, FactType } from "@/lib/types";
import { classify } from "./evidence";
import { ExtractionError } from "./util";
import { fillFromRules, validateFacts } from "./validate";

// Evidence Agent — Claude extraction path. Only used when ANTHROPIC_API_KEY is
// set on the server. The LLM only pulls facts out of text; every decision after
// that (matching, deadlines, gaps) is deterministic code.

const FACT_TYPES = [
  "person", "address", "date_of_loss", "money", "claim_number", "policy_number",
  "fema_registration", "deadline", "appointment", "damage", "need", "determination",
  "exclusion", "mentions_evidence", "billing_period",
] as const;

const Extraction = z.object({
  facts: z.array(
    z.object({
      type: z.enum(FACT_TYPES),
      label: z.string(),
      value: z.string(),
      normalized: z.string(),
      confidence: z.number(),
      quote: z.string(),
    }),
  ),
});

const SYSTEM = `You extract facts from disaster-recovery documents for a caseworker tool.
Return only facts stated in the document. "quote" must be copied exactly from the document.
Normalization rules for "normalized":
- date_of_loss and appointment: ISO date YYYY-MM-DD
- deadline: "fema_letter_date:YYYY-MM-DD" for the date on a FEMA letter, "insurance_due:YYYY-MM-DD" for a date the insurer wants documents by
- money: plain number, no $ or commas
- damage: "roof_damage" or "interior_water_damage"
- need: "medical_power" or "food_loss"
- determination: "fema_ineligible_info" for a FEMA insufficient-information decision, "missing:proof_of_occupancy" if occupancy could not be verified
- exclusion: "flood_excluded" if flood damage is excluded
- mentions_evidence: "has:<evidence_type>" if the person says they have a document they did not upload, "absent:<evidence_type>" if they say they do not have it. Evidence types: proof_of_occupancy, loss_receipts, proof_of_identity, medical_need_documentation
- person: "role:mother", "role:son", or "" for the main applicant
- billing_period: "billing_end:YYYY-MM-DD", the last day of a bill's service period
- otherwise an empty string.
For money facts use labels: "Repair estimate total", "Hurricane deductible", "Food lost in outage (estimated)", "Interior repair line items".`;

/** Per-request SDK timeout. The coordinator adds its own backstop on top (see coordinator.ts). */
export const CLAUDE_REQUEST_TIMEOUT_MS = 12_000;

// Created on first use, not at import: a module-scope client can throw while
// the route module loads if the environment is odd, which would break the
// offline path too.
let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    try {
      client = new Anthropic();
    } catch (err) {
      throw new ExtractionError("error", `could not create the Anthropic client: ${(err as Error).message}`);
    }
  }
  return client;
}

/** Map SDK errors to a fallback reason using the SDK's typed error classes. */
function toExtractionError(err: unknown): Error {
  if (err instanceof ExtractionError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ExtractionError("timeout", "Claude request timed out");
  if (err instanceof Anthropic.APIUserAbortError) return new ExtractionError("timeout", "Claude request was cancelled");
  if (err instanceof Anthropic.AuthenticationError) return new ExtractionError("error", "API key was rejected (401)");
  if (err instanceof Anthropic.APIConnectionError) return new ExtractionError("error", "could not reach the Claude API");
  if (err instanceof Anthropic.APIError) return new ExtractionError("error", `Claude API returned ${err.status ?? "an error"}`);
  // Non-HTTP SDK errors from .parse() mean the structured output did not match the schema.
  if (err instanceof Anthropic.AnthropicError) return new ExtractionError("validation", err.message.split("\n")[0]);
  return err instanceof Error ? err : new Error(String(err));
}

export async function extractWithClaude(doc: CaseDocument, opts: { signal?: AbortSignal } = {}): Promise<ExtractionResult> {
  let response;
  try {
    response = await getClient().messages.parse(
      {
        model: "claude-opus-5-5",
        max_tokens: 4000,
        output_config: { effort: "low", format: zodOutputFormat(Extraction) },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Document type: ${doc.kind}\nFilename: ${doc.filename}\n\n<document>\n${doc.text}\n</document>`,
          },
        ],
      },
      // No SDK retries: the coordinator falls back to rules instead, which is faster on stage.
      { timeout: CLAUDE_REQUEST_TIMEOUT_MS, maxRetries: 0, signal: opts.signal },
    );
  } catch (err) {
    throw toExtractionError(err);
  }
  if (response.stop_reason === "refusal") throw new ExtractionError("refusal", "Claude declined to extract this document");
  if (response.stop_reason === "max_tokens") throw new ExtractionError("validation", "Claude's output was cut off at max_tokens");
  if (!response.parsed_output) throw new ExtractionError("validation", `no structured output (stop reason: ${response.stop_reason})`);
  return fromClaudeOutput(doc, response.parsed_output.facts);
}

export type ClaudeFact = z.infer<typeof Extraction>["facts"][number];

/**
 * Turn Claude's raw facts into an ExtractionResult the rules engine can trust:
 * validate quotes and normalized values, then add back anything the offline
 * rules extractor finds that Claude missed. Pure, so tests can call it directly.
 */
export function fromClaudeOutput(doc: CaseDocument, raw: ClaudeFact[]): ExtractionResult {
  const facts: Fact[] = raw.map((f, i) => ({
    id: `${doc.id}#c${i + 1}`,
    docId: doc.id,
    type: f.type as FactType,
    label: f.label,
    value: f.value,
    normalized: f.normalized || undefined,
    confidence: f.confidence,
    quote: f.quote,
  }));
  const checked = validateFacts(doc, facts);
  if (!checked.facts.length) {
    throw new ExtractionError("validation", raw.length ? `none of Claude's ${raw.length} facts passed validation` : "Claude returned no facts");
  }
  const filled = fillFromRules(doc, checked.facts);
  return {
    docId: doc.id,
    evidenceTypes: classify(doc, filled.facts),
    facts: filled.facts,
    method: "claude",
    issues: [...checked.issues, ...filled.issues],
  };
}
