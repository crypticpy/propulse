import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleResearchRetention,
  type ResearchRetentionDependencies,
} from "./research-retention";

const ORIGINAL_SECRET = process.env.CRON_SECRET;
const SECRET = "test-cron-secret-that-is-at-least-32-characters";
const NOW = new Date("2026-07-16T05:17:00Z");

function request(secret = SECRET, method = "GET"): Request {
  return new Request("https://propulse.test/api/propagation/research-retention", {
    method,
    headers: { Authorization: `Bearer ${secret}` },
  });
}

function dependencies(): ResearchRetentionDependencies {
  return {
    prune: vi.fn().mockResolvedValue({
      participants_selected: 2,
      outcomes_deleted: 7,
      attempts_deleted: 6,
      predictions_deleted: 5,
    }),
    now: () => NOW,
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.restoreAllMocks();
});

describe("research retention cron", () => {
  it("fails closed without the independent cron secret", async () => {
    delete process.env.CRON_SECRET;
    await expect(handleResearchRetention(request(), dependencies()))
      .resolves.toHaveProperty("status", 503);
    process.env.CRON_SECRET = SECRET;
    await expect(handleResearchRetention(request("wrong-secret"), dependencies()))
      .resolves.toHaveProperty("status", 401);
  });

  it("accepts only GET", async () => {
    await expect(handleResearchRetention(request(SECRET, "POST"), dependencies()))
      .resolves.toHaveProperty("status", 405);
  });

  it("returns aggregate deletion counts without identifiers", async () => {
    const deps = dependencies();
    const response = await handleResearchRetention(request(), deps);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1,
      participantsSelected: 2,
      rowsDeleted: { outcomes: 7, attempts: 6, predictions: 5 },
    });
    expect(deps.prune).toHaveBeenCalledWith(NOW.toISOString(), 1_000);
  });

  it("does not expose database failure details", async () => {
    const deps = dependencies();
    vi.mocked(deps.prune).mockRejectedValue(new Error("user id leaked here"));
    const response = await handleResearchRetention(request(), deps);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("user id leaked here");
  });
});
