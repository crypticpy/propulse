import { describe, expect, it } from "vitest";

import { dRegionAbsorption } from "@/lib/propagation/absorption/dRegion";
import {
  hopGeometry,
  incidenceAngleRad,
  maximumHopGroundDistanceKm,
} from "@/lib/propagation/geometry/hop";
import {
  resolveRoute,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import { magneticField } from "@/lib/propagation/ionosphere/modip";
import {
  absorptionLoss,
  modifiedDipDegAt,
  penetrationPoints,
  PENETRATION_HEIGHT_KM,
  PENETRATION_REFLECTION_HEIGHT_KM,
  type PenetrationPointState,
} from "./absorptionLoss";

function route(tx: GeodeticPoint, rx: GeodeticPoint): ResolvedRoute {
  const resolved = resolveRoute(tx, rx);
  if (resolved.kind !== "resolved") {
    throw new Error(`fixture route is ${resolved.kind}`);
  }
  return resolved;
}

// About 5622 km, so a one-hop mode is beyond the 300 km grazing limit of
// 3835.8 km and a two-hop mode is comfortably inside it.
const MEDIUM = route(
  { latitudeDeg: 40, longitudeDeg: -74 },
  { latitudeDeg: 51.5, longitudeDeg: -0.1 },
);

// About 8932 km: a two-hop mode has 4466 km hops, which neither the fixed
// 300 km reflection height nor a 400 km one can reach.
const LONG = route(
  { latitudeDeg: 35, longitudeDeg: 139 },
  { latitudeDeg: 34, longitudeDeg: -118 },
);

// Along the equator, about 4448 km. Every penetration point on it has the same
// latitude, so `ATnoon` is the same at each and the only thing left varying
// between two runs is what the test is actually varying.
const EQUATOR = route(
  { latitudeDeg: 0, longitudeDeg: 0 },
  { latitudeDeg: 0, longitudeDeg: 40 },
);

const UNIFORM: PenetrationPointState = {
  foEMHz: 3.4,
  zenithAngleDeg: 30,
  zenithNoonAngleDeg: 20,
  longitudinalGyrofrequencyMHz: 1.2,
  modifiedDipDeg: 55,
};

describe("penetrationPoints", () => {
  it("uses the 300 km reflection height and 90 km penetration height the text fixes", () => {
    expect(PENETRATION_REFLECTION_HEIGHT_KM).toBe(300);
    expect(PENETRATION_HEIGHT_KM).toBe(90);
  });

  it("returns two points per hop, in increasing route order", () => {
    for (const hopCount of [1, 2, 3, 4]) {
      const result = penetrationPoints({ route: MEDIUM, hopCount });
      if (result.kind !== "points") {
        expect(hopCount).toBe(1);
        continue;
      }
      expect(result.points).toHaveLength(2 * hopCount);
      for (let i = 1; i < result.points.length; i += 1) {
        expect(result.points[i].fraction).toBeGreaterThan(
          result.points[i - 1].fraction,
        );
      }
      expect(result.points.map((p) => p.index)).toEqual(
        result.points.map((_, i) => i),
      );
      expect(result.points.map((p) => p.hopIndex)).toEqual(
        result.points.map((_, i) => Math.floor(i / 2)),
      );
      expect(result.points.map((p) => p.end)).toEqual(
        result.points.map((_, i) => (i % 2 === 0 ? "entry" : "exit")),
      );
    }
  });

  it("places the points symmetrically about each hop's mid-point", () => {
    const result = penetrationPoints({ route: MEDIUM, hopCount: 3 });
    if (result.kind !== "points") throw new Error(result.reason);
    const hopKm = MEDIUM.groundDistanceKm / 3;
    for (let hop = 0; hop < 3; hop += 1) {
      const entry = result.points[2 * hop];
      const exit = result.points[2 * hop + 1];
      const midpoint = (hop + 0.5) * hopKm;
      expect(midpoint - entry.offsetKm).toBeCloseTo(
        exit.offsetKm - midpoint,
        9,
      );
      expect(entry.offsetKm - hop * hopKm).toBeCloseTo(
        result.dRegionOffsetKm,
        9,
      );
    }
  });

  it("agrees with the hop geometry solved at the same fixed height", () => {
    const result = penetrationPoints({ route: MEDIUM, hopCount: 2 });
    const geometry = hopGeometry({
      groundDistanceKm: MEDIUM.groundDistanceKm,
      hopCount: 2,
      mirrorHeightKm: PENETRATION_REFLECTION_HEIGHT_KM,
    });
    if (result.kind !== "points") throw new Error(result.reason);
    if (geometry.kind !== "supported") throw new Error(geometry.reason);
    expect(result.points.map((p) => p.fraction)).toEqual([
      ...geometry.penetrationFractions,
    ]);
    expect(result.assumedElevationRad).toBe(geometry.elevationAngleRad);
  });

  it("puts each point on the resolved route, not on a straight line in lat and lng", () => {
    const result = penetrationPoints({ route: MEDIUM, hopCount: 2 });
    if (result.kind !== "points") throw new Error(result.reason);
    // The great circle from New York to London bulges north of both ends.
    const maxLat = Math.max(...result.points.map((p) => p.point.latitudeDeg));
    expect(maxLat).toBeGreaterThan(51.5);
  });

  it("names the failure when the fixed height cannot reach the hop", () => {
    const limit = maximumHopGroundDistanceKm(PENETRATION_REFLECTION_HEIGHT_KM);
    expect(limit).toBeCloseTo(3835.8, 1);
    expect(LONG.groundDistanceKm / 2).toBeGreaterThan(limit);
    const result = penetrationPoints({ route: LONG, hopCount: 2 });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") throw new Error("expected unsupported");
    expect(result.reason).toBe("penetration_geometry_below_horizon");
    expect(result.detail).toContain("300.0 km");
  });

  it("lets a caller state a different reflection height", () => {
    // The reference's own reading, deviation 2: the mode's height, here
    // 500 km, which does reach a 4466 km hop where 300 km does not.
    const result = penetrationPoints({
      route: LONG,
      hopCount: 2,
      reflectionHeightKm: 500,
    });
    expect(result.kind).toBe("points");
    if (result.kind !== "points") throw new Error("expected points");
    expect(result.reflectionHeightKm).toBe(500);
    // A higher assumed reflection height raises the assumed elevation, which
    // moves the 90 km crossings closer to the ends of the hop.
    const lower = penetrationPoints({
      route: MEDIUM,
      hopCount: 2,
      reflectionHeightKm: 300,
    });
    const higher = penetrationPoints({
      route: MEDIUM,
      hopCount: 2,
      reflectionHeightKm: 400,
    });
    if (lower.kind !== "points" || higher.kind !== "points") {
      throw new Error("expected points");
    }
    expect(higher.assumedElevationRad).toBeGreaterThan(
      lower.assumedElevationRad,
    );
    expect(higher.dRegionOffsetKm).toBeLessThan(lower.dRegionOffsetKm);
  });
});

describe("modifiedDipDegAt", () => {
  it("is atan of the dip in radians over the root of cos(latitude)", () => {
    const latitudeDeg = 40;
    const longitudeDeg = -74;
    const latRad = (latitudeDeg * Math.PI) / 180;
    const { dipRad } = magneticField(
      latRad,
      (longitudeDeg * Math.PI) / 180,
      100,
    );
    const expected =
      (Math.atan(dipRad / Math.sqrt(Math.cos(latRad))) * 180) / Math.PI;
    expect(modifiedDipDegAt(latitudeDeg, longitudeDeg)).toBeCloseTo(
      expected,
      12,
    );
  });

  it("defaults to the 100 km height the text names, which is not the 300 km map height", () => {
    const at100 = modifiedDipDegAt(40, -74);
    const at300 = modifiedDipDegAt(40, -74, 300);
    expect(at100).toBeCloseTo(modifiedDipDegAt(40, -74, 100), 12);
    expect(at100).not.toBeCloseTo(at300, 4);
  });

  it("changes sign across the magnetic equator", () => {
    expect(modifiedDipDegAt(60, 0)).toBeGreaterThan(0);
    expect(modifiedDipDegAt(-60, 0)).toBeLessThan(0);
  });

  it("rejects a non-finite coordinate", () => {
    expect(() => modifiedDipDegAt(Number.NaN, 0)).toThrow(RangeError);
    expect(() => modifiedDipDegAt(0, Number.NaN)).toThrow(RangeError);
  });

  it("rejects a non-positive or non-finite height", () => {
    expect(() => modifiedDipDegAt(40, -74, 0)).toThrow(RangeError);
    expect(() => modifiedDipDegAt(40, -74, -100)).toThrow(RangeError);
    expect(() => modifiedDipDegAt(40, -74, Number.NaN)).toThrow(RangeError);
    expect(() => modifiedDipDegAt(40, -74, 100)).not.toThrow();
  });
});

describe("absorptionLoss", () => {
  const base = {
    route: MEDIUM,
    hopCount: 2,
    frequencyMHz: 14,
    monthIndex: 2,
    ssn: 100,
    rayPathElevationRad: 0.25,
    sample: () => UNIFORM,
  };

  it("is equation (20) evaluated by the shared D-region leaf", () => {
    const result = absorptionLoss(base);
    if (result.kind !== "absorption") throw new Error(result.reason);
    const crossing = {
      latitudeDeg: 0,
      monthIndex: 2,
      modifiedDipDeg: 55,
      foEMHz: 3.4,
      zenithAngleDeg: 30,
      zenithNoonAngleDeg: 20,
      gyrofrequencyMHz: 1.2,
    };
    const expected = dRegionAbsorption({
      crossings: result.crossings.map((c) => ({
        ...crossing,
        latitudeDeg: c.latitudeDeg,
      })),
      hopCount: 2,
      frequencyMHz: 14,
      incidenceAngle110Rad: incidenceAngleRad(0.25, 110),
      ssn: 100,
    });
    expect(result.lossDb).toBeCloseTo(expected.absorptionDb, 12);
  });

  it("takes the angle of incidence at 110 km from the mode's ray, not the assumed one", () => {
    const result = absorptionLoss(base);
    const assumed = penetrationPoints({ route: MEDIUM, hopCount: 2 });
    if (result.kind !== "absorption") throw new Error(result.reason);
    if (assumed.kind !== "points") throw new Error(assumed.reason);
    expect(result.incidenceAngle110Rad).toBeCloseTo(
      incidenceAngleRad(0.25, 110),
      12,
    );
    // The 300 km sampling ray is a different ray, so its elevation differs and
    // an implementation that used it would fail here.
    expect(assumed.assumedElevationRad).not.toBeCloseTo(0.25, 3);
    expect(result.incidenceAngle110Rad).not.toBeCloseTo(
      incidenceAngleRad(assumed.assumedElevationRad, 110),
      3,
    );
  });

  it("reports fv = f cos i, equation (22)", () => {
    const result = absorptionLoss(base);
    if (result.kind !== "absorption") throw new Error(result.reason);
    expect(result.verticalFrequencyMHz).toBeCloseTo(
      14 * Math.cos(incidenceAngleRad(0.25, 110)),
      10,
    );
  });

  it("samples exactly the 2n penetration points, once each", () => {
    const seen: number[] = [];
    const result = absorptionLoss({
      ...base,
      hopCount: 3,
      sample: (point) => {
        seen.push(point.index);
        return UNIFORM;
      },
    });
    if (result.kind !== "absorption") throw new Error(result.reason);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.penetrationPoints).toHaveLength(6);
    expect(result.crossings).toHaveLength(6);
  });

  it("scales with the hop count for an otherwise identical circuit", () => {
    const two = absorptionLoss({ ...base, route: EQUATOR });
    const three = absorptionLoss({ ...base, route: EQUATOR, hopCount: 3 });
    if (two.kind !== "absorption" || three.kind !== "absorption") {
      throw new Error("expected absorption");
    }
    // On the equatorial route every crossing carries the same state, so the
    // per-crossing mean is identical and the only thing left is equation
    // (20)'s hop multiplier.
    expect(three.lossDb / two.lossDb).toBeCloseTo(1.5, 9);
  });

  it("evaluates the modified dip at each point when the sampler omits it", () => {
    const result = absorptionLoss({
      ...base,
      sample: () => ({
        foEMHz: 3.4,
        zenithAngleDeg: 30,
        zenithNoonAngleDeg: 20,
        longitudinalGyrofrequencyMHz: 1.2,
      }),
    });
    if (result.kind !== "absorption") throw new Error(result.reason);
    for (const crossing of result.crossings) {
      expect(crossing.modifiedDipDeg).not.toBe(55);
    }
    const first = result.penetrationPoints[0].point;
    expect(result.crossings[0].modifiedDipDeg).toBeCloseTo(
      modifiedDipDegAt(first.latitudeDeg, first.longitudeDeg),
      12,
    );
  });

  it("puts each point's own fL inside the squared sum, not one mean outside it", () => {
    // Two crossings with very different fL. If the divide happened outside the
    // mean with an averaged fL, the answer would be the uniform-1.6 case.
    const alternating = absorptionLoss({
      ...base,
      route: EQUATOR,
      sample: (point) => ({
        ...UNIFORM,
        longitudinalGyrofrequencyMHz: point.index % 2 === 0 ? 0.8 : 2.4,
      }),
    });
    const averaged = absorptionLoss({
      ...base,
      route: EQUATOR,
      sample: () => ({ ...UNIFORM, longitudinalGyrofrequencyMHz: 1.6 }),
    });
    if (alternating.kind !== "absorption" || averaged.kind !== "absorption") {
      throw new Error("expected absorption");
    }
    expect(alternating.lossDb).not.toBeCloseTo(averaged.lossDb, 3);
    // The divide is convex in fL, so the mean of the two is above the value at
    // the mean fL.
    expect(alternating.lossDb).toBeGreaterThan(averaged.lossDb);
  });

  it("passes the D-region leaf's declared assumptions through", () => {
    const withoutFl = absorptionLoss({
      ...base,
      sample: () => ({
        foEMHz: 3.4,
        zenithAngleDeg: 30,
        zenithNoonAngleDeg: 20,
        modifiedDipDeg: 55,
      }),
    });
    if (withoutFl.kind !== "absorption") throw new Error(withoutFl.reason);
    expect(withoutFl.assumptions.join(" ")).toContain("gyrofrequency");
  });

  it("returns the named geometry failure rather than a number", () => {
    const result = absorptionLoss({ ...base, route: LONG, hopCount: 2 });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") throw new Error("expected unsupported");
    expect(result.reason).toBe("penetration_geometry_below_horizon");
  });

  it("honours a caller-stated penetration reflection height", () => {
    const fixed = absorptionLoss({ ...base, route: EQUATOR });
    const reference = absorptionLoss({
      ...base,
      route: EQUATOR,
      penetrationReflectionHeightKm: 400,
    });
    if (fixed.kind !== "absorption" || reference.kind !== "absorption") {
      throw new Error("expected absorption");
    }
    // Same ionosphere everywhere, so the loss is unchanged; what moved is
    // where the crossings are, which is the whole content of deviation 2.
    expect(reference.lossDb).toBeCloseTo(fixed.lossDb, 12);
    expect(reference.penetrationPoints[0].offsetKm).not.toBeCloseTo(
      fixed.penetrationPoints[0].offsetKm,
      3,
    );
  });

  it("rejects inputs outside their domain", () => {
    expect(() => absorptionLoss({ ...base, frequencyMHz: 0 })).toThrow(
      RangeError,
    );
    expect(() => absorptionLoss({ ...base, monthIndex: 12 })).toThrow(
      RangeError,
    );
    expect(() => absorptionLoss({ ...base, monthIndex: 1.5 })).toThrow(
      RangeError,
    );
    expect(() => absorptionLoss({ ...base, rayPathElevationRad: 0 })).toThrow(
      RangeError,
    );
    expect(() =>
      absorptionLoss({ ...base, rayPathElevationRad: Number.NaN }),
    ).toThrow(RangeError);
  });

  it("rejects a non-finite or negative sunspot number, exported leaf and all", () => {
    // This leaf is exported directly by `physics/index.ts`, so a caller that
    // never goes through `fieldStrengthShort.ts` must still be caught here.
    expect(() => absorptionLoss({ ...base, ssn: Number.NaN })).toThrow(
      RangeError,
    );
    expect(() => absorptionLoss({ ...base, ssn: -1 })).toThrow(RangeError);
    expect(() => absorptionLoss({ ...base, ssn: 0 })).not.toThrow();
  });
});
