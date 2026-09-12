// @vitest-environment node
//
// Deliberately node, for the same reason `parity.modeSet.test.ts` is: the same
// leaf must answer identically on a server and in a browser, and the CCIR
// coefficient asset is read from disk here.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import golden from "../../../../ml/propagation_validation/reference/golden-v1.json";
import fixtures from "@/lib/propagation/fixtures/p533-short-field-strength.cases.json";
import manifest from "@/lib/propagation/ionosphere/assets/manifest.json";
import type { AssetByteSource } from "@/lib/propagation/ionosphere/assets/loader";
import {
  createCcirIonosphereProvider,
  type IonosphereProvider,
} from "@/lib/propagation/ionosphere/provider";
import {
  canonicalCoordinates,
  known,
} from "@/lib/propagation/ionosphere/types";
import {
  resolveRoute,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import { absorptionLoss, type PenetrationPointSampler } from "./absorptionLoss";
import {
  shortPathFieldStrength,
  RECEIVER_POWER_CONSTANT_DB,
  type ModeFieldStrength,
  type ShortPathFieldStrength,
} from "./fieldStrengthShort";
import {
  modeSet,
  type ModeControlPointSampler,
  type ResolvedModeSet,
} from "./modeSet";
import type { PropagationLayer, PropagationMode } from "./modeTypes";

/**
 * Parity of the section 5.2.2 field strength and the section 6 receiver power
 * against the pinned ITU reference build, on the 22 golden circuits at or
 * under the 9 000 km limit of the short-path method.
 *
 * WHAT IS ASSERTED AS PARITY IS NOT THE SHIPPED DIFFERENCE. Four of this
 * slice's readings of the recommendation disagree with the pinned build, three
 * of them move the field strength here, and a tolerance wide enough to pass the
 * raw difference would hide both the deviations and any real error. So each
 * case carries three columns and the test asserts the third: our Es with the
 * reference's Lz, the reference's above-the-MUF loss and the reference's
 * equation (2) geometry substituted in. The fixture's `what_is_compared`
 * defines all three and the first two tests read those definitions back out, so
 * that the meaning of a green run cannot drift away from the file.
 *
 * THE BUDGET IS DERIVED, NOT CHOSEN. Per case it is
 * `absorption_fit_db + auroral_band_factor * max_auroral_loss_db`: 0.25 dB is
 * the declared acceptance tolerance of the D-region absorption fit, the only
 * term of equation (18) that is a fit rather than a closed formula, and the
 * auroral term is a table lookup that can be wrong by its own size when the
 * reference's three truncations of the mid-path local time land in a different
 * column. `tolerance_derivation` carries the argument and the evidence for it.
 *
 * TWO CASES ARE NOT COVERED BY THE BUDGET AT ALL. G11 and G14 each have a 2F2
 * mode that section 5.2.1 selects at the equation (2) height and whose section
 * 5.1 height cannot close the hop, so slice B labels it
 * `mirror_height_cannot_close_hop` and it contributes nothing here while the
 * reference keeps it. Substituting the reference's geometry into our result
 * cannot put back a mode that was never evaluated, so those two are asserted
 * against the divergence bound instead, and the test reads which cases they are
 * from the mode set rather than from a case id written into the test.
 *
 * `parity_is_partial` states the seven things this corpus cannot prove. The
 * loudest of them: the oracle publishes one mode per circuit and only inside
 * 7 000 km, so nothing here measures the other three to eight modes of the sum.
 */
const assetBytes: AssetByteSource = async () => {
  const file = path.join(process.cwd(), manifest.asset.path);
  const bytes = await readFile(file);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
};

type Case = (typeof fixtures.cases)[number];

const TOL = fixtures.tolerances;
const BOUNDS = fixtures.reference_divergence.bounds;

/** Section 6's boundary, restated to read the fixture's `power_range`. */
const SECTION_6_BOUNDARY_KM = 7000;

/** The short-path limit of section 5.2, restated to re-derive the selection. */
const SHORT_PATH_LIMIT_KM = 9000;

function validAtOf(testCase: Case): string {
  const { year, month, hour_utc: hour } = testCase.inputs;
  return (
    `${String(year)}-${String(month).padStart(2, "0")}-15T` +
    `${String(hour).padStart(2, "0")}:00:00Z`
  );
}

/**
 * The reference's own above-the-MUF loss, written out here from
 * `MedianSkywaveFieldStrengthShort.c` rather than imported, so that the
 * substitution is an independent statement about the reference and not a
 * restatement of our own leaf. `losses.ts` deviations 2 and 3 quote the
 * published equations (25) and (26) these three lines replace.
 */
function referenceAboveMufLossDb(
  layer: PropagationLayer,
  frequencyMHz: number,
  basicMufMHz: number,
  groundDistanceKm: number,
): number {
  const ratio = frequencyMHz / basicMufMHz;
  if (ratio <= 1) return 0;
  if (layer === "E") return Math.min(46 * Math.sqrt(ratio - 1) + 5, 58);
  if (groundDistanceKm <= 3000) {
    return Math.min(36 * Math.sqrt(ratio - 1) + 5, 60);
  }
  return Math.min(70 * (ratio - 1) + 8, 80);
}

interface Solved {
  readonly distanceKm: number;
  readonly modes: ResolvedModeSet;
  readonly result: ShortPathFieldStrength;
  /** The mode the oracle names, or null where it names none or we lack it. */
  readonly namedMode: ModeFieldStrength | null;
  /** Es with the reference's Lz, its Lm and its equation (2) geometry. */
  readonly fieldStrengthRefGeometryDb: number | null;
  /** Equation (18) for the named mode, under the same substitutions. */
  readonly namedModeLbRefGeometryDb: number | null;
}

/**
 * The substitution, in one place.
 *
 * Three differences are put back on every contributing mode: Lz 8.72 -> 9.14,
 * our equations (25)/(26) -> the reference's formulas, and the section 5.1
 * geometry -> the equation (2) geometry, the last of which moves 20 log10 p'
 * (equation 19), the elevation that sets the angle of incidence in the
 * absorption, and the height the penetration points are taken at. What is left
 * is this slice's arithmetic against the oracle's.
 */
function referenceGeometryShiftDb(
  mode: PropagationMode,
  field: ModeFieldStrength,
  testCase: Case,
  absorptionSample: PenetrationPointSampler,
  route: ResolvedRoute,
): number | null {
  if (
    mode.selectionSlantRangeKm === null ||
    mode.selectionElevationDeg === null ||
    field.virtualSlantRangeKm === null ||
    field.basicTransmissionLoss === null
  ) {
    return null;
  }
  const selectionElevationRad = (mode.selectionElevationDeg * Math.PI) / 180;
  const absorption = absorptionLoss({
    route,
    hopCount: mode.hopCount,
    frequencyMHz: testCase.inputs.frequency_mhz,
    monthIndex: testCase.inputs.month - 1,
    ssn: testCase.inputs.sunspot_number,
    rayPathElevationRad: selectionElevationRad,
    sample: absorptionSample,
    penetrationReflectionHeightKm: mode.selectionMirrorHeightKm,
  });
  if (absorption.kind !== "absorption") return null;
  return (
    20 * Math.log10(mode.selectionSlantRangeKm / field.virtualSlantRangeKm) +
    (absorption.lossDb - field.basicTransmissionLoss.absorptionDb) +
    (referenceAboveMufLossDb(
      field.layer,
      testCase.inputs.frequency_mhz,
      field.basicMufMHz,
      route.groundDistanceKm,
    ) -
      (field.aboveMuf?.lossDb ?? 0)) +
    // Lz, the reference's 9.14 against the published 8.72.
    0.42
  );
}

const solved = new Map<string, Solved>();

function solve(provider: IonosphereProvider, testCase: Case): Solved {
  const cached = solved.get(testCase.case_id);
  if (cached !== undefined) return cached;

  const { inputs } = testCase;
  const route = resolveRoute(
    { latitudeDeg: inputs.tx_lat, longitudeDeg: inputs.tx_lon },
    { latitudeDeg: inputs.rx_lat, longitudeDeg: inputs.rx_lon },
    { direction: "short" },
  );
  if (route.kind !== "resolved") {
    throw new Error(`${testCase.case_id}: ${route.detail}`);
  }
  const validAt = validAtOf(testCase);
  const stateAt = (latitudeDeg: number, longitudeDeg: number) =>
    provider.state({
      coordinates: canonicalCoordinates(latitudeDeg, longitudeDeg),
      validAt,
      r12: known(inputs.sunspot_number),
      // The oracle's own convention. See the fixture's `provider_mode` note.
      mode: "reference",
    });

  const sample: ModeControlPointSampler = (point) => {
    const state = stateAt(point.latitudeDeg, point.longitudeDeg);
    return {
      foF2MHz: state.foF2MHz,
      m3000F2: state.m3000F2,
      foEMHz: state.foEMHz,
      gyrofrequency300kmMHz: state.gyrofrequency300kmMHz,
      r12: state.solarIndex.r12,
    };
  };
  const modes = modeSet({
    route,
    frequencyMHz: inputs.frequency_mhz,
    sample,
  });
  if (modes.kind !== "resolved") {
    throw new Error(`${testCase.case_id}: ${modes.detail}`);
  }

  const absorptionSample: PenetrationPointSampler = (query) => {
    const state = stateAt(query.point.latitudeDeg, query.point.longitudeDeg);
    return {
      foEMHz: state.foEMHz,
      zenithAngleDeg: state.solar.zenithAngleDeg,
      zenithNoonAngleDeg: Math.abs(
        query.point.latitudeDeg - state.solar.declinationDeg,
      ),
      longitudinalGyrofrequencyMHz: state.longitudinalGyrofrequency100kmMHz,
    };
  };

  const result = shortPathFieldStrength({
    route,
    modes,
    monthIndex: inputs.month - 1,
    utcHours: inputs.hour_utc,
    ssn: inputs.sunspot_number,
    absorptionSample,
    // The oracle's own conversion of watts to dB(1 kW). Both gains are left at
    // their isotropic defaults, which is what the golden antennas block is.
    transmitterPowerDbKw: 10 * Math.log10(inputs.tx_power_watts / 1000),
  });

  const namedMode =
    testCase.expected.dominant_mode === null
      ? null
      : (result.modes.find(
          (mode) => mode.label === testCase.expected.dominant_mode,
        ) ?? null);

  let sumRefGeometry = 0;
  let refGeometryComplete = true;
  for (const field of result.contributingModes) {
    const mode = modes.modes.find((m) => m.label === field.label);
    const shift =
      mode === undefined
        ? null
        : referenceGeometryShiftDb(
            mode,
            field,
            testCase,
            absorptionSample,
            route,
          );
    if (shift === null || field.fieldStrengthDbuVPerM === null) {
      refGeometryComplete = false;
      break;
    }
    sumRefGeometry += 10 ** ((field.fieldStrengthDbuVPerM - shift) / 10);
  }

  let namedModeLbRefGeometryDb: number | null = null;
  if (namedMode !== null && namedMode.basicTransmissionLoss !== null) {
    const mode = modes.modes.find((m) => m.label === namedMode.label);
    const shift =
      mode === undefined
        ? null
        : referenceGeometryShiftDb(
            mode,
            namedMode,
            testCase,
            absorptionSample,
            route,
          );
    if (shift !== null) {
      namedModeLbRefGeometryDb = namedMode.basicTransmissionLoss.lossDb + shift;
    }
  }

  const record: Solved = {
    distanceKm: route.groundDistanceKm,
    modes,
    result,
    namedMode,
    fieldStrengthRefGeometryDb:
      refGeometryComplete && sumRefGeometry > 0
        ? 10 * Math.log10(sumRefGeometry)
        : null,
    namedModeLbRefGeometryDb,
  };
  solved.set(testCase.case_id, record);
  return record;
}

/** The per-case budget, read out of the fixture rather than written here. */
function budgetDb(testCase: Case): number {
  return (
    TOL.absorption_fit_db +
    TOL.auroral_band_factor * testCase.reading.max_auroral_loss_db
  );
}

/**
 * Every number in a result, by path, so that a NaN cannot hide in a field no
 * test happens to name. Deliberately structural rather than a list of fields:
 * a field added later is swept without anyone remembering to add it.
 */
function nonFinitePaths(value: unknown, at: string): string[] {
  if (typeof value === "number") {
    return Number.isFinite(value) ? [] : [`${at} = ${String(value)}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      nonFinitePaths(item, `${at}[${String(index)}]`),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      nonFinitePaths(item, `${at}.${key}`),
    );
  }
  return [];
}

describe("P.533-14 short-path field strength parity with the ITU reference", () => {
  let provider: IonosphereProvider;

  beforeAll(async () => {
    provider = await createCcirIonosphereProvider(assetBytes);
  });

  it("keeps exactly the circuits the short-path method applies to", () => {
    expect(fixtures.case_count).toBe(fixtures.cases.length);
    expect(fixtures.cases.length).toBe(22);
    expect(fixtures.reference_commit).toBe(
      "cd172be56dc04b154e5d2fa91cbaa6ecf5284305",
    );

    // The selection is observable in the oracle and not a choice: the cases
    // left out are exactly the ones past 9 000 km, and on those the oracle has
    // no short-path field strength at all, only its -307 sentinel.
    const kept = new Set(fixtures.cases.map((c) => c.case_id));
    for (const goldenCase of golden.cases) {
      const outputs = goldenCase.outputs as unknown as {
        distance: number;
        Es: number;
      };
      if (kept.has(goldenCase.case_id)) {
        expect(outputs.distance).toBeLessThanOrEqual(SHORT_PATH_LIMIT_KM);
        expect(outputs.Es).toBeGreaterThan(-300);
      } else {
        expect(outputs.distance).toBeGreaterThan(SHORT_PATH_LIMIT_KM);
        expect(outputs.Es).toBe(-307);
      }
    }
  });

  it("declares what this corpus cannot prove", () => {
    // The two things a reader must not take from a green run: that the shipped
    // field strength matches the oracle, and that the sum being right means the
    // modes inside it are.
    expect(fixtures.parity_is_partial).toContain("DECLARED LIMITATION");
    expect(fixtures.parity_is_partial).toContain("one mode per circuit");
    expect(fixtures.parity_is_partial).toContain("no column for Li");
    expect(fixtures.parity_is_partial).toContain("isotropic at both ends");
    expect(fixtures.parity_is_partial).toContain("absorption_unavailable");
    expect(fixtures.reference_divergence.what_this_is).toContain(
      "NOT A PARITY COLUMN",
    );
    expect(fixtures.what_is_compared.field_strength_delta_db).toContain(
      "DECLARED AND NOT ASSERTED AS PARITY",
    );
    expect(
      fixtures.what_is_compared.field_strength_delta_with_reference_geometry_db,
    ).toContain("THIS IS THE PARITY COLUMN");

    // And the claims about the corpus are true of the corpus, not just written
    // down: the oracle names no mode past 7 000 km, and it has no per-term
    // column for any of the five losses of equation (18).
    const outputs = golden.cases[0].outputs as unknown as Record<
      string,
      unknown
    >;
    for (const term of ["Li", "Lm", "Lg", "Lh", "Lz"]) {
      expect(Object.keys(outputs)).not.toContain(term);
    }
    for (const testCase of fixtures.cases) {
      const past7000 = testCase.expected.distance_km > SECTION_6_BOUNDARY_KM;
      expect(testCase.expected.dominant_mode === null).toBe(past7000);
    }
    expect(
      fixtures.cases.filter((c) => c.expected.dominant_mode !== null).length,
    ).toBe(14);
    // Isotropic at both ends on every case, which is why no gain pattern is
    // exercised anywhere in this file.
    for (const testCase of fixtures.cases) {
      expect(testCase.expected.receiver_gain_dbi).toBe(0);
    }
  });

  it("states where its tolerances come from", () => {
    expect(fixtures.tolerance_derivation).toContain("absorption-model.json");
    expect(fixtures.tolerance_derivation).toContain("lookup, not a formula");
    expect(fixtures.tolerance_derivation).toContain("0.073");
    expect(TOL.absorption_fit_db).toBe(0.25);
    expect(TOL.auroral_band_factor).toBe(1);
    // The budget is a rule over an observable, not a per-case number someone
    // could widen for one case: every case is scored by the same two constants.
    expect(TOL.per_case_rule).toContain("max_auroral_loss_db");
    // And the wide divergence bounds are declared as drift detectors rather
    // than as tolerances, which is the distinction the whole file rests on.
    expect(BOUNDS.derivation).toContain("drift detectors");
  });

  /**
   * The oracle's statement about itself, which needs none of our code.
   *
   * Equation (43) with Grw = 0 is `PR = Ep - 20 log10 f - 107.2`, and the
   * golden file satisfies it on all 30 cases to the rounding of its own
   * two-decimal columns. That pins the constant 107.2, pins the reference plane
   * (the power is available power at a lossless isotropic antenna), and shows
   * that the oracle's power comes from the blended Ep and not from Es, which is
   * what `fieldStrengthShort.ts` deviation 2 reads.
   */
  it("reproduces the oracle's own power identity from the oracle", () => {
    let worst = 0;
    for (const goldenCase of golden.cases) {
      const outputs = goldenCase.outputs as unknown as {
        PR: number;
        Ep: number;
        Grw: number;
      };
      const inputs = goldenCase.inputs as unknown as { frequency_mhz: number };
      const identity =
        outputs.Grw -
        20 * Math.log10(inputs.frequency_mhz) -
        RECEIVER_POWER_CONSTANT_DB;
      worst = Math.max(worst, Math.abs(outputs.PR - outputs.Ep - identity));
    }
    expect(worst).toBeLessThanOrEqual(TOL.power_identity_db);
    expect(worst).toBeCloseTo(fixtures.observed_max_delta.power_identity_db, 4);

    // And the one exact statement the corpus makes about Pt: G28 is G04 at
    // 1 kW instead of 100 W, on the same circuit at the same hour.
    const g04 = golden.cases.find((c) => c.case_id === "G04");
    const g28 = golden.cases.find((c) => c.case_id === "G28");
    expect(g04).toBeDefined();
    expect(g28).toBeDefined();
    const a = (g04 as NonNullable<typeof g04>).outputs as unknown as {
      Es: number;
      Ep: number;
      PR: number;
    };
    const b = (g28 as NonNullable<typeof g28>).outputs as unknown as {
      Es: number;
      Ep: number;
      PR: number;
    };
    expect(Math.abs(b.Es - a.Es - 10)).toBeLessThanOrEqual(
      TOL.power_scaling_identity_db,
    );
    expect(Math.abs(b.Ep - a.Ep - 10)).toBeLessThanOrEqual(
      TOL.power_scaling_identity_db,
    );
    expect(Math.abs(b.PR - a.PR - 10)).toBeLessThanOrEqual(
      TOL.power_scaling_identity_db,
    );
  });

  /**
   * The same 10 dB, through our own equations (17) and (43) rather than the
   * oracle's columns, and equation (43) itself as an identity on real modes.
   *
   * Neither statement needs the oracle, and neither is inside any tolerance:
   * Prw - Ew is `Grw - 20 log10 f - 107.2` exactly, on every contributing mode
   * of every case, and doubling nothing but Pt moves every field strength and
   * every power by exactly the same amount.
   */
  it("holds equations (43) and (17) exactly on its own output", () => {
    const g04 = fixtures.cases.find((c) => c.case_id === "G04");
    const g28 = fixtures.cases.find((c) => c.case_id === "G28");
    expect(g04).toBeDefined();
    expect(g28).toBeDefined();
    const low = solve(provider, g04 as Case);
    const high = solve(provider, g28 as Case);
    expect(
      (high.result.fieldStrengthDbuVPerM as number) -
        (low.result.fieldStrengthDbuVPerM as number),
    ).toBeCloseTo(10, 9);
    expect(
      (high.result.receiverPowerDbW as number) -
        (low.result.receiverPowerDbW as number),
    ).toBeCloseTo(10, 9);

    for (const testCase of fixtures.cases) {
      const solution = solve(provider, testCase);
      const identity =
        -20 * Math.log10(testCase.inputs.frequency_mhz) -
        RECEIVER_POWER_CONSTANT_DB;
      for (const mode of solution.result.contributingModes) {
        // Grw is 0 dBi here, the corpus's own antenna.
        expect(mode.receiverGainDbi).toBe(0);
        expect(
          (mode.receiverPowerDbW as number) -
            (mode.fieldStrengthDbuVPerM as number),
        ).toBeCloseTo(identity, 9);
      }
    }
  });

  /**
   * The tight gate, and a different claim from the per-case budgets.
   *
   * On the cases with no auroral loss at all, the budget collapses to the
   * absorption fit's 0.25 dB and the agreement is an order of magnitude better
   * than that. Losing it would still pass every per-case check, so it is
   * asserted separately: a systematic tenth of a decibel in equation (18)
   * fails here and nowhere else.
   */
  it("agrees to a tenth of a decibel where there is no auroral loss", () => {
    let worst = 0;
    let cases = 0;
    for (const testCase of fixtures.cases) {
      if (testCase.reading.max_auroral_loss_db !== 0) continue;
      if (testCase.reading.unclosed_hop_modes.length > 0) continue;
      const solution = solve(provider, testCase);
      expect(solution.fieldStrengthRefGeometryDb).not.toBeNull();
      worst = Math.max(
        worst,
        Math.abs(
          (solution.fieldStrengthRefGeometryDb as number) -
            testCase.expected.field_strength_dbuv_per_m,
        ),
      );
      cases += 1;
    }
    expect(cases).toBe(7);
    // Measured 0.1343 dB on 2026-09-12 (G10); this is that with a little
    // headroom, and it is 56 per cent of the absorption fit's own tolerance.
    expect(worst).toBeLessThanOrEqual(0.14);
    expect(worst).toBeCloseTo(
      fixtures.observed_max_delta
        .field_strength_with_reference_geometry_db_zero_auroral_cases,
      3,
    );
  });

  it.each(fixtures.cases.map((c) => [c.case_id, c] as const))(
    "%s",
    (_id, testCase) => {
      const solution = solve(provider, testCase);
      const { expected, reading, divergence } = testCase;

      expect(
        Math.abs(solution.distanceKm - expected.distance_km),
      ).toBeLessThanOrEqual(0.1);

      // Section 6's boundary, and the label that says whether Pr is the
      // circuit's answer or the short-path term of equation (42).
      expect(solution.result.powerRange).toBe(reading.power_range);
      expect(reading.power_range).toBe(
        expected.distance_km <= SECTION_6_BOUNDARY_KM
          ? "up_to_7000_km"
          : "blend_7000_to_9000_km",
      );

      // The mode set this field strength was summed over, so that a change in
      // which modes contribute cannot pass as a change in the arithmetic.
      expect(solution.modes.modes.length).toBe(reading.mode_count);
      expect(solution.result.contributingModes.length).toBe(
        reading.contributing_mode_count,
      );
      expect(solution.result.unevaluatedModes.length).toBe(
        reading.unevaluated_mode_count,
      );
      expect(
        solution.modes.modes
          .filter(
            (mode) =>
              mode.unsupportedReason === "mirror_height_cannot_close_hop",
          )
          .map((mode) => mode.label),
      ).toEqual(reading.unclosed_hop_modes);

      // The above-the-MUF branches actually exercised, per layer, because
      // equations (25) and (26) are the largest single cause of the shipped
      // difference and the fixture's attribution rests on these counts.
      const aboveMuf = solution.result.contributingModes.filter(
        (mode) => mode.state === "above_basic_muf_with_loss",
      );
      expect(aboveMuf.filter((mode) => mode.layer === "E").length).toBe(
        reading.above_muf_e_mode_count,
      );
      expect(aboveMuf.filter((mode) => mode.layer === "F2").length).toBe(
        reading.above_muf_f2_mode_count,
      );
      expect(
        Math.max(
          0,
          ...solution.result.contributingModes.map(
            (mode) => mode.aboveMuf?.lossDb ?? 0,
          ),
        ),
      ).toBeCloseTo(reading.max_above_muf_loss_db, 3);
      // The auroral maximum, which is the case's own budget.
      expect(
        Math.max(
          0,
          ...solution.result.contributingModes.map(
            (mode) => mode.basicTransmissionLoss?.auroralDb ?? 0,
          ),
        ),
      ).toBeCloseTo(reading.max_auroral_loss_db, 3);

      // The mode the oracle names, where it names one.
      if (expected.dominant_mode === null) {
        expect(reading.named_mode_state).toBeNull();
        expect(expected.dominant_mode_lb_db).toBeNull();
      } else {
        expect(solution.namedMode).not.toBeNull();
        const named = solution.namedMode as ModeFieldStrength;
        expect(named.state).toBe(reading.named_mode_state);
        expect(
          Math.abs(
            named.basicMufMHz -
              (expected.dominant_mode_basic_muf_mhz as number),
          ),
        ).toBeLessThanOrEqual(TOL.basic_muf_mhz);
        // Which mode dominates is not part of the method; it is reported.
        expect(
          solution.result.dominantMode?.label ===
            (expected.dominant_mode as string),
        ).toBe(reading.dominant_mode_agrees);
      }

      // THE PARITY COLUMN. Es under the reference's Lz, its above-the-MUF loss
      // and its equation (2) geometry, against the oracle's Es.
      expect(solution.fieldStrengthRefGeometryDb).not.toBeNull();
      const deltaDb =
        (solution.fieldStrengthRefGeometryDb as number) -
        expected.field_strength_dbuv_per_m;
      expect(deltaDb).toBeCloseTo(
        divergence.field_strength_delta_with_reference_geometry_db,
        3,
      );
      if (reading.unclosed_hop_modes.length === 0) {
        expect(Math.abs(deltaDb)).toBeLessThanOrEqual(budgetDb(testCase));
      } else {
        // G11 and G14. Not inside any tolerance, and the reason is structural:
        // see reference_divergence.dropped_mode_cases.
        expect(
          fixtures.reference_divergence.dropped_mode_cases.cases,
        ).toContain(testCase.case_id);
        expect(Math.abs(deltaDb)).toBeLessThanOrEqual(
          fixtures.reference_divergence.dropped_mode_cases.bound_db,
        );
      }

      // The per-mode statement, so that a cancellation inside equation (28)
      // cannot pass for agreement on equation (18).
      if (
        divergence.dominant_mode_lb_delta_with_reference_geometry_db !== null
      ) {
        expect(solution.namedModeLbRefGeometryDb).not.toBeNull();
        const lbDeltaDb =
          (solution.namedModeLbRefGeometryDb as number) -
          (expected.dominant_mode_lb_db as number);
        expect(lbDeltaDb).toBeCloseTo(
          divergence.dominant_mode_lb_delta_with_reference_geometry_db,
          3,
        );
        expect(Math.abs(lbDeltaDb)).toBeLessThanOrEqual(budgetDb(testCase));
      }
    },
  );

  /**
   * The declared divergence, which is the opposite claim from every test above.
   *
   * These are the differences between what this repository ships and what the
   * pinned build prints. They are not parity and they are not inside a
   * tolerance; each is attributed to a numbered deviation in the leaf that
   * causes it, and what is asserted is that its size is the one the fixture
   * recorded and has not drifted.
   */
  it("holds the declared divergence between the text and the reference", () => {
    let worstFieldStrength = 0;
    let worstConventions = 0;
    let worstPower = 0;

    for (const testCase of fixtures.cases) {
      const solution = solve(provider, testCase);
      const { divergence, expected } = testCase;

      const shippedDeltaDb =
        (solution.result.fieldStrengthDbuVPerM as number) -
        expected.field_strength_dbuv_per_m;
      expect(shippedDeltaDb).toBeCloseTo(divergence.field_strength_delta_db, 3);
      worstFieldStrength = Math.max(
        worstFieldStrength,
        Math.abs(shippedDeltaDb),
      );

      // With the reference's Lz and its own above-the-MUF loss, but our
      // geometry: the middle column, which isolates those two formulas.
      const conventionsDb =
        10 *
        Math.log10(
          solution.result.contributingModes.reduce((total, mode) => {
            const shift =
              referenceAboveMufLossDb(
                mode.layer,
                testCase.inputs.frequency_mhz,
                mode.basicMufMHz,
                solution.distanceKm,
              ) -
              (mode.aboveMuf?.lossDb ?? 0) +
              0.42;
            return (
              total +
              10 ** (((mode.fieldStrengthDbuVPerM as number) - shift) / 10)
            );
          }, 0),
        );
      const conventionsDeltaDb =
        conventionsDb - expected.field_strength_dbuv_per_m;
      expect(conventionsDeltaDb).toBeCloseTo(
        divergence.field_strength_delta_with_reference_lz_and_lm_db,
        3,
      );
      worstConventions = Math.max(
        worstConventions,
        Math.abs(conventionsDeltaDb),
      );

      // The receiver power, which is only the circuit's answer inside
      // 7 000 km; past that the oracle's PR is the equation (42) blend and
      // ours is one term of it, so there is nothing to difference.
      if (divergence.receiver_power_delta_db === null) {
        expect(expected.distance_km).toBeGreaterThan(SECTION_6_BOUNDARY_KM);
      } else {
        const powerDeltaDb =
          (solution.result.receiverPowerDbW as number) -
          expected.receiver_power_dbw;
        expect(powerDeltaDb).toBeCloseTo(divergence.receiver_power_delta_db, 3);
        worstPower = Math.max(worstPower, Math.abs(powerDeltaDb));
      }
    }

    // The wide bounds, which exist only so that a change in any of the three
    // is reported. They are not tolerances and the fixture says so.
    expect(worstFieldStrength).toBeLessThanOrEqual(BOUNDS.field_strength_db);
    expect(worstConventions).toBeLessThanOrEqual(
      BOUNDS.field_strength_with_reference_lz_and_lm_db,
    );
    expect(worstPower).toBeLessThanOrEqual(BOUNDS.receiver_power_db);
    const observed = fixtures.reference_divergence.observed_max;
    expect(worstFieldStrength).toBeCloseTo(observed.field_strength_db, 3);
    expect(worstConventions).toBeCloseTo(
      observed.field_strength_with_reference_lz_and_lm_db,
      3,
    );
    expect(worstPower).toBeCloseTo(observed.receiver_power_db, 3);
    // Not a small difference dressed up as a divergence: the above-the-MUF
    // formulas alone move one circuit by 17 dB.
    expect(worstFieldStrength).toBeGreaterThan(17);
  });

  /**
   * The sweep, which asserts nothing about the reference at all.
   *
   * Every numeric field of every mode and of every field-strength output on
   * every case, by path. A null is a statement this method makes ("this mode
   * contributes nothing", "there is no elevation at this height"); a NaN or an
   * infinity is not, and the recommendation never produces one, so any is a
   * defect no matter how small the field strength delta stays.
   */
  it("produces no NaN and no infinity anywhere", () => {
    const found: string[] = [];
    for (const testCase of fixtures.cases) {
      const solution = solve(provider, testCase);
      found.push(
        ...nonFinitePaths(solution.modes, `${testCase.case_id}.modeSet`),
        ...nonFinitePaths(solution.result, `${testCase.case_id}.fieldStrength`),
      );
    }
    expect(found).toEqual([]);

    // And the sweep really reached the numbers, rather than walking an empty
    // shape: every case contributes at least four modes, each carrying a full
    // equation (18) breakdown.
    for (const testCase of fixtures.cases) {
      const solution = solve(provider, testCase);
      expect(solution.result.contributingModes.length).toBeGreaterThanOrEqual(
        4,
      );
      for (const mode of solution.result.contributingModes) {
        expect(mode.basicTransmissionLoss).not.toBeNull();
        expect(mode.absorption).not.toBeNull();
        expect(mode.auroral).not.toBeNull();
        expect(mode.fieldStrengthDbuVPerM).not.toBeNull();
        expect(mode.receiverPowerDbW).not.toBeNull();
      }
    }
  });
});
