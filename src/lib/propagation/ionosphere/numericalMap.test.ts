import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import fixtures from "./fixtures/reference-parity.json";
import manifest from "./assets/manifest.json";
import {
  loadNumericalMapAsset,
  resetNumericalMapAssetCache,
  type NumericalMapAsset,
} from "./assets/loader";
import { D2R } from "./modip";
import {
  createCcirIonosphereProvider,
  DETERMINISM_PROBE_DIGEST,
  DETERMINISM_PROBE_QUERY,
  ionosphereStateDigest,
} from "./provider";
import {
  QF,
  QM,
  bilinearInterpolation,
  blendBySolarIndex,
  evaluateMap,
  FOF2_GEOGRAPHIC_TERMS,
  FOF2_TIME_TERMS,
  geographicFunctions,
  GRID_INCREMENT_DEG,
  GRID_LATITUDES,
  GRID_LONGITUDES,
  gridNeighbourhood,
  gridNodeCoordinatesRad,
  M3000F2_GEOGRAPHIC_TERMS,
  M3000F2_TIME_TERMS,
  MAX_R12,
  referenceMapHour,
  timeTerms,
} from "./numericalMap";

/**
 * Coefficient asset for tests, read from `public/` rather than fetched. The
 * loader still verifies the manifest digest, so a test run is also a check that
 * the committed binary and the committed manifest agree.
 */
async function readAssetForTests(): Promise<NumericalMapAsset> {
  resetNumericalMapAssetCache();
  return loadNumericalMapAsset(async () => {
    const file = path.join(process.cwd(), manifest.asset.path);
    const bytes = await readFile(file);
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  });
}

/**
 * Rows read straight out of the ITU's own `ionos%02d.bin` monthly grids at
 * exact 1.5-degree nodes, so there is no coordinate rounding in them at all.
 * The tolerance is the float32 storage of those grids, not a fudge factor: the
 * build script measures the worst residual over all 16,796,736 nodes as
 * 1.03e-4 MHz and gates on 1e-3.
 */
const GRID_ROWS = fixtures.rows.filter(
  (row) => row.source === "itu-ionos-grid",
);
const GRID_TOLERANCE_MHZ = 2e-4;
const GRID_TOLERANCE_M3000 = 1e-5;

describe("exported basis tables", () => {
  it("freezes the shared exponent tables", () => {
    // QF and QM define the shape of every basis this module builds and are
    // exported. A writable module-level array is a channel between consumers.
    expect(Object.isFrozen(QF)).toBe(true);
    expect(Object.isFrozen(QM)).toBe(true);
    expect(() => {
      (QF as unknown as number[])[0] = 0;
    }).toThrow(TypeError);
  });
});

describe("CCIR numerical map basis", () => {
  it("emits exactly the term counts the coefficient blocks are sized for", () => {
    expect(geographicFunctions(0.5, 1.0, "foF2")).toHaveLength(
      FOF2_GEOGRAPHIC_TERMS,
    );
    expect(geographicFunctions(0.5, 1.0, "m3000F2")).toHaveLength(
      M3000F2_GEOGRAPHIC_TERMS,
    );
  });

  it("produces time terms [1, sin kT, cos kT] about T = 15*UT - 180 degrees", () => {
    const terms = timeTerms(6, FOF2_TIME_TERMS);
    expect(terms).toHaveLength(FOF2_TIME_TERMS);
    expect(terms[0]).toBe(1);
    // T = 15*6 - 180 = -90 degrees.
    expect(terms[1]).toBeCloseTo(-1, 12);
    expect(terms[2]).toBeCloseTo(0, 12);
    expect(timeTerms(12, M3000F2_TIME_TERMS)).toHaveLength(M3000F2_TIME_TERMS);
  });

  it("is periodic in UT with a period of 24 hours", () => {
    const a = timeTerms(3.25, FOF2_TIME_TERMS);
    const b = timeTerms(27.25, FOF2_TIME_TERMS);
    for (let i = 0; i < a.length; i += 1) expect(b[i]).toBeCloseTo(a[i], 12);
  });

  it("is continuous in longitude across the antimeridian", () => {
    // The basis carries sin(m*lambda) up to m = 8, which is odd about 180
    // degrees, so 0.001 degrees either side of the seam differ by at most
    // 8 * sin(0.001 deg) ~ 1.4e-4. Anything larger would be a wrap bug.
    const east = geographicFunctions(0.6, 179.999 * D2R, "foF2");
    const west = geographicFunctions(0.6, -179.999 * D2R, "foF2");
    for (let i = 0; i < east.length; i += 1) {
      expect(Math.abs(west[i] - east[i])).toBeLessThan(1.5e-4);
    }
  });
});

