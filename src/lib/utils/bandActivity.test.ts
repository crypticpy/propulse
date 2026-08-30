import { describe, expect, it } from "vitest";

import {
  MIN_CLIMATOLOGY_SAMPLES,
  classifyActivityLevel,
  computeTrend,
  isCrowded,
  parseBandActivityEntry,
} from "./bandActivity";

const THRESHOLDS = { p25: 10, p75: 40, p95: 80 };

describe("classifyActivityLevel", () => {
  it("maps counts onto the percentile display bands", () => {
    expect(classifyActivityLevel(0, THRESHOLDS, 90)).toBe("quiet");
    expect(classifyActivityLevel(9.9, THRESHOLDS, 90)).toBe("quiet");
    expect(classifyActivityLevel(10, THRESHOLDS, 90)).toBe("normal");
    expect(classifyActivityLevel(39.9, THRESHOLDS, 90)).toBe("normal");
    expect(classifyActivityLevel(40, THRESHOLDS, 90)).toBe("busy");
    expect(classifyActivityLevel(79.9, THRESHOLDS, 90)).toBe("busy");
    expect(classifyActivityLevel(80, THRESHOLDS, 90)).toBe("exceptional");
  });

  it("refuses a percentile claim without a trustworthy baseline", () => {
    expect(classifyActivityLevel(50, null, 90)).toBeNull();
    expect(classifyActivityLevel(50, THRESHOLDS, null)).toBeNull();
    expect(
      classifyActivityLevel(50, THRESHOLDS, MIN_CLIMATOLOGY_SAMPLES - 1),
    ).toBeNull();
    expect(
      classifyActivityLevel(50, THRESHOLDS, MIN_CLIMATOLOGY_SAMPLES),
    ).toBe("busy");
  });

  it("handles a degenerate all-zero climatology cell", () => {
    // A dead band × hour (p25 = p75 = p95 = 0): silence stays quiet, and
    // any traffic is exceptional relative to an empty history.
    const dead = { p25: 0, p75: 0, p95: 0 };
    expect(classifyActivityLevel(0, dead, 90)).toBe("quiet");
    expect(classifyActivityLevel(5, dead, 90)).toBe("exceptional");
  });
});

describe("isCrowded", () => {
  it("is true exactly at the 95th percentile and above", () => {
    expect(isCrowded(79.9, THRESHOLDS, 90)).toBe(false);
    expect(isCrowded(80, THRESHOLDS, 90)).toBe(true);
    expect(isCrowded(500, THRESHOLDS, 90)).toBe(true);
  });

  it("never claims crowded without a baseline", () => {
    expect(isCrowded(500, null, 90)).toBe(false);
    expect(isCrowded(500, THRESHOLDS, 3)).toBe(false);
  });

  it("never claims crowded against an empty congestion history", () => {
    expect(isCrowded(5, { p25: 0, p75: 0, p95: 0 }, 90)).toBe(false);
  });
});

describe("computeTrend", () => {
  it("applies the ±20% dead band around the prior window", () => {
    expect(computeTrend(12, 10)).toBe("steady"); // exactly +20%
    expect(computeTrend(13, 10)).toBe("rising");
    expect(computeTrend(8, 10)).toBe("steady"); // exactly -20%
    expect(computeTrend(7, 10)).toBe("falling");
    expect(computeTrend(10, 10)).toBe("steady");
  });

  it("handles empty prior windows without dividing by zero", () => {
    expect(computeTrend(0, 0)).toBe("steady");
    expect(computeTrend(3, 0)).toBe("rising");
    expect(computeTrend(0, 5)).toBe("falling");
  });
});

describe("parseBandActivityEntry", () => {
  const row = {
    band: "20m",
    count_60m: 42,
    obs_20m: 7,
    reporters_20m: 4,
    count_10m_recent: 9,
    count_10m_prior: 6,
    source_counts_60m: { pskreporter: 30, rbn: 12 },
    p25: 10,
    p50: 22,
    p75: 35,
    p95: 60,
    sample_count: 88,
  };

  it("parses a complete endpoint row", () => {
    expect(parseBandActivityEntry(row)).toEqual({
      band: "20m",
      count60m: 42,
      obs20m: 7,
      reporters20m: 4,
      count10mRecent: 9,
      count10mPrior: 6,
      sourceCounts60m: { pskreporter: 30, rbn: 12 },
      thresholds: { p25: 10, p75: 35, p95: 60 },
      sampleCount: 88,
    });
  });

  it("returns null thresholds when any percentile is missing", () => {
    const entry = parseBandActivityEntry({ ...row, p75: null });
    expect(entry?.thresholds).toBeNull();
    expect(entry?.count60m).toBe(42);
  });

  it("rejects rows missing required counts", () => {
    expect(parseBandActivityEntry({ ...row, count_60m: undefined })).toBeNull();
    expect(parseBandActivityEntry({ ...row, band: "" })).toBeNull();
    expect(parseBandActivityEntry("nope")).toBeNull();
  });
});
