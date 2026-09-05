import { describe, expect, it } from "vitest";
import { formatAge, heroSizeClass, reportFooter } from "./tokens";

const NOW = Date.parse("2026-09-05T13:00:00Z");

describe("formatAge", () => {
  it("reports WAITING for a null or undefined timestamp", () => {
    expect(formatAge(null, NOW)).toBe("WAITING");
    expect(formatAge(undefined, NOW)).toBe("WAITING");
  });

  it("reports JUST NOW under 45 seconds", () => {
    expect(formatAge(NOW - 0, NOW)).toBe("JUST NOW");
    expect(formatAge(NOW - 44_000, NOW)).toBe("JUST NOW");
  });

  it("reports minutes between 45s and 60 minutes", () => {
    expect(formatAge(NOW - 45_000, NOW)).toBe("1 MIN AGO");
    expect(formatAge(NOW - 5 * 60_000, NOW)).toBe("5 MIN AGO");
    expect(formatAge(NOW - 59 * 60_000, NOW)).toBe("59 MIN AGO");
  });

  it("reports hours between 60 minutes and 24 hours", () => {
    expect(formatAge(NOW - 60 * 60_000, NOW)).toBe("1 H AGO");
    expect(formatAge(NOW - 5 * 60 * 60_000, NOW)).toBe("5 H AGO");
    expect(formatAge(NOW - 23 * 60 * 60_000, NOW)).toBe("23 H AGO");
  });

  it("reports days at or beyond 24 hours", () => {
    expect(formatAge(NOW - 24 * 60 * 60_000, NOW)).toBe("1 D AGO");
    expect(formatAge(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe("3 D AGO");
  });

  it("rounds 59m30s up to the next hour rather than showing 60 minutes", () => {
    expect(formatAge(NOW - 59.5 * 60_000, NOW)).toBe("1 H AGO");
  });

  it("rounds 23h30m up to the next day rather than showing 24 hours", () => {
    expect(formatAge(NOW - 23.5 * 60 * 60_000, NOW)).toBe("1 D AGO");
  });

  it("rounds an hours-based delta to the correct day count", () => {
    expect(formatAge(NOW - 36 * 60 * 60_000, NOW)).toBe("2 D AGO");
  });

  it("treats a small future skew as JUST NOW", () => {
    expect(formatAge(NOW + 30_000, NOW)).toBe("JUST NOW");
  });

  it("treats a future timestamp beyond a minute as JUST NOW, not a negative age", () => {
    expect(formatAge(NOW + 5 * 60_000, NOW)).toBe("JUST NOW");
  });

  it("treats an invalid timestamp as JUST NOW", () => {
    expect(formatAge(Number.NaN, NOW)).toBe("JUST NOW");
  });

  it("accepts Date instances for both the timestamp and now", () => {
    expect(formatAge(new Date(NOW - 5 * 60_000), new Date(NOW))).toBe(
      "5 MIN AGO",
    );
  });

  it("defaults now to the current clock when omitted", () => {
    expect(formatAge(new Date())).toBe("JUST NOW");
  });
});

describe("reportFooter", () => {
  it("builds the DATA: prefix from the source", () => {
    expect(reportFooter("NOAA SWPC", NOW - 60_000, NOW).footer).toBe(
      "DATA: NOAA SWPC",
    );
  });

  it("formats the UPDATED line with the UTC clock and the age", () => {
    expect(reportFooter("NOAA SWPC", NOW - 5 * 60_000, NOW)).toEqual({
      footer: "DATA: NOAA SWPC",
      updated: "UPDATED 12:55 UTC · 5 MIN AGO",
    });
  });

  it("reports WAITING when there is no timestamp yet", () => {
    expect(reportFooter("NOAA SWPC", null, NOW)).toEqual({
      footer: "DATA: NOAA SWPC",
      updated: "WAITING",
    });
    expect(reportFooter("NOAA SWPC", undefined, NOW)).toEqual({
      footer: "DATA: NOAA SWPC",
      updated: "WAITING",
    });
  });
});

describe("heroSizeClass", () => {
  it("puts one-word states at the short band (≤ 4 chars)", () => {
    expect(heroSizeClass("HOT")).toBe("hc-hero--short");
    expect(heroSizeClass("DAY")).toBe("hc-hero--short");
    expect(heroSizeClass("20m")).toBe("hc-hero--short");
    expect(heroSizeClass("OPEN")).toBe("hc-hero--short");
  });

  it("puts typical values at the medium band (≤ 8 chars)", () => {
    expect(heroSizeClass("NIGHT")).toBe("hc-hero--medium");
    expect(heroSizeClass("RISING")).toBe("hc-hero--medium");
    expect(heroSizeClass("MARGINAL")).toBe("hc-hero--medium");
  });

  it("puts phrases past 8 chars at the long band", () => {
    expect(heroSizeClass("GREY LINE")).toBe("hc-hero--long");
    expect(heroSizeClass("NO SIGNAL")).toBe("hc-hero--long");
    expect(heroSizeClass("NO RECEIVER")).toBe("hc-hero--long");
    expect(heroSizeClass("NO MAPPED ALERTS")).toBe("hc-hero--long");
  });

  it("trims surrounding whitespace before measuring", () => {
    expect(heroSizeClass("  DAY  ")).toBe("hc-hero--short");
    expect(heroSizeClass(" NO MAPPED ALERTS ")).toBe("hc-hero--long");
  });
});
