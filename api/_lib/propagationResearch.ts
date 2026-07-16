import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const RESEARCH_POLICY_VERSION = "propagation-research-v1-2026-07-12";
export const RESEARCH_RECEIPT_SCHEMA_VERSION =
  "propagation-research-receipt-v1";
export const RESEARCH_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEARCH_SUBJECT_SCHEMA_VERSION =
  "propagation-research-subject-v1";
export const RESEARCH_SUBJECT_TTL_MS = 2 * 60 * 60 * 1000;

export const researchAllowedUseSchema = z.enum([
  "anonymous_quality_metrics",
  "derived_equipment_training",
  "attempt_outcome_training",
  "research_follow_up",
]);

export const evidenceGradeSchema = z.enum([
  "bridge",
  "wsjtx",
  "rig",
  "logbook",
  "manual",
]);

export const researchOutcomeSchema = z.enum([
  "receive_success",
  "receive_failure",
  "contact_success",
  "contact_failure",
  "not_attempted",
  "unknown",
]);

const isoTimestampSchema = z.string().datetime({ offset: true });
const grid4Schema = z.string().regex(/^[A-R]{2}[0-9]{2}$/);
const boundedStringSchema = z.string().min(1).max(256).refine(
  (value) => !/[\r\n]/.test(value),
  "must not contain line breaks",
);
const boundedStringArraySchema = z.array(boundedStringSchema).max(64);
const freshnessSchema = z
  .record(
    z.string().regex(/^[a-z0-9_]{1,64}$/),
    z.number().int().min(0).max(366 * 24 * 60 * 60),
  )
  .refine((value) => Object.keys(value).length <= 32, "too many freshness fields");

export const researchReceiptPayloadSchema = z
  .object({
    schema_version: z.literal(RESEARCH_RECEIPT_SCHEMA_VERSION),
    prediction_id: z.string().uuid(),
    receipt_issued_at: isoTimestampSchema,
    receipt_expires_at: isoTimestampSchema,
    model_version: boundedStringSchema,
    feature_contract: boundedStringSchema,
    station_feature_contract: z.literal("station-chain-v1"),
    chain_fingerprint: boundedStringSchema,
    origin_grid4: grid4Schema,
    target_grid4: grid4Schema,
    issue_time: isoTimestampSchema,
    valid_time: isoTimestampSchema,
    band: z.enum([
      "160m",
      "80m",
      "60m",
      "40m",
      "30m",
      "20m",
      "17m",
      "15m",
      "12m",
      "10m",
      "6m",
    ]),
    mode: z.enum([
      "WSPR",
      "FT8",
      "FT4",
      "CW",
      "SSB",
      "RTTY",
      "PSK31",
      "JS8",
      "AM",
      "FM",
    ]),
    declared_power_watts: z.number().positive().max(1_000_000),
    core_probability: z.number().min(0).max(1),
    personalized_probability: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    ood_flags: boundedStringArraySchema,
    freshness: freshnessSchema,
    assumptions: boundedStringArraySchema,
    research_subject_binding: z.object({
      schema_version: z.literal(RESEARCH_SUBJECT_SCHEMA_VERSION),
      expires_at: isoTimestampSchema,
      hmac_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }).strict(),
  })
  .strict();

export const signedResearchReceiptSchema = z
  .object({
    signed_payload: z.string().min(2).max(16_384),
    hmac_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const consentRequestSchema = z
  .object({
    action: z.literal("consent"),
    allowedUses: z.array(researchAllowedUseSchema).min(1).max(4),
    retentionAcknowledged: z.literal(true),
  })
  .strict();

export const withdrawRequestSchema = z
  .object({ action: z.literal("withdraw") })
  .strict();

export const startAttemptRequestSchema = z
  .object({
    action: z.literal("start_attempt"),
    receipt: signedResearchReceiptSchema,
    evidenceGrade: evidenceGradeSchema,
  })
  .strict();

export const completeAttemptRequestSchema = z
  .object({
    action: z.literal("complete_attempt"),
    attemptId: z.string().uuid(),
    outcomeType: researchOutcomeSchema,
  })
  .strict();

export type ResearchAllowedUse = z.infer<typeof researchAllowedUseSchema>;
export type EvidenceGrade = z.infer<typeof evidenceGradeSchema>;
export type ResearchOutcome = z.infer<typeof researchOutcomeSchema>;
export type ResearchReceiptPayload = z.infer<
  typeof researchReceiptPayloadSchema
>;
export type SignedResearchReceipt = z.infer<typeof signedResearchReceiptSchema>;
export type ResearchSubjectBinding = ResearchReceiptPayload[
  "research_subject_binding"
];

function signatureFor(signedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(signedPayload).digest();
}

function subjectMessage(userId: string, expiresAt: string): string {
  return `${RESEARCH_SUBJECT_SCHEMA_VERSION}:${userId}:${expiresAt}`;
}

export function createResearchSubjectBinding(
  userId: string,
  secret: string,
  now = new Date(),
): ResearchSubjectBinding {
  if (secret.length < 32) {
    throw new Error("Research subject binding is not configured");
  }
  const expiresAt = new Date(now.getTime() + RESEARCH_SUBJECT_TTL_MS).toISOString();
  return {
    schema_version: RESEARCH_SUBJECT_SCHEMA_VERSION,
    expires_at: expiresAt,
    hmac_sha256: createHmac("sha256", secret)
      .update(subjectMessage(userId, expiresAt))
      .digest("hex"),
  };
}

export function verifyResearchSubjectBinding(
  binding: ResearchSubjectBinding,
  userId: string,
  secret: string,
  now = new Date(),
): void {
  if (Date.parse(binding.expires_at) <= now.getTime()) {
    throw new Error("Research subject binding is expired");
  }
  const provided = Buffer.from(binding.hmac_sha256, "hex");
  const expected = createHmac("sha256", secret)
    .update(subjectMessage(userId, binding.expires_at))
    .digest();
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Research subject binding is invalid");
  }
}

export function verifyResearchReceipt(
  value: unknown,
  secret: string,
  now = new Date(),
): ResearchReceiptPayload {
  if (secret.length < 32) {
    throw new Error("Research receipt verifier is not configured");
  }
  const receipt = signedResearchReceiptSchema.parse(value);
  const provided = Buffer.from(receipt.hmac_sha256, "hex");
  const expected = signatureFor(receipt.signed_payload, secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Research receipt signature is invalid");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(receipt.signed_payload);
  } catch {
    throw new Error("Research receipt payload is invalid");
  }
  const payload = researchReceiptPayloadSchema.parse(decoded);
  const issuedAt = Date.parse(payload.receipt_issued_at);
  const expiresAt = Date.parse(payload.receipt_expires_at);
  const issueTime = Date.parse(payload.issue_time);
  const validTime = Date.parse(payload.valid_time);
  if (
    expiresAt <= now.getTime() ||
    issuedAt > now.getTime() + 5 * 60 * 1000 ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > RESEARCH_RECEIPT_TTL_MS ||
    issueTime > issuedAt + 5 * 60 * 1000 ||
    validTime < issueTime
  ) {
    throw new Error("Research receipt timing is invalid or expired");
  }
  return payload;
}

export function hasAttemptOutcomeConsent(
  status: string | null | undefined,
  allowedUses: readonly string[] | null | undefined,
): boolean {
  return status === "opted_in" && Boolean(
    allowedUses?.includes("attempt_outcome_training"),
  );
}
