import type { DocKind, EvidenceType } from "@/lib/types";

// The document types a household can type out instead of uploading. Shared by the
// server (validation, titles) and the browser (the picker, its hints).

export type TypedKind = Exclude<DocKind, "voice_note">;

export const TYPED_KINDS: Record<TypedKind, { en: string; es: string; hint: { en: string; es: string } }> = {
  fema_letter: {
    en: "FEMA letter", es: "Carta de FEMA",
    hint: { en: "The date on the letter, what FEMA decided, and why. For example: Letter dated October 30, 2026. Decision: ineligible, they could not verify I lived at the home.",
      es: "La fecha de la carta, lo que decidió FEMA y por qué. Por ejemplo: Carta del 30 de octubre de 2026. Decisión: no elegible, no pudieron comprobar que vivía en la casa." },
  },
  insurance_email: {
    en: "Insurance letter or email", es: "Carta o correo del seguro",
    hint: { en: "Your claim number, any dates they gave you, and what they asked for. For example: Claim HO-55120. Send photos and the estimate by November 24.",
      es: "Su número de reclamo, las fechas que le dieron y lo que le pidieron. Por ejemplo: Reclamo HO-55120. Enviar fotos y el presupuesto antes del 24 de noviembre." },
  },
  estimate: {
    en: "Repair estimate", es: "Presupuesto de reparación",
    hint: { en: "Who wrote it, what needs fixing, and the total. For example: Roof replacement and kitchen drywall, total $12,400.",
      es: "Quién lo hizo, qué hay que reparar y el total. Por ejemplo: Cambio de techo y paredes de la cocina, total $12,400." },
  },
  utility_bill: {
    en: "Utility bill", es: "Factura de servicios",
    hint: { en: "The service address and the billing period. For example: Service address 2210 Telephone Rd. Billing period September 1 to September 30, 2026.",
      es: "La dirección del servicio y el periodo de la factura. Por ejemplo: Dirección 2210 Telephone Rd. Periodo del 1 de septiembre al 30 de septiembre de 2026." },
  },
  bank_statement: {
    en: "Bank statement", es: "Estado de cuenta",
    hint: { en: "The address on it and the statement period.", es: "La dirección que aparece y el periodo del estado de cuenta." },
  },
  lease: {
    en: "Lease", es: "Contrato de renta",
    hint: { en: "The address of the home, the landlord, and the dates of the lease.", es: "La dirección de la casa, el dueño y las fechas del contrato." },
  },
  insurance_policy: {
    en: "Insurance policy", es: "Póliza de seguro",
    hint: { en: "The policy number, the insurer, and what it covers or excludes (for example flood).", es: "El número de póliza, la aseguradora y lo que cubre o excluye (por ejemplo inundación)." },
  },
  id_card: {
    en: "Photo ID", es: "Identificación con foto",
    hint: { en: "The kind of ID and the name on it. Do not type the ID number.", es: "El tipo de identificación y el nombre que aparece. No escriba el número." },
  },
  medical_letter: {
    en: "Doctor's letter", es: "Carta del médico",
    hint: { en: "Who it is for and the equipment that needs power. For example: My mother Rosa uses an oxygen concentrator.",
      es: "Para quién es y el equipo que necesita electricidad. Por ejemplo: Mi mamá Rosa usa un concentrador de oxígeno." },
  },
  receipt: {
    en: "Receipt", es: "Recibo",
    hint: { en: "What you bought or lost, the store, and the amount.", es: "Lo que compró o perdió, la tienda y la cantidad." },
  },
  photo: {
    en: "Photo (described)", es: "Foto (descrita)",
    hint: { en: "Describe what the photo shows. For example: Missing shingles on the roof and a water stain on the kitchen ceiling.",
      es: "Describa lo que muestra la foto. Por ejemplo: Faltan tejas en el techo y hay una mancha de agua en el techo de la cocina." },
  },
  other: {
    en: "Other document", es: "Otro documento",
    hint: { en: "What the document is and what it says.", es: "Qué documento es y qué dice." },
  },
};

export const isTypedKind = (k: unknown): k is TypedKind => typeof k === "string" && k in TYPED_KINDS;

/** The document type that supplies a missing piece of evidence, for "Type it instead". */
export const KIND_FOR_EVIDENCE: Record<EvidenceType, TypedKind> = {
  damage_photo: "photo",
  repair_estimate: "estimate",
  fema_determination: "fema_letter",
  insurance_correspondence: "insurance_email",
  insurance_policy: "insurance_policy",
  proof_of_occupancy: "utility_bill",
  proof_of_identity: "id_card",
  loss_statement: "other",
  loss_receipts: "receipt",
  medical_need_documentation: "medical_letter",
};

/** Typed documents must say enough to read, and not more than this. */
export const TYPED_CHARS = { min: 10, max: 4000 };
