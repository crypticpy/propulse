import { describe, expect, it } from "vitest";
import {
  calculateReflectionPoints,
  crossingAt,
  DECLARED_MIRROR_HEIGHT_KM,
  evaluateHopQuality,
  traceRayPath,
} from "./rayTrace";
import { dRegionAbsorption } from "@/lib/propagation/absorption/dRegion";
import { hopGeometry } from "@/lib/propagation/geometry/hop";
import {
  resolveRoute,
  routeSampleAtFraction,
} from "@/lib/propagation/geometry/route";
import { sfiToR12 } from "./ionosphere";

const DATE = new Date("2026-06-21T18:00:00Z");

const NY = { lat: 40.7, lon: -74.0 };
const TOKYO = { lat: 35.7, lon: 139.7 };

function trace(pathMode: "short" | "long") {
  return traceRayPath({
    startLat: NY.lat,
    startLon: NY.lon,
    endLat: TOKYO.lat,
    endLon: TOKYO.lon,
    frequencyMHz: 14.074,
    date: DATE,
    sfi: 150,
    kp: 2,
    pathMode,
  });
}

describe("traceRayPath", () => {
  it("defaults to the short path hop geometry", () => {
    const result = trace("short");
    expect(result.pathMode).toBe("short");
    expect(result.hops.length).toBeGreaterThanOrEqual(3);
    expect(result.hops.length).toBeLessThanOrEqual(5);
    expect(result.totalDistanceKm).toBeGreaterThan(9_000);
    expect(result.totalDistanceKm).toBeLessThan(12_000);
  });

  it("traces more hops along the long path than the short path", () => {
    const shortPath = trace("short");
    const longPath = trace("long");

    expect(longPath.pathMode).toBe("long");
    expect(longPath.hops.length).toBeGreaterThan(shortPath.hops.length);
    expect(longPath.totalDistanceKm).toBeGreaterThan(shortPath.totalDistanceKm);
    expect(longPath.summary).toContain("long-path");
  });

  it("places long-path reflections away from the short-path midpoint", () => {
    const shortMid = calculateReflectionPoints(
      NY.lat,
      NY.lon,
      TOKYO.lat,
      TOKYO.lon,
      1,
      DATE,
      "short",
    )[0];
    const longMid = calculateReflectionPoints(
      NY.lat,
      NY.lon,
      TOKYO.lat,
      TOKYO.lon,
      1,
      DATE,
      "long",
    )[0];

    const separation = Math.hypot(
      shortMid.lat - longMid.lat,
      shortMid.lon - longMid.lon,
    );
    expect(separation).toBeGreaterThan(40);
  });

  it("spreads over the virtual slant range, never the ground range", () => {
    // PROP-03 #949, contract M15. The wave travels the slant range of
    // P.533-14 equation (19); the ground range is the shadow it casts.
    for (const mode of ["short", "long"] as const) {
      const result = trace(mode);
      expect(result.support.kind).toBe("supported");
      expect(result.virtualSlantRangeKm).toBeGreaterThan(
        result.totalDistanceKm,
      );
      const expected =
        32.45 +
        20 * Math.log10(14.074) +
        20 * Math.log10(result.virtualSlantRangeKm);
      expect(result.losses.freeSpaceDb).toBeCloseTo(expected, 12);
    }
  });

  it("reports a loss budget whose parts sum exactly to the total", () => {
    // Exact float equality, not a tolerance: any rounding inside the engine
    // would break this, which is the point. A caller must be able to subtract
    // one itemised term and get the rest back.
    for (const mode of ["short", "long"] as const) {
      const { losses, totalPathLossDb } = trace(mode);
      expect(
        losses.freeSpaceDb +
          losses.absorptionDb +
          losses.terrainDb +
          losses.polarisationDb,
      ).toBe(totalPathLossDb);
    }
  });

  it("does not round the per-hop physics", () => {
    const { hops, totalAbsorptionDb } = trace("short");
    expect(hops.length).toBeGreaterThan(0);
    const rounded = hops.every(
      (hop) =>
        hop.absorptionDb === Math.round(hop.absorptionDb * 10) / 10 &&
        hop.muf === Math.round(hop.muf * 100) / 100,
    );
    expect(rounded).toBe(false);
    expect(totalAbsorptionDb).not.toBe(Math.round(totalAbsorptionDb * 10) / 10);
  });

  it("counts two D-region passes per hop", () => {
    const result = trace("short");
    expect(result.absorptionPassCount).toBe(2 * result.hops.length);
  });

  it("agrees with the analytic slant range on a single hop", () => {
    const result = traceRayPath({
      startLat: 0,
      startLon: 0,
      endLat: 0,
      endLon: 1,
      frequencyMHz: 14,
      date: DATE,
      sfi: 150,
      kp: 2,
    });
    const groundKm = result.totalDistanceKm;
    const psi = groundKm / (2 * 6371);
    const chord =
      2 * Math.sqrt(6371 ** 2 + 6671 ** 2 - 2 * 6371 * 6671 * Math.cos(psi));
    expect(result.virtualSlantRangeKm).toBeCloseTo(chord, 6);
    expect(
      20 * Math.log10(result.virtualSlantRangeKm / groundKm),
    ).toBeGreaterThan(10);
  });

  it("rejects a circuit whose endpoints determine no great circle", () => {
    const result = traceRayPath({
      startLat: 40,
      startLon: -74,
      endLat: -40,
      endLon: 106,
      frequencyMHz: 14,
      date: DATE,
      sfi: 150,
      kp: 2,
    });
    expect(result.support.kind).toBe("ambiguous_geometry");
    expect(result.hops).toHaveLength(0);
    expect(result.isPathViable).toBe(false);
    expect(result.summary).toContain("no ray path");
  });

  it("declares what it stands in for", () => {
    const result = trace("short");
    expect(result.assumptions.join(" ")).toContain("300 km");
    expect(result.assumptions.join(" ")).toContain("1.2 MHz");
  });

  it("declares the mirror height it used, not the one it defaults to", () => {
    // The assumptions used to be a constant pair, so a caller that supplied a
    // real reflection height still got told the trace assumed 300 km.
    const result = traceRayPath({
      startLat: NY.lat,
      startLon: NY.lon,
      endLat: TOKYO.lat,
      endLon: TOKYO.lon,
      frequencyMHz: 14.074,
      date: DATE,
      sfi: 150,
      kp: 2,
      mirrorHeightKm: 265,
    });
    expect(result.support.kind).toBe("supported");
    const assumptions = result.assumptions.join(" ");
    expect(assumptions).not.toContain("300 km");
    expect(
      result.assumptions.some(
        (line) => line.includes("265 km") && line.includes("caller-supplied"),
      ),
    ).toBe(true);
  });

  it("owns the dip provenance instead of letting the leaf invent one", () => {
    // The dip comes from modifiedDipAngle() here, so this engine is the layer
    // that may say where it came from. The absorption leaf used to claim the
    // climatology provider supplied it at 300 km, which was never true.
    const result = trace("short");
    const dipLines = result.assumptions.filter((line) =>
      line.toLowerCase().includes("magnetic dip"),
    );
    expect(dipLines.some((line) => line.includes("modifiedDipAngle()"))).toBe(
      true,
    );
    expect(
      dipLines.some(
        (line) =>
          line.includes("climatology provider") && line.includes("300 km"),
      ),
    ).toBe(false);
  });

  it("keeps long-path control points on the great circle", () => {
    // The long path used to be sampled from a 20 to 40 point polyline and then
    // snapped with Math.round, so a reflection point could be tens of
    // kilometres off the circle it is supposed to lie on.
    const points = calculateReflectionPoints(
      NY.lat,
      NY.lon,
      TOKYO.lat,
      TOKYO.lon,
      7,
      DATE,
      "long",
    );
    expect(points).toHaveLength(7);
    for (let i = 0; i < points.length; i++) {
      expect(points[i].fractionAlongPath).toBeCloseTo((2 * i + 1) / 14, 12);
    }
  });
});

