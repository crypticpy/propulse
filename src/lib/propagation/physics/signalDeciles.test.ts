// @vitest-environment node
//
// Node, because the sha256 pin reads the transcribed P.842-5 asset off disk.
// The module itself imports the JSON and runs anywhere.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveRoute, routeSample } from "@/lib/propagation/geometry/route";
import type { NoiseComponent } from "@/lib/propagation/noise/p372Noise";
import table2 from "./assets/p842-table2-signal-deciles.json";
import { geomagneticLatitudeDeg } from "./auroralLoss";
import {
  scanFootnoteSpan,
  signalDayToDayDeciles,
  snrDecileDeviations,
  table2RowIndex,
  FOOTNOTE_CONTROL_POINT_INSET_KM,
  HIGH_LATITUDE_THRESHOLD_DEG,
  P842_TABLE_2_SHA256,
  WITHIN_HOUR_LOWER_DECILE_DB,
  WITHIN_HOUR_UPPER_DECILE_DB,
} from "./signalDeciles";

const ASSET_PATH = path.join(
  process.cwd(),
  "src/lib/propagation/physics/assets/p842-table2-signal-deciles.json",
);

function route(txLat: number, txLon: number, rxLat: number, rxLon: number) {
  const resolved = resolveRoute(
    { latitudeDeg: txLat, longitudeDeg: txLon },
    { latitudeDeg: rxLat, longitudeDeg: rxLon },
    { direction: "short" },
  );
  if (resolved.kind !== "resolved") {
    throw new Error(`fixture route is ${resolved.reason}`);
  }
  return resolved;
}

describe("the transcribed P.842-5 Table 2 asset", () => {
  it("hashes to the sha256 recorded in the module", async () => {
    const bytes = await readFile(ASSET_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      P842_TABLE_2_SHA256,
    );
  });

  it("carries the published table, row for row", () => {
    // Written out here as a second transcription, independent of the asset:
    // a digest catches a change to the file, this catches the file having been
    // wrong when the digest was taken. Read off page 5 of P.842-5.
    expect(table2.frequency_ratio_upper_bounds).toEqual([
      0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 3.0, 4.0, 5.0,
    ]);
    expect(table2.deviations_db.below_60_deg.lower_decile).toEqual([
      8, 12, 13, 10, 8, 8, 8, 7, 6, 5,
    ]);
    expect(table2.deviations_db.below_60_deg.upper_decile).toEqual([
      6, 8, 12, 13, 12, 9, 9, 8, 7, 7,
    ]);
    expect(table2.deviations_db.at_or_above_60_deg.lower_decile).toEqual([
      11, 16, 17, 13, 11, 11, 11, 9, 8, 7,
    ]);
    expect(table2.deviations_db.at_or_above_60_deg.upper_decile).toEqual([
      9, 11, 12, 13, 12, 9, 9, 8, 7, 7,
    ]);
  });

  it("says where the two within-the-hour literals come from instead", () => {
    // Steps 4 and 7 of Table 1, not Table 2, which is why they are constants
    // in the module and not rows of the asset.
    expect(WITHIN_HOUR_UPPER_DECILE_DB).toBe(5);
    expect(WITHIN_HOUR_LOWER_DECILE_DB).toBe(8);
    expect(table2.rules.use).toContain("DuSh = 5");
    expect(table2.rules.use).toContain("DlSh = 8");
  });

  it("is a table whose high-latitude block is never the kinder one", () => {
    // The physical claim of the table, stated as an invariant: a path that
    // reaches the auroral zone fades at least as much, never less.
    const low = table2.deviations_db.below_60_deg;
    const high = table2.deviations_db.at_or_above_60_deg;
    for (let i = 0; i < low.lower_decile.length; i++) {
      expect(high.lower_decile[i]).toBeGreaterThanOrEqual(low.lower_decile[i]);
      expect(high.upper_decile[i]).toBeGreaterThanOrEqual(low.upper_decile[i]);
    }
  });
});

