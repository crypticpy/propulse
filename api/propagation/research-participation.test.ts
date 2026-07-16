import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESEARCH_POLICY_VERSION,
  createResearchSubjectBinding,
  type ResearchReceiptPayload,
  type SignedResearchReceipt,
} from "../_lib/propagationResearch";
import {
  handleResearchParticipation,
  type ResearchParticipationDependencies,
  type ResearchParticipationStore,
} from "./research-participation";

const ORIGINAL_GATE =
  process.env.PROPULSE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED;
const NOW = new Date("2026-07-16T12:00:00Z");
const SECRET = "test-research-receipt-secret-at-least-32-characters";
const USER_ID = "aeb08527-58ad-4be7-8fa4-23c22c07d93d";

function payload(overrides: Partial<ResearchReceiptPayload> = {}): ResearchReceiptPayload {
  return {
    schema_version: "propagation-research-receipt-v1",
    prediction_id: "f038638f-218b-4a31-9be9-4277897dc7d7",
    receipt_issued_at: "2026-07-16T11:55:00+00:00",
    receipt_expires_at: "2026-07-17T11:55:00+00:00",
    model_version: "archive-v4.2-a6",
    feature_contract: "archive-v4-features-v2",
    station_feature_contract: "station-chain-v1",
    chain_fingerprint: "sha256:test-chain",
    origin_grid4: "EM10",
    target_grid4: "IO91",
    issue_time: "2026-07-16T11:55:00+00:00",
    valid_time: "2026-07-16T11:55:00+00:00",
    band: "20m",
    mode: "WSPR",
    declared_power_watts: 25,
    core_probability: 0.4,
    personalized_probability: 0.51,
    confidence: 0.78,
    ood_flags: [],
    freshness: { path_history: 120, space_weather: 60 },
    assumptions: ["core_estimand_is_single_wspr_decode"],
    research_subject_binding: createResearchSubjectBinding(USER_ID, SECRET, NOW),
    ...overrides,
  };
}

function sign(value = payload()): SignedResearchReceipt {
  const signedPayload = JSON.stringify(value);
  return {
    signed_payload: signedPayload,
    hmac_sha256: createHmac("sha256", SECRET)
      .update(signedPayload)
      .digest("hex"),
  };
}

function optedInConsent() {
  return {
    policy_version: RESEARCH_POLICY_VERSION,
    status: "opted_in" as const,
    allowed_uses: ["attempt_outcome_training"],
    consented_at: NOW.toISOString(),
    withdrawn_at: null,
    retention_acknowledged_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

function buildStore(): ResearchParticipationStore {
  return {
    getConsent: vi.fn().mockResolvedValue(optedInConsent()),
    saveConsent: vi.fn().mockImplementation(async (_userId, allowedUses, now) => ({
      ...optedInConsent(),
      allowed_uses: allowedUses,
      consented_at: now,
      retention_acknowledged_at: now,
      updated_at: now,
    })),
    withdrawConsent: vi.fn().mockImplementation(async (_userId, now) => ({
      ...optedInConsent(),
      status: "withdrawn" as const,
      allowed_uses: [],
      consented_at: null,
      withdrawn_at: now,
      retention_acknowledged_at: null,
      updated_at: now,
    })),
    ensurePrediction: vi.fn().mockResolvedValue(undefined),
    startAttempt: vi.fn().mockResolvedValue({
      id: "722a25ce-d396-4964-a89d-a1261098f934",
      prediction_id: payload().prediction_id,
      started_at: NOW.toISOString(),
      ended_at: null,
      band: "20m",
      mode: "WSPR",
      evidence_grade: "manual",
    }),
    completeAttempt: vi.fn().mockResolvedValue({
      attempt: {
        id: "722a25ce-d396-4964-a89d-a1261098f934",
        prediction_id: payload().prediction_id,
        started_at: NOW.toISOString(),
        ended_at: NOW.toISOString(),
        band: "20m",
        mode: "WSPR",
        evidence_grade: "manual",
      },
      outcome: {
        id: randomUUID(),
        attempt_id: "722a25ce-d396-4964-a89d-a1261098f934",
        outcome_type: "receive_failure",
        observed_at: NOW.toISOString(),
      },
    }),
  };
}

function dependencies(store = buildStore()): ResearchParticipationDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({ id: USER_ID }),
    store,
    receiptSecret: SECRET,
    now: () => NOW,
  };
}

function post(body: unknown): Request {
  return new Request(
    "https://propulse.test/api/propagation/research-participation",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  process.env.PROPULSE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED = "true";
});

afterEach(() => {
  if (ORIGINAL_GATE === undefined) {
    delete process.env.PROPULSE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED;
  } else {
    process.env.PROPULSE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED = ORIGINAL_GATE;
  }
  vi.restoreAllMocks();
});

