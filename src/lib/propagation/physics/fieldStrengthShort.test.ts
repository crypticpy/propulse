// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  resolveRoute,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import type { PenetrationPointState } from "./absorptionLoss";
import {
  FREE_SPACE_CONSTANT_DB,
  OTHER_LOSSES_DB,
  aboveMufLoss,
} from "./losses";
import {
  modeSet,
  type ModeControlPointState,
  type ResolvedModeSet,
} from "./modeSet";
import type { PropagationMode } from "./modeTypes";
import {
  shortPathFieldStrength,
  FIELD_STRENGTH_CONSTANT_DB,
  RECEIVER_POWER_CONSTANT_DB,
  RECEIVER_POWER_MAX_KM,
  type ModeFieldStrength,
  type ShortPathFieldStrengthInputs,
} from "./fieldStrengthShort";

/**
 * Every expected number here comes from the published equations, transcribed
 * again in this file, and never from a stored output of the module.
 *
 *     Ew  = 136.6 + Pt + Gt + 20 log10 f - Lb                         (17)
 *     Lb  = 32.45 + 20 log10 f + 20 log10 p' + Li + Lm + Lg + Lh + Lz (18)
 *     Es  = 10 log10 sum_w 10^(Ew/10)                                 (28)
 *     Prw = Ew + Grw - 20 log10 f - 107.2                             (43)
 *     Pr  = 10 log10 sum_w 10^(Prw/10)                                (44)
 *
 * Substituting (18) into (17) cancels 20 log10 f exactly and leaves
 *
 *     Ew  = 104.15 + Pt + Gt - 20 log10 p' - (Li + Lm + Lg + Lh + Lz)
 *
 * and substituting that into (43) leaves
 *
 *     Prw = -3.05 + Pt + Gt + Grw - 20 log10 f - 20 log10 p'
 *           - (Li + Lm + Lg + Lh + Lz)
 *
 * because 136.6 - 32.45 = 104.15 and 104.15 - 107.2 = -3.05. Both identities
 * are asserted below: they are hand-provable, they are independent of every
 * loss leaf, and they pin the two places the recommendation puts a 20 log10 f
 * with opposite signs. The individual loss terms are pinned in `losses.test.ts`,
 * `absorptionLoss.test.ts` and `auroralLoss.test.ts`; this file asserts how
 * they are combined, which modes are counted, and where the antennas enter.
 */
const PRECISION = 9;

function route(tx: GeodeticPoint, rx: GeodeticPoint): ResolvedRoute {
  const resolved = resolveRoute(tx, rx);
  if (resolved.kind !== "resolved") {
    throw new Error(`fixture route is ${resolved.kind}`);
  }
  return resolved;
}

/**
 * A route of an exact length along the equator.
 *
 * `routeSample` measures arc length from the transmitter along the great
 * circle and does not clamp at the receiver, so overriding the length moves
 * every control point and penetration point along that same circle, which is
 * what the geometry under test needs. The endpoints are on the equator, so
 * every point of the route is, and the auroral loss is identically zero unless
 * a test asks for a polar route.
 */
function routeOfLength(groundDistanceKm: number): ResolvedRoute {
  const base = route(
    { latitudeDeg: 0, longitudeDeg: 0 },
    { latitudeDeg: 0, longitudeDeg: 40 },
  );
  return { ...base, groundDistanceKm, arcAngleRad: groundDistanceKm / 6371 };
}

/**
 * A route of an exact length, but along a different great circle than
 * `routeOfLength`'s. Used to build two routes that share `groundDistanceKm`
 * without sharing an origin or a tangent, which the guard in
 * `fieldStrengthShort` must still tell apart.
 */
function routeOfLengthFrom(
  tx: GeodeticPoint,
  rx: GeodeticPoint,
  groundDistanceKm: number,
): ResolvedRoute {
  const base = route(tx, rx);
  return { ...base, groundDistanceKm, arcAngleRad: groundDistanceKm / 6371 };
}

/** Fairbanks to Tromso, about 4900 km, well inside the auroral zone. */
const POLAR = route(
  { latitudeDeg: 64.8, longitudeDeg: -147.9 },
  { latitudeDeg: 69.6, longitudeDeg: 18.9 },
);

