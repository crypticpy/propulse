import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { verifyAuth } from "../_lib/auth";
import { applyRateLimit } from "../_lib/rateLimit";
import {
  RESEARCH_POLICY_VERSION,
  ResearchReceiptValidationError,
  completeAttemptRequestSchema,
  consentRequestSchema,
  createResearchSubjectBinding,
  hasAttemptOutcomeConsent,
  hasDerivedEquipmentConsent,
  startAttemptRequestSchema,
  verifyResearchReceipt,
  verifyResearchSubjectBinding,
  withdrawRequestSchema,
  type EvidenceGrade,
  type ResearchAllowedUse,
  type ResearchOutcome,
  type ResearchReceiptPayload,
} from "../_lib/propagationResearch";

interface ConsentRow {
  policy_version: string;
  status: "opted_in" | "withdrawn";
  allowed_uses: string[];
  consented_at: string | null;
  withdrawn_at: string | null;
  retention_acknowledged_at: string | null;
  retention_until: string;
  updated_at: string;
}

interface AttemptRow {
  id: string;
  prediction_id: string | null;
  started_at: string;
  ended_at: string | null;
  band: string;
  mode: string;
  evidence_grade: EvidenceGrade;
}

interface OutcomeRow {
  id: string;
  attempt_id: string;
  outcome_type: ResearchOutcome;
  observed_at: string;
}

export const STATIONCAST_BETA_PROTOCOL_VERSION =
  "propagation-v4.2-stationcast-beta-2026-07-16";
export const STATIONCAST_PATH_HISTORY_STALE_SECONDS = 7_200;

export type BetaTelemetryCounts = Partial<Record<
  | "requests"
  | "errors"
  | "integrity_errors"
  | "privacy_events"
  | "consent_errors"
  | "subject_binding_errors"
  | "stale_profile_events"
  | "equipment_math_events"
  | "unsupported_support_events"
  | "high_confidence_overprediction_events"
  | "geographic_regression_events",
  number
>>;

export interface ResearchParticipationStore {
  recordTelemetry(
    counts: BetaTelemetryCounts,
    observedAt: string,
  ): Promise<void>;
  getConsent(userId: string): Promise<ConsentRow | null>;
  saveConsent(
    userId: string,
    allowedUses: ResearchAllowedUse[],
    now: string,
  ): Promise<ConsentRow>;
  withdrawConsent(userId: string, now: string): Promise<ConsentRow>;
  ensurePrediction(
    userId: string,
    receipt: ResearchReceiptPayload,
    persistStationCapability: boolean,
  ): Promise<void>;
  startAttempt(
    userId: string,
    receipt: ResearchReceiptPayload,
    evidenceGrade: EvidenceGrade,
    now: string,
  ): Promise<AttemptRow>;
  completeAttempt(
    userId: string,
    attemptId: string,
    outcomeType: ResearchOutcome,
    now: string,
  ): Promise<{ attempt: AttemptRow; outcome: OutcomeRow }>;
}

export interface ResearchParticipationDependencies {
  authenticate(request: Request): Promise<{ id: string }>;
  store: ResearchParticipationStore;
  receiptSecret: string;
  now(): Date;
}

function allowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": allowedOrigin(),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      Vary: "Origin",
    },
  });
}

function publicConsent(row: ConsentRow | null) {
  if (!row) return null;
  return {
    policyVersion: row.policy_version,
    status: row.status,
    allowedUses: row.allowed_uses,
    consentedAt: row.consented_at,
    withdrawnAt: row.withdrawn_at,
    retentionAcknowledgedAt: row.retention_acknowledged_at,
    retentionUntil: row.retention_until,
    updatedAt: row.updated_at,
  };
}

function activeOutcomeConsent(row: ConsentRow | null, now: Date): boolean {
  return Boolean(
    row &&
      row.policy_version === RESEARCH_POLICY_VERSION &&
      hasAttemptOutcomeConsent(row.status, row.allowed_uses) &&
      Date.parse(row.retention_until) > now.getTime(),
  );
}

function activeDerivedEquipmentConsent(row: ConsentRow | null, now: Date): boolean {
  return Boolean(
    row &&
      row.policy_version === RESEARCH_POLICY_VERSION &&
      hasDerivedEquipmentConsent(row.status, row.allowed_uses) &&
      Date.parse(row.retention_until) > now.getTime(),
  );
}

