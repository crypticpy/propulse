// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  resolveRoute,
  routeSampleAtFraction,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import {
  basicMufDmaxKm,
  basicMufFoEMHz,
  higherOrderModeDmaxKm,
  hopGroundDistanceKm,
  MAX_DMAX_KM,
  maximumHopLengthKm,
  screeningFoEMHz,
  selectControlPoints,
  type ControlPointQuery,
  type ControlPointSelection,
} from "./controlPoints";

/**
 * A route of an exact length.
 *
 * Table 1 is a table of boundaries, and a boundary is only tested by landing
 * on it exactly. Two coordinates never produce exactly 2000.000000 km, so the
 * great circle is resolved from real endpoints (which is what fixes `origin`
 * and `tangent`, the only other fields the module reads) and the arc length is
 * then set to the number under test. Every sample stays on that same circle.
 */
function routeOfLength(groundDistanceKm: number): ResolvedRoute {
  const base = resolveRoute(
    { latitudeDeg: 0, longitudeDeg: 0 },
    { latitudeDeg: 10, longitudeDeg: 40 },
  );
  if (base.kind !== "resolved") throw new Error("fixture route is degenerate");
  return {
    ...base,
    groundDistanceKm,
    arcAngleRad: groundDistanceKm / 6371,
  };
}

function labels(selection: ControlPointSelection): readonly string[] {
  if (selection.kind !== "points") {
    throw new Error(`expected points, got ${selection.reason}`);
  }
  return selection.points.map((point) => point.label);
}

const query = (overrides: Partial<ControlPointQuery> & { route: ResolvedRoute }) =>
  selectControlPoints({
    purpose: "basic_muf",
    layer: "F2",
    ...overrides,
  });

describe("d0 and the dmax rule", () => {
  it("computes d0 = D / n", () => {
    expect(hopGroundDistanceKm(6000, 3)).toBe(2000);
    expect(hopGroundDistanceKm(2431.6, 2)).toBeCloseTo(1215.8, 10);
  });

  it("refuses a fractional or non-positive hop count", () => {
    expect(() => hopGroundDistanceKm(6000, 0)).toThrow(RangeError);
    expect(() => hopGroundDistanceKm(6000, 1.5)).toThrow(RangeError);
    expect(() => hopGroundDistanceKm(0, 1)).toThrow(RangeError);
  });

  it("restricts the basic-MUF dmax to 4000 km and leaves Mn/Mn0's free", () => {
    // M(3000)F2 = 2.6, foF2 = 8, foE = 2 gives x = 4 and, by equations (6)
    // and (5), a dmax well above the restriction: B = 2.6 - 0.124 +
    // (6.76 - 4)(0.0215 + 0.005 sin(7.854/4 - 1.9635)) = 2.5359...,
    // dmax = 4780 + (12610 + 133.75 - 194.22 + 168.19)(1/B - 0.303).
    const unrestricted = maximumHopLengthKm(2.6, 8, 2);
    expect(unrestricted).toBeGreaterThan(MAX_DMAX_KM);
    expect(higherOrderModeDmaxKm(2.6, 8, 2)).toBe(unrestricted);
    expect(basicMufDmaxKm(2.6, 8, 2)).toBe(MAX_DMAX_KM);
  });

  it("leaves a dmax already under 4000 km alone", () => {
    const unrestricted = maximumHopLengthKm(3.8, 4, 2);
    expect(unrestricted).toBeLessThan(MAX_DMAX_KM);
    expect(basicMufDmaxKm(3.8, 4, 2)).toBe(unrestricted);
  });
});