describe("numerical map against the ITU ionos*.bin grids", () => {
  let asset: NumericalMapAsset;

  beforeAll(async () => {
    asset = await readAssetForTests();
  });

  it("has a grid fixture row for both solar levels and both hemispheres", () => {
    expect(GRID_ROWS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(GRID_ROWS.map((row) => row.ssn))).toEqual(new Set([0, 100]));
    expect(GRID_ROWS.some((row) => row.latitude_deg < 0)).toBe(true);
    expect(GRID_ROWS.some((row) => row.latitude_deg > 0)).toBe(true);
  });

  it.each(GRID_ROWS.map((row) => [row.case_id, row] as const))(
    "reproduces %s",
    (_id, row) => {
      const levels = asset.blocks[row.month - 1];
      const latitudeRad = row.latitude_deg * D2R;
      const longitudeRad = row.longitude_deg * D2R;
      const mapHour = referenceMapHour(row.hour_utc);
      const foF2Geo = geographicFunctions(latitudeRad, longitudeRad, "foF2");
      const m3000Geo = geographicFunctions(
        latitudeRad,
        longitudeRad,
        "m3000F2",
      );
      const foF2Time = timeTerms(mapHour, FOF2_TIME_TERMS);
      const m3000Time = timeTerms(mapHour, M3000F2_TIME_TERMS);

      const foF2 = blendBySolarIndex(
        evaluateMap(levels[0].foF2, foF2Geo, foF2Time),
        evaluateMap(levels[1].foF2, foF2Geo, foF2Time),
        row.ssn,
      );
      const m3000 = blendBySolarIndex(
        evaluateMap(levels[0].m3000F2, m3000Geo, m3000Time),
        evaluateMap(levels[1].m3000F2, m3000Geo, m3000Time),
        row.ssn,
      );
      expect(Math.abs(foF2 - row.foF2_mhz)).toBeLessThan(GRID_TOLERANCE_MHZ);
      expect(Math.abs(m3000 - (row.m3000f2 as number))).toBeLessThan(
        GRID_TOLERANCE_M3000,
      );
    },
  );

  it("carries the build script's full-domain residuals in the manifest", () => {
    const verification = manifest.verification;
    expect(verification.points_per_parameter).toBe(
      12 * 2 * 24 * GRID_LONGITUDES * GRID_LATITUDES,
    );
    expect(verification.foF2_pass).toBe(true);
    expect(verification.m3000f2_pass).toBe(true);
    expect(verification.foF2_max_abs_delta_mhz).toBeLessThan(
      verification.foF2_gate_mhz,
    );
    expect(verification.m3000f2_max_abs_delta).toBeLessThan(
      verification.m3000f2_gate,
    );
  });
});

