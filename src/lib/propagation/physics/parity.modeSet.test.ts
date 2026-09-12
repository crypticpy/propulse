// @vitest-environment node
//
// Deliberately node, for the same reason `parity.basicMuf.test.ts` is: the same
// leaf must answer identically on a server and in a browser, and the CCIR
// coefficient asset is read from disk here.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import golden from "../../../../ml/propagation_validation/reference/golden-v1.json";
import fixtures from "@/lib/propagation/fixtures/p533-modes.cases.json";
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
import { hopGeometry } from "@/lib/propagation/geometry/hop";
import { f2ReflectionHeight } from "@/lib/propagation/geometry/reflectionHeight";
import { resolveRoute, routeMidpoint } from "@/lib/propagation/geometry/route";
import { MIN_ELEVATION_DEG } from "./basicMuf";
import { screeningFoEMHz } from "./controlPoints";
import {
  isScreened,
  screeningFrequencyMHz,
  screeningIncidenceAngleRad,
} from "./eLayerScreening";
import { modeSet, type ModeControlPointSampler } from "./modeSet";
import type { PropagationMode } from "./modeTypes";

/**
 * Parity of the section 5.2.1 mode set against the pinned ITU reference build,
 * on the 14 golden circuits for which the reference names a dominant mode.
 *
 * PARITY HERE IS PARTIAL AND THE FIXTURE SAYS SO IN `parity_is_partial`. The
 * oracle publishes one mode per circuit and no fs column at all, so the
 * screening branch of section 5.2.1 has no reference to be measured against.
 * The three `screening_cases` are hand-computed from the published equations to
 * cover it and are marked as not reference-derived. Read that block before
 * reading a green run as "the mode set matches the reference".
 *
 * Parity is a declared per-column tolerance budget derived from the provider's
 * residuals, never equality. The derivation is
 * `p533-modes.cases.json.tolerance_derivation` and the first two tests read it
 * out, so widening a budget silently is not possible.
 *
 * AND ONE COLUMN HERE IS NOT PARITY AT ALL. `ele`, `DMele` and `ptick` are
 * equation (13) and equation (19) at the equation (2) height, which is section
 * 5.2.1's selection height, so they are asserted against
 * `selectionElevationDeg` and `selectionSlantRangeKm`. The product elevation
 * and slant range are the same equations at the section 5.1 height, which is
 * what section 5.1 says equation (13)'s hr is (`modeSet.ts` deviation 2); the
 * oracle cannot measure those, only disagree with them, so their per-case
 * difference is asserted against `fixtures.reference_divergence` with a wide
 * bound and is labelled a divergence everywhere it appears.
 *
 * ON ONE CIRCUIT THERE IS NO PRODUCT ELEVATION TO DIFFERENCE. G11's dominant
 * 2F2 is selected at the equation (2) height and its section 5.1 height cannot
 * close that hop, so the mode is labelled `geometrically_unsupported` with
 * `mirror_height_cannot_close_hop` and reports null geometry. The oracle has a
 * number there because it reports the equation (2) elevation. Each case carries
 * `reading.section_5_1_closes_hop` so the per-case test reads the expected
 * label out of the fixture, and `reference_divergence.below_horizon_case`
 * states the case in full.
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
type Band = "table_1c_agrees" | "table_1c_differs";

const TOL = fixtures.tolerances;

/** Section 4's limit, restated here only to read the fixture's `DMhr = 0`. */
const SCREENING_MAX_PATH_KM = 4000;

function validAtOf(testCase: Case): string {
  const { year, month, hour_utc: hour } = testCase.inputs;
  return (
    `${String(year)}-${String(month).padStart(2, "0")}-15T` +
    `${String(hour).padStart(2, "0")}:00:00Z`
  );
}

