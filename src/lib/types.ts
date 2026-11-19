// Core data model for a BayouBridge recovery case.
// Everything here is synthetic demo data — never real personal information.

export type DocKind =
  | "photo"
  | "estimate"
  | "fema_letter"
  | "insurance_email"
  | "voice_note"
  | "utility_bill";

/** Evidence categories that recovery programs ask for. */
export type EvidenceType =
  | "damage_photo"
  | "repair_estimate"
  | "fema_determination"
  | "insurance_correspondence"
  | "insurance_policy"
  | "proof_of_occupancy"
  | "proof_of_identity"
  | "loss_statement"
  | "loss_receipts"
  | "medical_need_documentation";

export interface CaseDocument {
  id: string;
  kind: DocKind;
  title: string;
  filename: string;
  mime: string;
  receivedAt: string; // ISO date
  /** OCR text, vision caption, or speech transcript — what the Evidence Agent reads. */
  text: string;
  language: "en" | "es";
  /** Optional illustration shown in the UI (photos). */
  preview?: string;
}

export type FactType =
  | "person"
  | "address"
  | "date_of_loss"
  | "money"
  | "claim_number"
  | "policy_number"
  | "fema_registration"
  | "deadline"
  | "appointment"
  | "damage"
  | "need"
  | "determination"
  | "exclusion"
  | "mentions_evidence"
  | "billing_period";

export interface Fact {
  id: string;
  docId: string;
  type: FactType;
  label: string;
  value: string;
  /** Machine-friendly value: ISO date, number, or key. */
  normalized?: string;
  confidence: number; // 0..1
  /** Exact snippet from the document that supports the fact. */
  quote: string;
}

export interface ExtractionResult {
  docId: string;
  evidenceTypes: EvidenceType[];
  facts: Fact[];
  method: "rules" | "claude";
  /** What validation changed in Claude's output: "repaired: ...", "dropped: ...", "filled from rules: ...". */
  issues?: string[];
}

export type NeedKey =
  | "roof_damage"
  | "interior_water_damage"
  | "food_loss"
  | "medical_power"
  | "fema_denial";

export interface Need {
  key: NeedKey;
  label: string;
  urgency: "critical" | "high" | "medium";
  supportedBy: string[]; // fact ids
}

export interface Person {
  name: string;
  aliases: string[];
  role: string;
  sourceDocs: string[];
}

export interface Conflict {
  id: string;
  field: string;
  values: { value: string; docId: string; quote: string }[];
  impact: string;
  question: { en: string; es: string };
}

export interface ProgramMatch {
  programId: string;
  name: string;
  status: "possible_match" | "not_indicated";
  reasons: string[];
  evidence: {
    type: EvidenceType;
    label: string;
    satisfiedBy: string[]; // doc ids
    hint?: string; // a fact suggesting the household has it but hasn't uploaded it
  }[];
  readiness: number; // 0..1
  deadline?: { date: string; basis: string };
  nextAction: string;
  blocked: boolean;
  blockedBy: string[];
  source: { label: string; url: string };
  caveat: string;
}

export interface FollowUpQuestion {
  evidence: EvidenceType;
  unblocks: string[]; // program ids
  en: string;
  es: string;
  why: string;
}

export interface PlanTask {
  id: string;
  title: string;
  owner: "Navigator" | "Household" | "BayouBridge";
  due?: string;
  priority: number; // lower = sooner
  programId?: string;
  status: "ready" | "blocked" | "needs_approval";
  detail: string;
  /** Stamped by the Safety Agent on every outbound (BayouBridge-owned) task. */
  requiresApproval?: boolean;
  /** Set only by the server's approve route (POST /api/approve). */
  approved?: boolean;
}

/** What the Packet Agent would send for one pathway. Never leaves the sandbox outbox. */
export interface Packet {
  id: string; // "packet:<programId>"
  programId: string;
  title: string;
  /** Who it would go to (the program's agency). */
  to: string;
  summary: string;
  attachments: { docId: string; title: string }[];
  citations: { factId: string; quote: string; docId: string }[];
  /** Cover note in English, plus Spanish so the household can read what is sent for them. */
  bilingualCover: { en: string; es: string };
  status: "draft" | "approved" | "queued";
}

/** A packet a navigator approved, held in the in-memory sandbox outbox. */
export interface OutboxItem {
  id: string;
  caseId: string;
  taskId: string;
  packet: Packet;
  approvedBy: string;
  queuedAt: string; // ISO timestamp
}

export type GraphNodeKind = "document" | "need" | "program" | "missing" | "deadline";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  sub?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: "supports" | "requires" | "blocks" | "due";
}

export type AgentName =
  | "Coordinator"
  | "Evidence Agent"
  | "Recovery-Match Agent"
  | "Packet Agent"
  | "Follow-up Agent"
  | "Safety Agent";

export interface ActivityEvent {
  seq: number;
  agent: AgentName;
  action: string;
  detail: string;
  refs?: string[];
  minutesSaved?: number;
}

/** Which extractor actually read the documents in a run (not just whether a key is set). */
export interface ExtractionSummary {
  claude: number;
  rules: number;
  /** Documents meant for Claude that the rules engine read instead (timeout, refusal, validation, error, breaker). */
  fellBack: number;
  mode: "claude" | "rules" | "mixed";
}

/** Live status of one coordinator task, for showing agents "working" while they run. */
export interface TaskUpdate {
  id: string; // "extract:<docId>", "people", "match", ...
  agent: AgentName;
  label: string;
  status: "started" | "done";
}

export interface CaseState {
  caseId: string;
  householdName: string;
  address: string;
  disaster: string;
  today: string;
  documents: CaseDocument[];
  extractions: ExtractionResult[];
  people: Person[];
  needs: Need[];
  conflicts: Conflict[];
  matches: ProgramMatch[];
  followUp?: FollowUpQuestion;
  plan: PlanTask[];
  packets: Packet[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  evidenceScore: number; // 0..100
  events: ActivityEvent[];
  minutesSaved: number;
  extraction: ExtractionSummary;
}