describe("deviation 1: which row of Table 2 a frequency ratio reads", () => {
  it("treats each published label as the upper bound of its band", () => {
    // The "<= 0.80" row carries everything at or below 0.80 and nothing above.
    expect(table2RowIndex(0.1)).toBe(0);
    expect(table2RowIndex(0.8)).toBe(0);
    expect(table2RowIndex(0.80000001)).toBe(1);
    expect(table2RowIndex(1.0)).toBe(1);
    expect(table2RowIndex(1.0000001)).toBe(2);
    expect(table2RowIndex(1.2)).toBe(2);
    expect(table2RowIndex(1.4)).toBe(3);
    expect(table2RowIndex(1.6)).toBe(4);
    expect(table2RowIndex(1.8)).toBe(5);
    expect(table2RowIndex(2.0)).toBe(6);
    expect(table2RowIndex(3.0)).toBe(7);
    expect(table2RowIndex(4.0)).toBe(8);
    // And the ">= 5.00" row carries everything above 4.0, including 4.5,
    // which no other reading of the labels places anywhere.
    expect(table2RowIndex(4.5)).toBe(9);
    expect(table2RowIndex(5.0)).toBe(9);
    expect(table2RowIndex(500)).toBe(9);
  });

  it("keeps the peak the table puts on the MUF", () => {
    // The deciles are not monotonic in the ratio: they rise to a maximum
    // where the operating frequency sits on the basic MUF and fall away on
    // both sides. Interpolating between rows would smooth that away, which is
    // the second alternative deviation 1 rejects.
    const lower = table2.deviations_db.below_60_deg.lower_decile;
    const upper = table2.deviations_db.below_60_deg.upper_decile;
    expect(Math.max(...lower)).toBe(lower[2]);
    expect(Math.max(...upper)).toBe(upper[3]);
    expect(lower[0]).toBeLessThan(lower[2]);
    expect(lower[9]).toBeLessThan(lower[2]);
  });
});

describe("deviation 2: the 60 degree footnote, over the whole span", () => {
  it("finds the maximum exactly, and a dense scan agrees", () => {
    // The claim the module makes is that two endpoints plus the sinusoid's
    // own extrema are the maximum, not a sample of it. This is that claim
    // checked against 4 000 samples of the same span.
    const cases = [
      route(60.17, 24.94, 39.9, 116.41),
      route(-33.87, 151.21, 51.5, -0.13),
      route(30.3, -97.7, 35.68, 139.77),
      route(-23.55, -46.63, 55.75, 37.62),
      route(64.14, -21.94, -34.6, -58.38),
    ];
    for (const path of cases) {
      const scan = scanFootnoteSpan(path);
      let densest = -1;
      const steps = 4000;
      for (let i = 0; i <= steps; i++) {
        const sKm =
          scan.spanKm.from + ((scan.spanKm.to - scan.spanKm.from) * i) / steps;
        const point = routeSample(path, sKm);
        densest = Math.max(
          densest,
          Math.abs(
            geomagneticLatitudeDeg(point.latitudeDeg, point.longitudeDeg),
          ),
        );
      }
      // The analytic peak is at or above every sample, and the dense scan
      // reaches it: the two agree to well inside a hundredth of a degree.
      expect(scan.peakAbsGeomagneticLatitudeDeg).toBeGreaterThanOrEqual(
        densest - 1e-9,
      );
      expect(scan.peakAbsGeomagneticLatitudeDeg - densest).toBeLessThan(0.01);
    }
  });

  it("excludes the 1 000 km at each end that the footnote excludes", () => {
    const path = route(60.17, 24.94, 39.9, 116.41);
    const scan = scanFootnoteSpan(path);
    expect(scan.spanKm.from).toBe(FOOTNOTE_CONTROL_POINT_INSET_KM);
    expect(scan.spanKm.to).toBeCloseTo(
      path.groundDistanceKm - FOOTNOTE_CONTROL_POINT_INSET_KM,
      6,
    );
    expect(scan.peakAtKm).toBeGreaterThanOrEqual(scan.spanKm.from);
    expect(scan.peakAtKm).toBeLessThanOrEqual(scan.spanKm.to);
  });

  it("reads the high block for a path over the auroral zone", () => {
    // Reykjavik to Anchorage crosses the geomagnetic pole region.
    const scan = scanFootnoteSpan(route(64.14, -21.94, 61.22, -149.9));
    expect(scan.block).toBe("at_or_above_60_deg");
    expect(scan.peakAbsGeomagneticLatitudeDeg).toBeGreaterThan(
      HIGH_LATITUDE_THRESHOLD_DEG,
    );
  });

  it("reads the low block for a path that stays in the tropics", () => {
    const scan = scanFootnoteSpan(route(-1.29, 36.82, 1.35, 103.82));
    expect(scan.block).toBe("below_60_deg");
    expect(scan.peakAbsGeomagneticLatitudeDeg).toBeLessThan(
      HIGH_LATITUDE_THRESHOLD_DEG,
    );
  });

  it("catches a crossing that lies between the reference's three points", () => {
    // The whole of deviation 2, made visible. The pinned reference tests
    // mid-path and the two 1 000 km control points only; New York to Riyadh
    // reaches 57.3 degrees geomagnetic at the worst of those three and 62.1
    // degrees between them, so the two readings pick different blocks of
    // Table 2 and differ by 3 dB on the lower decile.
    const path = route(40.71, -74.01, 24.71, 46.68);
    const scan = scanFootnoteSpan(path);
    const threePoints = [
      FOOTNOTE_CONTROL_POINT_INSET_KM,
      path.groundDistanceKm / 2,
      path.groundDistanceKm - FOOTNOTE_CONTROL_POINT_INSET_KM,
    ].map((sKm) => {
      const point = routeSample(path, sKm);
      return Math.abs(
        geomagneticLatitudeDeg(point.latitudeDeg, point.longitudeDeg),
      );
    });
    expect(Math.max(...threePoints)).toBeLessThan(HIGH_LATITUDE_THRESHOLD_DEG);
    expect(scan.block).toBe("at_or_above_60_deg");
    expect(scan.peakAtKm).toBeGreaterThan(FOOTNOTE_CONTROL_POINT_INSET_KM);
    expect(scan.peakAtKm).toBeLessThan(
      path.groundDistanceKm - FOOTNOTE_CONTROL_POINT_INSET_KM,
    );
  });
});

