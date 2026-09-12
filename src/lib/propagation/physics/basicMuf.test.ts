// @vitest-environment node

import { describe, expect, it } from "vitest";

import { maximumHopGroundDistanceKm } from "@/lib/propagation/geometry/hop";
import {
  resolveRoute,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import {
  basicMuf,
  cdFactor,
  eBasicMufMHz,
  f2BasicMufMHz,
  lowestOrderHopCount,
  maxHopForMinElevationKm,
  E_LAYER_MIRROR_HEIGHT_KM,
  MAX_E_MODES,
  MAX_F2_MODES,
  type ControlPointSampler,
  type MufControlPointState,
} from "./basicMuf";
import { basicMufDmaxKm, MAX_DMAX_KM } from "./controlPoints";

/**
 * Every expected number in this file was computed from the published P.533-14
 * equations, by an independent Python transcription written from the
 * recommendation text, before the implementation was run. The inputs and the
 * intermediate values are recorded beside each one so the arithmetic can be
 * checked without this file. None of them is a snapshot of `basicMuf.ts`.
 */
const PRECISION = 9;

/** A route of an exact length; see `controlPoints.test.ts` for why. */
function routeOfLength(groundDistanceKm: number): ResolvedRoute {
  const base = resolveRoute(
    { latitudeDeg: 0, longitudeDeg: 0 },
    { latitudeDeg: 10, longitudeDeg: 40 },
  );
  if (base.kind !== "resolved") throw new Error("fixture route is degenerate");
  return { ...base, groundDistanceKm, arcAngleRad: groundDistanceKm / 6371 };
}

const state = (
  overrides: Partial<MufControlPointState> = {},
): MufControlPointState => ({
  foF2MHz: 8,
  m3000F2: 3,
  foEMHz: 2,
  gyrofrequency300kmMHz: 1.2,
  ...overrides,
});

const uniform =
  (value: MufControlPointState): ControlPointSampler =>
  () =>
    value;

describe("equation (1): E-layer basic MUF", () => {
  it("is foE sec(i110) for a 1000 km hop", () => {
    // psi = d / (2 R) = 1000 / 12742 = 0.078480615 rad
    // delta = atan2(cos psi - 6371/6481, sin psi) = 0.175406361 rad
    // i110 = asin((6371/6481) cos delta) = 1.316909350 rad
    // MUF = 3 / cos(1.316909350) = 3 / 0.251169... = 11.944186229732676
    expect(eBasicMufMHz(3, 1000)).toBeCloseTo(11.944186229732676, PRECISION);
  });

  it("scales exactly with foE, because foE is a plain factor", () => {
    const at3 = eBasicMufMHz(3, 1000);
    const at6 = eBasicMufMHz(6, 1000);
    expect(at3).not.toBeNull();
    expect(at6).not.toBeNull();
    expect(at6 as number).toBeCloseTo((at3 as number) * 2, 12);
  });

  it("has no value for a hop 110 km cannot reflect", () => {
    // The grazing limit at 110 km is 2 R acos(6371/6481) = 2351 km.
    expect(maximumHopGroundDistanceKm(E_LAYER_MIRROR_HEIGHT_KM)).toBeCloseTo(
      2350.9,
      0,
    );
    expect(eBasicMufMHz(3, 2400)).toBeNull();
  });
});

describe("mode existence at the reference's 3 degree floor", () => {
  it("gives 1775.58 km at 110 km, well inside the grazing limit", () => {
    // delta = 3 deg = 0.052359878 rad
    // i = asin((6371/6481) cos delta) = 1.378925... rad
    // dh = 2 R (pi/2 - delta - i) = 1775.5822065439036 km
    expect(maxHopForMinElevationKm(E_LAYER_MIRROR_HEIGHT_KM)).toBeCloseTo(
      1775.5822065439036,
      PRECISION,
    );
    expect(maxHopForMinElevationKm(E_LAYER_MIRROR_HEIGHT_KM)).toBeLessThan(
      maximumHopGroundDistanceKm(E_LAYER_MIRROR_HEIGHT_KM),
    );
  });

  it("chooses the lowest order from that hop, not from the horizon", () => {
    // 1800 km needs two E hops at the 3 degree floor (1800 > 1775.58) even
    // though a single 1800 km hop is above the horizon at 110 km.
    expect(
      lowestOrderHopCount(1500, E_LAYER_MIRROR_HEIGHT_KM, MAX_E_MODES),
    ).toBe(1);
    expect(
      lowestOrderHopCount(1800, E_LAYER_MIRROR_HEIGHT_KM, MAX_E_MODES),
    ).toBe(2);
    expect(
      maximumHopGroundDistanceKm(E_LAYER_MIRROR_HEIGHT_KM),
    ).toBeGreaterThan(1800);
  });

  it("reports no mode when even the highest order cannot reach", () => {
    // 3 E hops over 5400 km are 1800 km each, still past the floor.
    expect(
      lowestOrderHopCount(5400, E_LAYER_MIRROR_HEIGHT_KM, MAX_E_MODES),
    ).toBeNull();
  });
});

describe("equations (3) to (6): F2-layer basic MUF", () => {
  // foF2 = 8, foE = 2, M(3000)F2 = 3, fH = 1.2 give x = 4 and
  // B = 3 - 0.124 + (9 - 4)(0.0215 + 0.005 sin(7.854/4 - 1.9635)) = 2.9835
  // dmax = 4780 + (12610 + 133.75 - 194.21875 + 168.1885...)(1/2.9835 - 0.303)
  //      = 5189.215597415832, restricted to 4000 for the basic MUF.
  const B = 2.9835;
  const dmaxKm = MAX_DMAX_KM;

  it("gives Cd = 0.74 at Z = 0 and 1 at Z = -1", () => {
    expect(cdFactor(dmaxKm / 2, dmaxKm)).toBeCloseTo(0.74, 12);
    expect(cdFactor(dmaxKm, dmaxKm)).toBeCloseTo(1, 12);
    // C3000 with dmax = 4000 is Cd at Z = -0.5.
    expect(cdFactor(3000, dmaxKm)).toBeCloseTo(0.94209375, 12);
  });

  it("collapses to B foF2 + (fH/2)(1 - d/dmax) when d is exactly 3000 km", () => {
    // Cd/C3000 is then 1 by construction, which is the cleanest independent
    // check equation (3) admits: 2.9835 * 8 + 0.6 * 0.25 = 24.018.
    expect(f2BasicMufMHz(state(), 3000, dmaxKm)).toBeCloseTo(
      B * 8 + 0.6 * (1 - 3000 / dmaxKm),
      PRECISION,
    );
    expect(f2BasicMufMHz(state(), 3000, dmaxKm)).toBeCloseTo(24.018, PRECISION);
  });

  it("matches the hand-computed value at 2000 and 4000 km", () => {
    // d = 2000: Z = 0, Cd = 0.74, Cd/C3000 = 0.785509...,
    //   MUF = (1 + 0.785509 * 1.9835) * 8 + 0.6 * 0.5 = 20.764067403058352
    expect(f2BasicMufMHz(state(), 2000, dmaxKm)).toBeCloseTo(
      20.764067403058352,
      PRECISION,
    );
    // d = 4000: Z = -1, Cd = 1, MUF = 24.843334328457228, gyro term 0.
    expect(f2BasicMufMHz(state(), 4000, dmaxKm)).toBeCloseTo(
      24.843334328457228,
      PRECISION,
    );
  });

  it("keeps the gyrofrequency term negative for a hop longer than dmax", () => {
    // Cd is clipped at dmax, the gyrofrequency term is not: the difference
    // against the same expression evaluated at d = dmax is exactly
    // (fH/2)((d/dmax) - 1) = 0.6 * 0.25 = 0.15 MHz.
    const beyond = f2BasicMufMHz(state(), 5000, dmaxKm);
    expect(beyond).toBeCloseTo(24.69333432845723, PRECISION);
    expect(f2BasicMufMHz(state(), dmaxKm, dmaxKm) - beyond).toBeCloseTo(
      0.6 * (5000 / dmaxKm - 1),
      PRECISION,
    );
  });
});

describe("the path basic MUF", () => {
  it("takes the higher of the lowest-order E and F2 modes", () => {
    // D = 1200 km, uniform ionosphere. hr = 1490/3 - 176 = 320.667 km, so the
    // lowest F2 order is 1, and the lowest E order is 1 as well.
    const result = basicMuf({
      route: routeOfLength(1200),
      sample: uniform(state()),
    });
    if (result.kind !== "resolved") throw new Error(result.detail);
    expect(result.e?.lowestOrderHopCount).toBe(1);
    expect(result.f2?.lowestOrderHopCount).toBe(1);
    expect(result.pathBasicMufMHz).toBe(
      Math.max(
        result.e?.basicMufMHz as number,
        result.f2?.basicMufMHz as number,
      ),
    );
    expect(result.pathBasicMufMHz).toBe(result.f2?.basicMufMHz);
    expect(result.dmaxKm).toBe(MAX_DMAX_KM);
    expect(result.unrestrictedDmaxKm).toBeCloseTo(5189.215597415832, 6);
  });

  it("drops E modes beyond 4000 km and keeps F2", () => {
    const result = basicMuf({
      route: routeOfLength(4500),
      sample: uniform(state()),
    });
    if (result.kind !== "resolved") throw new Error(result.detail);
    expect(result.e).toBeNull();
    expect(result.f2).not.toBeNull();
    expect(result.pathBasicMufMHz).toBe(result.f2?.basicMufMHz);
  });

  it("refuses the long-path domain at exactly 9000 km", () => {
    const result = basicMuf({
      route: routeOfLength(9000),
      sample: uniform(state()),
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") throw new Error("expected unsupported");
    expect(result.reason).toBe("out_of_domain");
    expect(
      basicMuf({ route: routeOfLength(8999), sample: uniform(state()) }).kind,
    ).toBe("resolved");
  });
});

describe("section 3.3: the lower foE of the two Table 1a control points", () => {
  it("uses the lower value on a 2000 to 4000 km path", () => {
    // D = 2500 km, n0E = 2 (2500/2 = 1250 < 1775.58), so d = 1250 km.
    // With foE = 2.4 the hand-computed value is 10.91613975068902 MHz.
    const sample: ControlPointSampler = (_point, label) =>
      state({ foEMHz: label === "T + 1000" ? 2.4 : 3.1 });
    const result = basicMuf({ route: routeOfLength(2500), sample });
    if (result.kind !== "resolved") throw new Error(result.detail);
    expect(result.e?.lowestOrderHopCount).toBe(2);
    expect(result.e?.basicMufMHz).toBeCloseTo(10.91613975068902, PRECISION);
    // The higher foE would have given 14.10...; taking it would be section 4's
    // screening rule, not section 3.3's.
    expect(result.e?.basicMufMHz).toBeLessThan((3.1 / 2.4) * 10.91613975068902);
  });
});

describe("sections 3.5.1.2 and 3.5.2.2: paths longer than dmax", () => {
  // D = 6000 km, uniform foF2 = 7, foE = 2.2, M(3000)F2 = 3.2, fH = 1.15.
  // hr = 1490/3.2 - 176 = 289.625 km, longest 3-degree hop 3161.05 km, so
  // n0 = 2 and d0 = 3000 km. dmax at M is 4871.694012521116, restricted to
  // 4000 for the basic MUF, so D > dmax and Table 1a names T + d0/2 and
  // R - d0/2.
  const outer = state({
    foF2MHz: 7,
    m3000F2: 3.2,
    foEMHz: 2.2,
    gyrofrequency300kmMHz: 1.15,
  });
  const route = routeOfLength(6000);

  it("takes the lowest-order basic MUF from equation (3) at d0", () => {
    const result = basicMuf({ route, sample: uniform(outer) });
    if (result.kind !== "resolved") throw new Error(result.detail);
    expect(result.f2?.lowestOrderHopCount).toBe(2);
    expect(result.f2?.basicMufMHz).toBeCloseTo(22.720514430627947, PRECISION);
    expect(result.pathBasicMufMHz).toBeCloseTo(22.720514430627947, PRECISION);
  });

  it("selects the lower of the two control-point values", () => {
    // The receiver-end point is given a lower foF2, so its equation (3) value
    // is the lower one and must be the answer.
    const sample: ControlPointSampler = (_point, label) =>
      label === "R - d0/2" ? { ...outer, foF2MHz: 6 } : outer;
    const result = basicMuf({ route, sample });
    if (result.kind !== "resolved") throw new Error(result.detail);
    expect(result.f2?.basicMufMHz).toBeLessThan(22.720514430627947);
    expect(result.f2?.basicMufMHz).toBeCloseTo(
      f2BasicMufMHz({ ...outer, foF2MHz: 6 }, 3000, MAX_DMAX_KM),
      PRECISION,
    );
  });

  it("evaluates F2(dmax)MUF at each outer point with the mid-path dmax", () => {
    // The outer points are given an ionosphere whose own restricted dmax is
    // below 4000 km (foF2/foE = 2, M(3000)F2 = 4 gives B = 4.189 and
    // dmax = 3443 km). Table 1 defines dmax as "calculated at the mid-path
    // control point", and section 3.5.2.2 says dmax "is recalculated at the
    // control point" only for Mn and Mn0, so the lowest-order value keeps the
    // mid-path dmax (4000 km here) and the outer point's own ionosphere. The
    // reference agrees: MUFBasic.c passes path->dmax to both outer points.
    const mid = outer;
    const edge = state({
      foF2MHz: 6,
      m3000F2: 4,
      foEMHz: 3,
      gyrofrequency300kmMHz: 1.2,
    });
    const edgeDmaxKm = basicMufDmaxKm(edge.m3000F2, edge.foF2MHz, edge.foEMHz);
    expect(edgeDmaxKm).toBeLessThan(MAX_DMAX_KM);
    const sample: ControlPointSampler = (_point, label) =>
      label === "M" ? mid : edge;
    const result = basicMuf({ route, sample });
    if (result.kind !== "resolved") throw new Error(result.detail);
    expect(result.dmaxKm).toBe(MAX_DMAX_KM);
    expect(result.f2?.basicMufMHz).toBeCloseTo(
      f2BasicMufMHz(edge, 3000, MAX_DMAX_KM),
      PRECISION,
    );
    expect(result.f2?.basicMufMHz).not.toBeCloseTo(
      f2BasicMufMHz(edge, 3000, edgeDmaxKm),
      6,
    );
  });

  it("scales higher orders by Mn/Mn0 with dmax recalculated and unrestricted", () => {
    // dmax at the control point, free of the 4000 km cap, is 4871.694012521116.
    // Mn/Mn0 for n = 3 (d = 2000 km) against n0 = 2 (d0 = 3000 km) is
    // 18.634340592437628 / 22.797678152720007 = 0.8173788781299358, so
    // 3F2(D)MUF = 22.720514430627947 * 0.8173788781299358 = 18.57126859584169.
    const result = basicMuf({ route, sample: uniform(outer) });
    if (result.kind !== "resolved") throw new Error(result.detail);
    const modes = result.f2?.modes ?? [];
    expect(modes.map((mode) => mode.hopCount)).toEqual([2, 3, 4, 5, 6]);
    expect(modes[1].basicMufMHz).toBeCloseTo(18.57126859584169, PRECISION);
    expect(modes[2].basicMufMHz).toBeCloseTo(15.521324916487286, PRECISION);
    expect(modes[4].basicMufMHz).toBeCloseTo(12.030485061272737, PRECISION);
    // Using the restricted 4000 km dmax for the ratio would be a different
    // number; section 3.5.2.2 lifts the restriction and this pins that.
    const restrictedRatio =
      f2BasicMufMHz(outer, 2000, MAX_DMAX_KM) /
      f2BasicMufMHz(outer, 3000, MAX_DMAX_KM);
    expect(modes[1].basicMufMHz).not.toBeCloseTo(
      22.720514430627947 * restrictedRatio,
      6,
    );
  });

  it("names at most six F2 modes", () => {
    const result = basicMuf({ route, sample: uniform(outer) });
    if (result.kind !== "resolved") throw new Error(result.detail);
    expect(result.f2?.modes.length).toBeLessThanOrEqual(MAX_F2_MODES);
    expect(
      result.f2?.modes.every((mode) => mode.hopCount <= MAX_F2_MODES),
    ).toBe(true);
  });

  it("samples M and both Table 1a points, and nothing else", () => {
    const result = basicMuf({ route, sample: uniform(outer) });
    if (result.kind !== "resolved") throw new Error(result.detail);
    expect(result.controlPoints.map((point) => point.label)).toEqual([
      "M",
      "T + d0/2",
      "R - d0/2",
    ]);
  });
});
