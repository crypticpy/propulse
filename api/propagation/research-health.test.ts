import { afterEach, describe, expect, it, vi } from "vitest";
import handler, {
  deliverPendingAlerts,
  MAX_RESEARCH_ALERT_ATTEMPTS,
  researchHealthStoreConfig,
} from "./research-health";

const ORIGINAL_VIEW_FLAG = process.env.PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED;
const ORIGINAL_INGEST_SECRET = process.env.PROPULSE_RESEARCH_HEALTH_INGEST_SECRET;
const STORE_ENV_NAMES = [
  "PROPULSE_RESEARCH_HEALTH_STORE_URL",
  "PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const ORIGINAL_STORE_ENV = Object.fromEntries(
  STORE_ENV_NAMES.map((name) => [name, process.env[name]]),
);
const ALERT_ENV_NAMES = [
  "PROPULSE_RESEARCH_ALERT_WEBHOOK_URL",
  "PROPULSE_RESEARCH_ALERT_WEBHOOK_KIND",
  "PROPULSE_RESEARCH_ALERT_WEBHOOK_ALLOWED_HOST",
  "PROPULSE_RESEARCH_ALERT_WEBHOOK_BEARER",
] as const;
const ORIGINAL_ALERT_ENV = Object.fromEntries(
  ALERT_ENV_NAMES.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  if (ORIGINAL_VIEW_FLAG === undefined) {
    delete process.env.PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED;
  } else {
    process.env.PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED = ORIGINAL_VIEW_FLAG;
  }
  if (ORIGINAL_INGEST_SECRET === undefined) {
    delete process.env.PROPULSE_RESEARCH_HEALTH_INGEST_SECRET;
  } else {
    process.env.PROPULSE_RESEARCH_HEALTH_INGEST_SECRET = ORIGINAL_INGEST_SECRET;
  }
  for (const name of STORE_ENV_NAMES) {
    const original = ORIGINAL_STORE_ENV[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
  for (const name of ALERT_ENV_NAMES) {
    const original = ORIGINAL_ALERT_ENV[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("research health endpoint gates", () => {
  it("keeps the coarse view unavailable until the server gate is enabled", async () => {
    delete process.env.PROPULSE_RESEARCH_HEALTH_VIEW_ENABLED;
    const response = await handler(
      new Request("https://propulse.test/api/propagation/research-health"),
    );
    expect(response.status).toBe(404);
  });

  it("rejects unsigned ingest when server configuration is absent", async () => {
    delete process.env.PROPULSE_RESEARCH_HEALTH_INGEST_SECRET;
    const response = await handler(
      new Request("https://propulse.test/api/propagation/research-health", {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(response.status).toBe(503);
  });

  it("answers preflight without a response body", async () => {
    const response = await handler(
      new Request("https://propulse.test/api/propagation/research-health", {
        method: "OPTIONS",
      }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("keeps a dedicated health store all-or-nothing", () => {
    process.env.SUPABASE_URL = "https://general.supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "general-key";
    process.env.PROPULSE_RESEARCH_HEALTH_STORE_URL =
      "https://dedicated.supabase.test";
    delete process.env.PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY;
    expect(researchHealthStoreConfig()).toBeNull();

    process.env.PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY = "dedicated-key";
    expect(researchHealthStoreConfig()).toEqual({
      baseUrl: "https://dedicated.supabase.test",
      serviceKey: "dedicated-key",
    });
  });

  it("delivers a generic alert once and marks the outbox event", async () => {
    process.env.PROPULSE_RESEARCH_ALERT_WEBHOOK_URL =
      "https://alerts.example.test/propulse";
    process.env.PROPULSE_RESEARCH_ALERT_WEBHOOK_KIND = "generic";
    process.env.PROPULSE_RESEARCH_ALERT_WEBHOOK_ALLOWED_HOST =
      "alerts.example.test";
    process.env.PROPULSE_RESEARCH_ALERT_WEBHOOK_BEARER = "test-bearer";
    const event = {
      event_id: "a".repeat(64),
      decision: "alert",
      alert_names: ["health_record_recent"],
      occurred_at: "2026-07-16T07:00:00Z",
      attempts: 0,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([event]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deliverPendingAlerts({
        baseUrl: "https://store.supabase.test",
        serviceKey: "service-key",
      }),
    ).resolves.toEqual({
      configured: true,
      pending: 1,
      delivered: 1,
      failed: 0,
      exhausted: 0,
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `attempts=lt.${MAX_RESEARCH_ALERT_ATTEMPTS}`,
    );
    expect(fetchMock.mock.calls[1][0]).toBe("https://alerts.example.test/propulse");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: "Bearer test-bearer",
        "Content-Type": "application/json",
        "Idempotency-Key": event.event_id,
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
      attempts: 1,
      last_error: null,
    });
  });

  it("records a bounded sanitized failure at the retry limit", async () => {
    process.env.PROPULSE_RESEARCH_ALERT_WEBHOOK_URL =
      "https://alerts.example.test/propulse";
    process.env.PROPULSE_RESEARCH_ALERT_WEBHOOK_ALLOWED_HOST =
      "alerts.example.test";
    const event = {
      event_id: "b".repeat(64),
      decision: "healthy",
      alert_names: [],
      occurred_at: "2026-07-16T07:05:00Z",
      attempts: MAX_RESEARCH_ALERT_ATTEMPTS - 1,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([event]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response("no", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ event_id: event.event_id }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deliverPendingAlerts({
        baseUrl: "https://store.supabase.test",
        serviceKey: "service-key",
      }),
    ).resolves.toEqual({
      configured: true,
      pending: 1,
      delivered: 0,
      failed: 1,
      exhausted: 1,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      attempts: MAX_RESEARCH_ALERT_ATTEMPTS,
      last_error: "webhook returned 503",
    });
  });
});
