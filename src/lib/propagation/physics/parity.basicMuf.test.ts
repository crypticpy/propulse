// @vitest-environment node
//
// Deliberately node: the same leaf must answer identically on a server and in
// a browser, and the CCIR coefficient asset is read from disk here.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import fixtures from "@/lib/propagation/fixtures/p533-basic-muf.cases.json";
import manifest from "@/lib/propagation/ionosphere/assets/manifest.json";
import type { AssetByteSource } from "@/lib/propagation/ionosphere/assets/loader";
import {
  createCcirIonosphereProvider,
  type IonosphereProvider,
} from "@/lib/propagation/ionosphere/provider";
import { canonicalCoordinates, known } from "@/lib/propagation/ionosphere/types";
import {
  resolveRoute,
  routeMidpoint,
} from "@/lib/propagation/geometry/route";
import { basicMuf, type ControlPointSampler } from "./basicMuf";
import {
  dayOrNightFromUtcSunTimes,
  operationalMuf,
  p533Season,
} from "./operationalMuf";

/**
 * Parity against the pinned ITU reference build, on the 22 golden circuits
 * shorter than 9000 km.
 *
 * This is not bit parity and the fixture says why: the CCIR provider has
 * measured residuals against the ITU data files, and the tolerance for each
 * column is derived from those residuals through equation (3) rather than
 * chosen to make the run green. The derivation is
 * `p533-basic-muf.cases.json.tolerance_derivation`, and it is read out here so
 * that widening it silently is not possible.
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
  readonly basicMufMHz: number;
  readonly operationalMufMHz: number;
  readonly f2ModeMufMHz: (hopCount: number) => number | null;
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
      // The oracle's own convention: integer month, integer UTC hour, the
      // 1.5-degree grid. See the fixture's `provider_mode` note.
      mode: "reference",
    });

  const sample: ControlPointSampler = (point) => {
    const state = stateAt(point.latitudeDeg, point.longitudeDeg);
    return {
      foF2MHz: state.foF2MHz,
      m3000F2: state.m3000F2,
      foEMHz: state.foEMHz,
      gyrofrequency300kmMHz: state.gyrofrequency300kmMHz,
    };
  };

  const result = basicMuf({ route, sample });
  if (result.kind !== "resolved") {
    throw new Error(`${testCase.case_id}: ${result.detail}`);
  }

  const midpoint = routeMidpoint(route);
  const midState = stateAt(midpoint.latitudeDeg, midpoint.longitudeDeg);
  const operational = operationalMuf({
    basicMuf: result,
    season: p533Season(midpoint.latitudeDeg, inputs.month),
    dayOrNight: dayOrNightFromUtcSunTimes({
      hourUtc: inputs.hour_utc,
      sunriseUtcHours: midState.solar.sunriseUtcHours,
      sunsetUtcHours: midState.solar.sunsetUtcHours,
    }),
    eirpDbW: 10 * Math.log10(inputs.tx_power_watts),
  });

  return {
    distanceKm: route.groundDistanceKm,
    dmaxKm: result.dmaxKm,
    basicMufMHz: result.pathBasicMufMHz,
    operationalMufMHz: operational.pathOperationalMufMHz,
    f2ModeMufMHz: (hopCount) =>
      result.f2?.modes.find((mode) => mode.hopCount === hopCount)
        ?.basicMufMHz ?? null,
  };
}

describe("basic and operational MUF parity with the ITU reference", () => {
  let provider: IonosphereProvider;

  beforeAll(async () => {
    provider = await createCcirIonosphereProvider(assetBytes);
  });

  it("keeps only the cases the short-path method produces", () => {
    expect(fixtures.case_count).toBe(fixtures.cases.length);
    expect(fixtures.cases.length).toBe(22);
    for (const testCase of fixtures.cases) {
      expect(testCase.expected.distance_km).toBeLessThan(9000);
    }
    expect(fixtures.reference_commit).toBe(
      "cd172be56dc04b154e5d2fa91cbaa6ecf5284305",
    );
  });

  it("states where its tolerances come from", () => {
    // A tolerance with no derivation is a number that was raised until the
    // run went green. This pins the shape of the argument, not its prose.
    expect(fixtures.tolerance_derivation).toContain("reference-parity.json");
    expect(fixtures.tolerance_derivation).toContain("2e-3");
    expect(TOL.basic_muf_mhz).toBeLessThanOrEqual(0.05);
    expect(TOL.operational_muf_mhz).toBeLessThanOrEqual(0.07);
  });

  /**
   * A second, much tighter gate, and a different claim from the one above.
   *
   * The per-case budget is derived from the provider's residual and is
   * deliberately not narrowed to what this corpus happens to show, because
   * these 22 control points do not exercise the residual's worst case. But
   * what the corpus *does* show is that every MUF delta sits at or under
   * 5e-3 MHz, the half-digit of the golden columns' own two-decimal printing:
   * the leaf and the oracle agree to the last digit the oracle publishes.
   *
   * Losing that is a regression even though it would still be inside the
   * derived budget. Without this, a systematic 0.2% error in Cd - a single
   * mistyped coefficient - passes all 22 cases untouched, because 0.2% of a
   * 20 MHz MUF is 0.04 MHz and the budget is 0.05.
   */
  it("agrees with the oracle to the last digit the oracle publishes", () => {
    const worst = { distanceKm: 0, basicMufMHz: 0, operationalMufMHz: 0 };
    for (const testCase of fixtures.cases) {
      const solved = solve(provider, testCase);
      const expected = testCase.expected;
      worst.distanceKm = Math.max(
        worst.distanceKm,
        Math.abs(solved.distanceKm - expected.distance_km),
      );
      worst.basicMufMHz = Math.max(
        worst.basicMufMHz,
        Math.abs(solved.basicMufMHz - expected.basic_muf_mhz),
      );
      worst.operationalMufMHz = Math.max(
        worst.operationalMufMHz,
        Math.abs(solved.operationalMufMHz - expected.operational_muf_mhz),
      );
    }
    // The printed half-digit is 5e-3 MHz; 6e-3 leaves one part in a thousand
    // of slack for a future provider revision without letting a systematic
    // error through.
    expect(worst.basicMufMHz).toBeLessThanOrEqual(6e-3);
    expect(worst.operationalMufMHz).toBeLessThanOrEqual(6e-3);
    // The whole distance spread is the 6371 against 6371.009 km Earth radius.
    expect(worst.distanceKm).toBeLessThanOrEqual(0.02);
    // And the fixture records the same maxima, so the file cannot drift away
    // from what the run measures.
    expect(fixtures.observed_max_delta.basic_muf_mhz).toBeLessThanOrEqual(6e-3);
    expect(fixtures.observed_max_delta.distance_km).toBeLessThanOrEqual(0.02);
  });

  it.each(fixtures.cases.map((c) => [c.case_id, c] as const))(
    "%s",
    (_id, testCase) => {
      const solved = solve(provider, testCase);
      const expected = testCase.expected;

      expect(
        Math.abs(solved.distanceKm - expected.distance_km),
      ).toBeLessThanOrEqual(TOL.distance_km);
      expect(Math.abs(solved.dmaxKm - expected.dmax_km)).toBeLessThanOrEqual(
        TOL.dmax_km,
      );
      expect(
        Math.abs(solved.basicMufMHz - expected.basic_muf_mhz),
      ).toBeLessThanOrEqual(TOL.basic_muf_mhz);
      expect(
        Math.abs(solved.operationalMufMHz - expected.operational_muf_mhz),
      ).toBeLessThanOrEqual(TOL.operational_muf_mhz);

      // Where the reference names a dominant mode, its order and its own
      // basic MUF are a per-mode check: on G05 and G10 it is a higher-order
      // mode, which is the only independent evidence this corpus carries for
      // equations (7) and (8).
      const dominant = expected.dominant_mode;
      if (dominant !== "NONE" && dominant.endsWith("F2")) {
        const hopCount = Number(dominant.slice(0, -2));
        const mine = solved.f2ModeMufMHz(hopCount);
        expect(mine).not.toBeNull();
        expect(
          Math.abs(
            (mine as number) -
              (expected as { dominant_mode_basic_muf_mhz: number })
                .dominant_mode_basic_muf_mhz,
          ),
        ).toBeLessThanOrEqual(TOL.dominant_mode_basic_muf_mhz);
      }
    },
  );
});