describe("which foE of two control points is used", () => {
  it("takes the lower for the basic MUF (section 3.3) and the higher for screening (section 4)", () => {
    expect(basicMufFoEMHz([2.7, 3.1])).toBe(2.7);
    expect(screeningFoEMHz([2.7, 3.1])).toBe(3.1);
    // The two rules point opposite ways. A single "combine" would be right
    // half the time and silently wrong the other half.
    expect(basicMufFoEMHz([2.7, 3.1])).not.toBe(screeningFoEMHz([2.7, 3.1]));
  });

  it("rejects a missing or non-physical foE rather than inventing one", () => {
    expect(() => basicMufFoEMHz([])).toThrow(RangeError);
    expect(() => screeningFoEMHz([2.7, 0])).toThrow(RangeError);
    expect(() => basicMufFoEMHz([Number.NaN])).toThrow(RangeError);
  });
});

describe("Table 1a: basic MUF and associated gyrofrequency", () => {
  it("puts an E mode at M up to and including exactly 2000 km", () => {
    expect(labels(query({ route: routeOfLength(2000), layer: "E" }))).toEqual([
      "M",
    ]);
  });

  it("moves an E mode to T + 1000 and R - 1000 just past 2000 km and up to exactly 4000", () => {
    expect(
      labels(query({ route: routeOfLength(2000.000001), layer: "E" })),
    ).toEqual(["T + 1000", "R - 1000"]);
    expect(labels(query({ route: routeOfLength(4000), layer: "E" }))).toEqual([
      "T + 1000",
      "R - 1000",
    ]);
  });

  it("has no E-mode row past 4000 km", () => {
    const selection = query({ route: routeOfLength(4000.000001), layer: "E" });
    expect(selection.kind).toBe("not_applicable");
  });

  it("puts F2 at M up to and including exactly dmax", () => {
    const dmaxKm = 3200;
    expect(labels(query({ route: routeOfLength(dmaxKm), dmaxKm }))).toEqual([
      "M",
    ]);
    // and below 2000 km even when dmax itself is smaller than 2000
    expect(
      labels(query({ route: routeOfLength(1800), dmaxKm: 1500 })),
    ).toEqual(["M"]);
  });

  it("moves F2 to T + d0/2 and R - d0/2 past dmax, at d0/2 from each end", () => {
    const route = routeOfLength(6000);
    const selection = query({
      route,
      dmaxKm: MAX_DMAX_KM,
      hopGroundDistanceKm: hopGroundDistanceKm(6000, 2),
    });
    if (selection.kind !== "points") throw new Error("expected points");
    expect(selection.points.map((p) => p.label)).toEqual([
      "T + d0/2",
      "R - d0/2",
    ]);
    expect(selection.points[0].offsetKm).toBe(1500);
    expect(selection.points[1].offsetKm).toBe(4500);
    expect(selection.points[0].fraction).toBe(0.25);
    expect(selection.points[0].point).toEqual(
      routeSampleAtFraction(route, 0.25),
    );
  });

  it("stops at exactly 9000 km, where the long-path method takes over", () => {
    expect(
      query({
        route: routeOfLength(9000),
        dmaxKm: MAX_DMAX_KM,
        hopGroundDistanceKm: 3000,
      }).kind,
    ).toBe("not_applicable");
    expect(
      query({
        route: routeOfLength(8999.999999),
        dmaxKm: MAX_DMAX_KM,
        hopGroundDistanceKm: 3000,
      }).kind,
    ).toBe("points");
  });

  it("refuses to guess dmax or d0", () => {
    expect(() => query({ route: routeOfLength(3000) })).toThrow(RangeError);
    expect(() =>
      query({ route: routeOfLength(6000), dmaxKm: MAX_DMAX_KM }),
    ).toThrow(RangeError);
  });
});

describe("Table 1b: E-layer screening", () => {
  it("is M up to 2000 km, the 1000 km end points below 9000, and nothing at 9000", () => {
    const at = (km: number) =>
      selectControlPoints({
        route: routeOfLength(km),
        purpose: "e_layer_screening",
        layer: "F2",
      });
    expect(labels(at(2000))).toEqual(["M"]);
    expect(labels(at(2000.000001))).toEqual(["T + 1000", "R - 1000"]);
    expect(labels(at(8999.999999))).toEqual(["T + 1000", "R - 1000"]);
    expect(at(9000).kind).toBe("not_applicable");
  });

  it("has no E-layer row", () => {
    expect(
      selectControlPoints({
        route: routeOfLength(1500),
        purpose: "e_layer_screening",
        layer: "E",
      }).kind,
    ).toBe("not_applicable");
  });
});

