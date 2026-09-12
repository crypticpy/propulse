// @vitest-environment node
//
// Deliberately node, for the same reason `parity.modeSet.test.ts` is: the same
// leaf must answer identically on a server and in a browser, and the CCIR
// coefficient asset is read from disk here.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import golden from "../../../../ml/propagation_validation/reference/golden-v1.json";
import fixtures from "@/lib/propagation/fixtures/p533-long-path.cases.json";
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
  type RouteDirection,
} from "@/lib/propagation/geometry/route";
import { distanceBlend, interpolateDb } from "./distanceBlend";
import {
  etlDbuVPerM,
  frequencyFactor,
  longPathFieldStrength,
  LY_DB,
  type ResolvedLongPathFieldStrength,
} from "./fieldStrengthLong";
import {
  K_CONSTANT,
  type LongPathMufControlPoint,
  type LongPathMufSampler,
} from "./longPath/fM";
import {
  nightLufMHz,
  rawLufMHz,
  type ResolvedLongPathLuf,
} from "./longPath/fL";

/**
 * Parity of sections 5.3 and 5.4 against the pinned ITU reference build, on the
 * 16 golden circuits longer than 7 000 km.
 *
 * WHAT IS MEASURED AND WHAT IS NOT. The oracle publishes `El`, `Ep`, `ptick`
 * and `distance` on all 16, and `BMUF`/`OPMUF` from section 5.3.1 only on the 8
 * circuits past 9 000 km, because `MedianSkywaveFieldStrengthLong.c` writes
 * `path->BMUF` and `path->OPMUF` from the long-path control points inside
 * `if(path->distance > 9000)` and leaves them to slice A's `MUFBasic()` below
 * that. It publishes no fM, no fL, no fD and no K column of its own, so those
 * are exercised only through El. The fixture's `parity_is_partial` says all of
 * that and the second test reads it back.
 *
 * PARITY IS A DECLARED PER-COLUMN BUDGET, NEVER EQUALITY. The derivation is
 * `p533-long-path.cases.json.tolerance_derivation` and the third test reads it
 * out, so widening a budget silently is not possible.
 *
 * AND THE El COLUMN IS ASSERTED TWICE, ONLY ONE OF WHICH IS PARITY. Our El is
 * the recommendation's El and the reference's is the reference's, and the two
 * differ by the deviations the three modules declare rather than by an error.
 * So El is asserted once as a wide `reference_divergence` bound against our own
 * reading, and once, tightly, against the SAME LEAF re-evaluated under the
 * reference's own readings: its truncate-then-minus-one local noon, its
 * `SolarParameters()` zenith angles, its literal 0.7945, its non-strict
 * transition test, its `fL[hour + 1]` index and its Ly of -0.17. Substituting
 * those six closes the gap to 1e-4 dB on all 15 circuits whose hop division
 * also matches, which is what says equation (39) is right and the difference is
 * the deviation list. G25's hop division does not match, for the reason
 * `reference_divergence.hop_count_case` states, and it carries its own bounds.
 *
 * NOTHING OF THE REFERENCE IS IMPORTED. The substitutions above are written out
 * here from reading the benchmark, exactly as `parity.modeSet.test.ts` writes
 * out the reference's section 5.1(a) collapse, and they exist only in this
 * file. The provider's `solar.ts` is a port of the reference's own
 * `SolarParameters()`, so asking it for a zenith angle is reading the
 * benchmark's solar model and not importing its code.
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
const DIVERGENCE = fixtures.reference_divergence;
const HOP_BOUNDS = DIVERGENCE.hop_count_bounds;

/** The reference's own `#define NOIL`, quoted so it can be measured against. */
const REFERENCE_LY_DB = -0.17;

/** The reference's literal for e^-0.23 in equations (37) and (38). */
const REFERENCE_DECAY_PER_HOUR = 0.7945;

/** Section 5.3's upper bound on the section 5.4 interpolation, km. */
const BLEND_MAX_DISTANCE_KM = 9000;

