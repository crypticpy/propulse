import { describe, expect, it } from "vitest";

import {
  EARTH_RADIUS_KM,
  resolveRoute,
  routeMidpoint,
  routeSample,
  routeSampleAtFraction,
  type GeodeticPoint,
  type ResolvedRoute,
} from "./route";

function resolved(
  tx: GeodeticPoint,
  rx: GeodeticPoint,
  options?: Parameters<typeof resolveRoute>[2],
): ResolvedRoute {
  const route = resolveRoute(tx, rx, options);
  if (route.kind !== "resolved") {
    throw new Error(`expected a resolved route, got ${route.reason}`);
  }
  return route;
}

/** Great-circle distance between two points, independent of `resolveRoute`. */
function haversineKm(a: GeodeticPoint, b: GeodeticPoint): number {
  const d2r = Math.PI / 180;
  const dLat = (b.latitudeDeg - a.latitudeDeg) * d2r;
  const dLon = (b.longitudeDeg - a.longitudeDeg) * d2r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitudeDeg * d2r) *
      Math.cos(b.latitudeDeg * d2r) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, degrees, independent of `resolveRoute`. */
function initialBearingDeg(a: GeodeticPoint, b: GeodeticPoint): number {
  const d2r = Math.PI / 180;
  const dLon = (b.longitudeDeg - a.longitudeDeg) * d2r;
  const lat1 = a.latitudeDeg * d2r;
  const lat2 = b.latitudeDeg * d2r;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) / d2r) + 360) % 360;
}

const TOKYO = { latitudeDeg: 35.0, longitudeDeg: 139.0 };
const HONOLULU = { latitudeDeg: 21.0, longitudeDeg: -158.0 };
const NEW_YORK = { latitudeDeg: 40.7, longitudeDeg: -74.0 };
const TOKYO_JA1 = { latitudeDeg: 35.7, longitudeDeg: 139.7 };

describe("resolveRoute across the date line (R3)", () => {
  it("puts the midpoint on the great circle, not at the mean of the coordinates", () => {
    const route = resolved(TOKYO, HONOLULU);
    const midpoint = routeMidpoint(route);

    expect(route.groundDistanceKm).toBeCloseTo(6276.391, 3);
    expect(midpoint.latitudeDeg).toBeCloseTo(31.9272, 4);
    expect(midpoint.longitudeDeg).toBeCloseTo(172.791, 4);

    // The arithmetic mean of the two coordinate pairs, which is what the
    // shipped code used, lands in the Atlantic off Morocco.
    const arithmeticMean = {
      latitudeDeg: (TOKYO.latitudeDeg + HONOLULU.latitudeDeg) / 2,
      longitudeDeg: (TOKYO.longitudeDeg + HONOLULU.longitudeDeg) / 2,
    };
    expect(arithmeticMean.longitudeDeg).toBeCloseTo(-9.5, 10);
    expect(haversineKm(arithmeticMean, midpoint)).toBeGreaterThan(13_000);
  });

  it("places the midpoint equidistant from both ends", () => {
    const route = resolved(TOKYO, HONOLULU);
    const midpoint = routeMidpoint(route);
    const toTokyo = haversineKm(TOKYO, midpoint);
    const toHonolulu = haversineKm(HONOLULU, midpoint);
    expect(toTokyo).toBeCloseTo(3138.196, 3);
    expect(toHonolulu).toBeCloseTo(toTokyo, 6);
  });
});

describe("resolveRoute over the pole (R4)", () => {
  const A = { latitudeDeg: 70, longitudeDeg: 0 };
  const B = { latitudeDeg: 70, longitudeDeg: 180 };

  it("samples the pole exactly at the halfway point", () => {
    const route = resolved(A, B);
    expect(route.groundDistanceKm).toBeCloseTo(4447.797, 3);
    const midpoint = routeMidpoint(route);
    expect(midpoint.latitudeDeg).toBeCloseTo(90, 9);
    expect(Number.isNaN(midpoint.longitudeDeg)).toBe(false);
  });

  it("keeps the long route on the same great circle through the far side", () => {
    const long = resolved(A, B, { direction: "long" });
    const midpoint = routeMidpoint(long);
    // The long route between two points at 70 N runs over the south pole.
    expect(midpoint.latitudeDeg).toBeCloseTo(-90, 9);
    expect(Number.isNaN(midpoint.longitudeDeg)).toBe(false);
  });
});

describe("degenerate endpoints (R5)", () => {
  it("reports antipodal endpoints instead of inventing a route", () => {
    const route = resolveRoute(
      { latitudeDeg: 40, longitudeDeg: -74 },
      { latitudeDeg: -40, longitudeDeg: 106 },
    );
    expect(route.kind).toBe("ambiguous_geometry");
    if (route.kind !== "ambiguous_geometry") {
      throw new Error("unreachable");
    }
    expect(route.reason).toBe("antipodal_endpoints");
    expect(route.arcAngleRad).toBeCloseTo(Math.PI, 12);
  });

  it("reports coincident endpoints", () => {
    const route = resolveRoute(
      { latitudeDeg: 51.5, longitudeDeg: -0.1 },
      { latitudeDeg: 51.5, longitudeDeg: -0.1 },
    );
    expect(route.kind).toBe("ambiguous_geometry");
    if (route.kind !== "ambiguous_geometry") {
      throw new Error("unreachable");
    }
    expect(route.reason).toBe("coincident_endpoints");
  });

  it("is continuous in a perturbation once an azimuth resolves the ambiguity", () => {
    const tx = { latitudeDeg: 40, longitudeDeg: -74 };
    const base = resolved(
      tx,
      { latitudeDeg: -40, longitudeDeg: 106 },
      {
        azimuthDeg: 60,
      },
    );
    const nudged = resolved(tx, { latitudeDeg: -40, longitudeDeg: 106.01 });

    expect(base.tangentFromAzimuth).toBe(true);
    expect(nudged.tangentFromAzimuth).toBe(false);

    // A 0.01 degree perturbation of a near-antipodal endpoint must not swing
    // the route. The shipped midpoint moved 164 degrees of longitude here.
    const nudgedAgain = resolved(tx, {
      latitudeDeg: -40,
      longitudeDeg: 106.02,
    });
    const first = routeMidpoint(nudged);
    const second = routeMidpoint(nudgedAgain);
    expect(haversineKm(first, second)).toBeLessThan(2);
  });

  it("resolves a coincident pair when the caller names a direction", () => {
    const here = { latitudeDeg: 0, longitudeDeg: 0 };
    const route = resolved(here, here, { azimuthDeg: 90 });
    expect(route.groundDistanceKm).toBeCloseTo(0, 9);
    expect(route.initialAzimuthDeg).toBeCloseTo(90, 9);
    const east = routeSample(route, 1000);
    expect(east.latitudeDeg).toBeCloseTo(0, 9);
    expect(east.longitudeDeg).toBeGreaterThan(0);
  });
});

