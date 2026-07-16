import { describe, expect, it } from "vitest";
import {
  parseResearchHealthPayload,
  researchAlertWebhookBody,
  signResearchHealthBody,
  verifyResearchHealthSignature,
  type ResearchAlertEvent,
} from "./researchHealth";

const NOW_MS = Date.parse("2026-07-16T06:00:00Z");
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const SECRET = "test-secret-that-is-at-least-thirty-two-characters";

function payload(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    eventId: "a".repeat(64),
    generatedAt: "2026-07-16T06:00:00Z",
    decision: "healthy",
    researchOnly: true,
    alerts: [],
    lastCompletedTargetHour: "2026-07-16T05:00:00Z",
    continuousCompletedHours: 3,
    completedHours: 3,
    requiredHours: 720,
    missingHours: 0,
    freshnessSeconds: 0,
  };
}

describe("research health ingest contract", () => {
  it("accepts the exact identity-free aggregate schema", () => {
    expect(parseResearchHealthPayload(JSON.stringify(payload()), NOW_MS)).toMatchObject({
      decision: "healthy",
      completedHours: 3,
      researchOnly: true,
    });
  });

  it("rejects identity fields and inconsistent decisions", () => {
    const identity = { ...payload(), callsign: "TEST1" };
    expect(() =>
      parseResearchHealthPayload(JSON.stringify(identity), NOW_MS),
    ).toThrow("unknown or missing fields");

    const inconsistent = {
      ...payload(),
      decision: "alert",
      alerts: [],
    };
    expect(() =>
      parseResearchHealthPayload(JSON.stringify(inconsistent), NOW_MS),
    ).toThrow("decision and alerts disagree");
  });

  it("verifies the timestamp-bound HMAC and rejects replay", async () => {
    const body = JSON.stringify(payload());
    const timestamp = String(NOW_SECONDS);
    const signature = await signResearchHealthBody(body, timestamp, SECRET);
    await expect(
      verifyResearchHealthSignature(
        body,
        timestamp,
        `v1=${signature}`,
        SECRET,
        NOW_SECONDS,
      ),
    ).resolves.toBe(true);
    await expect(
      verifyResearchHealthSignature(
        body,
        String(NOW_SECONDS - 301),
        `v1=${signature}`,
        SECRET,
        NOW_SECONDS,
      ),
    ).resolves.toBe(false);
  });

  it("builds explicit Slack, Discord, and generic alert payloads", () => {
    const event: ResearchAlertEvent = {
      event_id: "b".repeat(64),
      decision: "alert",
      alert_names: ["health_record_recent"],
      occurred_at: "2026-07-16T06:00:00Z",
      attempts: 0,
    };
    expect(researchAlertWebhookBody(event, "slack")).toHaveProperty("text");
    expect(researchAlertWebhookBody(event, "discord")).toHaveProperty("content");
    expect(researchAlertWebhookBody(event, "generic")).toMatchObject({
      decision: "alert",
      alerts: ["health_record_recent"],
    });
  });
});