const BASE_STATE: ModeControlPointState = {
  foF2MHz: 9,
  m3000F2: 3,
  foEMHz: 1.8,
  gyrofrequency300kmMHz: 1.2,
  r12: 50,
};

const ABSORPTION_STATE: PenetrationPointState = {
  foEMHz: 3.4,
  zenithAngleDeg: 30,
  zenithNoonAngleDeg: 20,
  longitudinalGyrofrequencyMHz: 1.2,
  modifiedDipDeg: 55,
};

function resolvedSet(
  groundDistanceKm: number,
  frequencyMHz: number,
  state: Partial<ModeControlPointState> = {},
  pathRoute: ResolvedRoute = routeOfLength(groundDistanceKm),
): ResolvedModeSet {
  const result = modeSet({
    route: pathRoute,
    frequencyMHz,
    sample: () => ({ ...BASE_STATE, ...state }),
  });
  if (result.kind !== "resolved") {
    throw new Error(`fixture mode set is ${result.reason}: ${result.detail}`);
  }
  return result;
}

function inputs(
  set: ResolvedModeSet,
  overrides: Partial<ShortPathFieldStrengthInputs> = {},
  pathRoute: ResolvedRoute = routeOfLength(set.groundDistanceKm),
): ShortPathFieldStrengthInputs {
  return {
    route: pathRoute,
    modes: set,
    monthIndex: 5,
    utcHours: 12,
    ssn: 50,
    absorptionSample: () => ABSORPTION_STATE,
    ...overrides,
  };
}

/** The sum Li + Lm + Lg + Lh + Lz of equation (18), from the record's terms. */
function otherTermsDb(record: ModeFieldStrength): number {
  const loss = record.basicTransmissionLoss;
  if (loss === null) throw new Error(`${record.label} has no loss`);
  return (
    loss.absorptionDb +
    loss.aboveMufDb +
    loss.groundReflectionDb +
    loss.auroralDb +
    loss.otherLossesDb
  );
}

function contributing(
  result: ReturnType<typeof shortPathFieldStrength>,
): readonly ModeFieldStrength[] {
  expect(result.contributingModes.length).toBeGreaterThan(0);
  return result.contributingModes;
}

describe("equation (18) assembled from the terms", () => {
  it("adds the free-space term of equation (18) to the five loss terms", () => {
    const set = resolvedSet(3000, 10);
    const result = shortPathFieldStrength(inputs(set));
    for (const record of contributing(result)) {
      const loss = record.basicTransmissionLoss;
      if (loss === null) throw new Error("no loss");
      const p = record.virtualSlantRangeKm;
      if (p === null) throw new Error("no slant range");
      expect(loss.freeSpaceDb).toBeCloseTo(
        FREE_SPACE_CONSTANT_DB + 20 * Math.log10(10) + 20 * Math.log10(p),
        PRECISION,
      );
      expect(loss.lossDb).toBeCloseTo(
        loss.freeSpaceDb + otherTermsDb(record),
        PRECISION,
      );
      expect(loss.otherLossesDb).toBe(OTHER_LOSSES_DB);
    }
  });

  it("takes the loss over the section 5.1 slant range, not the selection one", () => {
    // foF2/foE = 4 with M(3000)F2 = 2.5 puts equation (2) at 420 km and
    // section 5.1's case (b) near 200 km, so the two geometries differ and the
    // test can tell which one was used.
    const set = resolvedSet(3000, 10, { foF2MHz: 12, foEMHz: 3, m3000F2: 2.5 });
    const result = shortPathFieldStrength(inputs(set));
    const f2 = contributing(result).filter((record) => record.layer === "F2");
    expect(f2.length).toBeGreaterThan(0);
    for (const record of f2) {
      const mode = set.modes.find((m) => m.label === record.label);
      if (mode === undefined) throw new Error("no mode");
      expect(record.virtualSlantRangeKm).toBe(mode.virtualSlantRangeKm);
      expect(record.elevationRad).toBe(mode.elevationRad);
      expect(record.virtualSlantRangeKm).not.toBe(mode.selectionSlantRangeKm);
    }
  });
});

