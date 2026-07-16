import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./research-health-monitor";


const ENV_NAMES = [
  "PROPULSE_RESEARCH_HEALTH_MONITOR_SECRET",
  "PROPULSE_RESEARCH_HEALTH_STORE_URL",
  "PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY",
  "PROPULSE_RESEARCH_ALERT_WEBHOOK_URL",
] as const;
const ORIGINAL_ENV = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
);
const SECRET = "test-monitor-secret-that-is-at-least-32-characters";
const NOW = new Date("2026-07-16T07:30:00Z");

function request(secret = SECRET): Request {
  return new Request(
    "https://propulse.test/api/propagation/research-health-monitor",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    },
  );
}

beforeEach(() => {
  process.env.PROPULSE_RESEARCH_HEALTH_MONITOR_SECRET = SECRET;
  process.env.PROPULSE_RESEARCH_HEALTH_STORE_URL =
    "https://store.supabase.test";
  process.env.PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY = "service-key";
  delete process.env.PROPULSE_RESEARCH_ALERT_WEBHOOK_URL;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  for (const name of ENV_NAMES) {
    const original = ORIGINAL_ENV[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("off-M5 research health monitor", () => {
  it("requires a configured independent bearer", async () => {
    delete process.env.PROPULSE_RESEARCH_HEALTH_MONITOR_SECRET;
    await expect(handler(request())).resolves.toHaveProperty("status", 503);
    process.env.PROPULSE_RESEARCH_HEALTH_MONITOR_SECRET = SECRET;
    await expect(handler(request("wrong-secret"))).resolves.toHaveProperty(
      "status",
      401,
    );
  });

  it("checks a fresh heartbeat without creating a transition", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ reported_at: "2026-07-16T07:00:00Z" }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      evaluated: true,
      heartbeatStale: false,
      stateChanged: false,
      heartbeatAgeSeconds: 1800,
      alertDelivery: {
        configured: false,
        pending: 0,
        delivered: 0,
        failed: 0,
        exhausted: 0,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the database transition when the source heartbeat is stale", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ reported_at: "2026-07-16T04:30:00Z" }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { evaluated: true, state_changed: true, heartbeat_stale: true },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      evaluated: true,
      heartbeatStale: true,
      stateChanged: true,
      heartbeatAgeSeconds: 10_800,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "rpc/monitor_propagation_research_health",
    );
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body).toMatchObject({
      p_observed_at: NOW.toISOString(),
      p_stale_seconds: 7200,
    });
    expect(body.p_event_id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects non-POST requests", async () => {
    const response = await handler(
      new Request(
        "https://propulse.test/api/propagation/research-health-monitor",
      ),
    );
    expect(response.status).toBe(405);
  });
});
