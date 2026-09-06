import { describe, expect, it } from "vitest";
import {
  getSolarEdgeCacheTtlMs,
  getSolarSourcePolicy,
  SOLAR_SOURCE_POLICIES,
} from "./sourcePolicies";
import type { SolarSourceId } from "./contracts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("solar source cadence policies", () => {
  it.each<[SolarSourceId, number]>([
    ["noaa-solar-flux", 4.5 * HOUR],
    ["noaa-magnetometer", 13 * MINUTE],
    ["noaa-protons", 13 * MINUTE],
    ["noaa-dst", 83 * MINUTE],
    ["noaa-probabilities", 25 * HOUR],
    ["noaa-sunspots", 48 * DAY],
    ["noaa-flux-forecast", 3 * HOUR],
    ["swpc-alerts", 2 * MINUTE],
    ["swpc-solar-wind-mag", 12 * MINUTE],
    ["swpc-solar-wind-plasma", 12 * MINUTE],
  ])("keeps a representative %s response current", (sourceId, ageMs) => {
    expect(ageMs).toBeLessThan(getSolarSourcePolicy(sourceId).softTtlMs);
  });

  it("revalidates slow-cadence products without shortening their usability window", () => {
    expect(
      getSolarEdgeCacheTtlMs(getSolarSourcePolicy("noaa-sunspots")),
    ).toBe(DAY);
    expect(
      getSolarEdgeCacheTtlMs(getSolarSourcePolicy("noaa-dst")),
    ).toBe(15 * MINUTE);
    expect(
      getSolarEdgeCacheTtlMs(getSolarSourcePolicy("swpc-alerts")),
    ).toBe(MINUTE);
  });

  it("keeps every cache revalidation window inside its usability limits", () => {
    for (const policy of Object.values(SOLAR_SOURCE_POLICIES)) {
      expect(getSolarEdgeCacheTtlMs(policy)).toBeLessThanOrEqual(
        policy.softTtlMs,
      );
      expect(policy.softTtlMs).toBeLessThan(policy.hardTtlMs);
    }
  });

  it("ages the day-long X-ray series by fetch time so a contaminated tail cannot hard-expire it", () => {
    // `adaptXray` drops GOES electron-contaminated samples, which pulls
    // `observedAt` back to the last valid minute; a long episode would
    // otherwise make the whole 24-hour chart unusable while the feed is live.
    expect(getSolarSourcePolicy("noaa-xray-24h").freshnessBasis).toBe(
      "fetchedAt",
    );
    // The short window that feeds alerts and the briefing still ages by the
    // measurement itself, so a held reading cannot look current there.
    expect(getSolarSourcePolicy("noaa-xray").freshnessBasis).toBeUndefined();
  });
});