describe("deviation 3: a path shorter than 2 000 km", () => {
  it("collapses the footnote's span onto the mid-path point", () => {
    // Reykjavik to Nuuk, 1 429 km, at 73.7 degrees geomagnetic throughout.
    const path = route(64.14, -21.94, 64.18, -51.69);
    expect(path.groundDistanceKm).toBeLessThan(2000);
    const scan = scanFootnoteSpan(path);
    expect(scan.spanIsMidPathOnly).toBe(true);
    expect(scan.spanKm.from).toBeCloseTo(path.groundDistanceKm / 2, 9);
    expect(scan.spanKm.to).toBeCloseTo(path.groundDistanceKm / 2, 9);
    // And it is a high-latitude path, which the reference's reading would
    // put in the "< 60" block purely because it is short.
    expect(scan.block).toBe("at_or_above_60_deg");
  });

  it("is continuous at the 2 000 km boundary", () => {
    // The reading is the limit of the recommendation's own span, so nothing
    // jumps as a path crosses 2 000 km. A path just above the boundary has a
    // span of nearly zero length around the same point.
    const justOver = route(0, 0, 0, 18.0);
    expect(justOver.groundDistanceKm).toBeGreaterThan(2000);
    expect(justOver.groundDistanceKm).toBeLessThan(2100);
    const scan = scanFootnoteSpan(justOver);
    expect(scan.spanIsMidPathOnly).toBe(false);
    expect(scan.spanKm.to - scan.spanKm.from).toBeLessThan(100);
  });
});

describe("deviation 4: |Gn|, not signed Gn", () => {
  it("reads the high block on a path whose footnote span is entirely south of the geomagnetic equator", () => {
    // Wellington to Cape Town: the footnote span's peak signed geomagnetic
    // latitude is about -86.4 degrees at around 4 922 km, never positive.
    // The pinned reference tests the signed value and would never select the
    // ">= 60" block for a southern-only span; this module tests |Gn| and
    // does, which is deviation 4 made visible rather than merely asserted.
    const scan = scanFootnoteSpan(route(-41.29, 174.78, -33.92, 18.42));
    expect(scan.block).toBe("at_or_above_60_deg");
    expect(scan.peakAbsGeomagneticLatitudeDeg).toBeGreaterThan(
      HIGH_LATITUDE_THRESHOLD_DEG,
    );
  });
});