function createStore(url: string, serviceKey: string): ResearchParticipationStore {
  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const getConsent = async (userId: string): Promise<ConsentRow | null> => {
    const { data, error } = await db
      .from("ml_research_consents")
      .select(
        "policy_version,status,allowed_uses,consented_at,withdrawn_at,retention_acknowledged_at,retention_until,updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("Consent lookup failed");
    return data as ConsentRow | null;
  };

  return {
    async recordTelemetry(counts, observedAt) {
      const { error } = await db.rpc("record_propagation_beta_telemetry", {
        p_protocol_version: STATIONCAST_BETA_PROTOCOL_VERSION,
        p_observed_at: observedAt,
        p_counts: counts,
      });
      if (error) throw new Error("Beta telemetry write failed");
    },
    getConsent,
    async saveConsent(userId, allowedUses, now) {
      const { data, error } = await db
        .rpc("set_propagation_research_consent", {
          p_user_id: userId,
          p_policy_version: RESEARCH_POLICY_VERSION,
          p_allowed_uses: [...new Set(allowedUses)].sort(),
          p_now: now,
        })
        .single();
      if (error || !data) throw new Error("Consent update failed");
      return data as ConsentRow;
    },
    async withdrawConsent(userId, now) {
      const { data, error } = await db
        .rpc("withdraw_propagation_research_consent", {
          p_user_id: userId,
          p_policy_version: RESEARCH_POLICY_VERSION,
          p_now: now,
        })
        .single();
      if (error || !data) throw new Error("Consent withdrawal failed");
      return data as ConsentRow;
    },
    async ensurePrediction(userId, receipt, persistStationCapability) {
      const row = {
        id: receipt.prediction_id,
        user_id: userId,
        model_version: receipt.model_version,
        feature_issuance_id: null,
        feature_contract: receipt.feature_contract,
        chain_fingerprint: receipt.chain_fingerprint,
        origin_grid4: receipt.origin_grid4,
        target_grid4: receipt.target_grid4,
        issue_time: receipt.issue_time,
        valid_time: receipt.valid_time,
        band: receipt.band,
        mode: receipt.mode,
        declared_power_watts: receipt.declared_power_watts,
        core_probability: receipt.core_probability,
        personalized_probability: receipt.personalized_probability,
        profile: receipt.profile,
        station_tx_class: persistStationCapability
          ? receipt.station_capability.tx_eirp
          : null,
        station_loss_class: persistStationCapability
          ? receipt.station_capability.passive_loss
          : null,
        station_antenna_class: persistStationCapability
          ? receipt.station_capability.directional_gain
          : null,
        station_rx_class: persistStationCapability
          ? receipt.station_capability.receiver_evidence
          : null,
        station_supported: receipt.station_capability.supported,
        confidence: receipt.confidence,
        ood_flags: receipt.ood_flags,
        freshness: receipt.freshness,
        assumptions: receipt.assumptions,
        sampled_for_research: true,
      };
      const { error } = await db.from("propagation_predictions").insert(row);
      if (!error) return;
      if (error.code !== "23505") throw new Error("Prediction receipt write failed");
      const { data: existing, error: lookupError } = await db
        .from("propagation_predictions")
        .select("id")
        .eq("id", receipt.prediction_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (lookupError || !existing) {
        throw new Error("Prediction receipt was already claimed");
      }
    },
    async startAttempt(userId, receipt, evidenceGrade, now) {
      const { data: existing, error: lookupError } = await db
        .from("propagation_attempts")
        .select("id,prediction_id,started_at,ended_at,band,mode,evidence_grade")
        .eq("user_id", userId)
        .eq("prediction_id", receipt.prediction_id)
        .maybeSingle();
      if (lookupError) throw new Error("Attempt lookup failed");
      if (existing) return existing as AttemptRow;

      const { data, error } = await db
        .from("propagation_attempts")
        .insert({
          id: randomUUID(),
          user_id: userId,
          prediction_id: receipt.prediction_id,
          started_at: now,
          ended_at: null,
          band: receipt.band,
          mode: receipt.mode,
          declared_power_watts: receipt.declared_power_watts,
          origin_grid4: receipt.origin_grid4,
          target_grid4: receipt.target_grid4,
          chain_fingerprint: receipt.chain_fingerprint,
          evidence_grade: evidenceGrade,
        })
        .select("id,prediction_id,started_at,ended_at,band,mode,evidence_grade")
        .single();
      if (!error && data) return data as AttemptRow;
      if (error?.code === "23505") {
        const { data: raced } = await db
          .from("propagation_attempts")
          .select("id,prediction_id,started_at,ended_at,band,mode,evidence_grade")
          .eq("user_id", userId)
          .eq("prediction_id", receipt.prediction_id)
          .single();
        if (raced) return raced as AttemptRow;
      }
      throw new Error("Attempt start failed");
    },
    async completeAttempt(userId, attemptId, outcomeType, now) {
      const { data: attempt, error: attemptError } = await db
        .from("propagation_attempts")
        .select("id,prediction_id,started_at,ended_at,band,mode,evidence_grade")
        .eq("id", attemptId)
        .eq("user_id", userId)
        .maybeSingle();
      if (attemptError || !attempt) throw new Error("Attempt not found");

      const { data: existing, error: existingError } = await db
        .from("propagation_outcomes")
        .select("id,attempt_id,outcome_type,observed_at")
        .eq("attempt_id", attemptId)
        .eq("user_id", userId)
        .maybeSingle();
      if (existingError) throw new Error("Outcome lookup failed");
      let outcome = existing as OutcomeRow | null;
      if (!outcome) {
        const inserted = await db
          .from("propagation_outcomes")
          .insert({
            id: randomUUID(),
            user_id: userId,
            attempt_id: attemptId,
            outcome_type: outcomeType,
            evidence_grade: attempt.evidence_grade,
            observed_at: now,
            details: {},
          })
          .select("id,attempt_id,outcome_type,observed_at")
          .single();
        if (inserted.error || !inserted.data) {
          throw new Error("Outcome write failed");
        }
        outcome = inserted.data as OutcomeRow;
      }
      const { data: ended, error: endError } = await db
        .from("propagation_attempts")
        .update({ ended_at: outcome.observed_at })
        .eq("id", attemptId)
        .eq("user_id", userId)
        .select("id,prediction_id,started_at,ended_at,band,mode,evidence_grade")
        .single();
      if (endError || !ended) throw new Error("Attempt completion failed");
      return { attempt: ended as AttemptRow, outcome };
    },
  };
}

function defaultDependencies(): ResearchParticipationDependencies | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const receiptSecret = process.env.PROPULSE_RESEARCH_RECEIPT_SECRET ?? "";
  if (!url || !serviceKey || receiptSecret.length < 32) return null;
  return {
    async authenticate(request) {
      const result = await verifyAuth(request);
      if (result instanceof Response) {
        throw Object.assign(new Error("Unauthorized"), { status: result.status });
      }
      if (result.user.id === "local-dev") {
        throw Object.assign(new Error("Unauthorized"), { status: 401 });
      }
      return { id: result.user.id };
    },
    store: createStore(url, serviceKey),
    receiptSecret,
    now: () => new Date(),
  };
}

export async function handleResearchParticipation(
  request: Request,
  dependencies?: ResearchParticipationDependencies,
): Promise<Response> {
  if (process.env.PROPULSE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED !== "true") {
    return jsonResponse({ error: "Not found" }, 404);
  }
  if (request.method === "OPTIONS") return jsonResponse({}, 204);
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const deps = dependencies ?? defaultDependencies();
  if (!deps) return jsonResponse({ error: "Service unavailable" }, 503);

  let user: { id: string };
  try {
    user = await deps.authenticate(request);
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error
      ? Number(error.status)
      : 401;
    return jsonResponse({ error: "Unauthorized" }, status);
  }

  const telemetryTime = deps.now();
  try {
    await deps.store.recordTelemetry(
      { requests: 1 },
      telemetryTime.toISOString(),
    );
  } catch {
    return jsonResponse({ error: "Service unavailable" }, 503);
  }

  const rejectWithTelemetry = async (
    status: number,
    message: string,
    counts: BetaTelemetryCounts = {},
  ): Promise<Response> => {
    try {
      await deps.store.recordTelemetry(
        { errors: 1, ...counts },
        telemetryTime.toISOString(),
      );
    } catch {
      return jsonResponse({ error: "Service unavailable" }, 503);
    }
    return jsonResponse({ error: message }, status);
  };

  try {
    if (request.method === "GET") {
      const consent = await deps.store.getConsent(user.id);
      return jsonResponse({
        policyVersion: RESEARCH_POLICY_VERSION,
        consent: publicConsent(consent),
        subjectBinding: activeOutcomeConsent(consent, deps.now())
          ? createResearchSubjectBinding(user.id, deps.receiptSecret, deps.now())
          : null,
      }, 200);
    }

    const body: unknown = await request.json();
    if (consentRequestSchema.safeParse(body).success) {
      const parsed = consentRequestSchema.parse(body);
      const consent = await deps.store.saveConsent(
        user.id,
        [...new Set(parsed.allowedUses)],
        deps.now().toISOString(),
      );
      return jsonResponse({ consent: publicConsent(consent) }, 200);
    }
    if (withdrawRequestSchema.safeParse(body).success) {
      const consent = await deps.store.withdrawConsent(
        user.id,
        deps.now().toISOString(),
      );
      return jsonResponse({ consent: publicConsent(consent) }, 200);
    }
    if (startAttemptRequestSchema.safeParse(body).success) {
      const parsed = startAttemptRequestSchema.parse(body);
      const consent = await deps.store.getConsent(user.id);
      if (!activeOutcomeConsent(consent, deps.now())) {
        return rejectWithTelemetry(
          403,
          "Attempt outcome consent is required",
          { consent_errors: 1 },
        );
      }
      const receipt = verifyResearchReceipt(
        parsed.receipt,
        deps.receiptSecret,
        deps.now(),
      );
      verifyResearchSubjectBinding(
        receipt.research_subject_binding,
        user.id,
        deps.receiptSecret,
        deps.now(),
      );
      const pathHistoryAge = receipt.freshness.path_history;
      if (
        receipt.profile === "nowcast" &&
        (pathHistoryAge === undefined ||
          pathHistoryAge > STATIONCAST_PATH_HISTORY_STALE_SECONDS)
      ) {
        return rejectWithTelemetry(
          400,
          "Invalid research participation request",
          { stale_profile_events: 1 },
        );
      }
      await deps.store.ensurePrediction(
        user.id,
        receipt,
        activeDerivedEquipmentConsent(consent, deps.now()),
      );
      const attempt = await deps.store.startAttempt(
        user.id,
        receipt,
        parsed.evidenceGrade,
        deps.now().toISOString(),
      );
      return jsonResponse({
        attempt: {
          id: attempt.id,
          predictionId: attempt.prediction_id,
          startedAt: attempt.started_at,
          endedAt: attempt.ended_at,
          band: attempt.band,
          mode: attempt.mode,
          evidenceGrade: attempt.evidence_grade,
        },
      }, 201);
    }
    if (completeAttemptRequestSchema.safeParse(body).success) {
      const parsed = completeAttemptRequestSchema.parse(body);
      const consent = await deps.store.getConsent(user.id);
      if (!activeOutcomeConsent(consent, deps.now())) {
        return rejectWithTelemetry(
          403,
          "Attempt outcome consent is required",
          { consent_errors: 1 },
        );
      }
      const result = await deps.store.completeAttempt(
        user.id,
        parsed.attemptId,
        parsed.outcomeType,
        deps.now().toISOString(),
      );
      return jsonResponse({
        attemptId: result.attempt.id,
        outcome: {
          type: result.outcome.outcome_type,
          observedAt: result.outcome.observed_at,
        },
      }, 200);
    }
    return rejectWithTelemetry(
      400,
      "Invalid research participation request",
    );
  } catch (error) {
    if (error instanceof ResearchReceiptValidationError) {
      return rejectWithTelemetry(
        400,
        "Invalid research participation request",
        { [error.telemetryCounter]: 1 },
      );
    }
    if (error instanceof ZodError) {
      return rejectWithTelemetry(
        400,
        "Invalid research participation request",
        { integrity_errors: 1 },
      );
    }
    if (error instanceof Error && error.message.startsWith("Research subject")) {
      return rejectWithTelemetry(
        400,
        "Invalid research participation request",
        { subject_binding_errors: 1 },
      );
    }
    if (error instanceof Error && error.message.startsWith("Research receipt")) {
      return rejectWithTelemetry(
        400,
        "Invalid research participation request",
        { integrity_errors: 1 },
      );
    }
    return rejectWithTelemetry(
      503,
      "Research participation service unavailable",
    );
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (process.env.PROPULSE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED !== "true") {
    return handleResearchParticipation(request);
  }
  const limited = applyRateLimit(
    request,
    "propagation/research-participation",
    30,
    60,
  );
  if (limited) return limited;
  return handleResearchParticipation(request);
}
