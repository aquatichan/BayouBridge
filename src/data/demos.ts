import type { CaseDocument, EvidenceType } from "@/lib/types";
import { DEMO_CARDS, type DemoId } from "./demoList";
import { documents as reyesDocuments, followUpDocuments as reyesBill, household as reyes } from "./household";

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC DEMO HOUSEHOLDS. Every name, address, number, company and storm in
// this file is fictional. "Hurricane Delfina" and "DR-9999-TX" do not exist.
// The documents are written out as text (photos as the captions a vision model
// would write), so the offline rules engine reads them and no demo ever depends
// on a model. Each demo starts with gaps and has, for each gap, the document that
// fills it ("arrives" in the demo). With every follow-up added, every conflict
// answered and every packet approved, every task is done and readiness is 100%.
// ─────────────────────────────────────────────────────────────────────────────

export interface FollowUpDoc { doc: CaseDocument; provides: EvidenceType }

export interface Demo {
  id: DemoId;
  caseId: string;
  name: string;
  address: string;
  disaster: string;
  documents: CaseDocument[];
  followUps: FollowUpDoc[];
}

const DISASTER = "Hurricane Delfina (fictional) · DR-9999-TX";
const doc = (d: Omit<CaseDocument, "language" | "mime"> & { mime?: string; language?: "en" | "es" }): CaseDocument =>
  ({ mime: "application/pdf", language: "en", ...d });

// ── Reyes: owners, a mother on oxygen, Spanish voice note (src/data/household.ts) ──

const reyesFollowUps: FollowUpDoc[] = [
  { doc: reyesBill[0], provides: "proof_of_occupancy" },
  {
    provides: "medical_need_documentation",
    doc: doc({
      id: "doc-reyes-critical-care", kind: "medical_letter", title: "Doctor's critical care form", filename: "CriticalCare_Ortega.pdf",
      receivedAt: "2026-11-18",
      text: `NORTHSIDE FAMILY CLINIC (fictional) — Critical care customer certification (synthetic sample)
Date: November 16, 2026
Patient: Carmen Ortega, age 71
Service address: 1847 Cypress Bayou Ln, Houston, TX 77093
Equipment: oxygen concentrator, used 24 hours a day. Losing power is a serious risk to her health.
Certifying physician: Dr. Samuel Price, MD`,
    }),
  },
  {
    provides: "proof_of_identity",
    doc: doc({
      id: "doc-reyes-license", kind: "id_card", title: "Driver license", filename: "TX_DL_Reyes.jpg", mime: "image/jpeg",
      receivedAt: "2026-11-18",
      text: `[Vision caption] TEXAS DRIVER LICENSE (synthetic sample, not a real document)
Name: Ana Reyes
Address: 1847 Cypress Bayou Ln, Houston, TX 77093
Class C · Expires 2030 · ID number hidden in this sample`,
    }),
  },
];

// ── Johnson: renters, a single mother of three, a child with asthma, no insurance ──

const JOHNSON = DEMO_CARDS.find((d) => d.id === "johnson")!;