describe("equation (17): the median field strength of one mode", () => {
  it("matches the equation written out, at three transmitter powers", () => {
    const set = resolvedSet(3000, 14);
    for (const transmitterPowerDbKw of [-10, 0, 13]) {
      const result = shortPathFieldStrength(
        inputs(set, { transmitterPowerDbKw }),
      );
      for (const record of contributing(result)) {
        const loss = record.basicTransmissionLoss;
        if (loss === null) throw new Error("no loss");
        expect(record.fieldStrengthDbuVPerM).toBeCloseTo(
          FIELD_STRENGTH_CONSTANT_DB +
            transmitterPowerDbKw +
            0 +
            20 * Math.log10(14) -
            loss.lossDb,
          PRECISION,
        );
      }
    }
  });

  it("cancels the 20 log f of equation (18) with the 20 log f of equation (17)", () => {
    const set = resolvedSet(3000, 21);
    const result = shortPathFieldStrength(
      inputs(set, { transmitterPowerDbKw: 6, transmitterGain: 3 }),
    );
    for (const record of contributing(result)) {
      const p = record.virtualSlantRangeKm;
      if (p === null) throw new Error("no slant range");
      expect(record.fieldStrengthDbuVPerM).toBeCloseTo(
        104.15 + 6 + 3 - 20 * Math.log10(p) - otherTermsDb(record),
        PRECISION,
      );
    }
  });

  it("moves one for one with Pt and with Gt", () => {
    const set = resolvedSet(3000, 14);
    const base = shortPathFieldStrength(inputs(set));
    const lifted = shortPathFieldStrength(
      inputs(set, { transmitterPowerDbKw: 4, transmitterGain: 2.5 }),
    );
    for (let i = 0; i < base.contributingModes.length; i += 1) {
      const before = base.contributingModes[i].fieldStrengthDbuVPerM;
      const after = lifted.contributingModes[i].fieldStrengthDbuVPerM;
      if (before === null || after === null) throw new Error("no field");
      expect(after - before).toBeCloseTo(6.5, PRECISION);
    }
  });
});

describe("equation (43): the available receiver power of one mode", () => {
  it("matches the equation written out", () => {
    const set = resolvedSet(3000, 18);
    const result = shortPathFieldStrength(inputs(set, { receiverGain: 4 }));
    for (const record of contributing(result)) {
      const ew = record.fieldStrengthDbuVPerM;
      if (ew === null) throw new Error("no field");
      expect(record.receiverPowerDbW).toBeCloseTo(
        ew + 4 - 20 * Math.log10(18) - RECEIVER_POWER_CONSTANT_DB,
        PRECISION,
      );
      expect(record.receiverPowerDbW).toBeCloseTo(
        -3.05 +
          0 +
          0 +
          4 -
          20 * Math.log10(18) -
          20 * Math.log10(record.virtualSlantRangeKm ?? Number.NaN) -
          otherTermsDb(record),
        PRECISION,
      );
    }
  });

  it("keeps the receiving antenna out of the field strength and in the power", () => {
    const set = resolvedSet(3000, 18);
    const base = shortPathFieldStrength(inputs(set));
    const lifted = shortPathFieldStrength(inputs(set, { receiverGain: 7 }));
    for (let i = 0; i < base.contributingModes.length; i += 1) {
      const before = base.contributingModes[i];
      const after = lifted.contributingModes[i];
      expect(after.fieldStrengthDbuVPerM).toBe(before.fieldStrengthDbuVPerM);
      const p0 = before.receiverPowerDbW;
      const p1 = after.receiverPowerDbW;
      if (p0 === null || p1 === null) throw new Error("no power");
      expect(p1 - p0).toBeCloseTo(7, PRECISION);
    }
    expect(base.fieldStrengthDbuVPerM).toBe(lifted.fieldStrengthDbuVPerM);
  });

  it("falls 20 log f with frequency at a fixed gain, as the aperture does", () => {
    // The same circuit, evaluated at two frequencies with the loss terms held
    // fixed by construction is not available, so the identity is asserted on
    // each record instead: the explicit f of equation (43) survives.
    const set = resolvedSet(3000, 7);
    const result = shortPathFieldStrength(inputs(set, { receiverGain: 0 }));
    for (const record of contributing(result)) {
      const ew = record.fieldStrengthDbuVPerM;
      const prw = record.receiverPowerDbW;
      if (ew === null || prw === null) throw new Error("no record");
      expect(ew - prw).toBeCloseTo(
        20 * Math.log10(7) + RECEIVER_POWER_CONSTANT_DB,
        PRECISION,
      );
    }
  });
});

