import { describe, expect, it, vi } from "vitest";
import { calculateLUF, getFrequencyLimits } from "@/lib/api/muf";
import { getMidpoint } from "@/lib/utils/path";
import { samplePathMuf } from "./pathMuf";

/**
 * A circuit can legitimately produce no ionospheric control points: two
 * endpoints that determine no great circle have no arc to sample, which is
 * what selecting your own QTH as the target amounts to. The ray-trace engine
 * on this branch never returns that yet, so the case is reached here by
 * making `calculateReflectionPoints` return the empty array it will return,
 * and only for the tests that ask for it. Everything else in this file runs
 * against the real engine.
 */
const emptyControlPoints = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/utils/rayTrace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/rayTrace")>();
  return {
    ...actual,
    calculateReflectionPoints: (
      ...args: Parameters<typeof actual.calculateReflectionPoints>
    ) =>
      emptyControlPoints.value ? [] : actual.calculateReflectionPoints(...args),
  };
});

function withoutControlPoints<T>(run: () => T): T {
  emptyControlPoints.value = true;
  try {
    return run();
  } finally {
    emptyControlPoints.value = false;
  }
}

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

    expect(sampled!.hopCount).toBeGreaterThan(1);
    expect(sampled!.hops).toHaveLength(sampled!.hopCount);
    const hopMufs = sampled!.hops.map((hop) => hop.muf);
    expect(Math.max(...hopMufs) - Math.min(...hopMufs)).toBeGreaterThan(1);
    expect(sampled!.muf).toBe(Math.min(...hopMufs));
    // The old PathAnalysis call used this midpoint-only estimate.
    expect(sampled!.muf).not.toBeCloseTo(midpointLimits.muf, 1);
    expect(sampled!.evidence.basis).toMatch(/ITU-R P\.533/);
    expect(sampled!.evidence.basis).not.toMatch(/VOACAP/i);
    expect(sampled!.evidence.observedAt).toBe("2026-06-21T11:00:00.000Z");
    expect(sampled!.fot).toBeCloseTo(sampled!.muf * 0.85, 5);
    expect(sampled!.hpf).toBeCloseTo(sampled!.muf * 1.15, 5);
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
    expect(sampled!.evidence.basis).toContain("SFI 100, Kp 0 assumed");
    expect(sampled!.evidence.observedAt).toBeNull();
    expect(sampled!.hopCount).toBe(1);
    expect(sampled!.evidence.fetchedAt).toBe(NOON.toISOString());
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
    expect(sampled!.hopCount).toBeGreaterThanOrEqual(1);
    expect(sampled!.muf).toBeGreaterThan(0);
  });

  it("reports no sample when the circuit has no control points", () => {
    // Before the guard this threw "Cannot read properties of undefined
    // (reading 'lat')": `hops` was empty, so `hops[limitingHop]` and the
    // `?? hops[0]` fallback were both undefined and the basis string
    // dereferenced it. Returning null is the answer the whole decision layer
    // already understands, since every consumer holds a
    // `PathMufSample | null`.
    const sampled = withoutControlPoints(() =>
      samplePathMuf({
        startLat: AUSTIN.lat,
        startLon: AUSTIN.lon,
        endLat: TOKYO.lat,
        endLon: TOKYO.lon,
        date: NOON,
        sfi: 120,
        kp: 0,
        computedAt: NOON,
      }),
    );
    expect(sampled).toBeNull();
  });

  it("keeps using the real control points outside that case", () => {
    // Proves the stub above is scoped: the same inputs return a real sample
    // when the engine is left alone, so the null is the guard and not the
    // mock leaking.
    const sampled = samplePathMuf({
      startLat: AUSTIN.lat,
      startLon: AUSTIN.lon,
      endLat: TOKYO.lat,
      endLon: TOKYO.lon,
      date: NOON,
      sfi: 120,
      kp: 0,
      computedAt: NOON,
    });
    expect(sampled).not.toBeNull();
    expect(sampled!.hops.length).toBeGreaterThan(0);
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
    const lufRtty = calculateLUF(
      AUSTIN.lat,
      AUSTIN.lon,
      150,
      NOON,
      100,
      "RTTY",
    );
    const lufSsb = calculateLUF(AUSTIN.lat, AUSTIN.lon, 150, NOON, 100, "SSB");

    expect(lufFt8).toBeLessThanOrEqual(lufCw);
    expect(lufCw).toBeLessThanOrEqual(lufRtty);
    expect(lufRtty).toBeLessThanOrEqual(lufSsb);
    // RTTY must actually differ from both neighbors, not just tie at a clamp.
    expect(lufRtty).not.toBe(lufCw);
    expect(lufRtty).not.toBe(lufSsb);
  });
});
