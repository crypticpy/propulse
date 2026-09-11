import { describe, expect, it } from "vitest";
import { calculateLUF, getFrequencyLimits } from "@/lib/api/muf";
import { getMidpoint } from "@/lib/utils/path";
import { samplePathMuf } from "./pathMuf";

const AUSTIN = { lat: 30.27, lon: -97.74 };
const TOKYO = { lat: 35.68, lon: 139.76 };
const NOON = new Date("2026-06-21T12:00:00Z");

describe("samplePathMuf", () => {
  it("uses the minimum hop MUF, not the midpoint-only estimate", () => {
    const sampled = samplePathMuf({
      startLat: AUSTIN.lat,
      startLon: AUSTIN.lon,
      endLat: TOKYO.lat,
      endLon: TOKYO.lon,
      date: NOON,
      sfi: 150,
      kp: 2,
      sfiObservedAt: "2026-06-21T11:00:00.000Z",
      sfiFetchedAt: "2026-06-21T11:05:00.000Z",
    });
    const midpoint = getMidpoint(AUSTIN.lat, AUSTIN.lon, TOKYO.lat, TOKYO.lon);
    const midpointLimits = getFrequencyLimits(
      midpoint.lat,
      midpoint.lon,
      150,
      NOON,
    );

    expect(sampled.hopCount).toBeGreaterThan(1);
    expect(sampled.hops).toHaveLength(sampled.hopCount);
    const hopMufs = sampled.hops.map((hop) => hop.muf);
    expect(Math.max(...hopMufs) - Math.min(...hopMufs)).toBeGreaterThan(1);
    expect(sampled.muf).toBe(Math.min(...hopMufs));
    // The old PathAnalysis call used this midpoint-only estimate.
    expect(sampled.muf).not.toBeCloseTo(midpointLimits.muf, 1);
    expect(sampled.evidence.basis).toMatch(/ITU-R P\.533/);
    expect(sampled.evidence.basis).not.toMatch(/VOACAP/i);
    expect(sampled.evidence.observedAt).toBe("2026-06-21T11:00:00.000Z");
    expect(sampled.fot).toBeCloseTo(sampled.muf * 0.85, 5);
    expect(sampled.hpf).toBeCloseTo(sampled.muf * 1.15, 5);
  });

  it("labels assumed Kp in basis and stamps computation time", () => {
    const sampled = samplePathMuf({
      startLat: AUSTIN.lat,
      startLon: AUSTIN.lon,
      endLat: AUSTIN.lat + 1,
      endLon: AUSTIN.lon + 1,
      date: NOON,
      sfi: 100,
      kp: 0,
      kpAssumed: true,
      computedAt: NOON,
    });
    expect(sampled.evidence.basis).toContain("SFI 100, Kp 0 assumed");
    expect(sampled.evidence.observedAt).toBeNull();
    expect(sampled.hopCount).toBe(1);
    expect(sampled.evidence.fetchedAt).toBe(NOON.toISOString());
  });

  it("samples a short antimeridian path without throwing", () => {
    const sampled = samplePathMuf({
      startLat: 51,
      startLon: 179.5,
      endLat: 51,
      endLon: -179.5,
      date: NOON,
      sfi: 120,
      kp: 0,
      computedAt: NOON,
    });
    expect(sampled.hopCount).toBeGreaterThanOrEqual(1);
    expect(sampled.muf).toBeGreaterThan(0);
  });
});

describe("calculateLUF RTTY threshold (#1088 note: MODE_SNR_THRESHOLDS is its own scale)", () => {
  // MODE_SNR_THRESHOLDS in src/lib/api/muf.ts: FT8 -20, CW 3, RTTY 6, SSB 10.
  // A higher required-SNR mode needs less D-layer absorption to close the
  // link, i.e. a higher LUF. RTTY's threshold sits strictly between CW's and
  // SSB's, so its LUF must land between theirs too -- monotone in threshold,
  // not silently reusing CW's or SSB's value.
  it("is at or above CW's LUF and below SSB's LUF for the same inputs", () => {
    const lufFt8 = calculateLUF(AUSTIN.lat, AUSTIN.lon, 150, NOON, 100, "FT8");
    const lufCw = calculateLUF(AUSTIN.lat, AUSTIN.lon, 150, NOON, 100, "CW");
    const lufRtty = calculateLUF(AUSTIN.lat, AUSTIN.lon, 150, NOON, 100, "RTTY");
    const lufSsb = calculateLUF(AUSTIN.lat, AUSTIN.lon, 150, NOON, 100, "SSB");

    expect(lufFt8).toBeLessThanOrEqual(lufCw);
    expect(lufCw).toBeLessThanOrEqual(lufRtty);
    expect(lufRtty).toBeLessThanOrEqual(lufSsb);
    // RTTY must actually differ from both neighbors, not just tie at a clamp.
    expect(lufRtty).not.toBe(lufCw);
    expect(lufRtty).not.toBe(lufSsb);
  });
});
