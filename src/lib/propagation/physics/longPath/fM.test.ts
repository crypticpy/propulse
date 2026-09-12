// @vitest-environment node
//
// Node, because the sha256 pin reads the transcribed asset off disk. The
// module itself imports the JSON and runs anywhere.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import tables from "../assets/p533-fl-tables.json";
import {
  EARTH_RADIUS_KM,
  resolveRoute,
  routeSampleAtFraction,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import { hopGeometry } from "@/lib/propagation/geometry/hop";
import { firstNonFiniteField } from "../finiteResult";
import {
  distanceReductionFactor,
  f2FourThousandMufMHz,
  f2ZeroMufMHz,
  forwardAzimuthDegAt,
  interpolateTable3,
  kFactor,
  localNoonUtcHour,
  longPathBasicMufMHz,
  longPathMuf,
  FD_COEFFICIENTS,
  FL_TABLES_SHA256,
  K_CONSTANT,
  LONG_PATH_MAX_HOP_COUNT,
  LONG_PATH_MAX_HOP_KM,
  LONG_PATH_MIN_DISTANCE_KM,
  LONG_PATH_MIN_ELEVATION_DEG,
  LONG_PATH_MIRROR_HEIGHT_KM,
  MAX_ROUTE_DISTANCE_KM,
  SAMPLED_FOF2_MAX_MHZ,
  SAMPLED_FOF2_MIN_MHZ,
  SAMPLED_GYROFREQUENCY_MAX_MHZ,
  SAMPLED_GYROFREQUENCY_MIN_MHZ,
  SAMPLED_M3000F2_MAX,
  type LongPathMufState,
  type ResolvedLongPathMuf,
} from "./fM";

/**
 * Every expected number here is transcribed from the published equations again
 * in this file, or worked out by hand in the comment above the assertion, and
 * never taken from a stored output of the module.
 *
 *     fBM = fz + (f4 - fz) fD,  f4 = 1.1 foF2 M(3000)F2,  fz = foF2 + fH/2 (29)
 *     fD  = ((((((C6 d + C5) d + C4) d + C3) d + C2) d + C1) d + C0) d     (30)
 *     fM  = K fBM                                                         (31)
 *     K   = 1.2 + W (fBM/fBM,noon) + X [(fBM,noon/fBM)^(1/3) - 1]
 *               + Y [fBM,min/fBM,noon]^2                                  (32)
 */
const ASSET_PATH = path.join(
  process.cwd(),
  "src/lib/propagation/physics/assets/p533-fl-tables.json",
);

const DEG_TO_RAD = Math.PI / 180;

function route(tx: GeodeticPoint, rx: GeodeticPoint): ResolvedRoute {
  const resolved = resolveRoute(tx, rx);
  if (resolved.kind !== "resolved") {
    throw new Error(`fixture route is ${resolved.kind}`);
  }
  return resolved;
}

/**
 * A route of an exact length along a chosen great circle.
 *
 * `groundDistanceKm` and `arcAngleRad` are the same quantity in two units, so
 * both are overridden together; overriding one alone would make the route
 * sampler and the azimuth disagree about where the receiver is.
 */
function stretched(
  base: ResolvedRoute,
  groundDistanceKm: number,
): ResolvedRoute {
  return {
    ...base,
    groundDistanceKm,
    arcAngleRad: groundDistanceKm / EARTH_RADIUS_KM,
  };
}

/** Due east along the equator from the prime meridian. */
const EASTBOUND = route(
  { latitudeDeg: 0, longitudeDeg: 0 },
  { latitudeDeg: 0, longitudeDeg: 80 },
);

/** Due north up the prime meridian. */
const NORTHBOUND = route(
  { latitudeDeg: 0, longitudeDeg: 0 },
  { latitudeDeg: 70, longitudeDeg: 0 },
);

const FLAT_STATE: LongPathMufState = {
  foF2MHz: 8,
  m3000F2: 3,
  gyrofrequency300kmMHz: 1.2,
};

/** A diurnal curve with a single maximum, so noon and minimum are distinct. */
function diurnalState(utcHour: number): LongPathMufState {
  return {
    foF2MHz: 6 + 4 * Math.cos(((utcHour - 12) / 24) * 2 * Math.PI),
    m3000F2: 3,
    gyrofrequency300kmMHz: 1.2,
  };
}

function resolved(result: ReturnType<typeof longPathMuf>): ResolvedLongPathMuf {
  if (result.kind !== "resolved") {
    throw new Error(`${result.reason}: ${result.detail}`);
  }
  return result;
}

describe("the transcribed Tables 3, 4 and 5 asset", () => {
  it("hashes to the sha256 recorded in the module", async () => {
    const bytes = await readFile(ASSET_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      FL_TABLES_SHA256,
    );
  });

  it("records where it came from and what the reference disagrees with", () => {
    expect(tables.provenance.recommendation).toContain("P.533-14");
    expect(tables.provenance.tables[0]).toContain("Table 3");
    expect(tables.provenance.tables[1]).toContain("Table 4");
    expect(tables.provenance.tables[2]).toContain("Table 5");
    expect(tables.provenance.transcribed_on).toBe("2026-09-12");
    expect(tables.provenance.reference_divergence).toContain("September");
  });

  it("carries Table 3 as the recommendation prints it", () => {
    expect(tables.table_3.east_west).toEqual({ W: 0.1, X: 1.2, Y: 0.6 });
    expect(tables.table_3.north_south).toEqual({ W: 0.2, X: 0.2, Y: 0.4 });
  });
});

describe("equation (30), the distance reduction factor", () => {
  it("lists C0 to C6 in the order the recommendation prints them", () => {
    expect([...FD_COEFFICIENTS]).toEqual([
      29.1996868566837e-6,
      87.4376851991085e-9,
      22.0776941764705e-12,
      102.342990689362e-15,
      -92.4986988833091e-18,
      25.8520201885984e-21,
      -2.4007463749479e-24,
    ]);
  });

  it("is exactly zero for a hop of zero length", () => {
    // Every term carries a factor of dM, so the polynomial has no constant
    // term and the text's "0.0 for a hop length of 0 km" is exact, not
    // approximate.
    expect(distanceReductionFactor(0)).toBe(0);
  });

  it("reaches the text's stated 1.0 only approximately at 4 000 km", () => {
    // The text says fD "varies between 0.0 ... and 1.0 (for a hop length of
    // 4 000 km)". The published polynomial gives 0.96596 there, so the
    // sentence is a description of the curve and not a normalisation to
    // impose. Nothing clamps it, and this records the real value.
    expect(distanceReductionFactor(LONG_PATH_MAX_HOP_KM)).toBeCloseTo(
      0.9659581832274088,
      12,
    );
  });

  it("matches a Horner evaluation written out again here", () => {
    for (const dM of [1000, 2000, 3000, 3500]) {
      const [C0, C1, C2, C3, C4, C5, C6] = FD_COEFFICIENTS;
      const byHand =
        C0 * dM +
        C1 * dM ** 2 +
        C2 * dM ** 3 +
        C3 * dM ** 4 +
        C4 * dM ** 5 +
        C5 * dM ** 6 +
        C6 * dM ** 7;
      expect(distanceReductionFactor(dM)).toBeCloseTo(byHand, 12);
    }
  });

  it("rises monotonically across the hop lengths section 5.3.1 can produce", () => {
    // The reachable ceiling is not the 4 000 km of the hop rule but the hop
    // length at which equation (13) at 300 km gives exactly the 3.0 degree
    // minimum, 3 224.51 km. A hop longer than that is refused and another hop
    // added, so section 5.3.1 never evaluates fD above it.
    let previous = -1;
    for (let dM = 0; dM <= 3224.5; dM += 25) {
      const value = distanceReductionFactor(dM);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
    expect(distanceReductionFactor(3224.5068554599857)).toBeCloseTo(
      0.920381548349608,
      12,
    );
  });

  it("is not monotonic on the whole 0 to 4 000 km domain, and overshoots 1", () => {
    // Recorded rather than asserted around, because it is a real property of
    // the 1963 NBS polynomial and not of this transcription: fD peaks at
    // 1.00407 near 3 784.5 km, four tenths of a per cent above the 1.0 the
    // text describes, and falls back to 0.96596 by 4 000 km. Nothing clamps
    // it. Section 5.3.1 cannot reach the descending limb, because the
    // 3.0 degree minimum caps the hop at 3 224.51 km; the test above is the
    // monotonicity claim that is actually load-bearing.
    expect(distanceReductionFactor(3784.5429144140408)).toBeCloseTo(
      1.0040668394366998,
      12,
    );
    expect(distanceReductionFactor(3900)).toBeLessThan(
      distanceReductionFactor(3800),
    );
    expect(distanceReductionFactor(LONG_PATH_MAX_HOP_KM)).toBeLessThan(
      distanceReductionFactor(3784.5429144140408),
    );
  });
});

describe("equation (29), the basic MUF at one control point", () => {
  it("reads f4 and fz straight off the recommendation", () => {
    expect(f2FourThousandMufMHz(FLAT_STATE)).toBeCloseTo(1.1 * 8 * 3, 12);
    expect(f2ZeroMufMHz(FLAT_STATE)).toBeCloseTo(8 + 1.2 / 2, 12);
  });

  it("is fz at fD = 0 and f4 at fD = 1", () => {
    expect(longPathBasicMufMHz(FLAT_STATE, 0)).toBeCloseTo(8.6, 12);
    expect(longPathBasicMufMHz(FLAT_STATE, 1)).toBeCloseTo(26.4, 12);
  });

  it("interpolates linearly in fD between them", () => {
    expect(longPathBasicMufMHz(FLAT_STATE, 0.25)).toBeCloseTo(
      8.6 + 0.25 * (26.4 - 8.6),
      12,
    );
  });
});

describe("equation (32), the K factor", () => {
  it("collapses to 1.2 + W + Y on a path whose fBM never varies", () => {
    // With fBM = fBM,noon = fBM,min the first ratio is 1, the cube-root
    // bracket is zero and the last ratio is 1, so K = 1.2 + W + Y exactly.
    const coefficients = { W: 0.1, X: 1.2, Y: 0.6 };
    expect(kFactor(12, 12, 12, coefficients)).toBeCloseTo(
      K_CONSTANT + 0.1 + 0.6,
      12,
    );
  });

  it("matches the published expression term by term", () => {
    const coefficients = { W: 0.2, X: 0.2, Y: 0.4 };
    const fBM = 9;
    const noon = 15;
    const min = 5;
    const byHand =
      1.2 +
      0.2 * (fBM / noon) +
      0.2 * ((noon / fBM) ** (1 / 3) - 1) +
      0.4 * (min / noon) ** 2;
    expect(kFactor(fBM, noon, min, coefficients)).toBeCloseTo(byHand, 12);
  });

  it("rises as the hour's fBM falls below the noon value", () => {
    // X multiplies (fBM,noon/fBM)^(1/3) - 1, which grows without bound as the
    // hour's basic MUF falls, so a night hour gets a larger operational
    // multiplier than a noon hour. That is the correction's whole purpose.
    const coefficients = { W: 0.1, X: 1.2, Y: 0.6 };
    const noonK = kFactor(15, 15, 5, coefficients);
    const nightK = kFactor(6, 15, 5, coefficients);
    expect(nightK).toBeGreaterThan(noonK);
  });
});

describe("the mid-path azimuth and Table 3", () => {
  it("reads 90 degrees everywhere along an eastbound equatorial route", () => {
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      expect(forwardAzimuthDegAt(EASTBOUND, fraction)).toBeCloseTo(90, 9);
    }
  });

  it("reads 0 degrees everywhere along a northbound meridian route", () => {
    for (const fraction of [0, 0.25, 0.5, 0.75]) {
      expect(forwardAzimuthDegAt(NORTHBOUND, fraction)).toBeCloseTo(0, 9);
    }
  });

  it("agrees with the route's own initial azimuth at the transmitter", () => {
    const oblique = route(
      { latitudeDeg: 30.2672, longitudeDeg: -97.7431 },
      { latitudeDeg: -33.8688, longitudeDeg: 151.2093 },
    );
    expect(forwardAzimuthDegAt(oblique, 0)).toBeCloseTo(
      oblique.initialAzimuthDeg,
      6,
    );
  });

  it("gives an east-west path the East-West row whole", () => {
    const coefficients = interpolateTable3(90);
    expect(coefficients.angleFromNorthSouthDeg).toBeCloseTo(90, 12);
    expect(coefficients.eastWestWeight).toBeCloseTo(1, 12);
    expect(coefficients.W).toBeCloseTo(0.1, 12);
    expect(coefficients.X).toBeCloseTo(1.2, 12);
    expect(coefficients.Y).toBeCloseTo(0.6, 12);
  });

  it("gives a north-south path the North-South row whole", () => {
    for (const azimuth of [0, 180, 360]) {
      const coefficients = interpolateTable3(azimuth);
      expect(coefficients.angleFromNorthSouthDeg).toBeCloseTo(0, 12);
      expect(coefficients.eastWestWeight).toBeCloseTo(0, 12);
      expect(coefficients.W).toBeCloseTo(0.2, 12);
      expect(coefficients.X).toBeCloseTo(0.2, 12);
      expect(coefficients.Y).toBeCloseTo(0.4, 12);
    }
  });

  it("interpolates linearly in the angle, halfway at 45 degrees", () => {
    const coefficients = interpolateTable3(45);
    expect(coefficients.eastWestWeight).toBeCloseTo(0.5, 12);
    expect(coefficients.W).toBeCloseTo(0.15, 12);
    expect(coefficients.X).toBeCloseTo(0.7, 12);
    expect(coefficients.Y).toBeCloseTo(0.5, 12);
  });

  it("folds every quadrant onto the same acute angle", () => {
    // A great circle has no preferred sense here, so the four azimuths that
    // make the same acute angle with the meridian must give the same row.
    const reference = interpolateTable3(30);
    for (const azimuth of [150, 210, 330, -30, 390]) {
      const other = interpolateTable3(azimuth);
      expect(other.eastWestWeight).toBeCloseTo(reference.eastWestWeight, 12);
      expect(other.W).toBeCloseTo(reference.W, 12);
      expect(other.X).toBeCloseTo(reference.X, 12);
      expect(other.Y).toBeCloseTo(reference.Y, 12);
    }
  });
});

describe("the hour corresponding to local noon", () => {
  it("is 12 UTC on the prime meridian and 00 UTC on the date line", () => {
    expect(localNoonUtcHour(0)).toBe(12);
    expect(localNoonUtcHour(180)).toBe(0);
    expect(localNoonUtcHour(-180)).toBe(0);
  });

  it("moves one hour per 15 degrees of longitude", () => {
    expect(localNoonUtcHour(15)).toBe(11);
    expect(localNoonUtcHour(-15)).toBe(13);
    expect(localNoonUtcHour(75)).toBe(7);
    expect(localNoonUtcHour(-75)).toBe(17);
  });

  it("rounds to the nearest whole hour rather than truncating", () => {
    // Austin, -97.7431 degrees: local noon is 18.516 UTC. The nearest whole
    // hour is 19. The pinned reference truncates and then subtracts one more,
    // reading 17, which is deviation 2 in the module header.
    expect(localNoonUtcHour(-97.7431)).toBe(19);
  });

  it("always answers with a whole hour inside the day", () => {
    for (let longitude = -180; longitude <= 180; longitude += 0.5) {
      const hour = localNoonUtcHour(longitude);
      expect(Number.isInteger(hour)).toBe(true);
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThan(24);
    }
  });
});

describe("the hop division of section 5.3.1", () => {
  it("takes the fewest equal hops no longer than 4 000 km when they clear 3 degrees", () => {
    // 8 095.11 km, the Austin to Sao Paulo golden circuit. Three hops of
    // 2 698.37 km leave at 6.145 degrees, which is above the minimum, so no
    // hop is added.
    const result = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 12,
        sample: () => FLAT_STATE,
      }),
    );
    expect(result.hopCount).toBe(3);
    expect(result.hopsAddedForElevation).toBe(0);
    expect(result.hopGroundDistanceKm).toBeCloseTo(8095.11 / 3, 9);
    expect(result.elevationDeg).toBeGreaterThan(LONG_PATH_MIN_ELEVATION_DEG);
  });

  it("adds hops until the elevation clears 3.0 degrees, not just one", () => {
    // 26 400.16 km, the Austin to Sydney long-path golden circuit. Seven hops
    // of 3 771.45 km leave at 0.292 degrees; eight of 3 300.02 km at 2.598,
    // still below the minimum the same sentence sets; nine of 2 933.35 km at
    // 4.657 degrees, which clears it. The reference stops at eight. See
    // deviation 1.
    const result = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 26400.16),
        utcHour: 12,
        sample: () => FLAT_STATE,
      }),
    );
    expect(result.hopCount).toBe(9);
    expect(result.hopsAddedForElevation).toBe(2);
    expect(result.elevationDeg).toBeCloseTo(4.657, 2);
    expect(result.hopGroundDistanceKm).toBeCloseTo(2933.35, 1);
  });

  it("adds a hop when the 4 000 km rule leaves the ray below the horizon", () => {
    // 7 910.38 km, Austin to London. Two hops of 3 955.19 km exceed the
    // 3 822 km a 300 km mirror can reach at all, so the two-hop geometry is
    // not merely shallow, it does not exist.
    const twoHops = hopGeometry({
      groundDistanceKm: 7910.38,
      hopCount: 2,
      mirrorHeightKm: LONG_PATH_MIRROR_HEIGHT_KM,
    });
    expect(twoHops.kind).toBe("unsupported");
    const result = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 7910.38),
        utcHour: 12,
        sample: () => FLAT_STATE,
      }),
    );
    expect(result.hopCount).toBe(3);
    expect(result.hopsAddedForElevation).toBe(1);
  });

  it("reports equation (19) over the whole path at the 300 km height", () => {
    const result = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 9671.01),
        utcHour: 12,
        sample: () => FLAT_STATE,
      }),
    );
    const geometry = hopGeometry({
      groundDistanceKm: 9671.01,
      hopCount: result.hopCount,
      mirrorHeightKm: LONG_PATH_MIRROR_HEIGHT_KM,
    });
    if (geometry.kind !== "supported") throw new Error("hop geometry missing");
    expect(result.virtualSlantRangeKm).toBeCloseTo(
      geometry.virtualSlantRangeKm,
      9,
    );
    expect(result.elevationRad).toBeCloseTo(geometry.elevationAngleRad, 12);
    expect(result.elevationDeg).toBeCloseTo(
      geometry.elevationAngleRad / DEG_TO_RAD,
      12,
    );
  });

  /**
   * The loop's bound is an exit, not a working branch.
   *
   * `no_elevation_solution` cannot fire on any route the module accepts: the
   * longest is the circumference, and 64 hops of that is 625 km, which leaves
   * at 41 degrees. The guard exists so the loop cannot run away on a hand-made
   * input, and this test is what says the guard is unreachable rather than
   * leaving a reader to wonder whether it is silently swallowing circuits.
   */
  it("always finds a hop count well inside its own bound", () => {
    let worstHopCount = 0;
    for (
      let D = LONG_PATH_MIN_DISTANCE_KM;
      D <= MAX_ROUTE_DISTANCE_KM;
      D += 250
    ) {
      const result = resolved(
        longPathMuf({
          route: stretched(EASTBOUND, D),
          utcHour: 0,
          sample: () => FLAT_STATE,
        }),
      );
      expect(result.elevationDeg).toBeGreaterThan(LONG_PATH_MIN_ELEVATION_DEG);
      worstHopCount = Math.max(worstHopCount, result.hopCount);
    }
    expect(worstHopCount).toBeLessThan(LONG_PATH_MAX_HOP_COUNT);
  });
});