interface Solved {
  readonly distanceKm: number;
  readonly dmaxKm: number;
  readonly modes: readonly PropagationMode[];
  readonly dominant: PropagationMode | undefined;
  /** The last mode the reference's field-strength loop would have computed. */
  readonly lastSelected: PropagationMode | undefined;
  /**
   * `A1 = 140 + (H - 47) E1` of section 5.1(a) for the dominant mode's hop, or
   * `null` where that mode is not on branch (a). This is what the reference
   * collapses to when its G polynomial drops the published `+ 90.47 xr` term.
   */
  readonly referenceBranchAHeightKm: number | null;
}

function solve(provider: IonosphereProvider, testCase: Case): Solved {
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

  const result = modeSet({
    route,
    frequencyMHz: inputs.frequency_mhz,
    sample,
  });
  if (result.kind !== "resolved") {
    throw new Error(`${testCase.case_id}: ${result.detail}`);
  }

  const dominant = result.modes.find(
    (mode) => mode.label === testCase.expected.dominant_mode,
  );
  // The reference's `MedianSkywaveFieldStrengthShort()` runs its E loop and
  // then its F2 loop, each writing `path->ptick`, so the surviving value is the
  // highest-order selected F2 mode's, or the last E mode's if no F2 mode was
  // selected at all.
  const selected = result.supportedModes;
  const lastSelected =
    [...selected].reverse().find((mode) => mode.layer === "F2") ??
    [...selected].reverse().find((mode) => mode.layer === "E");

  let referenceBranchAHeightKm: number | null = null;
  if (
    dominant !== undefined &&
    dominant.layer === "F2" &&
    route.groundDistanceKm <= SCREENING_MAX_PATH_KM
  ) {
    const midpoint = routeMidpoint(route);
    const mid = stateAt(midpoint.latitudeDeg, midpoint.longitudeDeg);
    const height = f2ReflectionHeight({
      m3000F2: mid.m3000F2,
      foF2MHz: mid.foF2MHz,
      foEMHz: mid.foEMHz,
      r12: mid.solarIndex.r12,
      frequencyMHz: inputs.frequency_mhz,
      groundDistanceKm: route.groundDistanceKm,
      hopCount: dominant.hopCount,
    });
    if (height.branch === "5.1a") {
      // Section 5.1(a), the two lines the reference's defect does not touch:
      //   E1 = -0.09707 xr^3 + 0.6870 xr^2 - 0.7506 xr + 0.6
      //   A1 = 140 + (H - 47) E1
      // Written out here rather than imported, so that this is an independent
      // statement about the reference and not a restatement of our own leaf.
      const xr = height.xr;
      const e1 = -0.09707 * xr * xr * xr + 0.687 * xr * xr - 0.7506 * xr + 0.6;
      referenceBranchAHeightKm = 140 + (height.H - 47) * e1;
    }
  }

  return {
    distanceKm: route.groundDistanceKm,
    dmaxKm: result.dmaxKm,
    modes: result.modes,
    dominant,
    lastSelected,
    referenceBranchAHeightKm,
  };
}