describe("Table 2 through a path", () => {
  // Nairobi to Singapore, which never leaves the "< 60" block, so what this
  // block tests is the row selection and nothing else.
  const path = route(-1.29, 36.82, 1.35, 103.82);

  it("returns the row the ratio selects, with the row it used", () => {
    const result = signalDayToDayDeciles({
      route: path,
      frequencyMHz: 14.1,
      pathBasicMufMHz: 14.1,
    });
    if (result.kind !== "resolved") throw new Error(result.detail);
    expect(result.frequencyToBasicMufRatio).toBe(1);
    expect(result.rowIndex).toBe(1);
    expect(result.rowLabel).toBe("1.0");
    expect(result.upperDb).toBe(8);
    expect(result.lowerDb).toBe(12);
  });

  it("labels a basic MUF it cannot divide by instead of inventing one", () => {
    for (const pathBasicMufMHz of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const result = signalDayToDayDeciles({
        route: path,
        frequencyMHz: 14.1,
        pathBasicMufMHz,
      });
      expect(result.kind).toBe("unsupported");
      if (result.kind === "unsupported") {
        expect(result.reason).toBe("basic_muf_unavailable");
        expect(result.detail).toContain("P.842-5");
      }
    }
    const noFrequency = signalDayToDayDeciles({
      route: path,
      frequencyMHz: Number.NaN,
      pathBasicMufMHz: 14.1,
    });
    expect(noFrequency.kind).toBe("unsupported");
  });

  it("throws on a route whose fields are not finite, which resolveRoute never produces", () => {
    // The docstring's "never throws" is qualified to any ResolvedRoute
    // geometry/route.ts actually produced: scanFootnoteSpan reads
    // route.groundDistanceKm and route.origin/route.tangent with no
    // finiteness check of its own, and geomagneticLatitudeDeg throws
    // RangeError on a non-finite latitude or longitude. This pins that real
    // behaviour rather than the wider guarantee the docstring used to state.
    expect(() =>
      signalDayToDayDeciles({
        route: { ...path, origin: { x: Number.NaN, y: 0, z: 0 } },
        frequencyMHz: 14,
        pathBasicMufMHz: 20,
      }),
    ).toThrow(RangeError);
  });
});

