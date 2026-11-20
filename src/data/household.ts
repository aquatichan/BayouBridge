import type { CaseDocument } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC DEMO HOUSEHOLD. Every name, address, number, company and storm in
// this file is fictional. "Hurricane Delfina" and "DR-9999-TX" do not exist.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_TODAY = "2026-11-18";

export const household = {
  caseId: "BB-0417",
  name: "Reyes household",
  address: "1847 Cypress Bayou Ln, Houston, TX 77093",
  disaster: "Hurricane Delfina (fictional) · DR-9999-TX",
};

export const documents: CaseDocument[] = [
  {
    id: "doc-roof-photo",
    kind: "photo",
    title: "Roof damage photo",
    filename: "IMG_2041.jpg",
    mime: "image/jpeg",
    receivedAt: "2026-10-10",
    language: "en",
    preview: "/demo/roof.svg",
    text: `[Vision caption]
Exterior photo of a single-story brick home at 1847 Cypress Bayou Ln.
Roof: large section of missing shingles on the north slope, exposed wood decking.
A blue tarp is partially installed. A fallen tree limb rests on the front gutter, which is bent.
Photo metadata timestamp: 2026-10-10 08:14.`,
  },
  {
    id: "doc-interior-photo",
    kind: "photo",
    title: "Living room water damage photo",
    filename: "IMG_2057.jpg",
    mime: "image/jpeg",
    receivedAt: "2026-10-10",
    language: "en",
    preview: "/demo/living-room.svg",
    text: `[Vision caption]
Interior living room. A water line is visible on the drywall about 14 inches above the floor.
Carpet is soaked, the couch is water-damaged, and a box fan is drying the room.
Ceiling stain near the north wall suggests water coming in through the roof.
Photo metadata timestamp: 2026-10-10 15:40.`,
  },
  {
    id: "doc-estimate",
    kind: "estimate",
    title: "Contractor repair estimate",
    filename: "Estimate_E-2291.pdf",
    mime: "application/pdf",
    receivedAt: "2026-10-14",
    language: "en",
    text: `BAYOU CITY ROOFING & REPAIR (fictional)
ESTIMATE #E-2291          Date: October 14, 2026
Customer: Ana Reyes
Property: 1847 Cypress Bayou Ln, Houston, TX 77093

Roof tear-off and replace, 22 squares ............ $11,400.00
Replace damaged decking, 6 sheets ................ $780.00
Gutter repair, front elevation ................... $640.00
Interior drywall cut and replace (4 ft) .......... $1,630.00
Carpet removal and disposal ...................... $400.00

TOTAL ............................................ $14,850.00
Cause noted by estimator: wind damage to roof, rain intrusion to living room.
Estimate valid 30 days.`,
  },
  {
    id: "doc-fema-letter",
    kind: "fema_letter",
    title: "FEMA decision letter",
    filename: "FEMA_Letter_Oct28.pdf",
    mime: "application/pdf",
    receivedAt: "2026-11-01",
    language: "en",
    text: `FEMA — Individuals and Households Program (synthetic sample)
Date of letter: October 28, 2026
Applicant: Ana Reyes
FEMA Registration ID: 9271-55310
Disaster: DR-9999-TX, Hurricane Delfina
Damaged dwelling: 1847 Cypress Bayou Ln, Houston, TX 77093
Date of incident: October 9, 2026

Decision: INELIGIBLE — Insufficient Information.
Reason: We could not verify that you lived in the damaged home as your primary residence
at the time of the disaster (occupancy).

You may send documents that prove occupancy, such as a utility bill, lease, mortgage statement,
or bank statement showing this address dated before the disaster.

You have the right to appeal. Your appeal must be submitted within 60 days of the date of this letter.`,
  },
  {
    id: "doc-insurance-email",
    kind: "insurance_email",
    title: "Insurance adjuster email",
    filename: "RE_Claim_HO-TX-26-118204.eml",
    mime: "message/rfc822",
    receivedAt: "2026-11-02",
    language: "en",
    text: `From: claims@gulfshore-mutual.example (Gulfshore Mutual Insurance — fictional)
Date: November 2, 2026
Subject: RE: Claim HO-TX-26-118204

Dear Anna Reyes-Ortega,

We have opened claim HO-TX-26-118204 under policy HO3-5531907 for date of loss October 10, 2026.
An adjuster inspection is scheduled for November 20, 2026 at 10:00 AM.

Please upload your contractor estimate and photos of the damage by November 24, 2026.

Please note: damage caused by flood or rising water is excluded under your homeowners policy.
Wind and wind-driven rain damage may be covered subject to your hurricane deductible of $4,200.

Gulfshore Mutual Claims Team`,
  },
  {
    id: "doc-voice-note",
    kind: "voice_note",
    title: "Voice note from Ana (Spanish)",
    filename: "nota_de_voz_ana.m4a",
    mime: "audio/mp4",
    receivedAt: "2026-11-05",
    language: "es",
    text: `[Transcript, Spanish — 0:52]
Hola, soy Ana Reyes. Se fue la luz cuatro días después del huracán y perdimos toda la comida
del refrigerador, como 380 dólares. No guardé los recibos de la comida.
Mi mamá, Carmen Ortega, tiene 71 años y usa un concentrador de oxígeno que necesita electricidad.
Cuando se fue la luz tuvimos que llevarla a la casa de mi hermana.
Mi hijo Luis tiene 16 años y vive con nosotras.
La factura de la luz de septiembre la tengo en mi correo electrónico, pero no la he imprimido.`,
  },
];

/**
 * Documents that arrive after the first run. The server appends these only by
 * id (POST /api/run { addDocumentIds }); it never accepts document text from
 * the browser. The bill pre-dates the storm, which is what FEMA needs to see.
 */
export const followUpDocuments: CaseDocument[] = [
  {
    id: "doc-electric-bill",
    kind: "utility_bill",
    title: "September electric bill",
    filename: "BayouStatePower_Bill_Sep2026.pdf",
    mime: "application/pdf",
    receivedAt: "2026-11-18",
    language: "en",
    text: `BAYOU STATE POWER (fictional) — Residential electric statement (synthetic sample)
Statement date: October 3, 2026
Account number: 5520-7731-0948
Customer: Ana Reyes
Service address: 1847 Cypress Bayou Ln, Houston, TX 77093
Billing period: September 1, 2026 – September 30, 2026
Electricity used: 1,186 kWh
Amount due: $162.40
Payment due: October 24, 2026`,
  },
  {
    id: "doc-reyes-deed",
    kind: "deed",
    title: "Mortgage statement",
    filename: "Mortgage_Statement_Sep.pdf",
    mime: "application/pdf",
    receivedAt: "2026-11-18",
    language: "en",
    text: `FIRST BAYOU MORTGAGE (fictional) — Monthly statement (synthetic sample)
Borrower: Ana Reyes
Property: 1847 Cypress Bayou Ln, Houston, TX 77093
Statement date: September 20, 2026
Payment due: October 1, 2026`,
  },
];