describe("short and long routes (R6)", () => {
  it("splits the circumference exactly", () => {
    const short = resolved(NEW_YORK, TOKYO_JA1);
    const long = resolved(NEW_YORK, TOKYO_JA1, { direction: "long" });
    expect(short.groundDistanceKm).toBeCloseTo(10_848.93, 2);
    expect(long.groundDistanceKm).toBeCloseTo(29_181.24, 2);
    expect(short.groundDistanceKm + long.groundDistanceKm).toBeCloseTo(
      2 * Math.PI * EARTH_RADIUS_KM,
      6,
    );
  });

  it("starts the long route on the reciprocal bearing", () => {
    const short = resolved(NEW_YORK, TOKYO_JA1);
    const long = resolved(NEW_YORK, TOKYO_JA1, { direction: "long" });
    const difference = Math.abs(
      short.initialAzimuthDeg - long.initialAzimuthDeg,
    );
    expect(difference).toBeCloseTo(180, 9);
  });

  it("does not reverse a tangent the caller supplied as an azimuth", () => {
    // For an antipodal pair the azimuth *is* the route: the caller named the
    // direction to leave on because the geometry names none. Reversing it for
    // the long route sends the circuit out on the reciprocal of the bearing
    // that was asked for. Short and long differ for a degenerate pair in the
    // arc they cover, which `arcAngleRad` already expresses, not in where
    // they start.
    const tx = { latitudeDeg: 40, longitudeDeg: -74 };
    const antipode = { latitudeDeg: -40, longitudeDeg: 106 };
    const long = resolved(tx, antipode, {
      azimuthDeg: 30,
      direction: "long",
    });
    const short = resolved(tx, antipode, {
      azimuthDeg: 30,
      direction: "short",
    });

    expect(long.tangentFromAzimuth).toBe(true);
    expect(long.initialAzimuthDeg).toBeCloseTo(30, 9);
    expect(long.initialAzimuthDeg).not.toBeCloseTo(210, 3);
    expect(initialBearingDeg(tx, routeSample(long, 100))).toBeCloseTo(30, 6);
    expect(short.initialAzimuthDeg).toBeCloseTo(30, 9);
  });

  it("keeps long-route control points exactly on the great circle", () => {
    const short = resolved(NEW_YORK, TOKYO_JA1);
    const long = resolved(NEW_YORK, TOKYO_JA1, { direction: "long" });

    const firstShort = routeSampleAtFraction(short, 0.1);
    const firstLong = routeSampleAtFraction(long, 0.1);
    expect(haversineKm(firstShort, firstLong)).toBeGreaterThan(
      (30 / 360) * 2 * Math.PI * EARTH_RADIUS_KM,
    );

    // Every long-route sample is a true point of the circle: its distance from
    // the route's pole is a quarter circumference to floating-point accuracy.
    const pole = {
      x: long.origin.y * long.tangent.z - long.origin.z * long.tangent.y,
      y: long.origin.z * long.tangent.x - long.origin.x * long.tangent.z,
      z: long.origin.x * long.tangent.y - long.origin.y * long.tangent.x,
    };
    const d2r = Math.PI / 180;
    for (let step = 0; step <= 20; step += 1) {
      const point = routeSampleAtFraction(long, step / 20);
      const unit = {
        x:
          Math.cos(point.latitudeDeg * d2r) *
          Math.cos(point.longitudeDeg * d2r),
        y:
          Math.cos(point.latitudeDeg * d2r) *
          Math.sin(point.longitudeDeg * d2r),
        z: Math.sin(point.latitudeDeg * d2r),
      };
      const dot = pole.x * unit.x + pole.y * unit.y + pole.z * unit.z;
      expect(Math.abs(dot)).toBeLessThan(1e-9);
    }
  });

  it("samples the endpoints of the route it was asked for", () => {
    const short = resolved(NEW_YORK, TOKYO_JA1);
    const end = routeSampleAtFraction(short, 1);
    expect(end.latitudeDeg).toBeCloseTo(TOKYO_JA1.latitudeDeg, 9);
    expect(end.longitudeDeg).toBeCloseTo(TOKYO_JA1.longitudeDeg, 9);

    const long = resolved(NEW_YORK, TOKYO_JA1, { direction: "long" });
    const longEnd = routeSampleAtFraction(long, 1);
    expect(longEnd.latitudeDeg).toBeCloseTo(TOKYO_JA1.latitudeDeg, 9);
    expect(longEnd.longitudeDeg).toBeCloseTo(TOKYO_JA1.longitudeDeg, 9);
  });
});
