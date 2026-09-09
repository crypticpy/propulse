import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeUpcomingLaunches,
  parseTimePrecision,
  resetLaunchCacheForTests,
  resolveLaunchesPayload,
  type LaunchRecord,
} from "./launches";

afterEach(() => {
  resetLaunchCacheForTests();
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