describe("the two Table 1a control points", () => {
  it("places them at dM/2 from each end", () => {
    const path = stretched(EASTBOUND, 8095.11);
    const result = resolved(
      longPathMuf({ route: path, utcHour: 12, sample: () => FLAT_STATE }),
    );
    const half = result.hopGroundDistanceKm / 2;
    const [near, far] = result.controlPoints;
    expect(near.site.label).toBe("T + d0/2");
    expect(far.site.label).toBe("R - d0/2");
    expect(near.site.offsetKm).toBeCloseTo(half, 9);
    expect(far.site.offsetKm).toBeCloseTo(8095.11 - half, 9);
    expect(near.site.point.longitudeDeg).toBeCloseTo(
      routeSampleAtFraction(path, half / 8095.11).longitudeDeg,
      9,
    );
  });

  it("asks the sampler for all 24 hours at both points", () => {
    const asked: string[] = [];
    resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 12,
        sample: (_point, label, utcHour) => {
          asked.push(`${label}@${String(utcHour)}`);
          return FLAT_STATE;
        },
      }),
    );
    expect(asked).toHaveLength(48);
    expect(new Set(asked).size).toBe(48);
  });

  it("takes the lower of the two control points for both fBM and fM", () => {
    const result = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 12,
        sample: (_point, label) =>
          label === "T + d0/2"
            ? { ...FLAT_STATE, foF2MHz: 10 }
            : { ...FLAT_STATE, foF2MHz: 6 },
      }),
    );
    const [near, far] = result.controlPoints;
    expect(near.basicMufMHz).toBeGreaterThan(far.basicMufMHz);
    expect(result.basicMufMHz).toBeCloseTo(far.basicMufMHz, 12);
    expect(result.fMMHz).toBeCloseTo(
      Math.min(near.operationalMufMHz, far.operationalMufMHz),
      12,
    );
  });

  it("reports fH as the mean of the two control points at the hour", () => {
    const result = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 5,
        sample: (_point, label) =>
          label === "T + d0/2"
            ? { ...FLAT_STATE, gyrofrequency300kmMHz: 1.0 }
            : { ...FLAT_STATE, gyrofrequency300kmMHz: 1.4 },
      }),
    );
    expect(result.gyrofrequencyMHz).toBeCloseTo(1.2, 12);
  });

  it("reassembles equation (31) from the record's own parts", () => {
    const result = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 3,
        sample: (_point, _label, utcHour) => diurnalState(utcHour),
      }),
    );
    for (const point of result.controlPoints) {
      const hour = point.hours[3];
      expect(hour.utcHour).toBe(3);
      expect(point.basicMufMHz).toBeCloseTo(hour.basicMufMHz, 12);
      expect(hour.basicMufMHz).toBeCloseTo(
        hour.fzMHz +
          (hour.f4MHz - hour.fzMHz) * result.distanceReductionFactor,
        12,
      );
      expect(point.noonBasicMufMHz).toBeCloseTo(
        point.hours[point.noonUtcHour].basicMufMHz,
        12,
      );
      expect(point.minimumBasicMufMHz).toBeCloseTo(
        Math.min(...point.hours.map((h) => h.basicMufMHz)),
        12,
      );
      expect(point.kFactor).toBeCloseTo(
        kFactor(
          point.basicMufMHz,
          point.noonBasicMufMHz,
          point.minimumBasicMufMHz,
          result.coefficients,
        ),
        12,
      );
      expect(point.operationalMufMHz).toBeCloseTo(
        point.kFactor * point.basicMufMHz,
        12,
      );
    }
  });

  it("uses the same interpolated Table 3 row at both control points", () => {
    // Section 5.3.1 takes the azimuth "at the centre of the whole path", one
    // reading for the circuit, not one per control point.
    const result = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 12,
        sample: (_point, _label, utcHour) => diurnalState(utcHour),
      }),
    );
    expect(result.coefficients.W).toBeCloseTo(0.1, 12);
    expect(result.coefficients.X).toBeCloseTo(1.2, 12);
    expect(result.coefficients.Y).toBeCloseTo(0.6, 12);
  });
});

