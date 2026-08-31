import { describe, expect, it } from "vitest";
import {
  getSpotFetchLimit,
  MAX_SPOT_FETCH_LIMIT,
  MIN_SPOT_FETCH_LIMIT,
} from "./spotDensity";

describe("getSpotFetchLimit", () => {
  it("requests more than the old flat 50 when the density slider is raised", () => {
    // The bug this exists to fix: displayDensity could be set to 200 while
    // every source was still fetched with a hardcoded 50, so the slider did
    // nothing above its midpoint.
    expect(getSpotFetchLimit(200)).toBe(200);
    expect(getSpotFetchLimit(120)).toBe(120);
  });

  it("never starves the analysis consumers when the map is turned down", () => {
    // useLiveSpots is shared with useBandOpeningFeed and useAlerts, which are
    // not map views. A display preference must not shrink their feed.
    expect(getSpotFetchLimit(10)).toBe(MIN_SPOT_FETCH_LIMIT);
    expect(getSpotFetchLimit(25)).toBe(MIN_SPOT_FETCH_LIMIT);
  });

  it("does not ask for more than the edge routes will return", () => {
    // api/_lib/handlers/spots.ts clamps limit to 200.
    expect(getSpotFetchLimit(1000)).toBe(MAX_SPOT_FETCH_LIMIT);
  });

  it("falls back to the previous behaviour for a missing or bad value", () => {
    expect(getSpotFetchLimit(undefined)).toBe(MIN_SPOT_FETCH_LIMIT);
    expect(getSpotFetchLimit(Number.NaN)).toBe(MIN_SPOT_FETCH_LIMIT);
  });
});
