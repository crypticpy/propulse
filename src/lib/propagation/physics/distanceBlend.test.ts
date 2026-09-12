// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  distanceBlend,
  distanceBlendRegime,
  interpolateDb,
  BLEND_DB_PER_DECADE,
  BLEND_MAX_DISTANCE_KM,
  BLEND_MIN_DISTANCE_KM,
  BLEND_SPAN_KM,
  type ResolvedDistanceBlend,
} from "./distanceBlend";

/**
 * Equation (42), transcribed again here and never taken from a stored output:
 *
 *   Ei = 100 log10 Xi,  Xi = Xs + (D - 7000)/2000 (Xl - Xs),
 *   Xs = 10^(0.01 Es),  Xl = 10^(0.01 El)                                (42)
 */
function resolved(
  result: ReturnType<typeof distanceBlend>,
): ResolvedDistanceBlend {
  if (result.kind !== "resolved") {
    throw new Error(`${result.reason}: ${result.detail}`);
  }
  return result;
}

function byHand(groundDistanceKm: number, es: number, el: number): number {
  const xs = 10 ** (0.01 * es);
  const xl = 10 ** (0.01 * el);
  const xi = xs + ((groundDistanceKm - 7000) / 2000) * (xl - xs);
  return 100 * Math.log10(xi);
}

describe("section 5.4's three distance ranges", () => {
  it("uses the bounds the recommendation states", () => {
    expect(BLEND_MIN_DISTANCE_KM).toBe(7000);
    expect(BLEND_MAX_DISTANCE_KM).toBe(9000);
    expect(BLEND_SPAN_KM).toBe(2000);
    expect(BLEND_DB_PER_DECADE).toBe(100);
  });

  it("classifies a distance into one of the three statements", () => {
    expect(distanceBlendRegime(0)).toBe("short_path_only");
    expect(distanceBlendRegime(6999.99)).toBe("short_path_only");
    expect(distanceBlendRegime(7000)).toBe("interpolated");
    expect(distanceBlendRegime(8000)).toBe("interpolated");
    expect(distanceBlendRegime(9000)).toBe("interpolated");
    expect(distanceBlendRegime(9000.01)).toBe("long_path_only");
    expect(distanceBlendRegime(26400.16)).toBe("long_path_only");
  });

  it("returns Es below 7 000 km and names equation (28) as the source", () => {
    const result = resolved(
      distanceBlend({ groundDistanceKm: 5000, shortPathDb: 12.5 }),
    );
    expect(result.regime).toBe("short_path_only");
    expect(result.fieldStrengthDb).toBe(12.5);
    expect(result.source).toBe("equation_28");
    expect(result.weight).toBeNull();
    expect(result.xInterpolated).toBeNull();
  });

  it("returns El above 9 000 km and names equation (39) as the source", () => {
    const result = resolved(
      distanceBlend({ groundDistanceKm: 26400.16, longPathDb: -51.08 }),
    );
    expect(result.regime).toBe("long_path_only");
    expect(result.fieldStrengthDb).toBe(-51.08);
    expect(result.source).toBe("equation_39");
  });

  it("keeps the side it did not use when the caller supplied it", () => {
    const short = resolved(
      distanceBlend({
        groundDistanceKm: 5000,
        shortPathDb: 12.5,
        longPathDb: 3,
      }),
    );
    expect(short.fieldStrengthDb).toBe(12.5);
    expect(short.longPathDb).toBe(3);
    const long = resolved(
      distanceBlend({
        groundDistanceKm: 12000,
        shortPathDb: 12.5,
        longPathDb: 3,
      }),
    );
    expect(long.fieldStrengthDb).toBe(3);
    expect(long.shortPathDb).toBe(12.5);
  });
});

