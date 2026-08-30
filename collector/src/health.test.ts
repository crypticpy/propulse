import { describe, expect, it } from "vitest";
import type { PollIntervals } from "./types.js";
import { getSourceStaleMs, isSourceStale } from "./health.js";

const pollIntervals: PollIntervals = {
  pskreporter: 5 * 60_000,
  rbn: 5 * 60_000,
  dxcluster: 2 * 60_000,
  solar: 15 * 60_000,
  forecasts: 6 * 60 * 60_000,
  satellites: 2 * 60 * 60_000,
  aggregator: 5 * 60_000,
  forecastSnapshot: 5 * 60_000,
  prune: 60 * 60_000,
  dbSizeGuard: 6 * 60 * 60_000,
  pathArchive: 60 * 60_000,
  bandClimatology: 24 * 60 * 60_000,
  verdictLadder: 5 * 60_000,
};

describe("collector health freshness", () => {
  it("derives freshness windows from each scheduled source interval", () => {
    expect(getSourceStaleMs("forecasts", pollIntervals)).toBe(12 * 60 * 60_000);
    expect(getSourceStaleMs("satellites", pollIntervals)).toBe(4 * 60 * 60_000);
    expect(getSourceStaleMs("solar", pollIntervals)).toBe(30 * 60_000);
    expect(getSourceStaleMs("path-aggregator", pollIntervals)).toBe(10 * 60_000);
    expect(getSourceStaleMs("region-aggregator", pollIntervals)).toBe(
      10 * 60_000,
    );
    expect(getSourceStaleMs("verdict-ladder", pollIntervals)).toBe(
      10 * 60_000,
    );
  });

  it("gives the daily band-climatology task a two-day freshness window", () => {
    // Unmapped sources fall back to the 10-min streaming threshold, which
    // would flip /health to 503 for ~23h50m of every day for a daily task.
    expect(getSourceStaleMs("band-climatology", pollIntervals)).toBe(
      48 * 60 * 60_000,
    );

    const now = Date.UTC(2026, 7, 30, 12, 0);
    const twentyHoursAgo = now - 20 * 60 * 60_000;
    expect(
      isSourceStale("band-climatology", twentyHoursAgo, now, pollIntervals),
    ).toBe(false);
  });

  it("keeps streaming sources on a bounded ten-minute window", () => {
    expect(getSourceStaleMs("pskreporter", pollIntervals)).toBe(10 * 60_000);
    expect(getSourceStaleMs("rbn", pollIntervals)).toBe(10 * 60_000);
    expect(getSourceStaleMs("lightning", pollIntervals)).toBe(10 * 60_000);
  });

  it("does not mark a healthy long-interval source stale after ten minutes", () => {
    const now = Date.UTC(2026, 6, 19, 16, 30);
    const thirtyMinutesAgo = now - 30 * 60_000;

    expect(
      isSourceStale("forecasts", thirtyMinutesAgo, now, pollIntervals),
    ).toBe(false);
    expect(
      isSourceStale("satellites", thirtyMinutesAgo, now, pollIntervals),
    ).toBe(false);
    expect(
      isSourceStale("lightning", thirtyMinutesAgo, now, pollIntervals),
    ).toBe(true);
  });

  it("degrades after two missed scheduled intervals", () => {
    const now = Date.UTC(2026, 6, 19, 16, 30);

    expect(
      isSourceStale(
        "forecasts",
        now - 12 * 60 * 60_000 - 1,
        now,
        pollIntervals,
      ),
    ).toBe(true);
    expect(isSourceStale("forecasts", undefined, now, pollIntervals)).toBe(true);
  });
});