describe("what section 5.3.1 refuses rather than guesses", () => {
  it("declines a path shorter than 7 000 km and says which sections own it", () => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, 5000),
      utcHour: 12,
      sample: () => FLAT_STATE,
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("5.1");
    expect(result.groundDistanceKm).toBe(5000);
  });

  it("declines a route longer than the sphere it was resolved on", () => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, MAX_ROUTE_DISTANCE_KM + 1),
      utcHour: 12,
      sample: () => FLAT_STATE,
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("circumference");
  });

  it("declines a fractional or out-of-range hour", () => {
    for (const utcHour of [-1, 24, 12.5, Number.NaN]) {
      const result = longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour,
        sample: () => FLAT_STATE,
      });
      expect(result.kind).toBe("unsupported");
      if (result.kind !== "unsupported") continue;
      expect(result.reason).toBe("out_of_domain");
    }
  });

  it("declines a sampler that answers with something that is not a frequency", () => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: (_point, _label, utcHour) =>
        utcHour === 7
          ? { ...FLAT_STATE, foF2MHz: Number.NaN }
          : FLAT_STATE,
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("foF2MHz");
    expect(result.detail).toContain("07 UTC");
  });

  it.each([
    ["f4 overflow", () => ({ ...FLAT_STATE, foF2MHz: Number.MAX_VALUE })],
    [
      "K overflow",
      (_point: unknown, _label: unknown, hour: number) => ({
        foF2MHz: hour === 12 ? 1e300 : 1e-300,
        m3000F2: 3,
        gyrofrequency300kmMHz: 0,
      }),
    ],
  ])("declines finite samples producing %s", (_name, sample) => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample,
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toMatch(/finite/);
  });

  it("declines a non-positive sampled foF2 before it can produce a non-positive basic MUF", () => {
    // foF2 = 0 is finite, so a finiteness-only check would let it through and
    // equation (29) would go on to divide equation (32) by a collapsed fBM.
    // The sampler boundary refuses it before either happens.
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => ({
        foF2MHz: 0,
        m3000F2: 3,
        gyrofrequency300kmMHz: SAMPLED_GYROFREQUENCY_MIN_MHZ,
      }),
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("foF2MHz");
    expect(result.detail).toContain("at least 0.1");
  });

  it("declines a finite but non-physical sampled m3000F2, such as a missing-data sentinel", () => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => ({ ...FLAT_STATE, m3000F2: -0.001 }),
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("m3000F2");
    expect(result.detail).toContain("-0.001");
    expect(result.detail).toContain("greater than 0");
  });

  it("declines a negative sampled gyrofrequency300kmMHz", () => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => ({ ...FLAT_STATE, gyrofrequency300kmMHz: -1e-9 }),
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("gyrofrequency300kmMHz");
    expect(result.detail).toContain("at least 0.1");
  });

  it("declines a sampled foF2 just above its envelope, which is a margin and not a physics limit", () => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => ({ ...FLAT_STATE, foF2MHz: SAMPLED_FOF2_MAX_MHZ + 0.001 }),
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("foF2MHz");
    expect(result.detail).toContain("50.001");
  });

  it("declines a sampled m3000F2 just above its envelope", () => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => ({ ...FLAT_STATE, m3000F2: SAMPLED_M3000F2_MAX + 0.001 }),
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("m3000F2");
    expect(result.detail).toContain("6.001");
  });

  it("declines a sampled gyrofrequency300kmMHz just above its envelope", () => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => ({
        ...FLAT_STATE,
        gyrofrequency300kmMHz: SAMPLED_GYROFREQUENCY_MAX_MHZ + 0.001,
      }),
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("gyrofrequency300kmMHz");
    expect(result.detail).toContain("3.001");
  });

  it("admits each envelope boundary exactly: foF2 = 50, M(3000)F2 = 6, gyrofrequency = 3", () => {
    const atFoF2Bound = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 12,
        sample: () => ({ ...FLAT_STATE, foF2MHz: SAMPLED_FOF2_MAX_MHZ }),
      }),
    );
    expect(Number.isFinite(atFoF2Bound.fMMHz)).toBe(true);

    const atM3000Bound = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 12,
        sample: () => ({ ...FLAT_STATE, m3000F2: SAMPLED_M3000F2_MAX }),
      }),
    );
    expect(Number.isFinite(atM3000Bound.fMMHz)).toBe(true);

    const atGyroBound = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 12,
        sample: () => ({
          ...FLAT_STATE,
          gyrofrequency300kmMHz: SAMPLED_GYROFREQUENCY_MAX_MHZ,
        }),
      }),
    );
    expect(Number.isFinite(atGyroBound.fMMHz)).toBe(true);
  });

  it("admits the lower envelope boundary exactly: foF2 = 0.1, gyrofrequency = 0.1", () => {
    const atFoF2Floor = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 12,
        sample: () => ({
          foF2MHz: SAMPLED_FOF2_MIN_MHZ,
          m3000F2: 3,
          gyrofrequency300kmMHz: SAMPLED_GYROFREQUENCY_MIN_MHZ,
        }),
      }),
    );
    expect(Number.isFinite(atFoF2Floor.fMMHz)).toBe(true);
  });

  it("declines a sampled foF2 or gyrofrequency just below the lower envelope, which is a margin and not a physics limit", () => {
    const belowFoF2 = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => ({
        foF2MHz: SAMPLED_FOF2_MIN_MHZ - 0.001,
        m3000F2: 3,
        gyrofrequency300kmMHz: SAMPLED_GYROFREQUENCY_MIN_MHZ,
      }),
    });
    expect(belowFoF2.kind).toBe("unsupported");
    if (belowFoF2.kind === "unsupported") {
      expect(belowFoF2.reason).toBe("out_of_domain");
      expect(belowFoF2.detail).toContain("foF2MHz");
    }

    const belowGyro = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => ({
        foF2MHz: SAMPLED_FOF2_MIN_MHZ,
        m3000F2: 3,
        gyrofrequency300kmMHz: SAMPLED_GYROFREQUENCY_MIN_MHZ - 0.001,
      }),
    });
    expect(belowGyro.kind).toBe("unsupported");
    if (belowGyro.kind === "unsupported") {
      expect(belowGyro.reason).toBe("out_of_domain");
      expect(belowGyro.detail).toContain("gyrofrequency300kmMHz");
    }
  });

  it("declines a foF2 of 1e-3, which the old bound admitted and the K factor could turn into an absurd but still finite operational MUF", () => {
    // Item A's whole rationale: 1e-3 MHz is finite and was positive under the
    // old ">0" bound, so it passed every earlier check and could still swing
    // equation (32)'s K-factor ratios by orders of magnitude between hours
    // without ever producing a non-finite number. The tightened floor
    // refuses it outright instead.
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => ({ foF2MHz: 1e-3, m3000F2: 3, gyrofrequency300kmMHz: 1.2 }),
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.detail).toContain("foF2MHz");
  });

  it("never returns a NaN on any field of a resolved record", () => {
    const result = resolved(
      longPathMuf({
        route: stretched(NORTHBOUND, 12345.6),
        utcHour: 17,
        sample: (_point, _label, utcHour) => diurnalState(utcHour),
      }),
    );
    const numbers: number[] = [
      result.groundDistanceKm,
      result.hopCount,
      result.hopGroundDistanceKm,
      result.elevationRad,
      result.elevationDeg,
      result.virtualSlantRangeKm,
      result.hopsAddedForElevation,
      result.distanceReductionFactor,
      result.coefficients.W,
      result.coefficients.X,
      result.coefficients.Y,
      result.coefficients.midPathAzimuthDeg,
      result.coefficients.angleFromNorthSouthDeg,
      result.coefficients.eastWestWeight,
      result.basicMufMHz,
      result.fMMHz,
      result.gyrofrequencyMHz,
    ];
    for (const point of result.controlPoints) {
      numbers.push(
        point.basicMufMHz,
        point.noonBasicMufMHz,
        point.noonUtcHour,
        point.minimumBasicMufMHz,
        point.kFactor,
        point.operationalMufMHz,
        point.site.offsetKm,
        point.site.fraction,
        point.site.point.latitudeDeg,
        point.site.point.longitudeDeg,
      );
      for (const hour of point.hours) {
        numbers.push(hour.f4MHz, hour.fzMHz, hour.basicMufMHz, hour.utcHour);
      }
    }
    for (const value of numbers) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it.each([
    {
      name: "foF2 = 1e-300, a near-zero missing-data sentinel item A now rejects outright",
      state: { foF2MHz: 1e-300, m3000F2: 3, gyrofrequency300kmMHz: 1.2 },
      expectRejected: true,
    },
    {
      name: "gyrofrequency300kmMHz = 0, below item A's new floor",
      state: { foF2MHz: 8, m3000F2: 3, gyrofrequency300kmMHz: 0 },
      expectRejected: true,
    },
    {
      name: "m3000F2 = 1e-300: unchanged by item A, still resolves, so it must be checked for finiteness rather than assumed rejected",
      state: { foF2MHz: 8, m3000F2: 1e-300, gyrofrequency300kmMHz: 1.2 },
      expectRejected: false,
    },
  ])("hostile sampled state: $name", ({ state, expectRejected }) => {
    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => state,
    });
    if (expectRejected) {
      expect(result.kind).toBe("unsupported");
    } else {
      expect(Number.isFinite(resolved(result).fMMHz)).toBe(true);
    }
  });
});