describe("PROP-03 (#949): iteration bounds that come from the caller", () => {
  it("refuses a hop count it would otherwise loop over", () => {
    // `calculateReflectionPoints` walks the count it is handed. A billion is a
    // perfectly good integer and an unbounded loop.
    for (const numHops of [0, -1, 2.5, 1_000_000_000, Number.NaN]) {
      expect(() =>
        calculateReflectionPoints(
          NY.lat,
          NY.lon,
          TOKYO.lat,
          TOKYO.lon,
          numHops,
          DATE,
        ),
      ).toThrow(RangeError);
    }
  }, 2000);

  it("throws on an unusable mirror height instead of hanging the caller", () => {
    // The engine reaches `minimumHopCount` before `hopGeometry` validates
    // anything, so a zero or NaN mirror height used to spin inside the hop
    // count search rather than reporting a bad request.
    for (const mirrorHeightKm of [0, -1, Number.NaN]) {
      expect(() =>
        traceRayPath({
          startLat: NY.lat,
          startLon: NY.lon,
          endLat: TOKYO.lat,
          endLon: TOKYO.lon,
          frequencyMHz: 14.074,
          date: DATE,
          sfi: 150,
          kp: 2,
          mirrorHeightKm,
        }),
      ).toThrow(RangeError);
    }
  }, 2000);
});