describe("P.533-14 mode set parity with the ITU reference", () => {
  let provider: IonosphereProvider;

  beforeAll(async () => {
    provider = await createCcirIonosphereProvider(assetBytes);
  });

  it("keeps exactly the cases for which the oracle names a mode", () => {
    expect(fixtures.case_count).toBe(fixtures.cases.length);
    expect(fixtures.cases.length).toBe(14);
    expect(fixtures.reference_commit).toBe(
      "cd172be56dc04b154e5d2fa91cbaa6ecf5284305",
    );

    // The selection is observable in the oracle, not chosen by hand: the cases
    // left out are exactly the ones with no dominant mode to compare against.
    const kept = new Set(fixtures.cases.map((c) => c.case_id));
    for (const goldenCase of golden.cases) {
      const outputs = goldenCase.outputs as unknown as {
        DMidx: string;
        distance: number;
      };
      if (kept.has(goldenCase.case_id)) {
        expect(outputs.DMidx).not.toBe("NONE");
      } else {
        expect(outputs.DMidx).toBe("NONE");
      }
    }
  });

  it("declares what this corpus cannot prove", () => {
    // The one thing a reader must not take from a green run is that the mode
    // set matches the reference mode for mode. It does not, because the oracle
    // publishes one mode and no fs.
    expect(fixtures.parity_is_partial).toContain("no fs column");
    expect(fixtures.parity_is_partial).toContain("DMFprob");
    // And the loudest of the three, because it is the one a reader is most
    // likely to mistake for parity.
    expect(fixtures.parity_is_partial).toContain("elevationDeg");
    expect(fixtures.reference_divergence.what_this_is).toContain(
      "NOT A PARITY COLUMN",
    );
    expect(fixtures.screening_cases.provenance).toContain(
      "NOT FROM THE REFERENCE",
    );
    expect(fixtures.screening_cases.cases.length).toBe(
      fixtures.screening_case_count,
    );
    // And the oracle really has no fs column, rather than one we chose to skip.
    const outputs = golden.cases[0].outputs as unknown as Record<
      string,
      unknown
    >;
    expect(Object.keys(outputs)).not.toContain("fs");
    // DMFprob is present in every case and asserted in none.
    for (const testCase of fixtures.cases) {
      expect(typeof testCase.expected.dominant_mode_probability).toBe("number");
    }
  });

  it("states where its tolerances come from", () => {
    expect(fixtures.tolerance_derivation).toContain("reference-parity.json");
    expect(fixtures.tolerance_derivation).toContain("2e-3");
    expect(fixtures.tolerance_derivation).toContain("90.47");
    // Slice A's budgets are reused unchanged where the quantity is slice A's.
    expect(TOL.distance_km).toBeLessThanOrEqual(0.1);
    expect(TOL.dmax_km).toBeLessThanOrEqual(1.0);
    expect(TOL.basic_muf_mhz).toBeLessThanOrEqual(0.05);
    // The wide elevation band exists for two named cases and nothing else.
    const wide = fixtures.cases.filter(
      (c) => c.reading.elevation_band === "table_1c_differs",
    );
    expect(wide.map((c) => c.case_id)).toEqual(["G07", "G10"]);
  });

  /**
   * The tight gate, and a different claim from the per-case budgets.
   *
   * On the 12 circuits where our Table 1c control point is the one the
   * reference's five-point search lands on, the selection geometry and the
   * oracle agree to the last digit the oracle publishes. Losing that is a regression even
   * though it would still sit inside the derived budget: a systematic 0.1
   * degree error in equation (13) passes all 14 per-case checks untouched and
   * fails here.
   */
  it("agrees with the oracle to the last digit the oracle publishes", () => {
    const worst = { elevationDeg: 0, slantRangeKm: 0, basicMufMHz: 0 };
    for (const testCase of fixtures.cases) {
      if (testCase.reading.elevation_band !== "table_1c_agrees") continue;
      const solved = solve(provider, testCase);
      const expected = testCase.expected;
      expect(solved.dominant).toBeDefined();
      const dominant = solved.dominant as PropagationMode;
      worst.elevationDeg = Math.max(
        worst.elevationDeg,
        Math.abs(
          (dominant.selectionElevationDeg as number) -
            expected.dominant_mode_elevation_deg,
        ),
      );
      worst.basicMufMHz = Math.max(
        worst.basicMufMHz,
        Math.abs(dominant.basicMufMHz - expected.dominant_mode_basic_muf_mhz),
      );
      expect(solved.lastSelected).toBeDefined();
      worst.slantRangeKm = Math.max(
        worst.slantRangeKm,
        Math.abs(
          ((solved.lastSelected as PropagationMode)
            .selectionSlantRangeKm as number) - expected.slant_range_km,
        ),
      );
    }
    // Measured 0.0042 degrees, 0.0121 km and 0.0050 MHz on 2026-09-12; these
    // are those with about a fifth of headroom, and every one of them is
    // inside the half-digit of a two-decimal column.
    expect(worst.elevationDeg).toBeLessThanOrEqual(5e-3);
    expect(worst.slantRangeKm).toBeLessThanOrEqual(2e-2);
    expect(worst.basicMufMHz).toBeLessThanOrEqual(6e-3);
    // The fixture records the same maxima, so it cannot drift from the run.
    expect(
      fixtures.observed_max_delta.elevation_deg_table_1c_agrees,
    ).toBeLessThanOrEqual(5e-3);
    expect(
      fixtures.observed_max_delta.slant_range_km_table_1c_agrees,
    ).toBeLessThanOrEqual(2e-2);
  });

  it.each(fixtures.cases.map((c) => [c.case_id, c] as const))(
    "%s",
    (_id, testCase) => {
      const solved = solve(provider, testCase);
      const expected = testCase.expected;
      const band = testCase.reading.elevation_band as Band;

      expect(
        Math.abs(solved.distanceKm - expected.distance_km),
      ).toBeLessThanOrEqual(TOL.distance_km);
      expect(Math.abs(solved.dmaxKm - expected.dmax_km)).toBeLessThanOrEqual(
        TOL.dmax_km,
      );

      // DMidx. The reference's dominant mode has to be in our set and has to be
      // one section 5.2.1 selects; which mode dominates is a slice C question.
      // Selected is not the same as supported: on G11 the section 5.1 height
      // cannot close the hop that the selection height reflects, so the mode is
      // labelled rather than dropped and reports no elevation. The fixture
      // carries the flag so this reads out of the oracle file, not out of a
      // case id written into the test.
      expect(solved.dominant).toBeDefined();
      const dominant = solved.dominant as PropagationMode;
      const closesHop = testCase.reading.section_5_1_closes_hop;
      expect(dominant.status).toBe(
        closesHop ? "supported" : "geometrically_unsupported",
      );
      expect(dominant.unsupportedReason).toBe(
        closesHop ? null : "mirror_height_cannot_close_hop",
      );
      expect(dominant.elevationDeg === null).toBe(!closesHop);
      expect(dominant.virtualSlantRangeKm === null).toBe(!closesHop);

      // ele and DMele are the same number on every one of these cases, because
      // the reference sets the short path's own elevation from the dominant
      // mode. Asserted rather than assumed. Both are equation (13) at the
      // equation (2) height, so the comparator field is the one they meet.
      expect(dominant.selectionElevationDeg).not.toBeNull();
      expect(expected.path_elevation_deg).toBe(
        expected.dominant_mode_elevation_deg,
      );
      expect(
        Math.abs(
          (dominant.selectionElevationDeg as number) -
            expected.dominant_mode_elevation_deg,
        ),
      ).toBeLessThanOrEqual(TOL.elevation_deg[band]);

      // DMBMUF, carried from slice A rather than recomputed.
      expect(
        Math.abs(dominant.basicMufMHz - expected.dominant_mode_basic_muf_mhz),
      ).toBeLessThanOrEqual(TOL.basic_muf_mhz);

      // ptick, the last mode the reference's loop computed.
      expect(solved.lastSelected).toBeDefined();
      const lastSelected = solved.lastSelected as PropagationMode;
      expect(
        Math.abs(
          (lastSelected.selectionSlantRangeKm as number) -
            expected.slant_range_km,
        ),
      ).toBeLessThanOrEqual(TOL.slant_range_km[band]);

      // DMhr, the section 5.1 height. The reference computes it only inside
      // `ELayerScreeningFrequency()`, which returns early past 4000 km; we need
      // it for equation (13) on every path, so past 4000 km there is nothing to
      // compare against and the oracle's 0.0 is not a height.
      if (!testCase.reading.screening_evaluated) {
        expect(expected.dominant_mode_reflection_height_km).toBe(0);
        expect(dominant.mirrorHeightKm).toBeGreaterThan(100);
        for (const mode of solved.modes) {
          expect(mode.screeningFrequencyMHz).toBeNull();
          expect(mode.status).not.toBe("screened");
        }
      } else if (testCase.reading.section_5_1_branch === "5.1a") {
        // Not a parity column. The reference's own section 5.1(a) drops the
        // published `+ 90.47 xr` from G, which collapses its height to A1; see
        // the fixture's tolerance_derivation. Prove the collapse instead of
        // asserting around it.
        expect(solved.referenceBranchAHeightKm).not.toBeNull();
        expect(
          Math.abs(
            (solved.referenceBranchAHeightKm as number) -
              expected.dominant_mode_reflection_height_km,
          ),
        ).toBeLessThanOrEqual(TOL.reference_branch_a_height_km);
        // And our published-formula height is the one the fixture records,
        // tens of kilometres above the reference's.
        expect(dominant.mirrorHeightKm).toBeCloseTo(
          testCase.reading.published_branch_a_height_km as number,
          2,
        );
        expect(
          dominant.mirrorHeightKm - expected.dominant_mode_reflection_height_km,
        ).toBeGreaterThan(40);
      } else {
        expect(
          Math.abs(
            dominant.mirrorHeightKm -
              expected.dominant_mode_reflection_height_km,
          ),
        ).toBeLessThanOrEqual(TOL.reflection_height_km);
      }
    },
  );

  /**
   * The negative findings, recorded because they are the reason the
   * hand-computed screening cases exist and the reason deviation 3 in
   * `modeSet.ts` is safe.
   */
  it("finds no screened mode and exactly one unsupported mode", () => {
    let minSelectionElevationDeg = Number.POSITIVE_INFINITY;
    const unsupported: string[] = [];
    for (const testCase of fixtures.cases) {
      const solved = solve(provider, testCase);
      for (const mode of solved.modes) {
        expect(mode.status).not.toBe("screened");
        if (mode.status === "geometrically_unsupported") {
          unsupported.push(`${testCase.case_id} ${mode.label}`);
          expect(mode.unsupportedReason).toBe("mirror_height_cannot_close_hop");
          expect(mode.elevationRad).toBeNull();
          expect(mode.elevationDeg).toBeNull();
          expect(mode.virtualSlantRangeKm).toBeNull();
        } else {
          expect(mode.status).toBe("supported");
          expect(mode.unsupportedReason).toBeNull();
          expect(mode.elevationDeg).not.toBeNull();
          expect(mode.virtualSlantRangeKm).not.toBeNull();
        }
        minSelectionElevationDeg = Math.min(
          minSelectionElevationDeg,
          mode.selectionElevationDeg as number,
        );
      }
    }
    // Deviation 3 of `modeSet.ts`: the 3 degree floor is applied to the
    // selection elevation, because section 3.5.1.1 puts it on the equation (2)
    // geometry. The shallowest selection elevation in the whole corpus is
    // G11's 2F2 at 3.711 degrees, so the floor never fires here. If a future
    // provider revision moved a mode under 3 degrees this test would say so
    // rather than let a labelling change pass unnoticed.
    expect(minSelectionElevationDeg).toBeGreaterThan(MIN_ELEVATION_DEG);
    expect(minSelectionElevationDeg).toBeLessThan(3.8);
    // And the one mode whose section 5.1 height cannot close the hop that its
    // selection height reflects. It is the reference's own dominant mode on
    // G11, which is why it is labelled rather than dropped and why its
    // selection fields stay populated. The fixture declares the case; slice C
    // excludes it under M07.
    expect(unsupported).toEqual(["G11 2F2"]);
    const declaredCase = fixtures.reference_divergence.below_horizon_case;
    expect(declaredCase).toContain("G11");
    expect(declaredCase).toContain("mirror_height_cannot_close_hop");
  });

  /**
   * The declared divergence, which is the opposite claim from every test above.
   *
   * `elevationDeg` and `virtualSlantRangeKm` are equation (13) and equation
   * (19) at the section 5.1 height, and the oracle's `ele`, `DMele` and `ptick`
   * are the same equations at the equation (2) height. The two are different
   * readings of the recommendation, not a measurement and an error, so what is
   * asserted here is that the difference is the one the fixture recorded and
   * has not drifted.
   */
  it("holds the declared divergence between the two readings", () => {
    const declared = new Map(
      fixtures.reference_divergence.cases.map((c) => [c.case_id, c]),
    );
    expect(declared.size).toBe(fixtures.cases.length);
    const bounds = fixtures.reference_divergence.bounds;
    let worstElevationDeg = 0;
    let worstSlantRangeKm = 0;

    for (const testCase of fixtures.cases) {
      const record = declared.get(testCase.case_id);
      expect(record).toBeDefined();
      const row = record as NonNullable<typeof record>;
      const solved = solve(provider, testCase);
      const dominant = solved.dominant as PropagationMode;
      const lastSelected = solved.lastSelected as PropagationMode;
      expect(dominant.label).toBe(row.dominant_mode);
      expect(lastSelected.label).toBe(row.last_selected_mode);

      // The recorded per-case difference, to the precision the fixture keeps.
      // On G11 there is no product elevation to difference: the section 5.1
      // height cannot close the hop the selection height reflects, so the
      // fixture carries null on both sides and what is recorded there is the
      // label, not an angle.
      if (row.elevation_delta_deg === null) {
        expect(row.product_elevation_deg).toBeNull();
        expect(dominant.elevationDeg).toBeNull();
        expect(dominant.status).toBe("geometrically_unsupported");
        expect(dominant.unsupportedReason).toBe(
          "mirror_height_cannot_close_hop",
        );
      } else {
        const elevationDeltaDeg =
          (dominant.elevationDeg as number) -
          testCase.expected.dominant_mode_elevation_deg;
        expect(elevationDeltaDeg).toBeCloseTo(row.elevation_delta_deg, 3);
        worstElevationDeg = Math.max(
          worstElevationDeg,
          Math.abs(elevationDeltaDeg),
        );
      }
      expect(dominant.mirrorHeightKm).toBeCloseTo(row.section_5_1_height_km, 2);
      expect(dominant.selectionMirrorHeightKm).toBeCloseTo(
        row.selection_height_km,
        2,
      );
      const slantRangeDeltaKm =
        (lastSelected.virtualSlantRangeKm as number) -
        testCase.expected.slant_range_km;
      expect(slantRangeDeltaKm).toBeCloseTo(row.slant_range_delta_km, 1);

      worstSlantRangeKm = Math.max(
        worstSlantRangeKm,
        Math.abs(slantRangeDeltaKm),
      );
    }

    // The wide bound, which exists only so that a change in either height is
    // reported. It is not a tolerance and the fixture says so.
    expect(worstElevationDeg).toBeLessThanOrEqual(bounds.elevation_deg);
    expect(worstSlantRangeKm).toBeLessThanOrEqual(bounds.slant_range_km);
    expect(worstElevationDeg).toBeCloseTo(
      fixtures.reference_divergence.observed_max.elevation_deg,
      3,
    );
    expect(worstSlantRangeKm).toBeCloseTo(
      fixtures.reference_divergence.observed_max.slant_range_km,
      1,
    );
    // Not a small difference dressed up as a divergence: the product elevation
    // is degrees away from the oracle's on most of the corpus.
    expect(worstElevationDeg).toBeGreaterThan(1);
    expect(bounds.derivation).toContain("drift detectors");
  });
});