describe("equations (28) and (44): the resultant of the circuit", () => {
  it("sums the contributing modes in power, not in decibels", () => {
    const set = resolvedSet(3000, 14);
    const result = shortPathFieldStrength(inputs(set, { receiverGain: 2 }));
    const modes = contributing(result);
    const es =
      10 *
      Math.log10(
        modes.reduce(
          (total, record) =>
            total + 10 ** ((record.fieldStrengthDbuVPerM ?? 0) / 10),
          0,
        ),
      );
    const pr =
      10 *
      Math.log10(
        modes.reduce(
          (total, record) =>
            total + 10 ** ((record.receiverPowerDbW ?? 0) / 10),
          0,
        ),
      );
    expect(result.fieldStrengthDbuVPerM).toBeCloseTo(es, PRECISION);
    expect(result.receiverPowerDbW).toBeCloseTo(pr, PRECISION);
  });

  it("lands between the strongest mode and the strongest plus 10 log n", () => {
    const set = resolvedSet(3000, 14);
    const result = shortPathFieldStrength(inputs(set));
    const strongest = Math.max(
      ...contributing(result).map(
        (record) => record.fieldStrengthDbuVPerM ?? -Infinity,
      ),
    );
    const n = result.contributingModes.length;
    expect(result.fieldStrengthDbuVPerM ?? -Infinity).toBeGreaterThanOrEqual(
      strongest,
    );
    expect(result.fieldStrengthDbuVPerM ?? Infinity).toBeLessThanOrEqual(
      strongest + 10 * Math.log10(n) + 1e-9,
    );
  });

  it("equals the single mode's own values when only one contributes", () => {
    const set = resolvedSet(3000, 14);
    const full = shortPathFieldStrength(inputs(set));
    const one = full.contributingModes[0];
    const trimmed: ResolvedModeSet = {
      ...set,
      modes: set.modes.filter((mode) => mode.label === one.label),
    };
    const result = shortPathFieldStrength(inputs(trimmed));
    expect(result.contributingModes).toHaveLength(1);
    expect(result.fieldStrengthDbuVPerM).toBe(one.fieldStrengthDbuVPerM);
    expect(result.receiverPowerDbW).toBe(one.receiverPowerDbW);
    expect(result.dominantMode?.label).toBe(one.label);
  });

  it("reports the strongest mode by Prw as the dominant one", () => {
    const set = resolvedSet(3000, 14);
    const result = shortPathFieldStrength(inputs(set));
    const strongest = Math.max(
      ...contributing(result).map(
        (record) => record.receiverPowerDbW ?? -Infinity,
      ),
    );
    expect(result.dominantMode?.receiverPowerDbW).toBe(strongest);
  });
});