describe("PROP-03 (#949): per-hop absorption is taken at the hop's own crossings", () => {
  // London to New York at 08:00 UTC on the equinox. The first hop's midpoint
  // is in daylight and its exit penetration point is past the terminator, so
  // a midpoint-only sample cannot describe the hop.
  const LONDON = { lat: 51.5, lon: -0.1 };
  const TERMINATOR_DATE = new Date("2026-03-20T08:00:00Z");
  const FREQUENCY_MHZ = 14.1;
  const SFI = 150;

  function terminatorTrace() {
    return traceRayPath({
      startLat: LONDON.lat,
      startLon: LONDON.lon,
      endLat: NY.lat,
      endLon: NY.lon,
      frequencyMHz: FREQUENCY_MHZ,
      date: TERMINATOR_DATE,
      sfi: SFI,
      kp: 2,
    });
  }

  it("absorbs a straddling hop as entry plus exit, not as twice the lit midpoint", () => {
    const result = terminatorTrace();
    const route = resolveRoute(
      { latitudeDeg: LONDON.lat, longitudeDeg: LONDON.lon },
      { latitudeDeg: NY.lat, longitudeDeg: NY.lon },
    );
    if (route.kind !== "resolved") throw new Error("unreachable");
    const geometry = hopGeometry({
      groundDistanceKm: route.groundDistanceKm,
      hopCount: result.hops.length,
      mirrorHeightKm: DECLARED_MIRROR_HEIGHT_KM,
    });
    if (geometry.kind !== "supported") throw new Error("unreachable");

    const hop = result.hops[0];
    const entry = routeSampleAtFraction(
      route,
      geometry.penetrationFractions[0],
    );
    const exit = routeSampleAtFraction(route, geometry.penetrationFractions[1]);
    const entryCrossing = crossingAt(entry, TERMINATOR_DATE, SFI);
    const exitCrossing = crossingAt(exit, TERMINATOR_DATE, SFI);

    // The case only bites when the two ends of the hop are on opposite sides
    // of the terminator while the reflection point is still lit.
    expect(hop.reflectionPoint.solarZenithAngle).toBeLessThan(90);
    expect(entryCrossing.zenithAngleDeg).toBeLessThan(90);
    expect(exitCrossing.zenithAngleDeg).toBeGreaterThan(90);

    const expected = dRegionAbsorption({
      crossings: [entryCrossing, exitCrossing],
      hopCount: 1,
      frequencyMHz: FREQUENCY_MHZ,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: sfiToR12(SFI),
    }).absorptionDb;
    expect(hop.absorptionDb).toBe(expected);

    // And it is a different number from the one the midpoint alone gives, by
    // enough to move a displayed figure and a hop ranking.
    const midpointOnly = evaluateHopQuality(
      hop.reflectionPoint.lat,
      hop.reflectionPoint.lon,
      FREQUENCY_MHZ,
      TERMINATOR_DATE,
      SFI,
      2,
      geometry.hopGroundDistanceKm,
      DECLARED_MIRROR_HEIGHT_KM,
    ).absorptionDb;
    expect(Math.abs(hop.absorptionDb - midpointOnly)).toBeGreaterThan(0.1);
  });

  it("makes the mode total the exact sum of its hops", () => {
    const result = terminatorTrace();
    const summed = result.hops.reduce(
      (total, hop) => total + hop.absorptionDb,
      0,
    );
    // Exact, not close: the total is that sum, not a second evaluation of the
    // same crossings that is free to disagree with it.
    expect(result.totalAbsorptionDb).toBe(summed);
    expect(result.absorptionPassCount).toBe(2 * result.hops.length);
    expect(result.losses.absorptionDb).toBe(summed);
  });
});