describe("P.842-5 Table 1 Steps 6 and 9", () => {
  const noise = {
    atmospheric: { fa: 56.53, du: 9.4, dl: 6.2 } satisfies NoiseComponent,
    manMade: { fa: 57.09, du: 10.6, dl: 5.3 } satisfies NoiseComponent,
    galactic: { fa: 39.21, du: 2, dl: 2 } satisfies NoiseComponent,
  };

  it("is the root sum of squares the table writes out", () => {
    const result = snrDecileDeviations({ upperDb: 8, lowerDb: 12 }, noise);
    expect(result.upperDb).toBeCloseTo(
      Math.sqrt(
        8 ** 2 +
          WITHIN_HOUR_UPPER_DECILE_DB ** 2 +
          result.noiseLowerTermDb ** 2,
      ),
      12,
    );
    expect(result.lowerDb).toBeCloseTo(
      Math.sqrt(
        12 ** 2 +
          WITHIN_HOUR_LOWER_DECILE_DB ** 2 +
          result.noiseUpperTermDb ** 2,
      ),
      12,
    );
  });

  it("puts the lower noise decile on the upper ratio decile", () => {
    // The sign trap. A signal-to-noise ratio is at its upper decile when the
    // noise is at its LOWER one, so Step 6's logarithm is how far the total
    // noise falls and Step 9's is how far it rises. Both are positive, and
    // swapping the two would change DuSN and DlSN by several dB with no
    // component-level test able to see it.
    const result = snrDecileDeviations({ upperDb: 8, lowerDb: 12 }, noise);
    expect(result.noiseLowerTermDb).toBeGreaterThan(0);
    expect(result.noiseUpperTermDb).toBeGreaterThan(0);
    // Each term is bounded by the widest component decile in its direction,
    // because a power sum moves less than its largest term.
    expect(result.noiseLowerTermDb).toBeLessThan(
      Math.max(noise.atmospheric.dl, noise.manMade.dl, noise.galactic.dl),
    );
    expect(result.noiseUpperTermDb).toBeLessThan(
      Math.max(noise.atmospheric.du, noise.manMade.du, noise.galactic.du),
    );
  });

  it("reduces to one component's own decile when it dominates", () => {
    // A sanity anchor with an independent answer: put the whole of the noise
    // in one component and the total must move by exactly that component's
    // decile.
    const dominated = {
      atmospheric: { fa: 60, du: 7, dl: 4 },
      manMade: { fa: -60, du: 11, dl: 6.7 },
      galactic: { fa: -60, du: 2, dl: 2 },
    };
    const result = snrDecileDeviations({ upperDb: 8, lowerDb: 12 }, dominated);
    expect(result.noiseLowerTermDb).toBeCloseTo(4, 6);
    expect(result.noiseUpperTermDb).toBeCloseTo(7, 6);
  });

  it("returns finite numbers for every finite input", () => {
    const wide = {
      atmospheric: { fa: 120, du: 30, dl: 30 },
      manMade: { fa: -40, du: 0, dl: 0 },
      galactic: { fa: 0, du: 2, dl: 2 },
    };
    const result = snrDecileDeviations({ upperDb: 5, lowerDb: 7 }, wide);
    for (const value of Object.values(result)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("stays finite when a signal decile term is 1e200 (rootSumSquare overflow)", () => {
    // `term * term` overflows `Number.MAX_VALUE` well before 1e200 and turns
    // `Math.sqrt` of the sum into `Infinity`; `Math.hypot` is specified to
    // avoid intermediate overflow and must stay finite here.
    const result = snrDecileDeviations({ upperDb: 1e200, lowerDb: 1e200 }, noise);
    expect(Number.isFinite(result.upperDb)).toBe(true);
    expect(Number.isFinite(result.lowerDb)).toBe(true);
  });

  it("stays finite when a component's noise figure is very large", () => {
    // `circuitDomain` admits any finite noise figure; a linear-domain power
    // sum overflows `10^(db/10)` to Infinity well before 5000 dB, turning
    // both decile terms into NaN. The logarithmic-domain sum must not.
    const huge = {
      atmospheric: { fa: 5000, du: 9.4, dl: 6.2 },
      manMade: { fa: 57.09, du: 10.6, dl: 5.3 },
      galactic: { fa: 39.21, du: 2, dl: 2 },
    };
    const result = snrDecileDeviations({ upperDb: 8, lowerDb: 12 }, huge);
    expect(Number.isFinite(result.noiseLowerTermDb)).toBe(true);
    expect(Number.isFinite(result.noiseUpperTermDb)).toBe(true);
    expect(Number.isFinite(result.upperDb)).toBe(true);
    expect(Number.isFinite(result.lowerDb)).toBe(true);
  });

  it("matches the old power-ratio formula for ordinary values, to 1e-9 dB", () => {
    const result = snrDecileDeviations({ upperDb: 8, lowerDb: 12 }, noise);
    const powerSum = (dbValues: readonly number[]): number =>
      dbValues.reduce((total, db) => total + Math.pow(10, db / 10), 0);
    const components = [noise.atmospheric, noise.manMade, noise.galactic];
    const median = powerSum(components.map((c) => c.fa));
    const atLowerDecile = powerSum(components.map((c) => c.fa - c.dl));
    const atUpperDecile = powerSum(components.map((c) => c.fa + c.du));
    const expectedLowerTermDb = 10 * Math.log10(median / atLowerDecile);
    const expectedUpperTermDb = 10 * Math.log10(atUpperDecile / median);
    expect(result.noiseLowerTermDb).toBeCloseTo(expectedLowerTermDb, 9);
    expect(result.noiseUpperTermDb).toBeCloseTo(expectedUpperTermDb, 9);
  });
});