describe("research participation API", () => {
  it("is undiscoverable while the independent server gate is disabled", async () => {
    delete process.env.PROPULSE_PROPAGATION_RESEARCH_OUTCOMES_ENABLED;
    const response = await handleResearchParticipation(
      new Request("https://propulse.test/api/propagation/research-participation"),
      dependencies(),
    );
    expect(response.status).toBe(404);
  });

  it("returns a privacy-bounded consent state", async () => {
    const response = await handleResearchParticipation(
      new Request("https://propulse.test/api/propagation/research-participation"),
      dependencies(),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      policyVersion: RESEARCH_POLICY_VERSION,
      consent: {
        status: "opted_in",
        allowedUses: ["attempt_outcome_training"],
      },
      subjectBinding: {
        schema_version: "propagation-research-subject-v1",
      },
    });
    expect(JSON.stringify(body)).not.toContain(USER_ID);
  });

  it("requires explicit retention acknowledgement for versioned consent", async () => {
    const store = buildStore();
    const invalid = await handleResearchParticipation(
      post({
        action: "consent",
        allowedUses: ["attempt_outcome_training"],
        retentionAcknowledged: false,
      }),
      dependencies(store),
    );
    expect(invalid.status).toBe(400);
    expect(store.saveConsent).not.toHaveBeenCalled();

    const valid = await handleResearchParticipation(
      post({
        action: "consent",
        allowedUses: [
          "attempt_outcome_training",
          "anonymous_quality_metrics",
          "attempt_outcome_training",
        ],
        retentionAcknowledged: true,
      }),
      dependencies(store),
    );
    expect(valid.status).toBe(200);
    expect(store.saveConsent).toHaveBeenCalledWith(
      USER_ID,
      ["attempt_outcome_training", "anonymous_quality_metrics"],
      NOW.toISOString(),
    );
  });

  it("copies only signed prediction provenance before starting an attempt", async () => {
    const store = buildStore();
    const response = await handleResearchParticipation(
      post({ action: "start_attempt", receipt: sign(), evidenceGrade: "manual" }),
      dependencies(store),
    );
    expect(response.status).toBe(201);
    expect(store.ensurePrediction).toHaveBeenCalledWith(USER_ID, payload());
    expect(store.startAttempt).toHaveBeenCalledWith(
      USER_ID,
      payload(),
      "manual",
      NOW.toISOString(),
    );
    const body = await response.json();
    expect(body.attempt).toMatchObject({ band: "20m", mode: "WSPR" });
    expect(JSON.stringify(body)).not.toContain("chain_fingerprint");
  });

  it("rejects tampered and expired receipts before any write", async () => {
    const store = buildStore();
    const tampered = sign();
    tampered.signed_payload = tampered.signed_payload.replace("20m", "40m");
    const badSignature = await handleResearchParticipation(
      post({ action: "start_attempt", receipt: tampered, evidenceGrade: "manual" }),
      dependencies(store),
    );
    expect(badSignature.status).toBe(400);

    const expired = await handleResearchParticipation(
      post({
        action: "start_attempt",
        receipt: sign({
          ...payload(),
          receipt_issued_at: "2026-07-15T10:00:00+00:00",
          receipt_expires_at: "2026-07-16T10:00:00+00:00",
        }),
        evidenceGrade: "manual",
      }),
      dependencies(store),
    );
    expect(expired.status).toBe(400);
    expect(store.ensurePrediction).not.toHaveBeenCalled();
  });

  it("binds a signed receipt to the authenticated consenting account", async () => {
    const store = buildStore();
    const otherUserDependencies = dependencies(store);
    otherUserDependencies.authenticate = vi.fn().mockResolvedValue({
      id: "bec6b1fd-3e43-4dd0-a325-aeb8e458168b",
    });
    const response = await handleResearchParticipation(
      post({ action: "start_attempt", receipt: sign(), evidenceGrade: "manual" }),
      otherUserDependencies,
    );
    expect(response.status).toBe(400);
    expect(store.ensurePrediction).not.toHaveBeenCalled();
  });

  it("cannot start or label an attempt after consent withdrawal", async () => {
    const store = buildStore();
    vi.mocked(store.getConsent).mockResolvedValue({
      ...optedInConsent(),
      status: "withdrawn",
      allowed_uses: [],
      withdrawn_at: NOW.toISOString(),
    });
    const start = await handleResearchParticipation(
      post({ action: "start_attempt", receipt: sign(), evidenceGrade: "manual" }),
      dependencies(store),
    );
    expect(start.status).toBe(403);
    const complete = await handleResearchParticipation(
      post({
        action: "complete_attempt",
        attemptId: "722a25ce-d396-4964-a89d-a1261098f934",
        outcomeType: "receive_failure",
      }),
      dependencies(store),
    );
    expect(complete.status).toBe(403);
    expect(store.ensurePrediction).not.toHaveBeenCalled();
    expect(store.completeAttempt).not.toHaveBeenCalled();
  });

  it("records a failure only through an existing explicit attempt id", async () => {
    const store = buildStore();
    const response = await handleResearchParticipation(
      post({
        action: "complete_attempt",
        attemptId: "722a25ce-d396-4964-a89d-a1261098f934",
        outcomeType: "receive_failure",
      }),
      dependencies(store),
    );
    expect(response.status).toBe(200);
    expect(store.completeAttempt).toHaveBeenCalledWith(
      USER_ID,
      "722a25ce-d396-4964-a89d-a1261098f934",
      "receive_failure",
      NOW.toISOString(),
    );
  });
});
