import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RESEARCH_POLICY_VERSION,
  canRecordResearchOutcomes,
  completeResearchAttempt,
  saveResearchConsent,
  startResearchAttempt,
} from "./researchParticipation";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("research participation client", () => {
  it("sends explicit policy choices with the authenticated request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        consent: {
          policyVersion: RESEARCH_POLICY_VERSION,
          status: "opted_in",
          allowedUses: ["attempt_outcome_training"],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await saveResearchConsent("access-token", ["attempt_outcome_training"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/propagation/research-participation",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      action: "consent",
      allowedUses: ["attempt_outcome_training"],
      retentionAcknowledged: true,
    });
  });

  it("passes the opaque signed receipt without adding prediction fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        attempt: {
          id: "attempt-id",
          predictionId: "prediction-id",
          startedAt: "2026-07-16T12:00:00Z",
          endedAt: null,
          band: "20m",
          mode: "WSPR",
          evidenceGrade: "manual",
        },
      }), { status: 201, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const receipt = { signed_payload: "{}", hmac_sha256: "a".repeat(64) };
    await startResearchAttempt("access-token", receipt);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      action: "start_attempt",
      receipt,
      evidenceGrade: "manual",
    });
  });

  it("requires an attempt id for every failure outcome", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        attemptId: "attempt-id",
        outcome: { type: "receive_failure", observedAt: "2026-07-16T12:00:00Z" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await completeResearchAttempt(
      "access-token",
      "attempt-id",
      "receive_failure",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      action: "complete_attempt",
      attemptId: "attempt-id",
      outcomeType: "receive_failure",
    });
  });

  it("accepts outcome collection only for current explicit consent", () => {
    expect(canRecordResearchOutcomes(undefined)).toBe(false);
    expect(canRecordResearchOutcomes({
      policyVersion: RESEARCH_POLICY_VERSION,
      subjectBinding: null,
      consent: {
        policyVersion: RESEARCH_POLICY_VERSION,
        status: "opted_in",
        allowedUses: ["anonymous_quality_metrics"],
        consentedAt: null,
        withdrawnAt: null,
        retentionAcknowledgedAt: null,
        updatedAt: "2026-07-16T12:00:00Z",
      },
    })).toBe(false);
    expect(canRecordResearchOutcomes({
      policyVersion: RESEARCH_POLICY_VERSION,
      subjectBinding: null,
      consent: {
        policyVersion: RESEARCH_POLICY_VERSION,
        status: "opted_in",
        allowedUses: ["attempt_outcome_training"],
        consentedAt: "2026-07-16T12:00:00Z",
        withdrawnAt: null,
        retentionAcknowledgedAt: "2026-07-16T12:00:00Z",
        updatedAt: "2026-07-16T12:00:00Z",
      },
    })).toBe(true);
  });
});