/**
 * The screening cases, which are not parity: the oracle has no fs column, so
 * these are hand-computed from equations (11), (12) and (13) and asserted
 * exactly. There is no provider in them and therefore no residual to budget
 * for; the tolerance is 1e-9, the precision the fixture's derivation carries.
 */
describe("E-layer screening, hand-computed from the published equations", () => {
  const EXACT = 9;

  it.each(fixtures.screening_cases.cases.map((c) => [c.case_id, c] as const))(
    "%s",
    (_id, testCase) => {
      const expected = testCase.expected;

      // Equation (13) at the stated section 5.1 height, via the same
      // `hopGeometry` the mode set uses.
      const geometry = hopGeometry({
        groundDistanceKm: testCase.path_ground_distance_km,
        hopCount: testCase.hop_count,
        mirrorHeightKm: testCase.section_5_1_height_km,
      });
      expect(geometry.kind).toBe("supported");
      if (geometry.kind !== "supported") return;
      expect(geometry.hopGroundDistanceKm).toBeCloseTo(
        testCase.hop_ground_distance_km,
        EXACT,
      );
      const elevationDeg = (geometry.elevationAngleRad * 180) / Math.PI;
      expect(elevationDeg).toBeCloseTo(expected.elevation_deg, EXACT);

      // Equation (12).
      const incidenceRad = screeningIncidenceAngleRad(
        geometry.elevationAngleRad,
      );
      expect((incidenceRad * 180) / Math.PI).toBeCloseTo(
        expected.incidence_deg,
        EXACT,
      );

      // Section 4's foE, and equation (11).
      const foEValues = Object.values(testCase.foe_by_control_point);
      if (expected.selected_foe_mhz === null) {
        // S3: the path is longer than 4000 km, so section 4 selects nothing and
        // there is no fs. The contrast with S2 is the point: the same geometry
        // and the same foE values would have screened the mode.
        expect(testCase.path_ground_distance_km).toBeGreaterThan(4000);
        expect(expected.fs_mhz).toBeNull();
        expect(isScreened(null, testCase.frequency_mhz)).toBe(false);
        expect(expected.screened).toBe(false);
        // What it would have been, had section 4 applied.
        expect(
          screeningFrequencyMHz(
            screeningFoEMHz(foEValues),
            geometry.elevationAngleRad,
          ),
        ).toBeCloseTo(7.707874590763, EXACT);
        return;
      }

      const foE = screeningFoEMHz(foEValues);
      expect(foE).toBeCloseTo(expected.selected_foe_mhz, EXACT);
      const fs = screeningFrequencyMHz(foE, geometry.elevationAngleRad);
      expect(fs).toBeCloseTo(expected.fs_mhz as number, EXACT);
      expect(isScreened(fs, testCase.frequency_mhz)).toBe(expected.screened);
    },
  );

  it("would keep S2's mode on the lower foE, which is why the rule matters", () => {
    // Section 3.3 takes the LOWER of the two foE values for the basic MUF and
    // section 4 takes the HIGHER for screening. If they were the same way
    // round, S2's mode would survive at 7 MHz instead of being screened.
    const s2 = fixtures.screening_cases.cases.find((c) => c.case_id === "S2");
    expect(s2).toBeDefined();
    const testCase = s2 as (typeof fixtures.screening_cases.cases)[number];
    const geometry = hopGeometry({
      groundDistanceKm: testCase.path_ground_distance_km,
      hopCount: testCase.hop_count,
      mirrorHeightKm: testCase.section_5_1_height_km,
    });
    if (geometry.kind !== "supported") throw new Error("S2 does not reflect");
    const lower = Math.min(...Object.values(testCase.foe_by_control_point));
    const fsLower = screeningFrequencyMHz(lower, geometry.elevationAngleRad);
    expect(fsLower).toBeCloseTo(5.336220870528, EXACT);
    expect(isScreened(fsLower, testCase.frequency_mhz)).toBe(false);
    expect(isScreened(testCase.expected.fs_mhz, testCase.frequency_mhz)).toBe(
      true,
    );
  });
});
