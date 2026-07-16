import { describe, expect, it, vi } from "vitest";
import {
  RESEARCH_HEALTH_ISSUE_TITLE,
  normalizeMonitorPayload,
  reconcileResearchHealthIssue,
} from "./reconcile-research-health-issue.mjs";

const REPOSITORY = "crypticpy/propulse";
const TOKEN = "github-actions-token-with-test-length";

function monitor(overrides = {}) {
  return {
    evaluated: true,
    heartbeatStale: false,
    stateChanged: false,
    heartbeatAgeSeconds: 300,
    alertDelivery: {
      configured: false,
      failed: 0,
      exhausted: 0,
    },
    ...overrides,
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("research health GitHub issue destination", () => {
  it("treats a valid fresh heartbeat as healthy", () => {
    expect(normalizeMonitorPayload(monitor())).toMatchObject({
      healthy: true,
      reasons: [],
    });
  });

  it("rejects a well-formed response that was not evaluated", () => {
    expect(normalizeMonitorPayload(monitor({ evaluated: false }))).toMatchObject({
      healthy: false,
      reasons: ["monitor evaluation incomplete"],
    });
  });

  it("opens one identity-free incident for a stale M5 heartbeat", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ number: 42 }, 201));
    const result = await reconcileResearchHealthIssue({
      payload: monitor({
        heartbeatStale: true,
        stateChanged: true,
        heartbeatAgeSeconds: 7300,
      }),
      repository: REPOSITORY,
      token: TOKEN,
      fetchImpl: fetchMock,
    });
    expect(result).toMatchObject({
      healthy: false,
      action: "created",
      issueNumber: 42,
    });
    const create = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(create.title).toBe(RESEARCH_HEALTH_ISSUE_TITLE);
    expect(create.body).toContain("M5 heartbeat stale");
    expect(create.body).toContain("excludes callsigns, grids, equipment");
    expect(create.body).not.toContain("https://");
  });

  it("does not duplicate or spam an unchanged open incident", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json([{ number: 42, title: RESEARCH_HEALTH_ISSUE_TITLE }]),
    );
    const result = await reconcileResearchHealthIssue({
      payload: monitor({ heartbeatStale: true }),
      repository: REPOSITORY,
      token: TOKEN,
      fetchImpl: fetchMock,
    });
    expect(result.action).toBe("unchanged");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("closes the incident only after a genuine healthy response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json([{ number: 42, title: RESEARCH_HEALTH_ISSUE_TITLE }]),
      )
      .mockResolvedValueOnce(json({ id: 1 }, 201))
      .mockResolvedValueOnce(json({ number: 42, state: "closed" }));
    const result = await reconcileResearchHealthIssue({
      payload: monitor(),
      repository: REPOSITORY,
      token: TOKEN,
      fetchImpl: fetchMock,
    });
    expect(result).toMatchObject({
      healthy: true,
      action: "closed",
      issueNumber: 42,
    });
    expect(fetchMock.mock.calls[1][0]).toContain("/issues/42/comments");
    expect(fetchMock.mock.calls[2][0]).toContain("/issues/42");
    expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
  });

  it("opens an incident when the protected monitor endpoint is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ number: 7 }, 201));
    const result = await reconcileResearchHealthIssue({
      payload: { monitorUnavailable: true },
      repository: REPOSITORY,
      token: TOKEN,
      fetchImpl: fetchMock,
    });
    expect(result).toMatchObject({
      healthy: false,
      action: "created",
      issueNumber: 7,
      reasons: ["monitor endpoint unavailable"],
    });
  });

  it("does not spam a continuing endpoint-outage incident", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json([{ number: 7, title: RESEARCH_HEALTH_ISSUE_TITLE }]),
    );
    const result = await reconcileResearchHealthIssue({
      payload: { monitorUnavailable: true },
      repository: REPOSITORY,
      token: TOKEN,
      fetchImpl: fetchMock,
    });
    expect(result.action).toBe("unchanged");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