describe("contract M07: which modes contribute", () => {
  it("gives a screened mode no field strength and no place in the sums", () => {
    // foE = 9 MHz at 10 MHz operating: equation (11) puts fs = 1.05 foE sec i
    // above the operating frequency for every F2 mode of this length.
    const set = resolvedSet(3000, 10, { foEMHz: 9 });
    const screened = set.modes.filter((mode) => mode.status === "screened");
    expect(screened.length).toBeGreaterThan(0);
    const result = shortPathFieldStrength(inputs(set));
    for (const mode of screened) {
      const record = result.modes.find((r) => r.label === mode.label);
      expect(record?.state).toBe("screened");
      expect(record?.fieldStrengthDbuVPerM).toBeNull();
      expect(record?.receiverPowerDbW).toBeNull();
      expect(record?.basicTransmissionLoss).toBeNull();
      expect(record?.noContributionReason).toContain("screened");
    }
    expect(
      result.contributingModes.some((record) =>
        screened.some((mode) => mode.label === record.label),
      ),
    ).toBe(false);
  });

  it("gives a geometrically unsupported mode no field strength either", () => {
    // 6 600 km, and the selection height is read at the Table 1c control point
    // with the lower foF2 because the path is longer than dmax. M(3000)F2 = 7
    // there puts that height at 1490/7 - 176 = 36.86 km, which closes no hop
    // this path has, and the section 5.1 height closes none of them either, so
    // the low-order modes are `no_reflection` with no geometry at all. That is
    // the only geometric reason `modeSet` can still emit after the deviation 3
    // ruling, and it is the one state in which a selected mode has no elevation
    // to take a budget at.
    const result5x = modeSet({
      route: routeOfLength(6600),
      frequencyMHz: 10,
      sample: (_point, label) => ({
        ...BASE_STATE,
        foF2MHz: 12,
        foEMHz: 3,
        m3000F2: label === "R - d0/2" ? 7 : 2.5,
        ...(label === "R - d0/2" ? { foF2MHz: 7 } : {}),
      }),
    });
    if (result5x.kind !== "resolved") {
      throw new Error(`fixture mode set is ${result5x.reason}`);
    }
    const set = result5x;
    const unsupported = set.modes.filter(
      (mode) => mode.status === "geometrically_unsupported",
    );
    expect(unsupported.length).toBeGreaterThan(0);
    // Deviation 3's invariant, stated where it bites: a mode with no geometry
    // at all carries `no_reflection` and nothing else. The other unsupported
    // modes here are hop-length refusals, and they do keep a geometry.
    const withoutGeometry = unsupported.filter(
      (mode) => mode.elevationRad === null,
    );
    expect(withoutGeometry.length).toBeGreaterThan(0);
    expect(
      withoutGeometry.every(
        (mode) => mode.unsupportedReason === "no_reflection",
      ),
    ).toBe(true);
    const result = shortPathFieldStrength(inputs(set, {}, routeOfLength(6600)));
    for (const mode of unsupported) {
      const record = result.modes.find((r) => r.label === mode.label);
      expect(record?.state).toBe("geometrically_unsupported");
      expect(record?.fieldStrengthDbuVPerM).toBeNull();
      expect(record?.receiverPowerDbW).toBeNull();
      expect(record?.noContributionReason).toContain(
        mode.unsupportedReason ?? "",
      );
    }
    expect(
      result.contributingModes.some((record) =>
        unsupported.some((mode) => mode.label === record.label),
      ),
    ).toBe(false);
  });

  it("gives a mode on deviation 3's fallback geometry a full budget", () => {
    // 3 800 km with M(3000)F2 = 2.2: equation (2)'s height is capped at 500 km
    // and reflects a one-hop mode, while section 5.1's height for that hop is
    // 283.1 km and cannot (a 3 800 km hop needs 294.2 km to close at all). Before the ruling of `modeSet.ts` deviation 3 that
    // made 1F2 `mirror_height_cannot_close_hop`, with no elevation and no
    // contribution; section 5.2.1 says the mode exists, so it now contributes
    // at the selection geometry and its budget is taken there like any other
    // mode's. This is the whole effect of the ruling on slice C, measured.
    const set = resolvedSet(3800, 10, { m3000F2: 2.2 });
    const fallback = set.modes.filter(
      (mode) => mode.elevationSource === "selection_height",
    );
    expect(fallback.map((mode) => mode.label)).toEqual(["1F2"]);
    const oneF2 = fallback[0];
    expect(oneF2.status).toBe("supported");
    expect(oneF2.elevationDeg).toBe(oneF2.selectionElevationDeg);
    expect(oneF2.virtualSlantRangeKm).toBe(oneF2.selectionSlantRangeKm);
    expect(oneF2.mirrorHeightKm).toBeCloseTo(283.1, 1);

    const result = shortPathFieldStrength(inputs(set));
    const record = result.modes.find((r) => r.label === "1F2");
    expect(record?.state).not.toBe("geometrically_unsupported");
    expect(record?.fieldStrengthDbuVPerM).not.toBeNull();
    expect(record?.receiverPowerDbW).not.toBeNull();
    expect(record?.noContributionReason).toBeNull();
    expect(result.contributingModes.some((r) => r.label === "1F2")).toBe(true);

    // Equation (18)'s free-space term is taken over the fallback slant range,
    // not over a number from a height that closed nothing.
    expect(record?.basicTransmissionLoss?.freeSpaceDb).toBeCloseTo(
      FREE_SPACE_CONSTANT_DB +
        20 * Math.log10(10) +
        20 * Math.log10(oneF2.selectionSlantRangeKm as number),
      PRECISION,
    );

    // And what the mode is worth: equation (28) over the whole set with and
    // without it. The `without` figure is what the pre-ruling leaf returned.
    const withoutMode =
      10 *
      Math.log10(
        result.contributingModes
          .filter((r) => r.label !== "1F2")
          .reduce(
            (total, r) =>
              total + 10 ** ((r.fieldStrengthDbuVPerM as number) / 10),
            0,
          ),
      );
    expect(result.fieldStrengthDbuVPerM).toBeGreaterThan(withoutMode);
  });

  it("keeps a mode above its basic MUF, with the loss of equations (24) to (26)", () => {
    const set = resolvedSet(3000, 30);
    const result = shortPathFieldStrength(inputs(set));
    const above = result.modes.filter(
      (record) => record.state === "above_basic_muf_with_loss",
    );
    expect(above.length).toBeGreaterThan(0);
    for (const record of above) {
      const expected = aboveMufLoss({
        layer: record.layer,
        frequencyMHz: 30,
        basicMufMHz: record.basicMufMHz,
      });
      expect(record.aboveMuf?.lossDb).toBeCloseTo(expected.lossDb, PRECISION);
      expect(record.basicTransmissionLoss?.aboveMufDb).toBeCloseTo(
        expected.lossDb,
        PRECISION,
      );
      expect(expected.lossDb).toBeGreaterThan(0);
      expect(record.fieldStrengthDbuVPerM).not.toBeNull();
      expect(
        result.contributingModes.some((r) => r.label === record.label),
      ).toBe(true);
    }
  });

  it("calls a mode at or below its basic MUF supported, with no above-MUF loss", () => {
    const set = resolvedSet(3000, 10);
    const result = shortPathFieldStrength(inputs(set));
    const below = result.modes.filter((record) => record.state === "supported");
    expect(below.length).toBeGreaterThan(0);
    for (const record of below) {
      expect(record.aboveMuf?.aboveBasicMuf).toBe(false);
      expect(record.basicTransmissionLoss?.aboveMufDb).toBe(0);
    }
  });

  it("names a selected mode whose absorption has no ray, and drops it", () => {
    // A 3 900 km one-hop F2 mode that section 5.2.1 really does select: both
    // heights reach it, equation (2)'s 500 km and section 5.1's 452.4 km. The
    // fixed 300 km penetration geometry of section 5.2.2 grazes out at
    // 3 835.8 km, so `absorptionLoss` has no ray to take on this one hop.
    const set = resolvedSet(3900, 10, {
      m3000F2: 2,
      foF2MHz: 6,
      foEMHz: 1.2,
    });
    expect(set.modes.find((mode) => mode.label === "1F2")?.status).toBe(
      "supported",
    );
    const result = shortPathFieldStrength(inputs(set));
    const unevaluated = result.unevaluatedModes;
    expect(unevaluated.map((record) => record.label)).toContain("1F2");
    for (const record of unevaluated) {
      expect(record.state).toBe("absorption_unavailable");
      expect(record.fieldStrengthDbuVPerM).toBeNull();
      expect(record.receiverPowerDbW).toBeNull();
      expect(
        result.contributingModes.some((r) => r.label === record.label),
      ).toBe(false);
    }
    expect(result.assumptions.join(" ")).toContain("absorption could not be");
  });
});

