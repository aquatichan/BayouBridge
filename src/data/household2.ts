import type { CaseDocument } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// A SECOND SYNTHETIC HOUSEHOLD, used only by tests/generic-household.test.ts to
// prove the pipeline has no Reyes-specific code paths. Every name, address and
// number here is fictional, like the Reyes case.
// ─────────────────────────────────────────────────────────────────────────────

export const household2 = {
  caseId: "BB-0522",
  name: "Okafor household",
  address: "512 Willow Creek Dr, Houston, TX 77016",
  disaster: "Hurricane Delfina (fictional) · DR-9999-TX",
};

export const documents2: CaseDocument[] = [
  {
    id: "h2-roof-photo", kind: "photo", title: "Roof photo", filename: "PXL_0311.jpg", mime: "image/jpeg",
    receivedAt: "2026-10-12", language: "en",
    text: `[Vision caption]
Exterior photo of a two-story frame house at 512 Willow Creek Dr.
Roof: wind damage to roof along the ridge, missing shingles near the chimney.
Photo metadata timestamp: 2026-10-11 09:02.`,
  },
  {
    id: "h2-estimate", kind: "estimate", title: "Contractor estimate", filename: "Quote_7781.pdf", mime: "application/pdf",
    receivedAt: "2026-10-16", language: "en",
    text: `NORTHSIDE HOME REPAIR (fictional)
QUOTE #7781          Date: October 16, 2026
Customer: Grace Okafor
Property: 512 Willow Creek Dr, Houston, TX 77016

Ridge and shingle replacement .................... $6,900.00
Interior drywall, kitchen (6 ft) ................. $2,240.00
Cabinet base repair .............................. $820.00

TOTAL ............................................ $9,960.00
Cause noted by estimator: wind damage to roof, rain intrusion to kitchen.`,
  },
  {
    id: "h2-fema-letter", kind: "fema_letter", title: "FEMA decision letter", filename: "FEMA_Letter_Oct30.pdf", mime: "application/pdf",
    receivedAt: "2026-11-03", language: "en",
    text: `FEMA — Individuals and Households Program (synthetic sample)
Date of letter: October 30, 2026
Applicant: Grace Okafor
FEMA Registration ID: 9271-60418
Damaged dwelling: 512 Willow Creek Dr, Houston, TX 77016
Date of incident: October 9, 2026

Decision: INELIGIBLE — Insufficient Information.
Reason: We could not verify that you lived in the damaged home as your primary residence
at the time of the disaster (occupancy).`,
  },
  {
    id: "h2-insurance-email", kind: "insurance_email", title: "Insurer email", filename: "RE_Claim_HO-TX-26-220917.eml", mime: "message/rfc822",
    receivedAt: "2026-11-04", language: "en",
    text: `From: claims@lonestar-home.example (Lone Star Home Insurance — fictional)
Subject: RE: Claim HO-TX-26-220917

Dear Grace Okafor-Mensah,

We have opened claim HO-TX-26-220917 under policy HO3-7720456 for date of loss October 8, 2026.
An adjuster inspection is scheduled for November 21, 2026 at 2:00 PM.
Please upload your contractor estimate and photos of the damage by November 25, 2026.
Please note: damage caused by flood or rising water is excluded under your homeowners policy.
Wind damage may be covered subject to your hurricane deductible of $3,100.`,
  },
  {
    id: "h2-voice-note", kind: "voice_note", title: "Voice note from Grace", filename: "voice_grace.m4a", mime: "audio/mp4",
    receivedAt: "2026-11-06", language: "en",
    text: `[Transcript, English — 0:40]
Hi, this is Grace. We lost power for three days and we lost all our food.
My mother, Ruth Okafor, is 78 and uses a CPAP machine at night.
My September electric bill is in my email, I just haven't printed it.`,
  },
];
