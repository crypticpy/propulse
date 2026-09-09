import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LAST_GOOD_MAX_AGE_MS,
  handleEventsLaunches,
  normalizeUpcomingLaunches,
  parseTimePrecision,
  resetLaunchCacheForTests,
  resolveLaunchesPayload,
  seedLastGoodForTests,
  type LaunchRecord,
} from "./launches";

afterEach(() => {
  resetLaunchCacheForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function rawLaunch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "launch-1",
    name: "Falcon 9 Block 5 | Starlink Group 10-12",
    net: "2026-09-10T09:00:00Z",
    window_start: "2026-09-10T08:52:00Z",
    window_end: "2026-09-10T09:13:00Z",
    webcast_live: false,
    last_updated: "2026-09-07T16:31:11Z",
    status: { id: 1, name: "Go for Launch", abbrev: "Go" },
    net_precision: { id: 2, name: "Hour", abbrev: "HR" },
    launch_service_provider: {
      name: "SpaceX",
      abbrev: "SpX",
    },
    pad: {
      name: "Space Launch Complex 40",
      location: { name: "Cape Canaveral, FL, USA" },
    },
    ...overrides,
  };
}

describe("parseTimePrecision", () => {
  it("maps Launch Library abbrevs including HR for hour", () => {
    expect(parseTimePrecision({ abbrev: "SEC" })).toBe("second");
    expect(parseTimePrecision({ abbrev: "MIN" })).toBe("minute");
    expect(parseTimePrecision({ abbrev: "HR", name: "Hour" })).toBe("hour");
    expect(parseTimePrecision({ abbrev: "DAY" })).toBe("day");
    expect(parseTimePrecision({ abbrev: "QTR" })).toBe("coarser");
    expect(parseTimePrecision({ name: "Month" })).toBe("coarser");
    expect(parseTimePrecision(null)).toBe("unknown");
  });
});

describe("normalizeUpcomingLaunches", () => {
  it("keeps provider, pad, NET and precision from a normal-mode payload", () => {
    const launches = normalizeUpcomingLaunches({
      results: [rawLaunch()],
    });
    expect(launches).toEqual<LaunchRecord[]>([
      {
        id: "launch-1",
        name: "Falcon 9 Block 5 | Starlink Group 10-12",
        provider: "SpaceX",
        providerAbbrev: "SpX",
        pad: "Space Launch Complex 40",
        location: "Cape Canaveral, FL, USA",
        net: "2026-09-10T09:00:00.000Z",
        windowStart: "2026-09-10T08:52:00.000Z",
        windowEnd: "2026-09-10T09:13:00.000Z",
        status: "Go",
        statusName: "Go for Launch",
        precision: "hour",
        webcastLive: false,
        sourceUpdatedAt: "2026-09-07T16:31:11.000Z",
      },
    ]);
  });

  it("skips rows without a stable id or name and caps at 10", () => {
    const results = Array.from({ length: 12 }, (_, i) =>
      rawLaunch({ id: `launch-${i}`, name: `Mission ${i}` }),
    );
    results.push({ id: "no-name" });
    const launches = normalizeUpcomingLaunches({ results });
    expect(launches).toHaveLength(10);
    expect(launches[0].id).toBe("launch-0");
    expect(launches[9].id).toBe("launch-9");
  });

  it("returns an empty list for a malformed body", () => {
    expect(normalizeUpcomingLaunches(null)).toEqual([]);
    expect(normalizeUpcomingLaunches({ results: "nope" })).toEqual([]);
  });

  it("reads lsp when launch_service_provider is absent", () => {
    const launches = normalizeUpcomingLaunches({
      results: [
        rawLaunch({
          launch_service_provider: undefined,
          lsp: { name: "Rocket Lab", abbrev: "RL" },
        }),
      ],
    });
    expect(launches[0].provider).toBe("Rocket Lab");
    expect(launches[0].providerAbbrev).toBe("RL");
  });
});

describe("resolveLaunchesPayload", () => {
  const now = Date.parse("2026-09-08T21:00:00Z");
  const cached: ReturnType<typeof resolveLaunchesPayload>["payload"] = {
    status: "ok",
    stale: false,
    retrievedAt: "2026-09-08T20:50:00.000Z",
    launches: normalizeUpcomingLaunches({ results: [rawLaunch()] }),
  };

  it("normalizes a successful upstream body", () => {
    const { payload, remember } = resolveLaunchesPayload(
      { kind: "ok", raw: { results: [rawLaunch()] } },
      null,
      now,
    );
    expect(remember).toBe(true);
    expect(payload.status).toBe("ok");
    expect(payload.stale).toBe(false);
    expect(payload.launches).toHaveLength(1);
    expect(payload.retrievedAt).toBe("2026-09-08T21:00:00.000Z");
  });

  it("serves the last good payload as stale on a 429", () => {
    const { payload, remember } = resolveLaunchesPayload(
      { kind: "rate_limited" },
      cached,
      now,
    );
    expect(remember).toBe(false);
    expect(payload.status).toBe("stale");
    expect(payload.stale).toBe(true);
    expect(payload.launches).toEqual(cached.launches);
    expect(payload.retrievedAt).toBe(cached.retrievedAt);
  });

  it("does not replace last-good with a 200 that has no results array", () => {
    const { payload, remember } = resolveLaunchesPayload(
      { kind: "ok", raw: { count: 0 } },
      cached,
      now,
    );
    expect(remember).toBe(false);
    expect(payload.status).toBe("stale");
    expect(payload.launches).toEqual(cached.launches);
    expect(payload.retrievedAt).toBe(cached.retrievedAt);
  });

  it("treats a legitimate empty results list as ok", () => {
    const { payload, remember } = resolveLaunchesPayload(
      { kind: "ok", raw: { results: [] } },
      cached,
      now,
    );
    expect(remember).toBe(true);
    expect(payload.status).toBe("ok");
    expect(payload.launches).toEqual([]);
  });

  it("marks an empty unavailable result when there is no last-good cache", () => {
    const { payload } = resolveLaunchesPayload({ kind: "error" }, null, now);
    expect(payload).toEqual({
      status: "unavailable",
      stale: false,
      retrievedAt: "2026-09-08T21:00:00.000Z",
      launches: [],
    });
  });
});

