import { describe, expect, it } from "vitest";
import { endAlmanac, formatUtcHm, localMeanDate, pathAlmanac } from "./almanac";

const AUSTIN = { lat: 30.27, lon: -97.74 };
const TOKYO = { lat: 35.68, lon: 139.76 };
const NOON = new Date("2026-06-21T12:00:00Z");
const POLAR_WINTER = new Date("2026-12-21T12:00:00Z");

describe("formatUtcHm", () => {
  it("formats UTC hours and minutes", () => {
    expect(formatUtcHm(NOON)).toBe("12:00");
  });
});

describe("localMeanDate", () => {
  it("shifts UTC by lon/15 hours so 90°E is +6h", () => {
    const lmt = localMeanDate(NOON, 90);
    expect(formatUtcHm(lmt)).toBe("18:00");
  });

  it("puts Austin about 6.5 hours behind UTC", () => {
    const lmt = localMeanDate(NOON, AUSTIN.lon);
    expect(formatUtcHm(lmt)).toBe("05:29");
  });
});

describe("endAlmanac", () => {
  it("returns sunrise and sunset at mid-latitudes", () => {
    const almanac = endAlmanac(AUSTIN.lat, AUSTIN.lon, NOON, "QTH", NOON);
    expect(almanac.utcTime).toBe("12:00");
    expect(almanac.localMeanTime).toBe("05:29");
    expect(almanac.sunriseUtc).not.toBeNull();
    expect(almanac.sunsetUtc).not.toBeNull();
    expect(almanac.polar).toBeNull();
    expect(almanac.evidence.basis).toContain("SunCalc");
    expect(almanac.evidence.observedAt).toBeNull();
    expect(almanac.evidence.fetchedAt).toBe(NOON.toISOString());
  });

  it("stamps fetchedAt with computation time, not the modeled clock", () => {
    const computed = new Date("2026-06-21T12:07:00Z");
    const almanac = endAlmanac(AUSTIN.lat, AUSTIN.lon, NOON, "QTH", computed);
    expect(almanac.utcTime).toBe("12:00");
    expect(almanac.evidence.fetchedAt).toBe(computed.toISOString());
  });

  it("marks polar night when the sun never rises", () => {
    const almanac = endAlmanac(80, 0, POLAR_WINTER, "QTH", NOON);
    expect(almanac.sunriseUtc).toBeNull();
    expect(almanac.sunsetUtc).toBeNull();
    expect(almanac.polar).toBe("night");
  });

  it("marks polar day when the sun never sets", () => {
    const almanac = endAlmanac(80, 0, NOON, "QTH", NOON);
    expect(almanac.sunriseUtc).toBeNull();
    expect(almanac.sunsetUtc).toBeNull();
    expect(almanac.polar).toBe("day");
  });

  it("does not throw on an invalid date", () => {
    const almanac = endAlmanac(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("invalid"),
      "QTH",
      NOON,
    );
    expect(almanac.utcTime).toBe("—");
    expect(almanac.localMeanTime).toBe("—");
    expect(almanac.evidence.fetchedAt).toBe(NOON.toISOString());
  });
});

describe("pathAlmanac", () => {
  it("reports both ends and a mutual grey-line window for nearby stations", () => {
    const report = pathAlmanac(
      { lat: 30, lon: 0 },
      { lat: 30, lon: 5 },
      new Date("2026-09-05T00:00:00Z"),
    );
    expect(report.qth.utcTime).toBe("00:00");
    expect(report.target.localMeanTime).toBe("00:20");
    expect(report.greyline.start).not.toBeNull();
    expect(report.greyline.end).not.toBeNull();
    expect(report.greyline.label).toMatch(/grey-line/i);
  });

  it("says there is no mutual window when the stations are 90° apart", () => {
    const report = pathAlmanac(AUSTIN, TOKYO, NOON);
    expect(report.greyline.active).toBe(false);
  });
});