describe("the antennas are the caller's", () => {
  it("defaults to one kilowatt and an isotropic radiator at each end", () => {
    const set = resolvedSet(3000, 14);
    const result = shortPathFieldStrength(inputs(set));
    expect(result.transmitterPowerDbKw).toBe(0);
    for (const record of contributing(result)) {
      expect(record.transmitterGainDbi).toBe(0);
      expect(record.receiverGainDbi).toBe(0);
    }
    expect(result.assumptions.join(" ")).toContain("isotropic");
  });

  it("asks a gain function at each mode's own section 5.1 elevation", () => {
    const set = resolvedSet(3000, 14);
    const seen: { label: string; elevationDeg: number }[] = [];
    const result = shortPathFieldStrength(
      inputs(set, {
        transmitterGain: (context) => {
          seen.push({
            label: context.label,
            elevationDeg: context.elevationDeg,
          });
          return context.elevationDeg;
        },
        receiverGain: (context) => context.hopCount,
      }),
    );
    for (const record of contributing(result)) {
      const mode = set.modes.find((m) => m.label === record.label);
      if (mode === undefined) throw new Error("no mode");
      expect(record.transmitterGainDbi).toBeCloseTo(
        mode.elevationDeg ?? Number.NaN,
        PRECISION,
      );
      expect(record.receiverGainDbi).toBe(mode.hopCount);
      expect(
        seen.some(
          (entry) =>
            entry.label === record.label &&
            Math.abs(entry.elevationDeg - (mode.elevationDeg ?? 0)) < 1e-12,
        ),
      ).toBe(true);
    }
  });
});

