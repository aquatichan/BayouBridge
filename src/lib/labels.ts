import type { ExtractionSummary } from "@/lib/types";

// Display text for the extraction badge, shared by the dashboard and scripts/run-demo.ts.

export function extractionLabel(x: ExtractionSummary): string {
  if (x.mode === "claude") return "Claude";
  if (x.mode === "rules") return "rules engine";
  return `Claude ${x.claude} · rules ${x.rules}`;
}

export function extractionTooltip(x: ExtractionSummary): string {
  const total = x.claude + x.rules;
  if (x.mode === "claude") return "Claude read every document. Its facts were checked against the document text and backstopped by the rules engine.";
  if (x.mode === "rules" && !x.fellBack) return "No API key is set, so the offline rules engine read every document.";
  const which = x.mode === "rules" ? `All ${total} documents` : `${x.fellBack} of ${total} documents`;
  return `${which} fell back to the offline rules engine because Claude timed out, refused, returned unusable output or errored. The agent log shows the reason for each.`;
}