const johnsonDocuments: CaseDocument[] = [
  doc({
    id: "doc-johnson-voice-note", kind: "voice_note", title: "Voice note from Denise", filename: "voice_denise.m4a", mime: "audio/mp4",
    receivedAt: "2026-11-03",
    text: `[Transcript, English — 1:05]
Hi, my name is Denise Johnson. Hurricane Delfina hit on October 9, 2026, and rain poured through the ceiling in the kids' bedroom.
The carpet was soaked and now there is mold on the wall. We rent our apartment, and we don't have renters insurance.
My daughter Amara is 6 and uses a nebulizer for her asthma, so she needs power for it.
My son Jaylen is 9 and my son Malik is 2.
We lost power for three days and lost all our food, about 260 dollars of groceries.
FEMA sent me a letter saying I'm not eligible because they couldn't verify I lived here.`,
  }),
  doc({
    id: "doc-johnson-bedroom-photo", kind: "photo", title: "Kids' bedroom ceiling photo", filename: "IMG_3310.jpg", mime: "image/jpeg",
    receivedAt: "2026-10-11",
    text: `[Vision caption]
Apartment bedroom with two twin beds. A brown water stain spreads across the ceiling above the beds.
The carpet is soaked along the outer wall and dark mold spots are visible on the lower drywall.
Photo metadata timestamp: 2026-10-11 09:02.`,
  }),
  doc({
    id: "doc-johnson-kitchen-photo", kind: "photo", title: "Spoiled food photo", filename: "IMG_3317.jpg", mime: "image/jpeg",
    receivedAt: "2026-10-12",
    text: `[Vision caption]
Apartment kitchen. The refrigerator door is open and empty. Four trash bags of spoiled groceries sit on the floor.
Photo metadata timestamp: 2026-10-12 18:45.`,
  }),
  doc({
    id: "doc-johnson-fema-letter", kind: "fema_letter", title: "FEMA decision letter", filename: "FEMA_Letter_Johnson.pdf",
    receivedAt: "2026-10-31",
    text: `FEMA — Individuals and Households Program (synthetic sample)
Date of letter: October 27, 2026
Applicant: Denise Johnson
FEMA Registration ID: 9318-40277
Disaster: DR-9999-TX, Hurricane Delfina
Damaged dwelling: 2210 Telephone Rd, Apt 4B, Houston, TX 77023
Date of incident: October 9, 2026

Decision: INELIGIBLE — Insufficient Information.
Reason: We could not verify that you lived in the damaged home as your primary residence
at the time of the disaster (occupancy).

Renters may send a lease, a utility bill or a bank statement showing this address dated before the disaster.
You have the right to appeal. Your appeal must be submitted within 60 days of the date of this letter.`,
  }),
  doc({
    id: "doc-johnson-id", kind: "id_card", title: "Texas ID card", filename: "TX_ID_Johnson.jpg", mime: "image/jpeg",
    receivedAt: "2026-11-03",
    text: `[Vision caption] TEXAS IDENTIFICATION CARD (synthetic sample, not a real document)
Name: Denise Johnson
Address: 2210 Telephone Rd, Apt 4B, Houston, TX 77023
ID number hidden in this sample`,
  }),
  doc({
    id: "doc-johnson-paystub", kind: "other", title: "Pay stub", filename: "GulfMart_Paystub_Nov.pdf",
    receivedAt: "2026-11-10",
    text: `GULF MART STORES (fictional) — Earnings statement (synthetic sample)
Employee: Denise Johnson, cashier
Pay date: November 14, 2026
Gross pay: $1,184.00
Net pay: $1,032.50
Year to date gross: $24,860.00`,
  }),
];

const johnsonFollowUps: FollowUpDoc[] = [
  {
    provides: "proof_of_occupancy",
    doc: doc({
      id: "doc-johnson-lease", kind: "lease", title: "Apartment lease", filename: "Lease_EastwoodGardens_4B.pdf",
      receivedAt: "2026-11-18",
      text: `RESIDENTIAL LEASE AGREEMENT (synthetic sample)
Landlord: Eastwood Gardens Apartments LLC (fictional)
Tenant: Denise Johnson
Premises: 2210 Telephone Rd, Apt 4B, Houston, TX 77023
Lease term: August 1, 2025 – July 31, 2027
Monthly rent: $1,045.00
Occupants: Denise Johnson, Jaylen Johnson, Amara Johnson, Malik Johnson`,
    }),
  },
  {
    provides: "medical_need_documentation",
    doc: doc({
      id: "doc-johnson-pediatrician", kind: "medical_letter", title: "Pediatrician's letter", filename: "EastEndPediatrics_Amara.pdf",
      receivedAt: "2026-11-18",
      text: `EAST END PEDIATRICS (fictional) — Letter of medical necessity (synthetic sample)
Date: November 12, 2026
Patient: Amara Johnson, age 6
Amara has moderate persistent asthma and uses a nebulizer at home several times a day.
Her treatments need electricity. Please list this household as a critical care customer.
Dr. Lena Ortiz, MD`,
    }),
  },
];