describe("section 6: the distance range of the power", () => {
  it("labels a path up to 7 000 km as the final short-path power", () => {
    expect(RECEIVER_POWER_MAX_KM).toBe(7000);
    const result = shortPathFieldStrength(inputs(resolvedSet(6000, 14)));
    expect(result.powerRange).toBe("up_to_7000_km");
  });

  it("labels a path past 7 000 km as a term of the equation (42) blend", () => {
    const result = shortPathFieldStrength(inputs(resolvedSet(8000, 14)));
    expect(result.powerRange).toBe("blend_7000_to_9000_km");
    expect(result.receiverPowerDbW).not.toBeNull();
  });
});

describe("the absorption ray path above the basic MUF", () => {
  it("uses the caller's basic-MUF elevation when one is supplied", () => {
    const set = resolvedSet(3000, 30);
    const asIs = shortPathFieldStrength(inputs(set));
    const frozen = shortPathFieldStrength(
      inputs(set, {
        basicMufElevationRad: (mode: PropagationMode) =>
          (mode.elevationRad ?? 0) * 1.2,
      }),
    );
    const moved = frozen.contributingModes.filter((record, i) => {
      const before = asIs.contributingModes[i].basicTransmissionLoss;
      return (
        record.basicTransmissionLoss?.absorptionDb !== before?.absorptionDb
      );
    });
    expect(moved.length).toBeGreaterThan(0);
    expect(frozen.assumptions.join(" ")).not.toContain(
      "absorption ray path was taken at the operating frequency",
    );
  });

  it("does not consult the caller's elevation at or below the basic MUF", () => {
    // 3000 km at 14 MHz mixes modes on both sides of their basic MUF. The
    // rule after equation (23) applies above it only, so the callback is
    // consulted for exactly those modes and the others keep the
    // operating-frequency ray path untouched.
    const set = resolvedSet(3000, 14);
    const above = set.supportedModes
      .filter((m) => 14 > m.basicMufMHz)
      .map((m) => m.label);
    const atOrBelow = new Set(
      set.supportedModes.filter((m) => 14 <= m.basicMufMHz).map((m) => m.label),
    );
    expect(atOrBelow.size).toBeGreaterThan(0);
    const asIs = shortPathFieldStrength(inputs(set));
    const consulted: string[] = [];
    const withCallback = shortPathFieldStrength(
      inputs(set, {
        basicMufElevationRad: (mode: PropagationMode) => {
          consulted.push(mode.label);
          return (mode.elevationRad ?? 0) * 1.2;
        },
      }),
    );
    expect(consulted).toEqual(above);
    withCallback.contributingModes.forEach((record, i) => {
      if (!atOrBelow.has(record.label)) return;
      expect(record.basicTransmissionLoss?.absorptionDb).toBe(
        asIs.contributingModes[i].basicTransmissionLoss?.absorptionDb,
      );
    });
    expect(withCallback.assumptions.join(" ")).not.toContain(
      "absorption ray path was taken at the operating frequency",
    );
  });

  it("declares the substitution when the caller supplies none", () => {
    const result = shortPathFieldStrength(inputs(resolvedSet(3000, 30)));
    expect(result.assumptions.join(" ")).toContain(
      "absorption ray path was taken at the operating frequency",
    );
  });
});

describe("the auroral loss reaches equation (18)", () => {
  it("carries a non-zero Lh into the total on a polar path", () => {
    const set = resolvedSet(POLAR.groundDistanceKm, 14, {}, POLAR);
    const result = shortPathFieldStrength(inputs(set, {}, POLAR));
    const withAuroral = contributing(result).filter(
      (record) => (record.auroral?.lossDb ?? 0) > 0,
    );
    expect(withAuroral.length).toBeGreaterThan(0);
    for (const record of withAuroral) {
      expect(record.basicTransmissionLoss?.auroralDb).toBe(
        record.auroral?.lossDb,
      );
    }
  });

  it("is zero on an equatorial path, where Table 2 has no rows", () => {
    const result = shortPathFieldStrength(inputs(resolvedSet(3000, 14)));
    for (const record of contributing(result)) {
      expect(record.auroral?.lossDb).toBe(0);
    }
  });
});