describe("Table 1c reproduces ionosphere/mirrorHeight.ts's choice", () => {
  /**
   * `ionosphere/mirrorHeight.ts` implements Table 1c inline. Its branch is
   * `groundDistanceKm <= dmaxKm`, and above it the three fractions it samples
   * are, verbatim from that file, `1 / (2 * hopCount)`, `0.5` and
   * `1 - 1 / (2 * hopCount)`. That leaf is not changed by this slice, so the
   * duplicate is held together here instead: if either definition moves, this
   * fails. It is a transcription of the other file, not a call into it, on
   * purpose - `resolveMirrorHeight` is async and needs the CCIR asset, and
   * what is being compared is the table, not the height.
   */
  const mirrorHeightChoice = (
    groundDistanceKm: number,
    dmaxKm: number,
    hopCount: number,
  ): readonly { label: string; fraction: number }[] =>
    groundDistanceKm <= dmaxKm
      ? [{ label: "M", fraction: 0.5 }]
      : [
          { label: "T + d0/2", fraction: 1 / (2 * hopCount) },
          { label: "M", fraction: 0.5 },
          { label: "R - d0/2", fraction: 1 - 1 / (2 * hopCount) },
        ];

  it.each([
    [1200, 4000, 1],
    [4000, 4000, 1],
    [6000, 4000, 2],
    [8400, 3000, 3],
    [8999, 2500, 4],
  ])("agrees at D = %s km, dmax = %s km, n = %s", (D, dmaxKm, hopCount) => {
    const selection = selectControlPoints({
      route: routeOfLength(D),
      purpose: "reflection_height",
      layer: "F2",
      dmaxKm,
      hopGroundDistanceKm: hopGroundDistanceKm(D, hopCount),
    });
    if (selection.kind !== "points") throw new Error("expected points");
    expect(
      selection.points.map((p) => ({ label: p.label, fraction: p.fraction })),
    ).toEqual(mirrorHeightChoice(D, dmaxKm, hopCount));
  });
});

describe("Table 1d: ionospheric absorption", () => {
  const at = (km: number, layer: "E" | "F2", extra: Partial<ControlPointQuery> = {}) =>
    selectControlPoints({
      route: routeOfLength(km),
      purpose: "absorption",
      layer,
      ...extra,
    });

  it("gives the E-mode rows of Table 1d", () => {
    expect(labels(at(2000, "E"))).toEqual(["M"]);
    expect(labels(at(3000, "E"))).toEqual(["T + 1000", "M", "R - 1000"]);
    expect(labels(at(4000, "E"))).toEqual(["T + 1000", "M", "R - 1000"]);
    expect(at(4000.000001, "E").kind).toBe("not_applicable");
  });

  it("gives the five-point F2 row past dmax", () => {
    const selection = at(6000, "F2", {
      dmaxKm: MAX_DMAX_KM,
      hopGroundDistanceKm: 3000,
    });
    if (selection.kind !== "points") throw new Error("expected points");
    expect(selection.points.map((p) => p.label)).toEqual([
      "T + 1000",
      "T + d0/2",
      "M",
      "R - d0/2",
      "R - 1000",
    ]);
    expect(selection.points.map((p) => p.offsetKm)).toEqual([
      1000, 1500, 3000, 4500, 5000,
    ]);
  });

  it("gives the three-point F2 row inside dmax and M alone below 2000 km", () => {
    expect(labels(at(3000, "F2", { dmaxKm: MAX_DMAX_KM }))).toEqual([
      "T + 1000",
      "M",
      "R - 1000",
    ]);
    expect(labels(at(2000, "F2", { dmaxKm: MAX_DMAX_KM }))).toEqual(["M"]);
  });
});