// ── Nguyen: retired owners, insured, a tree through the garage, no medical need ──

const NGUYEN = DEMO_CARDS.find((d) => d.id === "nguyen")!;

const nguyenDocuments: CaseDocument[] = [
  doc({
    id: "doc-nguyen-note", kind: "voice_note", title: "Note from Minh", filename: "note_minh.txt", mime: "text/plain",
    receivedAt: "2026-11-05",
    text: `[Typed note, English]
My name is Minh Nguyen. I am 67 and my wife Lan Nguyen is 64. We own our house and it is paid off.
On October 9, 2026, Hurricane Delfina knocked an oak tree onto our garage and tore shingles off the roof.
Rain came into the back bedroom through the roof.
We live on Social Security, about 2,900 dollars a month, and we cannot pay the deductible and the repairs on our own.`,
  }),
  doc({
    id: "doc-nguyen-roof-photo", kind: "photo", title: "Roof and garage photo", filename: "DSC_0912.jpg", mime: "image/jpeg",
    receivedAt: "2026-10-10",
    text: `[Vision caption]
Single-story home at 6127 Bissonnet St. Roof: missing shingles along the ridge and exposed decking near the chimney.
A large oak tree has fallen across the detached garage, and the garage roof is caved in.
Photo metadata timestamp: 2026-10-10 11:20.`,
  }),
  doc({
    id: "doc-nguyen-bedroom-photo", kind: "photo", title: "Back bedroom ceiling photo", filename: "DSC_0920.jpg", mime: "image/jpeg",
    receivedAt: "2026-10-10",
    text: `[Vision caption]
Back bedroom. The ceiling drywall sags with a brown stain, with rain intrusion to the back bedroom along the window wall.
A bucket on the floor is catching drips.
Photo metadata timestamp: 2026-10-10 11:34.`,
  }),
  doc({
    id: "doc-nguyen-estimate", kind: "estimate", title: "Contractor repair estimate", filename: "Estimate_G-7714.pdf",
    receivedAt: "2026-10-16",
    text: `GULF FREEWAY CONSTRUCTION (fictional)
ESTIMATE #G-7714          Date: October 16, 2026
Customer: Minh Nguyen
Property: 6127 Bissonnet St, Houston, TX 77081

Tree removal from garage ......................... $1,950.00
Garage roof framing and decking .................. $4,300.00
Main roof tear-off and replace, 26 squares ....... $13,520.00
Interior drywall and ceiling, back bedroom ....... $1,480.00

TOTAL ............................................ $21,250.00
Cause noted by estimator: wind damage to roof and fallen tree, rain intrusion to back bedroom.`,
  }),
  doc({
    id: "doc-nguyen-insurance-email", kind: "insurance_email", title: "Insurance claim letter", filename: "LoneStar_Claim_204871.pdf",
    receivedAt: "2026-11-04",
    text: `From: claims@lonestar-home.example (Lone Star Home Insurance — fictional)
Date: November 4, 2026
Subject: Claim HO-TX-26-204871

Dear Minh Van Nguyen,

We have opened claim HO-TX-26-204871 under policy HO3-7720415 for date of loss October 9, 2026.
An adjuster inspection is scheduled for November 21, 2026 at 1:30 PM.

Please send your contractor estimate and photos of the damage by November 25, 2026.

Please note: damage caused by flood or rising water is excluded under your homeowners policy.
Wind damage, including a tree that falls because of wind, may be covered subject to your hurricane deductible of $4,800.`,
  }),
  doc({
    id: "doc-nguyen-fema-letter", kind: "fema_letter", title: "FEMA decision letter", filename: "FEMA_Letter_Nguyen.pdf",
    receivedAt: "2026-11-03",
    text: `FEMA — Individuals and Households Program (synthetic sample)
Date of letter: October 30, 2026
Applicant: Minh Nguyen
FEMA Registration ID: 9402-11786
Disaster: DR-9999-TX, Hurricane Delfina
Damaged dwelling: 6127 Bissonnet St, Houston, TX 77081
Date of incident: October 9, 2026

Decision: INELIGIBLE — Insufficient Information.
Reason: We could not verify your insurance settlement or that you lived in the damaged home
as your primary residence at the time of the disaster (occupancy).

Send your insurance settlement or denial letter and a document that proves occupancy.
You have the right to appeal. Your appeal must be submitted within 60 days of the date of this letter.`,
  }),
  doc({
    id: "doc-nguyen-deed", kind: "deed", title: "Warranty deed", filename: "HarrisCounty_Deed_2001.pdf",
    receivedAt: "2026-11-05",
    text: `HARRIS COUNTY CLERK — Warranty deed, abstract (synthetic sample)
Grantees: Minh Nguyen and Lan Nguyen
Property: 6127 Bissonnet St, Houston, TX 77081
Recorded: June 18, 2001
Mortgage: none on record (paid in full in 2019)`,
  }),
  doc({
    id: "doc-nguyen-policy", kind: "insurance_policy", title: "Insurance declarations page", filename: "LoneStar_Declarations.pdf",
    receivedAt: "2026-11-05",
    text: `LONE STAR HOME INSURANCE (fictional) — Homeowners declarations page (synthetic sample)
Named insured: Minh Nguyen and Lan Nguyen
Policy number: HO3-7720415
Policy period: March 1, 2026 – March 1, 2027
Dwelling coverage: $240,000
Hurricane deductible: 2% of dwelling coverage ($4,800)
Flood: not covered`,
  }),
];