describe("domain checks", () => {
  it("rejects a mode set resolved for a different route", () => {
    const set = resolvedSet(3000, 14);
    expect(() =>
      shortPathFieldStrength(inputs(set, {}, routeOfLength(4000))),
    ).toThrow(RangeError);
    expect(() =>
      shortPathFieldStrength(
        inputs(set, {}, routeOfLength(set.groundDistanceKm)),
      ),
    ).not.toThrow();
  });

  it("rejects a mode set combined with a different circuit of the same ground distance", () => {
    // Same length as the fixture's equatorial route (3000 km) but a
    // different pair of endpoints, so groundDistanceKm alone cannot tell
    // the two routes apart; the origin/tangent check must.
    const set = resolvedSet(3000, 14);
    const sameLengthOtherCircuit = routeOfLengthFrom(
      { latitudeDeg: 10, longitudeDeg: 0 },
      { latitudeDeg: 10, longitudeDeg: 40 },
      set.groundDistanceKm,
    );
    expect(() =>
      shortPathFieldStrength(inputs(set, {}, sameLengthOtherCircuit)),
    ).toThrow(/routeOrigin|routeTangent/);
  });

  it("accepts the same route object and an equal-geometry copy", () => {
    const pathRoute = routeOfLength(3000);
    const set = resolvedSet(3000, 14, {}, pathRoute);
    expect(() =>
      shortPathFieldStrength(inputs(set, {}, pathRoute)),
    ).not.toThrow();
    const equalGeometryCopy: ResolvedRoute = { ...pathRoute };
    expect(() =>
      shortPathFieldStrength(inputs(set, {}, equalGeometryCopy)),
    ).not.toThrow();
  });

  it("rejects a month index outside 0 to 11", () => {
    const set = resolvedSet(3000, 14);
    expect(() =>
      shortPathFieldStrength(inputs(set, { monthIndex: 12 })),
    ).toThrow(RangeError);
    expect(() =>
      shortPathFieldStrength(inputs(set, { monthIndex: -1 })),
    ).toThrow(RangeError);
  });

  it("rejects a non-finite or negative sunspot number", () => {
    const set = resolvedSet(3000, 14);
    expect(() =>
      shortPathFieldStrength(inputs(set, { ssn: Number.NaN })),
    ).toThrow(RangeError);
    expect(() => shortPathFieldStrength(inputs(set, { ssn: -1 }))).toThrow(
      RangeError,
    );
    expect(() => shortPathFieldStrength(inputs(set, { ssn: 0 }))).not.toThrow();
  });

  it("rejects a non-finite hour or transmitter power", () => {
    const set = resolvedSet(3000, 14);
    expect(() =>
      shortPathFieldStrength(inputs(set, { utcHours: Number.NaN })),
    ).toThrow(RangeError);
    expect(() =>
      shortPathFieldStrength(
        inputs(set, { transmitterPowerDbKw: Number.POSITIVE_INFINITY }),
      ),
    ).toThrow(RangeError);
  });

  it("rejects a non-finite fixed antenna gain", () => {
    const set = resolvedSet(3000, 14);
    expect(() =>
      shortPathFieldStrength(inputs(set, { transmitterGain: Number.NaN })),
    ).toThrow(RangeError);
    expect(() =>
      shortPathFieldStrength(
        inputs(set, { receiverGain: Number.POSITIVE_INFINITY }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      shortPathFieldStrength(inputs(set, { transmitterGain: 0 })),
    ).not.toThrow();
  });

  it("rejects a non-finite antenna gain returned by a per-mode callback", () => {
    const set = resolvedSet(3000, 14);
    expect(() =>
      shortPathFieldStrength(
        inputs(set, { transmitterGain: () => Number.NaN }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      shortPathFieldStrength(
        inputs(set, { receiverGain: () => Number.NEGATIVE_INFINITY }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      shortPathFieldStrength(inputs(set, { transmitterGain: () => 0 })),
    ).not.toThrow();
  });
});