const HOURS_PER_DAY = 24;
const DEGREES_PER_HOUR = 15;
const DEG_TO_RAD = Math.PI / 180;

function validAtOf(year: number, month: number, utcHour: number): string {
  return (
    `${String(year)}-${String(month).padStart(2, "0")}-15T` +
    `${String(utcHour).padStart(2, "0")}:00:00Z`
  );
}

function directionOf(pathDirection: string): RouteDirection {
  return pathDirection === "LONGPATH" ? "long" : "short";
}

/**
 * The reference's local-noon index, written out rather than imported.
 *
 * `MedianSkywaveFieldStrengthLong.c`:
 *   noon[0] = (int)(12.0 - CP[TdM2][1].L.lng/(15.0*D2R)) - 1;
 *   noon[0] = (noon[0]+24) % 24;
 * `(int)` truncates toward zero and the `- 1` converts a countable hour into an
 * index, which double-counts: element 0 of the array already is the hour from
 * 00:00 to 00:59. Our `localNoonUtcHour` rounds and does not subtract (fM.ts
 * deviation 2).
 */
function referenceNoonUtcHour(longitudeDeg: number): number {
  const noon = Math.trunc(12 - longitudeDeg / DEGREES_PER_HOUR) - 1;
  return ((noon % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
}

/**
 * Equation (31)'s K fBM at one control point under a stated noon index.
 *
 * Equation (32) verbatim:
 *   K = 1.2 + W (fBM/fBM,noon) + X ((fBM,noon/fBM)^(1/3) - 1)
 *         + Y (fBM,min/fBM,noon)^2
 * The fBM values come from the leaf's own 24-hour table, so the only thing
 * varying between our reading and the reference's is which hour is noon.
 */
function operationalMufAtNoonIndex(
  controlPoint: LongPathMufControlPoint,
  coefficients: { readonly W: number; readonly X: number; readonly Y: number },
  utcHour: number,
  noonUtcHour: number,
): number {
  const fBM = controlPoint.hours[utcHour].basicMufMHz;
  const fBMNoon = controlPoint.hours[noonUtcHour].basicMufMHz;
  const k =
    K_CONSTANT +
    coefficients.W * (fBM / fBMNoon) +
    coefficients.X * ((fBMNoon / fBM) ** (1 / 3) - 1) +
    coefficients.Y * (controlPoint.minimumBasicMufMHz / fBMNoon) ** 2;
  return k * fBM;
}

/**
 * The reference's whole 24-hour fL curve, built from our own exported pieces.
 *
 * Four of the six substitutions live here. The zenith angle comes from the
 * provider's `solar`, which is a port of the reference's `SolarParameters()`,
 * instead of from the recommendation's Table 4 and equation (35) (fL.ts
 * deviation 1). `FindfL()`'s transition search then uses the reference's
 * literal 0.7945 (deviation 3), its non-strict `>=` and `<=` (deviation 4) and
 * its overwrite of `fL[tr]` before the "only if larger" comparison, which makes
 * that comparison always false (deviation 5). Equation (33) itself is our own
 * exported `rawLufMHz`, so what changes is the reading and not the equation.
 */
function referenceLufCurve(
  provider: IonosphereProvider,
  testCase: Case,
  luf: ResolvedLongPathLuf,
  virtualSlantRangeKm: number,
  gyrofrequencyMHz: number,
): { readonly hours: readonly number[]; readonly transitionUtcHour: number | null } {
  const { inputs } = testCase;
  const nightLuf = nightLufMHz(luf.groundDistanceKm);
  const hours: number[] = [];
  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    let sum = 0;
    for (const penetration of luf.penetrationPoints) {
      const state = provider.state({
        coordinates: canonicalCoordinates(
          penetration.point.latitudeDeg,
          penetration.point.longitudeDeg,
        ),
        validAt: validAtOf(inputs.year, inputs.month, hour),
        r12: known(inputs.sunspot_number),
        mode: "reference",
      });
      const chi = state.solar.zenithAngleDeg * DEG_TO_RAD;
      // The reference's own guard, `if((chi > 0.0) && (chi < PI/2.0))`.
      if (chi > 0 && chi < Math.PI / 2) sum += Math.sqrt(Math.cos(chi));
    }
    hours.push(
      Math.max(
        rawLufMHz({
          zenithCosineRootSum: sum,
          r12: inputs.sunspot_number,
          incidenceAngle90Rad: luf.incidenceAngle90Rad,
          virtualSlantRangeKm,
          gyrofrequencyMHz,
          winterAnomalyFactor: luf.winterAnomalyFactor,
        }),
        nightLuf,
      ),
    );
  }

  const threshold = 2 * nightLuf;
  let tr: number | null = null;
  for (let now = 0; now < HOURS_PER_DAY && tr === null; now += 1) {
    const previous = (now - 1 + HOURS_PER_DAY) % HOURS_PER_DAY;
    if (hours[previous] >= threshold && hours[now] <= threshold) {
      tr = now;
      const dt = (threshold - hours[tr]) / (hours[previous] - hours[tr]);
      hours[tr] =
        REFERENCE_DECAY_PER_HOUR *
        hours[previous] *
        (dt * (1 - REFERENCE_DECAY_PER_HOUR) + REFERENCE_DECAY_PER_HOUR);
      if (hours[now] < hours[tr]) hours[now] = hours[tr];
    }
  }
  if (tr !== null) {
    for (let n = 1; n < 4; n += 1) {
      const now = (tr + n) % HOURS_PER_DAY;
      const previous = (now - 1 + HOURS_PER_DAY) % HOURS_PER_DAY;
      hours[now] = Math.max(
        hours[previous] * REFERENCE_DECAY_PER_HOUR,
        hours[now],
      );
    }
  }
  return { hours, transitionUtcHour: tr };
}

interface Solved {
  readonly route: ResolvedRoute;
  readonly fieldStrength: ResolvedLongPathFieldStrength;
  /** fM under the reference's local-noon index, MHz. */
  readonly referenceFMMHz: number;
  /** The reference's fL curve read at its own `hour + 1` index, MHz. */
  readonly referenceFLMHz: number;
  readonly referenceTransitionUtcHour: number | null;
  /** Equation (39) re-run on all six reference readings, dB(1 uV/m). */
  readonly referenceReadingElDb: number;
}

function solve(provider: IonosphereProvider, testCase: Case): Solved {
  const { inputs } = testCase;
  const route = resolveRoute(
    { latitudeDeg: inputs.tx_lat, longitudeDeg: inputs.tx_lon },
    { latitudeDeg: inputs.rx_lat, longitudeDeg: inputs.rx_lon },
    { direction: directionOf(inputs.path_direction) },
  );
  if (route.kind !== "resolved") {
    throw new Error(`${testCase.case_id}: ${route.detail}`);
  }

  // Contract M03's injected provider. Section 5.3.1 needs the whole diurnal
  // curve at both control points, so the hour comes from the sampler's third
  // argument and not from the case.
  const sample: LongPathMufSampler = (point, _label, utcHour) => {
    const state = provider.state({
      coordinates: canonicalCoordinates(point.latitudeDeg, point.longitudeDeg),
      validAt: validAtOf(inputs.year, inputs.month, utcHour),
      r12: known(inputs.sunspot_number),
      // The oracle's own convention. See the fixture's `provider_mode` note.
      mode: "reference",
    });
    return {
      foF2MHz: state.foF2MHz,
      m3000F2: state.m3000F2,
      gyrofrequency300kmMHz: state.gyrofrequency300kmMHz,
    };
  };

  const fieldStrength = longPathFieldStrength({
    route,
    frequencyMHz: inputs.frequency_mhz,
    monthIndex: inputs.month - 1,
    utcHour: inputs.hour_utc,
    // Raw, not clipped: the recommendation says R12 "does not saturate for
    // high values and can exceed 160" and the reference reads `path->SSN`
    // directly in equation (33). Only the numerical map applies MAXSSN, and
    // the provider does that itself.
    r12: inputs.sunspot_number,
    sample,
    transmitterPowerDbKw: inputs.transmitter_power_db_kw,
    // The golden set runs both ends ISOTROPIC with a 0 dB offset, so Gtl is
    // the module's own default and is passed explicitly to say so.
    transmitterGainDbi: 0,
  });
  if (fieldStrength.kind !== "field_strength") {
    throw new Error(`${testCase.case_id}: ${fieldStrength.detail}`);
  }

  const { muf, luf, terms } = fieldStrength;
  const referenceFMMHz = Math.min(
    ...muf.controlPoints.map((controlPoint) =>
      operationalMufAtNoonIndex(
        controlPoint,
        muf.coefficients,
        inputs.hour_utc,
        referenceNoonUtcHour(controlPoint.site.point.longitudeDeg),
      ),
    ),
  );
  const referenceLuf = referenceLufCurve(
    provider,
    testCase,
    luf,
    muf.virtualSlantRangeKm,
    fieldStrength.fHMHz,
  );
  const referenceFLMHz =
    referenceLuf.hours[(inputs.hour_utc + 1) % HOURS_PER_DAY];
  const referenceReadingElDb = etlDbuVPerM({
    freeSpaceFieldStrengthDbuVPerM: terms.freeSpaceFieldStrengthDbuVPerM,
    frequencyFactor: frequencyFactor({
      frequencyMHz: inputs.frequency_mhz,
      fMMHz: referenceFMMHz,
      fLMHz: referenceFLMHz,
      fHMHz: fieldStrength.fHMHz,
    }),
    transmitterPowerDbKw: terms.transmitterPowerDbKw,
    transmitterGainDbi: terms.transmitterGainDbi,
    focusGainDb: terms.focusGainDb,
    lyDb: REFERENCE_LY_DB,
  });

  return {
    route,
    fieldStrength,
    referenceFMMHz,
    referenceFLMHz,
    referenceTransitionUtcHour: referenceLuf.transitionUtcHour,
    referenceReadingElDb,
  };
}

/** Every number in a record, recursively, with the path it was found at. */
function walkNumbers(
  value: unknown,
  trail: string,
  report: (trail: string, value: number) => void,
): void {
  if (typeof value === "number") {
    report(trail, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      walkNumbers(entry, `${trail}[${String(index)}]`, report);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      walkNumbers(entry, `${trail}.${key}`, report);
    }
  }
}

describe("P.533-14 long-path parity with the ITU reference", () => {
  let provider: IonosphereProvider;
  const solved = new Map<string, Solved>();

  const solvedFor = (testCase: Case): Solved => {
    const cached = solved.get(testCase.case_id);
    if (cached !== undefined) return cached;
    const fresh = solve(provider, testCase);
    solved.set(testCase.case_id, fresh);
    return fresh;
  };

  beforeAll(async () => {
    provider = await createCcirIonosphereProvider(assetBytes);
  });

  it("keeps every golden circuit longer than 7 000 km and no other", () => {
    expect(fixtures.case_count).toBe(fixtures.cases.length);
    expect(fixtures.cases.length).toBe(16);
    expect(fixtures.reference_commit).toBe(
      "cd172be56dc04b154e5d2fa91cbaa6ecf5284305",
    );
    expect(fixtures.reference_version).toBe(golden.reference_version);

    // The selection is section 5.3's own domain and nothing else, read out of
    // the oracle rather than chosen by hand.
    const kept = new Set(fixtures.cases.map((c) => c.case_id));
    for (const goldenCase of golden.cases) {
      const outputs = goldenCase.outputs as unknown as {
        distance: number;
        El: number;
      };
      expect(kept.has(goldenCase.case_id)).toBe(outputs.distance > 7000);
      if (kept.has(goldenCase.case_id)) {
        // And the oracle really ran its long-path method on every one of them
        // rather than emitting its not-computed sentinel.
        expect(outputs.El).not.toBe(-307);
      }
    }

    // Every case carries the oracle's own numbers, unrounded.
    const goldenById = new Map(golden.cases.map((c) => [c.case_id, c]));
    for (const testCase of fixtures.cases) {
      const record = goldenById.get(testCase.case_id);
      expect(record).toBeDefined();
      const outputs = (record as NonNullable<typeof record>)
        .outputs as unknown as Record<string, number>;
      expect(testCase.expected.distance_km).toBe(outputs.distance);
      expect(testCase.expected.slant_range_km).toBe(outputs.ptick);
      expect(testCase.expected.el_dbuv_per_m).toBe(outputs.El);
      expect(testCase.expected.ep_dbuv_per_m).toBe(outputs.Ep);
      expect(testCase.expected.es_dbuv_per_m ?? -307).toBe(outputs.Es);
    }
  });

  it("declares what this corpus cannot prove", () => {
    expect(fixtures.parity_is_partial).toContain("no fM column");
    expect(fixtures.parity_is_partial).toContain("no fL column");
    expect(fixtures.parity_is_partial).toContain("9 000");
    expect(DIVERGENCE.what_this_is).toContain("NOT A PARITY COLUMN");

    // BMUF and OPMUF are the reference's section 5.3.1 values only past
    // 9 000 km. Asserted against the oracle, not assumed: below that they are
    // slice A's short-path MUF and comparing our fBM against them would be
    // comparing two different quantities.
    const goldenById = new Map(golden.cases.map((c) => [c.case_id, c]));
    for (const testCase of fixtures.cases) {
      const above = testCase.expected.distance_km > BLEND_MAX_DISTANCE_KM;
      expect(testCase.reading.muf_columns_published).toBe(above);
      expect(testCase.reading.range).toBe(
        above ? "above_9000_km" : "blend_7000_to_9000_km",
      );
      expect(testCase.expected.basic_muf_mhz === null).toBe(!above);
      expect(testCase.expected.operational_muf_mhz === null).toBe(!above);
      // Below 9 000 km the oracle's Es is a real number, above it the sentinel.
      expect(testCase.expected.es_dbuv_per_m === null).toBe(above);
      const record = goldenById.get(testCase.case_id);
      const outputs = (record as NonNullable<typeof record>)
        .outputs as unknown as Record<string, number>;
      // And the oracle really has no fM, fL or K column of its own.
      const columns = Object.keys(outputs);
      expect(columns).not.toContain("fM");
      expect(columns).not.toContain("fL");
      expect(columns).not.toContain("K");
    }

    // No golden case here falls in September, so fL.ts deviation 6, the one
    // Table 5 cell we and the reference disagree on, cannot be hiding inside
    // any budget in this file.
    expect(fixtures.cases.map((c) => c.inputs.month)).not.toContain(9);
    expect(fixtures.conventions.winter_anomaly).toContain("September");
  });

  it("states where its tolerances come from", () => {
    expect(fixtures.tolerance_derivation).toContain("reference-parity.json");
    expect(fixtures.tolerance_derivation).toContain("2e-3");
    expect(fixtures.tolerance_derivation).toContain("Not chosen to pass");
    // Slice A's budget for a route length, reused unchanged.
    expect(TOL.distance_km).toBeLessThanOrEqual(0.1);
    // Every budget is at least ten times the measured maximum it covers, and
    // none is wider than the column it guards is meaningful.
    expect(TOL.slant_range_km).toBeLessThanOrEqual(0.05);
    expect(TOL.basic_muf_mhz).toBeLessThanOrEqual(0.03);
    expect(TOL.operational_muf_mhz).toBeLessThanOrEqual(0.05);
    expect(TOL.el_reference_reading_dbuv_per_m).toBeLessThanOrEqual(0.01);
    expect(TOL.ep_dbuv_per_m).toBeLessThanOrEqual(0.01);
    // The wide band exists for exactly one named case.
    const wide = fixtures.cases.filter(
      (c) => !c.reading.hop_count_matches_reference,
    );
    expect(wide.map((c) => c.case_id)).toEqual(["G25"]);
    expect(DIVERGENCE.hop_count_case).toContain("G25");
    expect(HOP_BOUNDS.applies_to).toContain("G25");
  });

  it.each(fixtures.cases.map((c) => [c.case_id, c] as const))(
    "%s",
    (_id, testCase) => {
      const result = solvedFor(testCase);
      const expected = testCase.expected;
      const { fieldStrength } = result;
      const { muf } = fieldStrength;
      const matches = testCase.reading.hop_count_matches_reference;

      // distance, slice A's route again, kept so that a long-path regression
      // that is really a route regression is visible here.
      expect(
        Math.abs(result.route.groundDistanceKm - expected.distance_km),
      ).toBeLessThanOrEqual(TOL.distance_km);

      // The hop division itself, which is what G25 turns on.
      expect(muf.hopCount).toBe(testCase.reading.hop_count);
      expect(muf.elevationDeg).toBeGreaterThan(3);

      // ptick, equation (19) at the 300 km height over that hop division.
      expect(
        Math.abs(muf.virtualSlantRangeKm - expected.slant_range_km),
      ).toBeLessThanOrEqual(
        matches ? TOL.slant_range_km : HOP_BOUNDS.slant_range_km,
      );

      // BMUF and OPMUF, section 5.3.1, published past 9 000 km only.
      if (testCase.reading.muf_columns_published) {
        expect(
          Math.abs(muf.basicMufMHz - (expected.basic_muf_mhz as number)),
        ).toBeLessThanOrEqual(
          matches ? TOL.basic_muf_mhz : HOP_BOUNDS.basic_muf_mhz,
        );
        // The tight claim is against the reference's own noon index; the loose
        // one against ours, because the noon index is a declared deviation.
        expect(
          Math.abs(
            result.referenceFMMHz - (expected.operational_muf_mhz as number),
          ),
        ).toBeLessThanOrEqual(
          matches ? TOL.operational_muf_mhz : HOP_BOUNDS.operational_muf_mhz,
        );
        expect(
          Math.abs(muf.fMMHz - (expected.operational_muf_mhz as number)),
        ).toBeLessThanOrEqual(DIVERGENCE.bounds.operational_muf_mhz);
      }

      // El, equation (39). Tight against the reference's own six readings,
      // wide against ours; the gap between them is the declared deviations.
      expect(
        Math.abs(result.referenceReadingElDb - expected.el_dbuv_per_m),
      ).toBeLessThanOrEqual(
        matches
          ? TOL.el_reference_reading_dbuv_per_m
          : HOP_BOUNDS.el_reference_reading_dbuv_per_m,
      );
      expect(
        Math.abs(fieldStrength.etlDbuVPerM - expected.el_dbuv_per_m),
      ).toBeLessThanOrEqual(DIVERGENCE.bounds.el_dbuv_per_m);
      expect(fieldStrength.range).toBe(testCase.reading.range);

      // Ep, equation (42), as a pure function of the oracle's OWN Es and El.
      // That is what makes it a claim about section 5.4 alone: nothing of ours
      // feeds it, so a section 5.3 deviation cannot move it.
      const blended = distanceBlend({
        groundDistanceKm: expected.distance_km,
        shortPathDb: expected.es_dbuv_per_m,
        longPathDb: expected.el_dbuv_per_m,
      });
      expect(blended.kind).toBe("resolved");
      if (blended.kind !== "resolved") return;
      const above = testCase.reading.muf_columns_published;
      expect(blended.regime).toBe(above ? "long_path_only" : "interpolated");
      expect(blended.source).toBe(above ? "equation_39" : "equation_42");
      expect(
        Math.abs(blended.fieldStrengthDb - expected.ep_dbuv_per_m),
      ).toBeLessThanOrEqual(TOL.ep_dbuv_per_m);
    },
  );

  /**
   * The claim the per-case budgets cannot make on their own.
   *
   * A systematic error of a hundredth of a decibel in equation (39) passes
   * every per-case El check inside the reference-reading budget and fails here.
   * The fixture records the same maxima, so a budget cannot drift from the run.
   */
  it("agrees with the oracle to the last digit the oracle publishes", () => {
    const worst = {
      distanceKm: 0,
      slantRangeKm: 0,
      basicMufMHz: 0,
      operationalMufMHz: 0,
      elDb: 0,
      epDb: 0,
    };
    for (const testCase of fixtures.cases) {
      const result = solvedFor(testCase);
      const expected = testCase.expected;
      const matches = testCase.reading.hop_count_matches_reference;
      worst.distanceKm = Math.max(
        worst.distanceKm,
        Math.abs(result.route.groundDistanceKm - expected.distance_km),
      );
      if (matches) {
        worst.slantRangeKm = Math.max(
          worst.slantRangeKm,
          Math.abs(
            result.fieldStrength.muf.virtualSlantRangeKm -
              expected.slant_range_km,
          ),
        );
        worst.elDb = Math.max(
          worst.elDb,
          Math.abs(result.referenceReadingElDb - expected.el_dbuv_per_m),
        );
        if (testCase.reading.muf_columns_published) {
          worst.basicMufMHz = Math.max(
            worst.basicMufMHz,
            Math.abs(
              result.fieldStrength.muf.basicMufMHz -
                (expected.basic_muf_mhz as number),
            ),
          );
          worst.operationalMufMHz = Math.max(
            worst.operationalMufMHz,
            Math.abs(
              result.referenceFMMHz - (expected.operational_muf_mhz as number),
            ),
          );
        }
      }
      // Only genuine 7000-9000 km blend circuits (Es not null) actually call
      // `interpolateDb`, the same domain `distanceBlend`'s own code follows;
      // above 9000 km the oracle's Ep is just El, compared directly.
      const epDbCandidate =
        expected.es_dbuv_per_m !== null
          ? interpolateDb(
              expected.distance_km,
              expected.es_dbuv_per_m,
              expected.el_dbuv_per_m,
            ).db
          : expected.el_dbuv_per_m;
      worst.epDb = Math.max(
        worst.epDb,
        Math.abs(epDbCandidate - expected.ep_dbuv_per_m),
      );
    }

    const observed = fixtures.observed_max_delta;
    expect(worst.distanceKm).toBeCloseTo(observed.distance_km, 3);
    expect(worst.slantRangeKm).toBeCloseTo(
      observed.slant_range_km_hop_count_matches,
      3,
    );
    expect(worst.basicMufMHz).toBeCloseTo(observed.basic_muf_mhz, 3);
    expect(worst.operationalMufMHz).toBeCloseTo(
      observed.operational_muf_mhz,
      3,
    );
    expect(worst.elDb).toBeCloseTo(
      observed.el_reference_reading_dbuv_per_m,
      3,
    );
    expect(worst.epDb).toBeCloseTo(observed.ep_dbuv_per_m, 3);

    // And the sharpest of them, restated so that losing it is a regression
    // even though a tenth of that would still sit inside the budget.
    expect(worst.elDb).toBeLessThanOrEqual(5e-3);
    expect(worst.operationalMufMHz).toBeLessThanOrEqual(1e-2);
  });

  /**
   * The declared divergence, which is the opposite claim from every test above.
   *
   * Our El is not a worse measurement of the reference's El: it is the
   * recommendation's El, and it differs by the deviations the three modules
   * declare. This block records the per-case difference so that it is on the
   * record and so that a change in any of them is noticed, and its bounds are
   * wide enough that they can never be mistaken for tolerances.
   */
  it("holds the declared divergence between the two readings", () => {
    const declared = new Map(DIVERGENCE.cases.map((c) => [c.case_id, c]));
    expect(declared.size).toBe(fixtures.cases.length);
    let worstElDb = 0;
    let worstOperationalMufMHz = 0;
    let above = 0;

    // The Ly deviation on its own is an exact 0.03 dB in one direction on every
    // circuit, because equation (39) subtracts Ly.
    expect(LY_DB - REFERENCE_LY_DB).toBeCloseTo(0.03, 12);

    for (const testCase of fixtures.cases) {
      const record = declared.get(testCase.case_id);
      expect(record).toBeDefined();
      const row = record as NonNullable<typeof record>;
      const result = solvedFor(testCase);
      const { fieldStrength } = result;

      const elDeltaDb =
        fieldStrength.etlDbuVPerM - testCase.expected.el_dbuv_per_m;
      expect(elDeltaDb).toBeCloseTo(row.el_delta_db, 2);
      worstElDb = Math.max(worstElDb, Math.abs(elDeltaDb));
      if (elDeltaDb > 0) above += 1;

      expect(fieldStrength.fMMHz).toBeCloseTo(row.our_fm_mhz, 2);
      expect(result.referenceFMMHz).toBeCloseTo(row.reference_noon_fm_mhz, 2);
      expect(fieldStrength.fLMHz).toBeCloseTo(row.our_fl_mhz, 2);
      expect(result.referenceFLMHz).toBeCloseTo(
        row.reference_reading_fl_mhz,
        2,
      );
      expect(fieldStrength.luf.transitionUtcHour).toBe(
        row.our_transition_utc_hour,
      );
      expect(result.referenceTransitionUtcHour).toBe(
        row.reference_transition_utc_hour,
      );
      expect(fieldStrength.luf.winterAnomalyFactor).toBeCloseTo(
        row.winter_anomaly_factor,
        4,
      );

      if (testCase.reading.muf_columns_published) {
        worstOperationalMufMHz = Math.max(
          worstOperationalMufMHz,
          Math.abs(
            fieldStrength.fMMHz -
              (testCase.expected.operational_muf_mhz as number),
          ),
        );
      }
    }

    expect(worstElDb).toBeLessThanOrEqual(DIVERGENCE.bounds.el_dbuv_per_m);
    expect(worstOperationalMufMHz).toBeLessThanOrEqual(
      DIVERGENCE.bounds.operational_muf_mhz,
    );
    expect(worstElDb).toBeCloseTo(DIVERGENCE.observed_max.el_dbuv_per_m, 2);
    expect(worstOperationalMufMHz).toBeCloseTo(
      DIVERGENCE.observed_max.operational_muf_mhz,
      2,
    );
    // Not a small difference dressed up as a divergence, and not a bias: our El
    // is above the reference's on 6 circuits and below it on 10.
    expect(worstElDb).toBeGreaterThan(1);
    expect(above).toBe(6);
    expect(DIVERGENCE.sign).toContain("no sign");
    expect(DIVERGENCE.bounds.derivation).toContain("drift detectors");
  });

  /** No NaN, no Infinity, anywhere in any record the corpus produces. */
  it("emits no NaN and no Infinity on any golden circuit", () => {
    let counted = 0;
    for (const testCase of fixtures.cases) {
      const result = solvedFor(testCase);
      walkNumbers(result.fieldStrength, testCase.case_id, (trail, value) => {
        counted += 1;
        if (!Number.isFinite(value)) {
          throw new Error(`${trail} is ${String(value)}`);
        }
      });
      for (const value of [
        result.referenceFMMHz,
        result.referenceFLMHz,
        result.referenceReadingElDb,
      ]) {
        counted += 1;
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    // Each circuit carries two 24-hour fBM tables and one 24-hour fL table, so
    // a leaf that quietly stopped populating them would show up as a collapse
    // in the count rather than as a silent pass.
    expect(counted).toBeGreaterThan(16 * 24 * 3);
  });
});
