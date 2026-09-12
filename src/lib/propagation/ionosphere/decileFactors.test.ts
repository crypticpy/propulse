// @vitest-environment node
//
// node, for the same reason `provider.test.ts` is: the factors are read on a
// server as well as in a browser, and the asset is read off disk here.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import manifest from "./assets/manifest.json";
import parity from "./fixtures/p1239-decile-parity.json";
import {
  DECILE_ASSET_SHA256,
  FACTOR_COUNT,
  HOUR_COLUMNS,
  LATITUDE_ROWS,
  decileFactorIndex,
  loadDecileFactorAsset,
  resetDecileFactorAssetCache,
  type DecileByteSource,
  type DecileFactorTable,
} from "./assets/decileLoader";
import {
  foF2DecileFactorsFrom,
  foF2Season,
  r12Range,
  resolveFoF2DecileFactors,
} from "./decileFactors";
import { CAPABILITIES } from "./provider";
import { IonosphereAssetError, IonosphereQueryError } from "./types";

const assetBytes: DecileByteSource = async () => {
  const file = path.join(process.cwd(), manifest.decile_factors.asset.path);
  const bytes = await readFile(file);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
};

/**
 * A table whose every cell is its own flat index.
 *
 * Any mis-ordered axis, any off-by-one row and any transposed pair shows up as
 * a specific wrong integer rather than as a plausible decile factor, which is
 * what makes the ordering assertions below able to fail.
 */
function syntheticTable(): DecileFactorTable {
  const factors = new Float64Array(FACTOR_COUNT);
  for (let index = 0; index < FACTOR_COUNT; index += 1) factors[index] = index;
  return { artifactHash: DECILE_ASSET_SHA256, factors };
}

let table: DecileFactorTable;

beforeEach(async () => {
  resetDecileFactorAssetCache();
  table = await loadDecileFactorAsset(assetBytes);
});

