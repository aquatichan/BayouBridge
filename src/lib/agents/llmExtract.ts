import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CaseDocument, ExtractionResult, FactType } from "@/lib/types";
import { classify, parseDate } from "./evidence";

// Evidence Agent — Claude extraction path. Only used when ANTHROPIC_API_KEY is
// set on the server. The LLM only pulls facts out of text; every decision after
// that (matching, deadlines, gaps) is deterministic code.

const FACT_TYPES = [
  "person", "address", "date_of_loss", "money", "claim_number", "policy_number",
  "fema_registration", "deadline", "appointment", "damage", "need", "determination",
  "exclusion", "mentions_evidence",
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
- otherwise an empty string.
For money facts use labels: "Repair estimate total", "Hurricane deductible", "Food lost in outage (estimated)", "Interior repair line items".`;

const client = new Anthropic();

export async function extractWithClaude(doc: CaseDocument): Promise<ExtractionResult> {
  const response = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(Extraction) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Document type: ${doc.kind}\nFilename: ${doc.filename}\n\n<document>\n${doc.text}\n</document>`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Extraction failed for ${doc.id}: ${response.stop_reason}`);
  }
  const facts = response.parsed_output.facts.map((f, i) => ({
    id: `${doc.id}#c${i + 1}`,
    docId: doc.id,
    type: f.type as FactType,
    label: f.label,
    value: f.value,
    normalized:
      f.normalized ||
      (f.type === "date_of_loss" ? parseDate(f.value) : undefined),
    confidence: Math.max(0, Math.min(1, f.confidence)),
    quote: f.quote,
  }));
  return { docId: doc.id, evidenceTypes: classify(doc, facts), facts, method: "claude" };
}
