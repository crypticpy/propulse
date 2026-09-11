import { describe, expect, it } from "vitest";

import {
  clearHopGeometryCache,
  hopGeometry,
  incidenceAngleRad,
  maximumHopGroundDistanceKm,
  minimumHopCount,
  mirrorHeightFromM3000F2,
  type SupportedHopGeometry,
} from "./hop";
import { EARTH_RADIUS_KM } from "./route";

const R2D = 180 / Math.PI;

function supported(
  groundDistanceKm: number,
  hopCount: number,
  mirrorHeightKm: number,
): SupportedHopGeometry {
  const geometry = hopGeometry({ groundDistanceKm, hopCount, mirrorHeightKm });
  if (geometry.kind !== "supported") {
    throw new Error(`expected a supported hop, got ${geometry.reason}`);
  }
  return geometry;
}

describe("virtual slant range (R1)", () => {
  it("matches the chord of the audit fixture", () => {
    // 100 km ground, one hop, 300 km mirror. The chord computed independently
    // from the law of cosines is 2 * sqrt(R^2 + (R+h)^2 - 2 R (R+h) cos(psi)).
    const psi = 100 / (2 * EARTH_RADIUS_KM);
    const chordKm =
      2 *
      Math.sqrt(
        EARTH_RADIUS_KM ** 2 +
          (EARTH_RADIUS_KM + 300) ** 2 -
          2 * EARTH_RADIUS_KM * (EARTH_RADIUS_KM + 300) * Math.cos(psi),
      );
    expect(chordKm).toBeCloseTo(608.663, 3);

    const geometry = supported(100, 1, 300);
    expect(geometry.virtualSlantRangeKm).toBeCloseTo(chordKm, 6);
    expect(geometry.virtualSlantRangeKm).toBeCloseTo(608.663, 3);
    expect(geometry.elevationAngleRad * R2D).toBeCloseTo(80.094, 3);
  });

  it("is the 15.688 dB of spreading the ground range loses", () => {
    const geometry = supported(100, 1, 300);
    const difference = 20 * Math.log10(geometry.virtualSlantRangeKm / 100);
    expect(difference).toBeCloseTo(15.688, 3);
  });

  it("always exceeds the ground range", () => {
    for (const distance of [100, 500, 1500, 3000, 6000, 10_000, 18_000]) {
      const hops = minimumHopCount(distance, 300);
      const geometry = supported(distance, hops, 300);
      expect(geometry.virtualSlantRangeKm).toBeGreaterThan(distance);
    }
  });
});

describe("hop geometry of the reference circuit (R2 inputs)", () => {
  it("reproduces the 3000 km single-hop angles", () => {
    const geometry = supported(3000, 1, 300);
    expect(geometry.elevationAngleRad * R2D).toBeCloseTo(4.2615, 4);
    expect(geometry.incidenceAngle110Rad * R2D).toBeCloseTo(78.6111, 4);
    expect(geometry.incidenceAngle90Rad * R2D).toBeCloseTo(79.5281, 4);
    expect(geometry.virtualSlantRangeKm).toBeCloseTo(3120.952, 3);
  });

  it("agrees with the standalone incidence helper", () => {
    const geometry = supported(3000, 1, 300);
    expect(incidenceAngleRad(geometry.elevationAngleRad, 110)).toBeCloseTo(
      geometry.incidenceAngle110Rad,
      12,
    );
  });
});

describe("short and long circuits (R6)", () => {
  it("computes the slant range of both directions", () => {
    const short = supported(10_848.93, 4, 300);
    const long = supported(29_181.24, 10, 300);
    expect(short.virtualSlantRangeKm).toBeCloseTo(11_337.41, 1);
    expect(long.virtualSlantRangeKm).toBeCloseTo(30_393.25, 1);
    expect(20 * Math.log10(short.virtualSlantRangeKm / 10_848.93)).toBeCloseTo(
      0.3825,
      4,
    );
    expect(20 * Math.log10(long.virtualSlantRangeKm / 29_181.24)).toBeCloseTo(
      0.3535,
      4,
    );
  });
});