function launchesRequest(
  method = "GET",
  ip = "203.0.113.10",
): Request {
  return new Request("https://propulse.test/api/events/launches", {
    method,
    headers: { "x-forwarded-for": ip },
  });
}

function upstreamOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("handleEventsLaunches", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T21:00:00Z"));
  });

  it("answers OPTIONS with CORS and no body", async () => {
    const response = await handleEventsLaunches(launchesRequest("OPTIONS"));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeTruthy();
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("rejects POST with 405", async () => {
    const response = await handleEventsLaunches(launchesRequest("POST"));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });

  it("returns Cache-Control s-maxage=900 on a fresh upstream hit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(upstreamOk({ results: [rawLaunch()] })),
    );
    const response = await handleEventsLaunches(launchesRequest("GET", "203.0.113.11"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=900");
    const body = (await response.json()) as { status: string; launches: unknown[] };
    expect(body.status).toBe("ok");
    expect(body.launches).toHaveLength(1);
  });

  it("re-stamps remaining CDN ttl instead of another full 900s", async () => {
    seedLastGoodForTests({
      storedAt: Date.parse("2026-09-08T20:50:00Z"),
      payload: {
        status: "ok",
        stale: false,
        retrievedAt: "2026-09-08T20:50:00.000Z",
        launches: normalizeUpcomingLaunches({ results: [rawLaunch()] }),
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleEventsLaunches(launchesRequest("GET", "203.0.113.12"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
  });

  it("serves last-good as stale on a 429", async () => {
    seedLastGoodForTests({
      storedAt: Date.parse("2026-09-08T20:40:00Z"),
      payload: {
        status: "ok",
        stale: false,
        retrievedAt: "2026-09-08T20:40:00.000Z",
        launches: normalizeUpcomingLaunches({ results: [rawLaunch()] }),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })),
    );
    const response = await handleEventsLaunches(launchesRequest("GET", "203.0.113.13"));
    const body = (await response.json()) as {
      status: string;
      stale: boolean;
      retrievedAt: string;
    };
    expect(body.status).toBe("stale");
    expect(body.stale).toBe(true);
    expect(body.retrievedAt).toBe("2026-09-08T20:40:00.000Z");
  });

  it("treats a fetch timeout as an error and keeps last-good", async () => {
    seedLastGoodForTests({
      storedAt: Date.parse("2026-09-08T20:40:00Z"),
      payload: {
        status: "ok",
        stale: false,
        retrievedAt: "2026-09-08T20:40:00.000Z",
        launches: normalizeUpcomingLaunches({ results: [rawLaunch()] }),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );
    const response = await handleEventsLaunches(launchesRequest("GET", "203.0.113.14"));
    const body = (await response.json()) as { status: string; stale: boolean };
    expect(body.status).toBe("stale");
    expect(body.stale).toBe(true);
  });

  it("drops last-good older than six hours", async () => {
    seedLastGoodForTests({
      storedAt: Date.parse("2026-09-08T21:00:00Z") - LAST_GOOD_MAX_AGE_MS - 1,
      payload: {
        status: "ok",
        stale: false,
        retrievedAt: "2026-09-08T14:00:00.000Z",
        launches: normalizeUpcomingLaunches({ results: [rawLaunch()] }),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })),
    );
    const response = await handleEventsLaunches(launchesRequest("GET", "203.0.113.15"));
    const body = (await response.json()) as {
      status: string;
      launches: unknown[];
    };
    expect(body.status).toBe("unavailable");
    expect(body.launches).toEqual([]);
  });

  it("reads last-good from caches.default after a cold isolate", async () => {
    const store = new Map<string, Response>();
    let lastPut: { url: string; cacheControl: string | null } | null = null;
    vi.stubGlobal("caches", {
      default: {
        match: async (info: RequestInfo | URL) => {
          const url =
            typeof info === "string"
              ? info
              : info instanceof URL
                ? info.href
                : info.url;
          const hit = store.get(url);
          return hit?.clone();
        },
        put: async (info: RequestInfo | URL, response: Response) => {
          const url =
            typeof info === "string"
              ? info
              : info instanceof URL
                ? info.href
                : info.url;
          lastPut = {
            url,
            cacheControl: response.headers.get("cache-control"),
          };
          store.set(url, response);
        },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(upstreamOk({ results: [rawLaunch()] })),
    );
    await handleEventsLaunches(launchesRequest("GET", "203.0.113.16"));
    expect(lastPut?.url).toBe("https://propulse.test/api/events/launches");
    expect(lastPut?.cacheControl).toBe("max-age=21600");
    resetLaunchCacheForTests();
    vi.setSystemTime(new Date("2026-09-08T21:16:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })),
    );
    const response = await handleEventsLaunches(launchesRequest("GET", "203.0.113.17"));
    const body = (await response.json()) as { status: string; stale: boolean };
    expect(body.status).toBe("stale");
    expect(body.stale).toBe(true);
  });
});