describe("equation (42)", () => {
  it("is continuous at both ends of its own range", () => {
    // At 7 000 km the weight is 0 and Xi is Xs exactly; at 9 000 km it is 1
    // and Xi is Xl exactly. This is why the inclusive or exclusive reading of
    // "between 7 000 and 9 000 km" cannot change a single number.
    const at7000 = resolved(
      distanceBlend({
        groundDistanceKm: 7000,
        shortPathDb: -0.7307,
        longPathDb: -3.5501,
      }),
    );
    expect(at7000.weight).toBe(0);
    expect(at7000.fieldStrengthDb).toBeCloseTo(-0.7307, 12);
    const at9000 = resolved(
      distanceBlend({
        groundDistanceKm: 9000,
        shortPathDb: -0.7307,
        longPathDb: -3.5501,
      }),
    );
    expect(at9000.weight).toBe(1);
    expect(at9000.fieldStrengthDb).toBeCloseTo(-3.5501, 12);
  });

  it("interpolates on the linear quantity, not on the decibels", () => {
    // Es = 0 dB is Xs = 1 and El = 20 dB is Xl = 10^0.2 = 1.5848932. Halfway,
    // Xi = 1.2924466 and Ei = 100 log10 Xi = 11.141261 dB, which is well above
    // the 10 dB a decibel average would give. Reading equation (42) as a mean
    // of two decibel values is wrong by more than a decibel here.
    const result = resolved(
      distanceBlend({ groundDistanceKm: 8000, shortPathDb: 0, longPathDb: 20 }),
    );
    expect(result.xShort).toBeCloseTo(1, 12);
    expect(result.xLong).toBeCloseTo(1.5848931924611136, 12);
    expect(result.xInterpolated).toBeCloseTo(1.292446596230557, 12);
    expect(result.fieldStrengthDb).toBeCloseTo(11.141260713035855, 9);
    expect(result.fieldStrengthDb).not.toBeCloseTo(10, 1);
    expect(result.source).toBe("equation_42");
  });

  it("matches a transcription of the published form at every weight", () => {
    for (const groundDistanceKm of [7000, 7250, 7454.96, 8095.11, 8697.26, 9000]) {
      for (const [es, el] of [
        [-0.7307, -3.5501],
        [1.2347, -1.0404],
        [-28.3015, -14.9203],
        [-77.017, -305.8822],
      ] as const) {
        const result = resolved(
          distanceBlend({ groundDistanceKm, shortPathDb: es, longPathDb: el }),
        );
        expect(result.fieldStrengthDb).toBeCloseTo(
          byHand(groundDistanceKm, es, el),
          9,
        );
        expect(result.weight).toBeCloseTo(
          (groundDistanceKm - 7000) / 2000,
          12,
        );
      }
    }
  });

  it("is monotone between the two endpoints", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let D = 7000; D <= 9000; D += 50) {
      const value = resolved(
        distanceBlend({ groundDistanceKm: D, shortPathDb: 5, longPathDb: -25 }),
      ).fieldStrengthDb;
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it("reduces to the same number as its own standalone assembler", () => {
    const direct = interpolateDb(8500, 4.25, -12.75);
    const through = resolved(
      distanceBlend({
        groundDistanceKm: 8500,
        shortPathDb: 4.25,
        longPathDb: -12.75,
      }),
    );
    expect(through.fieldStrengthDb).toBe(direct.db);
    expect(through.weight).toBe(direct.weight);
    expect(through.xShort).toBe(direct.xShort);
    expect(through.xLong).toBe(direct.xLong);
    expect(through.xInterpolated).toBe(direct.xInterpolated);
  });

  it("applies unchanged to the powers of section 6", () => {
    // Section 6: "In the intermediate range 7 000 to 9 000 km, the power is
    // determined from equation (42) using the powers corresponding to Es and
    // El." The function is unit-blind, so the same assembler answers for
    // dB(W) as for dB(1 uV/m).
    const powers = interpolateDb(8000, -135.08, -148.92);
    expect(powers.db).toBeCloseTo(byHand(8000, -135.08, -148.92), 9);
  });
});

describe("what section 5.4 refuses rather than guesses", () => {
  it("declines a distance that is not a usable path length", () => {
    for (const groundDistanceKm of [0, -1, Number.NaN]) {
      const result = distanceBlend({ groundDistanceKm, shortPathDb: 1 });
      expect(result.kind).toBe("unsupported");
      if (result.kind !== "unsupported") continue;
      expect(result.reason).toBe("out_of_domain");
      expect(result.regime).toBeNull();
    }
  });

  it("declines when the one applicable side is absent", () => {
    const short = distanceBlend({ groundDistanceKm: 5000, longPathDb: 3 });
    expect(short.kind).toBe("unsupported");
    if (short.kind === "unsupported") {
      expect(short.reason).toBe("short_path_missing");
      expect(short.regime).toBe("short_path_only");
    }
    const long = distanceBlend({ groundDistanceKm: 12000, shortPathDb: 3 });
    expect(long.kind).toBe("unsupported");
    if (long.kind === "unsupported") {
      expect(long.reason).toBe("long_path_missing");
      expect(long.regime).toBe("long_path_only");
    }
  });

  it("declines a one-sided interpolation rather than inventing the other side", () => {
    const noShort = distanceBlend({ groundDistanceKm: 8000, longPathDb: 3 });
    expect(noShort.kind).toBe("unsupported");
    if (noShort.kind === "unsupported") {
      expect(noShort.reason).toBe("short_path_missing");
      expect(noShort.detail).toContain("both methods");
    }
    const noLong = distanceBlend({ groundDistanceKm: 8000, shortPathDb: 3 });
    expect(noLong.kind).toBe("unsupported");
    if (noLong.kind === "unsupported") {
      expect(noLong.reason).toBe("long_path_missing");
    }
    const neither = distanceBlend({ groundDistanceKm: 8000 });
    expect(neither.kind).toBe("unsupported");
    if (neither.kind === "unsupported") {
      expect(neither.reason).toBe("both_missing");
    }
  });

  it("treats an explicit null and a non-finite number as absent", () => {
    for (const shortPathDb of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = distanceBlend({ groundDistanceKm: 5000, shortPathDb });
      expect(result.kind).toBe("unsupported");
      if (result.kind !== "unsupported") continue;
      expect(result.reason).toBe("short_path_missing");
    }
  });

  it("resolves the interpolation endpoints from the one applicable side alone", () => {
    // At exactly 7 000 km the weight is 0, so equation (42) reduces to Es and
    // El is not required even though the range is written inclusive of this
    // endpoint. Symmetrically at 9 000 km only El is required.
    const atMin = resolved(
      distanceBlend({ groundDistanceKm: 7000, shortPathDb: 12.5 }),
    );
    expect(atMin.regime).toBe("interpolated");
    expect(atMin.fieldStrengthDb).toBe(12.5);
    expect(atMin.weight).toBe(0);
    expect(atMin.longPathDb).toBeNull();

    const atMax = resolved(
      distanceBlend({ groundDistanceKm: 9000, longPathDb: -51.08 }),
    );
    expect(atMax.regime).toBe("interpolated");
    expect(atMax.fieldStrengthDb).toBe(-51.08);
    expect(atMax.weight).toBe(1);
    expect(atMax.shortPathDb).toBeNull();
  });

  it("still declines a strictly interior distance missing either side", () => {
    const noShort = distanceBlend({ groundDistanceKm: 8000, longPathDb: 3 });
    expect(noShort.kind).toBe("unsupported");
    if (noShort.kind === "unsupported") {
      expect(noShort.reason).toBe("short_path_missing");
    }
    const noLong = distanceBlend({ groundDistanceKm: 8000, shortPathDb: 3 });
    expect(noLong.kind).toBe("unsupported");
    if (noLong.kind === "unsupported") {
      expect(noLong.reason).toBe("long_path_missing");
    }
  });

  it("still declines just inside either boundary when the required side is missing", () => {
    // 7 000.001 km has a nonzero weight, so both sides are needed again; the
    // fix at the exact endpoint must not leak into the interior.
    const justInsideMin = distanceBlend({
      groundDistanceKm: 7000.001,
      shortPathDb: 12.5,
    });
    expect(justInsideMin.kind).toBe("unsupported");
    if (justInsideMin.kind === "unsupported") {
      expect(justInsideMin.reason).toBe("long_path_missing");
    }
    const justInsideMax = distanceBlend({
      groundDistanceKm: 8999.999,
      longPathDb: -51.08,
    });
    expect(justInsideMax.kind).toBe("unsupported");
    if (justInsideMax.kind === "unsupported") {
      expect(justInsideMax.reason).toBe("short_path_missing");
    }
  });

  it("never returns a NaN on any field of a resolved record", () => {
    for (const groundDistanceKm of [1000, 7000, 8000, 9000, 26400.16]) {
      const result = resolved(
        distanceBlend({
          groundDistanceKm,
          shortPathDb: -77.017,
          longPathDb: -305.8822,
        }),
      );
      const numbers = [
        result.groundDistanceKm,
        result.fieldStrengthDb,
        result.shortPathDb,
        result.longPathDb,
        result.weight,
        result.xShort,
        result.xLong,
        result.xInterpolated,
      ];
      for (const value of numbers) {
        if (value === null) continue;
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("returns non_finite_result rather than a NaN field strength when a corrupted upstream Es overflows equation (42)'s exponential", () => {
    // shortPathDb only has to be finite to be accepted; at 1e6 dB it still
    // is, but Xs = 10^(0.01 Es) overflows double range on its own, before the
    // interpolation itself runs, corrupting Xi and the field strength with
    // it. This is the distanceBlend sibling of the fM finding: neither Es nor
    // El fails any check above, and it is the record's own arithmetic that
    // overflows.
    const result = distanceBlend({
      groundDistanceKm: 8000,
      shortPathDb: 1e6,
      longPathDb: -50,
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("non_finite_result");
    expect(result.detail).toContain("xShort");
    expect(result.detail).toContain("Infinity");
  });
});