const nguyenFollowUps: FollowUpDoc[] = [
  {
    provides: "proof_of_occupancy",
    doc: doc({
      id: "doc-nguyen-bank-statement", kind: "bank_statement", title: "Credit union statement", filename: "GCCCU_Statement_Sep2026.pdf",
      receivedAt: "2026-11-18",
      text: `GULF COAST COMMUNITY CREDIT UNION (fictional) — Account statement (synthetic sample)
Members: Minh Nguyen, Lan Nguyen
Mailing address: 6127 Bissonnet St, Houston, TX 77081
Statement period: September 1, 2026 – September 30, 2026
Social Security deposits: $2,912.00
Ending balance: $6,418.27`,
    }),
  },
  {
    provides: "proof_of_identity",
    doc: doc({
      id: "doc-nguyen-license", kind: "id_card", title: "Driver license", filename: "TX_DL_Nguyen.jpg", mime: "image/jpeg",
      receivedAt: "2026-11-18",
      text: `[Vision caption] TEXAS DRIVER LICENSE (synthetic sample, not a real document)
Name: Minh Nguyen
Address: 6127 Bissonnet St, Houston, TX 77081
Class C · Expires 2029 · ID number hidden in this sample`,
    }),
  },
];

export const DEMOS: Record<DemoId, Demo> = {
  reyes: { id: "reyes", caseId: reyes.caseId, name: reyes.name, address: reyes.address, disaster: reyes.disaster, documents: reyesDocuments, followUps: reyesFollowUps },
  johnson: { id: "johnson", caseId: "BB-0522", name: JOHNSON.name, address: JOHNSON.address, disaster: DISASTER, documents: johnsonDocuments, followUps: johnsonFollowUps },
  nguyen: { id: "nguyen", caseId: "BB-0638", name: NGUYEN.name, address: NGUYEN.address, disaster: DISASTER, documents: nguyenDocuments, followUps: nguyenFollowUps },
};

/** Every follow-up document any demo can receive, by id: the only documents the server adds by id. */
export const ALL_FOLLOW_UPS: CaseDocument[] = Object.values(DEMOS).flatMap((d) => d.followUps.map((f) => f.doc));