describe("modes that do not exist (R7)", () => {
  it("reports a 3000 km single hop off the E layer as below the horizon", () => {
    const geometry = hopGeometry({
      groundDistanceKm: 3000,
      hopCount: 1,
      mirrorHeightKm: 110,
    });
    expect(geometry.kind).toBe("unsupported");
    if (geometry.kind !== "unsupported") {
      throw new Error("unreachable");
    }
    expect(geometry.reason).toBe("below_horizon");
    expect(geometry.elevationAngleRad * R2D).toBeCloseTo(-2.6057, 4);
    // The shipped code clamped this to +1 degree and scored the mode as usable.
    expect(geometry.elevationAngleRad).toBeLessThan(0);
    expect(geometry.maximumHopGroundDistanceKm).toBeCloseTo(2350.954, 3);
    expect(geometry.detail).toContain("2 hops");
  });

  it("names a hop count that does exist", () => {
    const hops = minimumHopCount(3000, 110);
    expect(hops).toBe(2);
    const geometry = supported(3000, hops, 110);
    expect(geometry.elevationAngleRad).toBeGreaterThan(0);
  });

  it("puts the grazing ray exactly at the maximum hop length", () => {
    const maximum = maximumHopGroundDistanceKm(300);
    const justInside = supported(maximum - 1, 1, 300);
    expect(justInside.elevationAngleRad).toBeGreaterThan(0);
    expect(justInside.elevationAngleRad).toBeLessThan(0.001);
    expect(
      hopGeometry({
        groundDistanceKm: maximum + 1,
        hopCount: 1,
        mirrorHeightKm: 300,
      }).kind,
    ).toBe("unsupported");
  });
});

describe("D-region penetration points", () => {
  it("produces two crossings per hop, inside the hop and in order", () => {
    const geometry = supported(3000, 2, 300);
    expect(geometry.penetrationFractions).toHaveLength(4);
    let previous = 0;
    for (const fraction of geometry.penetrationFractions) {
      expect(fraction).toBeGreaterThan(previous);
      expect(fraction).toBeLessThan(1);
      previous = fraction;
    }
  });

  it("places the crossings symmetrically about each hop", () => {
    const geometry = supported(3000, 2, 300);
    const [enter, exit] = geometry.penetrationFractions;
    const hopFraction = 1 / 2;
    expect(enter).toBeCloseTo(geometry.dRegionOffsetKm / 3000, 12);
    expect(exit).toBeCloseTo(hopFraction - geometry.dRegionOffsetKm / 3000, 12);
  });
});

describe("mirror height", () => {
  it("follows 1490 / M(3000)F2 - 176 and caps at 500 km", () => {
    expect(mirrorHeightFromM3000F2(3.0)).toBeCloseTo(320.6667, 4);
    expect(mirrorHeightFromM3000F2(2.0)).toBe(500);
    expect(() => mirrorHeightFromM3000F2(0)).toThrow(RangeError);
  });
});

describe("input validation", () => {
  it("rejects impossible requests instead of returning a number", () => {
    expect(() =>
      hopGeometry({ groundDistanceKm: 0, hopCount: 1, mirrorHeightKm: 300 }),
    ).toThrow(RangeError);
    expect(() =>
      hopGeometry({ groundDistanceKm: 1000, hopCount: 0, mirrorHeightKm: 300 }),
    ).toThrow(RangeError);
    expect(() =>
      hopGeometry({
        groundDistanceKm: 1000,
        hopCount: 1.5,
        mirrorHeightKm: 300,
      }),
    ).toThrow(RangeError);
    expect(() =>
      hopGeometry({
        groundDistanceKm: Number.NaN,
        hopCount: 1,
        mirrorHeightKm: 300,
      }),
    ).toThrow(RangeError);
  });
});

describe("memoisation", () => {
  it("returns the identical object for identical inputs and is state-scoped", () => {
    clearHopGeometryCache();
    const a = hopGeometry({
      groundDistanceKm: 3000,
      hopCount: 1,
      mirrorHeightKm: 300,
      stateDigest: "digest-a",
    });
    const again = hopGeometry({
      groundDistanceKm: 3000,
      hopCount: 1,
      mirrorHeightKm: 300,
      stateDigest: "digest-a",
    });
    const other = hopGeometry({
      groundDistanceKm: 3000,
      hopCount: 1,
      mirrorHeightKm: 300,
      stateDigest: "digest-b",
    });
    expect(again).toBe(a);
    expect(other).not.toBe(a);
    expect(other).toEqual(a);
  });
});