describe("asset loading", () => {
  it("verifies the manifest digest and decodes every factor", () => {
    expect(table.factors.length).toBe(FACTOR_COUNT);
    expect(table.artifactHash).toBe(manifest.decile_factors.asset.sha256);
    // 2 deciles x 3 seasons x 3 R12 ranges x 19 latitudes x 24 hours.
    expect(FACTOR_COUNT).toBe(2 * 3 * 3 * LATITUDE_ROWS * HOUR_COLUMNS);
  });

  it("reports the quantity unavailable when one byte of the asset changed", async () => {
    const corrupted: DecileByteSource = async (url) => {
      const bytes = new Uint8Array(await assetBytes(url));
      // A factor, not the header: a header check would catch a header edit,
      // and the digest is the only thing that catches this one.
      bytes[64] ^= 0x01;
      return bytes.buffer as ArrayBuffer;
    };
    resetDecileFactorAssetCache();
    const answer = await resolveFoF2DecileFactors(
      { month: 1, latitudeDeg: 45, localTimeHours: 12, r12: 20 },
      corrupted,
    );
    expect(answer.known).toBe(false);
    if (answer.known) throw new Error("corrupted asset produced a number");
    expect(answer.reason).toContain("digest does not match");
    expect(answer.reason).toContain(DECILE_ASSET_SHA256);
  });

  it("rejects a truncated asset rather than reading past the end", async () => {
    resetDecileFactorAssetCache();
    await expect(
      loadDecileFactorAsset(async () => new ArrayBuffer(64)),
    ).rejects.toBeInstanceOf(IonosphereAssetError);
  });

  it("retries after a failed load instead of caching the failure", async () => {
    resetDecileFactorAssetCache();
    await expect(
      loadDecileFactorAsset(async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    const recovered = await loadDecileFactorAsset(assetBytes);
    expect(recovered.factors.length).toBe(FACTOR_COUNT);
  });

  it("hands out a copy, so one caller cannot rewrite another's factors", async () => {
    const mine = await loadDecileFactorAsset(assetBytes);
    (mine.factors as Float64Array)[0] = 99;
    const theirs = await loadDecileFactorAsset(assetBytes);
    expect(theirs.factors[0]).not.toBe(99);
  });
});

describe("axis order", () => {
  it("indexes with hour fastest and decile slowest", () => {
    const synthetic = syntheticTable();
    const read = (
      month: number,
      latitudeDeg: number,
      localTimeHours: number,
      r12: number,
    ) =>
      foF2DecileFactorsFrom(synthetic, {
        month,
        latitudeDeg,
        localTimeHours,
        r12,
      });

    // January, northern, R12 20: decile 0/1, season 0 (winter), range 0.
    const atMidnightPole = read(1, 90, 0, 20);
    expect(atMidnightPole.lower).toBe(decileFactorIndex(0, 0, 0, 18, 0));
    expect(atMidnightPole.upper).toBe(decileFactorIndex(1, 0, 0, 18, 0));

    // One hour along is one cell along; one 5-degree row is 24 cells along.
    expect(read(1, 90, 1, 20).lower).toBe(decileFactorIndex(0, 0, 0, 18, 1));
    expect(read(1, 85, 0, 20).lower).toBe(decileFactorIndex(0, 0, 0, 17, 0));

    // July northern is summer (season 2) and R12 140 is the third range.
    expect(read(7, 0, 23, 140).lower).toBe(decileFactorIndex(0, 2, 2, 0, 23));
  });
});

describe("season selection", () => {
  it("follows the reference: winter is November through February in the north", () => {
    for (const month of [11, 12, 1, 2]) {
      expect(foF2Season(month, 45)).toBe("winter");
      expect(foF2Season(month, -45)).toBe("summer");
    }
    for (const month of [3, 4, 9, 10]) {
      expect(foF2Season(month, 45)).toBe("equinox");
      expect(foF2Season(month, -45)).toBe("equinox");
    }
    for (const month of [5, 6, 7, 8]) {
      expect(foF2Season(month, 45)).toBe("summer");
      expect(foF2Season(month, -45)).toBe("winter");
    }
  });

  it("puts the equator in the northern hemisphere, as the reference does", () => {
    expect(foF2Season(1, 0)).toBe("winter");
    expect(foF2Season(1, -0.0001)).toBe("summer");
  });

  it("changes the factor at the October-November seam", () => {
    const at = (month: number) =>
      foF2DecileFactorsFrom(table, {
        month,
        latitudeDeg: 45,
        localTimeHours: 12,
        r12: 20,
      });
    expect(at(10).season).toBe("equinox");
    expect(at(11).season).toBe("winter");
    expect(at(11).lower).not.toBe(at(10).lower);
  });
});

describe("R12 range selection", () => {
  it("splits at the reference's thresholds, both ends inclusive in the middle", () => {
    expect(r12Range(49)).toBe("below-50");
    expect(r12Range(50)).toBe("50-to-100");
    expect(r12Range(51)).toBe("50-to-100");
    expect(r12Range(99)).toBe("50-to-100");
    expect(r12Range(100)).toBe("50-to-100");
    expect(r12Range(101)).toBe("above-100");
  });

  it("steps rather than interpolating across a threshold", () => {
    const at = (r12: number) =>
      foF2DecileFactorsFrom(table, {
        month: 1,
        latitudeDeg: 80,
        localTimeHours: 0,
        r12,
      });
    // 0.60 below 50 and 0.76 at 50: the published rows for winter lower decile
    // at 80 degrees, hour 00. A blended answer would sit between them.
    expect(at(49.999).lower).toBeCloseTo(0.6, 12);
    expect(at(50).lower).toBeCloseTo(0.76, 12);
  });
});

describe("latitude and hour interpolation", () => {
  it("returns the tabulated value at a row and column, with no drift", () => {
    const atPole = foF2DecileFactorsFrom(table, {
      month: 1,
      latitudeDeg: 90,
      localTimeHours: 0,
      r12: 20,
    });
    expect(atPole.lower).toBe(0.67);
    const atEquator = foF2DecileFactorsFrom(table, {
      month: 1,
      latitudeDeg: 0,
      localTimeHours: 23,
      r12: 20,
    });
    expect(atEquator.lower).toBe(0.72);
  });

  it("mirrors the southern hemisphere onto the same latitude row", () => {
    const query = { month: 3, localTimeHours: 9, r12: 75 };
    const north = foF2DecileFactorsFrom(table, {
      ...query,
      latitudeDeg: 55,
    });
    const south = foF2DecileFactorsFrom(table, {
      ...query,
      latitudeDeg: -55,
    });
    // Equinox on both sides, so only the row matters and it is the same row.
    expect(south.season).toBe("equinox");
    expect(south.lower).toBe(north.lower);
    expect(south.upper).toBe(north.upper);
  });

  it("interpolates halfway between two latitude rows", () => {
    const common = { month: 1, localTimeHours: 6, r12: 20 };
    const lower40 = foF2DecileFactorsFrom(table, {
      ...common,
      latitudeDeg: 40,
    }).lower;
    const lower45 = foF2DecileFactorsFrom(table, {
      ...common,
      latitudeDeg: 45,
    }).lower;
    const midpoint = foF2DecileFactorsFrom(table, {
      ...common,
      latitudeDeg: 42.5,
    }).lower;
    expect(midpoint).toBeCloseTo((lower40 + lower45) / 2, 12);
    // The rows differ, so a lookup that silently truncated to one of them
    // would fail this rather than pass by coincidence.
    expect(lower40).not.toBe(lower45);
  });

  it("wraps the hour axis from 23 back to 00", () => {
    // The equator at high solar activity is one of the few rows whose hour 23
    // and hour 00 differ, which is what makes the blend below observable: on a
    // row where they are equal, a lookup that clamped instead of wrapping
    // would pass by coincidence.
    const common = { month: 7, latitudeDeg: 0, r12: 140 };
    const at23 = foF2DecileFactorsFrom(table, {
      ...common,
      localTimeHours: 23,
    }).upper;
    const at0 = foF2DecileFactorsFrom(table, {
      ...common,
      localTimeHours: 0,
    }).upper;
    const half = foF2DecileFactorsFrom(table, {
      ...common,
      localTimeHours: 23.5,
    }).upper;
    expect(at23).not.toBe(at0);
    expect(half).toBeCloseTo((at23 + at0) / 2, 12);
    expect(
      foF2DecileFactorsFrom(table, { ...common, localTimeHours: 24 }).upper,
    ).toBe(at0);
    expect(
      foF2DecileFactorsFrom(table, { ...common, localTimeHours: -1 }).upper,
    ).toBe(at23);
  });
});

describe("parity with the published table", () => {
  it("reproduces every hand-read fixture value exactly", () => {
    expect(parity.rows.length).toBeGreaterThanOrEqual(12);
    for (const row of parity.rows) {
      const answer = foF2DecileFactorsFrom(table, {
        month: row.month,
        latitudeDeg: row.latitudeDeg,
        localTimeHours: row.localTimeHours,
        r12: row.r12,
      });
      const actual = row.decile === "lower" ? answer.lower : answer.upper;
      expect({
        line: row.sourceRowLine,
        season: answer.season,
        range: answer.r12Range,
        factor: actual,
      }).toEqual({
        line: row.sourceRowLine,
        season: row.season,
        range: row.r12Range,
        factor: row.factor,
      });
    }
  });

  it("covers both deciles, all three seasons and both R12 extremes", () => {
    const seen = (key: "decile" | "season" | "r12Range") =>
      new Set(parity.rows.map((row) => row[key]));
    expect(seen("decile")).toEqual(new Set(["lower", "upper"]));
    expect(seen("season")).toEqual(new Set(["winter", "equinox", "summer"]));
    expect(seen("r12Range")).toEqual(
      new Set(["below-50", "50-to-100", "above-100"]),
    );
  });
});

describe("query validation", () => {
  it("rejects a malformed query instead of answering a different point", async () => {
    const base = { month: 1, latitudeDeg: 45, localTimeHours: 12, r12: 20 };
    const bad = [
      { ...base, month: 0 },
      { ...base, month: 13 },
      { ...base, month: 1.5 },
      { ...base, latitudeDeg: 91 },
      { ...base, latitudeDeg: Number.NaN },
      { ...base, localTimeHours: Number.POSITIVE_INFINITY },
      { ...base, r12: -1 },
    ];
    for (const query of bad) {
      expect(() => foF2DecileFactorsFrom(table, query)).toThrow(
        IonosphereQueryError,
      );
      await expect(resolveFoF2DecileFactors(query, assetBytes)).rejects.toThrow(
        IonosphereQueryError,
      );
    }
  });
});

describe("provider surface", () => {
  it("reports the quantity as supported and names where to read it", () => {
    const capability = CAPABILITIES.foF2DecileFactors;
    expect(capability.status).toBe("supported");
    expect(capability.status === "supported" && capability.note).toContain(
      "P.1239-3",
    );
    expect(capability.status === "supported" && capability.note).toContain(
      "resolveFoF2DecileFactors",
    );
  });

  it("answers a well-formed query through the resolver", async () => {
    resetDecileFactorAssetCache();
    const answer = await resolveFoF2DecileFactors(
      { month: 1, latitudeDeg: 90, localTimeHours: 0, r12: 20 },
      assetBytes,
    );
    expect(answer.known).toBe(true);
    if (!answer.known) throw new Error(answer.reason);
    expect(answer.value.lower).toBe(0.67);
    expect(answer.value.upper).toBe(1.38);
    expect(answer.value.interpolation).toBe(
      "bilinear-latitude-hour-selected-season-r12",
    );
    expect(answer.value.artifactHash).toBe(DECILE_ASSET_SHA256);
  });
});