describe("P.533 grid neighbourhood", () => {
  const inc = GRID_INCREMENT_DEG * D2R;

  it("returns zero fractions and an anchor on the query point at a node", () => {
    const n = gridNeighbourhood(30 * D2R, 60 * D2R);
    expect(n.fracJ).toBeCloseTo(0, 12);
    expect(n.fracK).toBeCloseTo(0, 12);
    // Node coordinates are `k * 1.5 * D2R - PI/2` exactly as the reference
    // forms them, mixing its truncated D2R with a full-precision PI. That is a
    // 3.6e-9 radian inconsistency, worth 1e-8 MHz of foF2, and it is kept
    // rather than tidied so the neighbourhood matches P.533 node for node.
    const { latitudeRad, longitudeRad } = gridNodeCoordinatesRad(n.ll);
    expect(latitudeRad).toBeCloseTo(30 * D2R, 8);
    expect(longitudeRad).toBeCloseTo(60 * D2R, 8);
  });

  it("rolls longitude over from the east edge to index 0, not off the array", () => {
    // Column 240 is only reachable at exactly +180 degrees, which
    // `canonicalCoordinates` folds to -180, so this branch is unreachable
    // through the provider. It is ported and tested anyway: it is the
    // reference's, and a future caller of `gridNeighbourhood` must not fall off
    // the end of the array.
    const n = gridNeighbourhood(30 * D2R, 180 * D2R);
    expect(n.ll.j).toBe(GRID_LONGITUDES - 1);
    expect([n.lr.j, n.ur.j]).toEqual([0, 0]);
  });

  it("rolls longitude over from the west edge to the east edge", () => {
    const n = gridNeighbourhood(-30 * D2R, -180 * D2R);
    expect([n.ll.j, n.ul.j]).toEqual([
      GRID_LONGITUDES - 1,
      GRID_LONGITUDES - 1,
    ]);
  });

  it("collapses at the poles instead of wrapping north to south", () => {
    const north = gridNeighbourhood(90 * D2R, 45 * D2R);
    expect(new Set([north.ll.k, north.lr.k, north.ul.k, north.ur.k])).toEqual(
      new Set([GRID_LATITUDES - 1]),
    );
    const south = gridNeighbourhood(-90 * D2R, 45 * D2R);
    expect(new Set([south.ll.k, south.lr.k, south.ul.k, south.ur.k])).toEqual(
      new Set([0]),
    );
  });

  it("keeps every neighbour in range over a sweep of the whole globe", () => {
    // An out-of-range index would read past the coefficient block and produce a
    // confident number from nothing, so this sweeps rather than samples. The
    // assertions are accumulated instead of run inside the loop: 115,000
    // `expect` calls take longer than the whole rest of the suite.
    const offenders: string[] = [];
    for (let lat = -90; lat <= 90; lat += 0.37) {
      for (let lon = -180; lon < 180; lon += 0.37) {
        const n = gridNeighbourhood(lat * D2R, lon * D2R);
        const bad = [n.ll, n.lr, n.ul, n.ur].some(
          (node) =>
            node.j < 0 ||
            node.j >= GRID_LONGITUDES ||
            node.k < 0 ||
            node.k >= GRID_LATITUDES,
        );
        if (
          bad ||
          !(n.fracJ >= 0 && n.fracJ < 1) ||
          !(n.fracK >= 0 && n.fracK < 1)
        ) {
          offenders.push(`${lat.toFixed(2)},${lon.toFixed(2)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("interpolates bilinearly in the reference's argument order", () => {
    expect(bilinearInterpolation(1, 2, 3, 4, 0, 0)).toBe(1);
    expect(bilinearInterpolation(1, 2, 3, 4, 0, 1)).toBe(2);
    expect(bilinearInterpolation(1, 2, 3, 4, 1, 0)).toBe(3);
    expect(bilinearInterpolation(1, 2, 3, 4, 1, 1)).toBe(4);
    expect(bilinearInterpolation(1, 2, 3, 4, 0.5, 0.5)).toBeCloseTo(2.5, 12);
  });

  it("leaves the grid increment consistent with the node count", () => {
    expect((GRID_LONGITUDES - 1) * GRID_INCREMENT_DEG).toBe(360);
    expect((GRID_LATITUDES - 1) * GRID_INCREMENT_DEG).toBe(180);
    expect(inc).toBeCloseTo(0.0261799388, 9);
  });
});

describe("solar index blending", () => {
  it("is the reference's linear blend between the R12 0 and 100 map levels", () => {
    expect(blendBySolarIndex(2, 6, 0)).toBeCloseTo(2, 12);
    expect(blendBySolarIndex(2, 6, 100)).toBeCloseTo(6, 12);
    expect(blendBySolarIndex(2, 6, 50)).toBeCloseTo(4, 12);
  });

  it("clips at R12 160 rather than extrapolating the fitted maps", () => {
    expect(blendBySolarIndex(2, 6, 250)).toBe(blendBySolarIndex(2, 6, MAX_R12));
  });
});

describe("cross-environment determinism", () => {
  it("produces the pinned digest under jsdom", async () => {
    // The other half of this assertion is in `provider.test.ts`, which runs
    // under node. Both assert the same literal, so a divergence between the two
    // JavaScript engines fails exactly one of them and names the environment.
    resetNumericalMapAssetCache();
    const provider = await createCcirIonosphereProvider(async () => {
      const bytes = await readFile(
        path.join(process.cwd(), manifest.asset.path),
      );
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
    });
    const digest = await ionosphereStateDigest(
      provider.state(DETERMINISM_PROBE_QUERY),
    );
    expect(digest).toBe(DETERMINISM_PROBE_DIGEST);
  });
});
