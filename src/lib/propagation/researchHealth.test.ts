import { describe, expect, it } from "vitest";
import {
  evaluateResearchHealthResponse,
  parseResearchHealthResponse,
} from "./researchHealth";

const NOW = Date.parse("2026-07-16T06:00:00Z");

function response(status: "healthy" | "degraded" | "alert" = "healthy") {
  return {
    schemaVersion: 1,
    status,
    reportedAt: "2026-07-16T05:59:00Z",
    lastCompletedAt: "2026-07-16T05:00:00Z",
    freshnessSeconds: 0,
    progress: {
      continuousHours: 3,
      completedHours: 3,
      requiredHours: 720,
      missingHours: 0,
    },
  };
}

describe("research health display contract", () => {
  it("accepts only the coarse aggregate response", () => {
    expect(parseResearchHealthResponse(response())).toEqual(response());
    expect(
      parseResearchHealthResponse({ ...response(), station: "TEST" }),
    ).toBeNull();
  });

  it("maps upstream alert state to an error", () => {
    expect(evaluateResearchHealthResponse(response("alert"), 120_000, NOW)).toMatchObject({
      status: "error",
      errorMessage: "Research pipeline alert",
    });
  });

  it("marks a stale heartbeat degraded even when its stored status is healthy", () => {
    const stale = { ...response(), reportedAt: "2026-07-16T03:00:00Z" };
    expect(evaluateResearchHealthResponse(stale, 120_000, NOW).status).toBe(
      "degraded",
    );
  });

  it("fails closed on malformed counters", () => {
    const malformed = {
      ...response(),
      progress: { ...response().progress, completedHours: -1 },
    };
    expect(evaluateResearchHealthResponse(malformed, 120_000, NOW).status).toBe(
      "error",
    );
  });
});
