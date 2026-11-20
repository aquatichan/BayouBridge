import type { EvidenceType } from "@/lib/types";

// Curated recovery-pathway database. Each record is hand-written from an
// official source and cites it. BayouBridge never claims eligibility: matches
// are labeled "possible match" and must be verified against the source.
// Last reviewed: 2026-11-16 (demo). Rules are simplified for the demo.

export interface ProgramRule {
  id: string;
  name: string;
  agency: string;
  summary: string;
  /** Which needs or case facts make this pathway worth looking at. */
  triggers: { need?: string; fact?: string; description: string }[];
  requires: { type: EvidenceType; label: string }[];
  /** What renters need instead (they don't repair the building, so no contractor estimate). */
  requiresForRenters?: { type: EvidenceType; label: string }[];
  deadline?: { fromFact: "fema_letter_date" | "insurance_due"; days?: number; basis: string };
  nextAction: string;
  /** The next action as the household reads it in the app, when it differs from the caseworker's wording. */
  nextActionHousehold?: string;
  source: { label: string; url: string };
  caveat: string;
  /** Only for households that own the home (a renter's landlord insures and repairs the building). */
  ownersOnly?: boolean;
  /** Only when the household may have insurance: skipped if they said they have none and no insurer letter is on file. */
  needsInsurance?: boolean;
}

export const EVIDENCE_LABELS: Record<EvidenceType, string> = {
  damage_photo: "Photos of the damage",
  repair_estimate: "Contractor repair estimate",
  fema_determination: "FEMA decision letter",
  insurance_correspondence: "Insurance claim letter or email",
  insurance_policy: "Insurance policy declarations page",
  proof_of_occupancy: "Proof of occupancy (utility bill, lease, or bank statement)",
  proof_of_identity: "Photo ID",
  loss_statement: "Statement describing losses",
  loss_receipts: "Receipts for lost items",
  medical_need_documentation: "Medical documentation of power-dependent equipment",
};

export const programs: ProgramRule[] = [
  {
    id: "fema-appeal",
    name: "FEMA Individual Assistance appeal",
    agency: "FEMA",
    summary:
      "Applicants can appeal a FEMA decision and send missing documents, such as proof of occupancy.",
    triggers: [{ need: "fema_denial", description: "FEMA letter says ineligible for insufficient information" }],
    requires: [
      { type: "fema_determination", label: EVIDENCE_LABELS.fema_determination },
      { type: "proof_of_occupancy", label: EVIDENCE_LABELS.proof_of_occupancy },
      { type: "damage_photo", label: EVIDENCE_LABELS.damage_photo },
      { type: "repair_estimate", label: EVIDENCE_LABELS.repair_estimate },
    ],
    requiresForRenters: [
      { type: "fema_determination", label: EVIDENCE_LABELS.fema_determination },
      { type: "proof_of_occupancy", label: EVIDENCE_LABELS.proof_of_occupancy },
      { type: "damage_photo", label: EVIDENCE_LABELS.damage_photo },
      { type: "loss_statement", label: EVIDENCE_LABELS.loss_statement },
    ],
    deadline: { fromFact: "fema_letter_date", days: 60, basis: "60 days from the date on the FEMA letter" },
    nextAction: "Prepare a signed appeal letter with proof of occupancy attached.",
    source: { label: "FEMA: Individual Assistance", url: "https://www.fema.gov/assistance/individual" },
    caveat: "Possible match. FEMA decides eligibility. Check the appeal instructions in the household's own letter.",
  },
  {
    id: "insurance-claim",
    name: "Homeowners insurance claim (wind damage)",
    agency: "Private insurer",
    summary:
      "Wind and wind-driven rain damage may be covered under the homeowners policy, minus the hurricane deductible.",
    triggers: [{ need: "roof_damage", description: "Wind damage to roof documented in photos and estimate" }],
    requires: [
      { type: "damage_photo", label: EVIDENCE_LABELS.damage_photo },
      { type: "repair_estimate", label: EVIDENCE_LABELS.repair_estimate },
      { type: "insurance_correspondence", label: EVIDENCE_LABELS.insurance_correspondence },
    ],
    deadline: { fromFact: "insurance_due", basis: "Due date stated in the insurer's email" },
    nextAction: "Send the estimate and photos to the adjuster before the inspection.",
    source: { label: "Texas Department of Insurance", url: "https://www.tdi.texas.gov" },
    caveat: "Possible match. Coverage depends on the policy. TDI can help if the household has a dispute.",
    ownersOnly: true,
    needsInsurance: true,
  },
  {
    id: "sba-home-loan",
    name: "SBA disaster home loan",
    agency: "U.S. Small Business Administration",
    summary:
      "Low-interest disaster loans can cover repair costs that insurance and FEMA do not, including for homeowners.",
    triggers: [
      { fact: "coverage_gap", description: "Repair estimate is larger than what insurance is likely to pay" },
    ],
    requires: [
      { type: "repair_estimate", label: EVIDENCE_LABELS.repair_estimate },
      { type: "insurance_correspondence", label: EVIDENCE_LABELS.insurance_correspondence },
      { type: "proof_of_identity", label: EVIDENCE_LABELS.proof_of_identity },
    ],
    nextAction: "Talk with the family about whether a loan fits. Do not apply without their decision.",
    nextActionHousehold: "Decide whether a low-interest SBA loan fits your family. Nothing is sent unless you approve it.",
    source: { label: "SBA: Disaster assistance", url: "https://www.sba.gov/funding-programs/disaster-assistance" },
    caveat: "Possible match. A loan must be repaid. The household decides whether to apply.",
    ownersOnly: true, // this pathway is the home-repair loan; renters' personal-property loans are not modeled yet
  },
  {
    id: "critical-care",
    name: "Critical care electric customer designation",
    agency: "Retail electric provider (Public Utility Commission of Texas rules)",
    summary:
      "Households with someone who depends on electric medical equipment can ask to be listed as critical care customers.",
    triggers: [{ need: "medical_power", description: "Household member uses {equipment}" }], // {equipment}: from the need fact
    requires: [
      { type: "medical_need_documentation", label: EVIDENCE_LABELS.medical_need_documentation },
    ],
    nextAction: "Ask {member}'s doctor to fill out the provider's critical care form.", // {member}: who uses the equipment
    source: { label: "Public Utility Commission of Texas", url: "https://www.puc.texas.gov" },
    caveat: "Possible match. A designation does not guarantee power during an outage. Keep a backup plan.",
  },
  {
    id: "food-assistance",
    name: "Food and immediate-needs referral (2-1-1 Texas)",
    agency: "2-1-1 Texas / United Way",
    summary:
      "2-1-1 connects households with local food pantries and, when activated after a disaster, disaster food benefits.",
    triggers: [{ need: "food_loss", description: "Household lost refrigerated food during the outage" }],
    requires: [{ type: "loss_statement", label: EVIDENCE_LABELS.loss_statement }],
    nextAction: "Draft a referral message to a nearby food pantry partner.",
    source: { label: "2-1-1 Texas", url: "https://www.211texas.org" },
    caveat: "Referral only. Disaster food benefits are available only when the state activates them.",
  },
];