describe("the finite-result invariant on the assembled fM record", () => {
  it("cannot be reached through the public longPathMuf() surface once the sampler is in-envelope", () => {
    // fBM = fz + (f4 - fz) fD (equation 29) with fz = foF2 + fH/2 > 0 and
    // f4 = 1.1 foF2 M(3000)F2 > 0 once the sampler passes SAMPLED_STATE_BOUNDS,
    // and fD lies in [0, ~0.92038] over every hop length section 5.3.1 can
    // produce (see `distanceReductionFactor`'s own comment: it never reaches
    // its own 4 000 km extreme here). So fBM is always a weighted average of
    // two positive numbers and can never leave the interval between them,
    // whatever the sampler answers inside its envelope. With the envelope's
    // upper bounds (foF2 <= 50, M(3000)F2 <= 6, gyrofrequency <= 3), f4 and fz
    // are both bounded above by a few hundred MHz, so fBM, the K-factor ratios
    // in equation (32) and the final fM all stay many orders of magnitude
    // inside double range. There is therefore no `LongPathMufState` this
    // module's own sampler contract admits that reaches a non-finite result
    // any more: the injected `Number.MAX_VALUE` sentinel the finding used is
    // now rejected by the envelope itself, at the sampler boundary, before
    // equation (29) ever sees it (see the envelope tests above). The largest
    // in-envelope state is exercised here to show the result stays finite;
    // the test below exercises `firstNonFiniteField` directly, on a record
    // built by this same module, to prove the invariant's own wiring still
    // catches a non-finite field if one ever reached it by some other route.
    const result = resolved(
      longPathMuf({
        route: stretched(EASTBOUND, 8095.11),
        utcHour: 12,
        sample: () => ({
          foF2MHz: SAMPLED_FOF2_MAX_MHZ,
          m3000F2: SAMPLED_M3000F2_MAX,
          gyrofrequency300kmMHz: SAMPLED_GYROFREQUENCY_MAX_MHZ,
        }),
      }),
    );
    expect(Number.isFinite(result.basicMufMHz)).toBe(true);
    expect(Number.isFinite(result.fMMHz)).toBe(true);
  });

  it("firstNonFiniteField names the exact field and value on a record corrupted after the fact", () => {
    const base = resolved(
      longPathMuf({
        route: stretched(NORTHBOUND, 12345.6),
        utcHour: 17,
        sample: (_point, _label, utcHour) => diurnalState(utcHour),
      }),
    );
    const corrupted: ResolvedLongPathMuf = {
      ...base,
      controlPoints: [
        { ...base.controlPoints[0], kFactor: Number.NaN },
        base.controlPoints[1],
      ],
    };
    const found = firstNonFiniteField(corrupted);
    expect(found).not.toBeNull();
    expect(found?.path).toBe("controlPoints[0].kFactor");
    expect(found?.value !== undefined && Number.isNaN(found.value)).toBe(
      true,
    );
    // And a healthy record reports nothing to find.
    expect(firstNonFiniteField(base)).toBeNull();
  });

  it("resolves rather than stack-overflowing when the sampler's own state is self-referential", () => {
    // Codex P2: a hostile `LongPathMufSampler` can answer with a state that
    // passes SAMPLED_STATE_BOUNDS on its three required fields while also
    // carrying a self-reference. `firstNonFiniteField`'s cycle guard (see
    // `finiteResult.test.ts`) must terminate on that cycle rather than
    // recurse forever, so this stays a normal resolved record end to end.
    const hostileState: Record<string, unknown> = {
      foF2MHz: 8,
      m3000F2: 3,
      gyrofrequency300kmMHz: 1.2,
    };
    hostileState.self = hostileState;

    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => hostileState as unknown as LongPathMufState,
    });

    expect(result.kind).toBe("resolved");
    expect(Number.isFinite(resolved(result).fMMHz)).toBe(true);
  });

  it("drops a sampler's foreign properties at the boundary, including a huge sparse array", () => {
    // Codex P2, round 3 (`finiteResult.ts` line 95, #954 slice D): a hostile
    // sampler can answer with the three required fields plus a sparse
    // `padding` array whose declared `length` is enormous
    // (`new Array(0xffffffff)` allocates nothing but still reports ~4.29
    // billion as its length). Before this fix that object was stored by
    // reference in `hours[].state`, so the finite-result invariant's own
    // walk would have to cross it. The structural fix is to never let it in:
    // `longPathMuf` copies only the three validated numbers into a fresh
    // literal before storing anything in `hours[].state`.
    const hostileState = {
      foF2MHz: 8,
      m3000F2: 3,
      gyrofrequency300kmMHz: 1.2,
      padding: new Array(0xffffffff),
    };

    const result = longPathMuf({
      route: stretched(EASTBOUND, 8095.11),
      utcHour: 12,
      sample: () => hostileState as unknown as LongPathMufState,
    });

    expect(result.kind).toBe("resolved");
    const record = resolved(result);
    for (const controlPoint of record.controlPoints) {
      for (const hour of controlPoint.hours) {
        expect(Object.keys(hour.state).sort()).toEqual([
          "foF2MHz",
          "gyrofrequency300kmMHz",
          "m3000F2",
        ]);
      }
    }
  });
});
