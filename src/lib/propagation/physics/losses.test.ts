import { describe, expect, it } from "vitest";

import {
  aboveMufLoss,
  absorptionRayPathFrequencyMHz,
  basicTransmissionLossDb,
  freeSpaceLossDb,
  groundReflectionLossDb,
  E_ABOVE_MUF_CAP_DB,
  E_ABOVE_MUF_COEFFICIENT,
  F2_ABOVE_MUF_CAP_DB,
  F2_ABOVE_MUF_COEFFICIENT,
  FREE_SPACE_CONSTANT_DB,
  OTHER_LOSSES_DB,
} from "./losses";

describe("freeSpaceLossDb", () => {
  it("is the constant alone at 1 MHz over 1 km", () => {
    expect(freeSpaceLossDb(1, 1)).toBeCloseTo(FREE_SPACE_CONSTANT_DB, 12);
  });

  it("rises 6.0206 dB per doubling of frequency", () => {
    const base = freeSpaceLossDb(7, 3000);
    expect(freeSpaceLossDb(14, 3000) - base).toBeCloseTo(
      20 * Math.log10(2),
      12,
    );
  });

  it("rises 6.0206 dB per doubling of slant range", () => {
    const base = freeSpaceLossDb(7, 3000);
    expect(freeSpaceLossDb(7, 6000) - base).toBeCloseTo(20 * Math.log10(2), 12);
  });

  it("matches a hand-computed value on a 14.1 MHz 3200 km slant range", () => {
    // 32.45 + 20 log10(14.1) + 20 log10(3200)
    //      = 32.45 + 22.9844... + 70.1030... dB
    const expected = 32.45 + 20 * Math.log10(14.1) + 20 * Math.log10(3200);
    expect(freeSpaceLossDb(14.1, 3200)).toBeCloseTo(expected, 12);
    expect(freeSpaceLossDb(14.1, 3200)).toBeCloseTo(125.5375, 3);
  });

  it("rejects a non-positive or non-finite argument", () => {
    expect(() => freeSpaceLossDb(0, 3000)).toThrow(RangeError);
    expect(() => freeSpaceLossDb(-7, 3000)).toThrow(RangeError);
    expect(() => freeSpaceLossDb(Number.NaN, 3000)).toThrow(RangeError);
    expect(() => freeSpaceLossDb(7, 0)).toThrow(RangeError);
    expect(() => freeSpaceLossDb(7, -1)).toThrow(RangeError);
    expect(() => freeSpaceLossDb(7, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});

describe("groundReflectionLossDb", () => {
  it("is zero for a one-hop mode, which has no intermediate reflection", () => {
    expect(groundReflectionLossDb(1)).toBe(0);
  });

  it("is 2 dB per intermediate reflection point", () => {
    expect(groundReflectionLossDb(2)).toBe(2);
    expect(groundReflectionLossDb(3)).toBe(4);
    expect(groundReflectionLossDb(4)).toBe(6);
    expect(groundReflectionLossDb(6)).toBe(10);
  });

  it("rejects a hop count that is not a positive integer", () => {
    expect(() => groundReflectionLossDb(0)).toThrow(RangeError);
    expect(() => groundReflectionLossDb(-1)).toThrow(RangeError);
    expect(() => groundReflectionLossDb(1.5)).toThrow(RangeError);
    expect(() => groundReflectionLossDb(Number.NaN)).toThrow(RangeError);
  });
});

describe("aboveMufLoss", () => {
  it("is zero at and below the basic MUF, for both layers", () => {
    for (const layer of ["E", "F2"] as const) {
      expect(
        aboveMufLoss({ layer, frequencyMHz: 9, basicMufMHz: 10 }).lossDb,
      ).toBe(0);
      // "equal to or less than the basic MUF": exactly fb takes no loss.
      const atMuf = aboveMufLoss({ layer, frequencyMHz: 10, basicMufMHz: 10 });
      expect(atMuf.lossDb).toBe(0);
      expect(atMuf.aboveBasicMuf).toBe(false);
      expect(atMuf.capped).toBe(false);
      expect(atMuf.frequencyRatio).toBe(1);
    }
  });

  it("squares the excess ratio for E modes, equation (25)", () => {
    // 130 (f/fb - 1)^2 at f/fb = 1.1 is 130 x 0.01 = 1.3 dB.
    const tenPercent = aboveMufLoss({
      layer: "E",
      frequencyMHz: 11,
      basicMufMHz: 10,
    });
    expect(tenPercent.lossDb).toBeCloseTo(1.3, 10);
    expect(tenPercent.aboveBasicMuf).toBe(true);
    expect(tenPercent.capped).toBe(false);
    // 130 x 0.16 = 20.8 dB at f/fb = 1.4.
    expect(
      aboveMufLoss({ layer: "E", frequencyMHz: 14, basicMufMHz: 10 }).lossDb,
    ).toBeCloseTo(20.8, 10);
  });

  it("caps the E-mode loss at 81 dB", () => {
    // 130 x^2 = 81 at x = 0.78935..., so f/fb = 1.78935... is the knee.
    const knee = 1 + Math.sqrt(E_ABOVE_MUF_CAP_DB / E_ABOVE_MUF_COEFFICIENT);
    const justBelow = aboveMufLoss({
      layer: "E",
      frequencyMHz: 10 * (knee - 1e-6),
      basicMufMHz: 10,
    });
    expect(justBelow.lossDb).toBeLessThan(E_ABOVE_MUF_CAP_DB);
    expect(justBelow.capped).toBe(false);
    const wellAbove = aboveMufLoss({
      layer: "E",
      frequencyMHz: 30,
      basicMufMHz: 10,
    });
    expect(wellAbove.lossDb).toBe(E_ABOVE_MUF_CAP_DB);
    expect(wellAbove.capped).toBe(true);
  });

  it("takes the square root of the excess ratio for F2 modes, equation (26)", () => {
    // 36 sqrt(f/fb - 1) at f/fb = 1.25 is 36 x 0.5 = 18 dB.
    const result = aboveMufLoss({
      layer: "F2",
      frequencyMHz: 12.5,
      basicMufMHz: 10,
    });
    expect(result.lossDb).toBeCloseTo(18, 10);
    expect(result.aboveBasicMuf).toBe(true);
    // 36 sqrt(0.44444...) = 24 dB at f/fb = 1.4444...
    expect(
      aboveMufLoss({ layer: "F2", frequencyMHz: 13, basicMufMHz: 9 }).lossDb,
    ).toBeCloseTo(36 * Math.sqrt(13 / 9 - 1), 10);
  });

  it("caps the F2-mode loss at 62 dB", () => {
    // 36 sqrt(x) = 62 at x = 2.96605..., so the knee is f/fb = 3.96605...
    const knee = 1 + (F2_ABOVE_MUF_CAP_DB / F2_ABOVE_MUF_COEFFICIENT) ** 2;
    expect(
      aboveMufLoss({
        layer: "F2",
        frequencyMHz: 10 * (knee - 1e-6),
        basicMufMHz: 10,
      }).capped,
    ).toBe(false);
    const capped = aboveMufLoss({
      layer: "F2",
      frequencyMHz: 10 * (knee + 1),
      basicMufMHz: 10,
    });
    expect(capped.lossDb).toBe(F2_ABOVE_MUF_CAP_DB);
    expect(capped.capped).toBe(true);
  });

  it("gives the E and F2 branches genuinely different curves", () => {
    // A square and a square root only agree at the ends. If the two branches
    // were the same expression this would pass trivially; it does not.
    const e = aboveMufLoss({ layer: "E", frequencyMHz: 11, basicMufMHz: 10 });
    const f2 = aboveMufLoss({ layer: "F2", frequencyMHz: 11, basicMufMHz: 10 });
    expect(e.lossDb).toBeCloseTo(1.3, 10);
    expect(f2.lossDb).toBeCloseTo(36 * Math.sqrt(0.1), 10);
    expect(f2.lossDb).toBeGreaterThan(e.lossDb);
  });

  it("rises monotonically with frequency until the cap, for both layers", () => {
    for (const layer of ["E", "F2"] as const) {
      let previous = -1;
      for (let f = 10; f <= 17; f += 0.25) {
        const value = aboveMufLoss({
          layer,
          frequencyMHz: f,
          basicMufMHz: 10,
        }).lossDb;
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it("reports the frequency ratio it used", () => {
    expect(
      aboveMufLoss({ layer: "F2", frequencyMHz: 21, basicMufMHz: 14 })
        .frequencyRatio,
    ).toBeCloseTo(1.5, 12);
  });

  it("rejects a non-positive or non-finite frequency or basic MUF", () => {
    expect(() =>
      aboveMufLoss({ layer: "E", frequencyMHz: 0, basicMufMHz: 10 }),
    ).toThrow(RangeError);
    expect(() =>
      aboveMufLoss({ layer: "E", frequencyMHz: 10, basicMufMHz: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      aboveMufLoss({ layer: "F2", frequencyMHz: 10, basicMufMHz: Number.NaN }),
    ).toThrow(RangeError);
  });
});

describe("absorptionRayPathFrequencyMHz", () => {
  it("is the operating frequency at and below the basic MUF", () => {
    expect(absorptionRayPathFrequencyMHz(7, 10)).toBe(7);
    expect(absorptionRayPathFrequencyMHz(10, 10)).toBe(10);
  });

  it("freezes at the basic MUF above it", () => {
    expect(absorptionRayPathFrequencyMHz(21, 10)).toBe(10);
    expect(absorptionRayPathFrequencyMHz(28, 10)).toBe(10);
  });

  it("rejects a non-positive or non-finite argument", () => {
    expect(() => absorptionRayPathFrequencyMHz(0, 10)).toThrow(RangeError);
    expect(() => absorptionRayPathFrequencyMHz(10, -1)).toThrow(RangeError);
    expect(() => absorptionRayPathFrequencyMHz(Number.NaN, 10)).toThrow(
      RangeError,
    );
  });
});

describe("basicTransmissionLossDb", () => {
  const terms = {
    frequencyMHz: 14.1,
    virtualSlantRangeKm: 3200,
    absorptionDb: 17.3,
    aboveMufDb: 0,
    groundReflectionDb: 2,
    auroralDb: 1.4,
  };

  it("sums the six terms of equation (18)", () => {
    const result = basicTransmissionLossDb(terms);
    const expected =
      freeSpaceLossDb(14.1, 3200) + 17.3 + 0 + 2 + 1.4 + OTHER_LOSSES_DB;
    expect(result.lossDb).toBeCloseTo(expected, 12);
  });

  it("uses the published 8.72 dB for Lz when the caller says nothing", () => {
    expect(basicTransmissionLossDb(terms).otherLossesDb).toBe(8.72);
  });

  it("lets a caller state a different Lz without touching the other terms", () => {
    const withReferenceLz = basicTransmissionLossDb({
      ...terms,
      otherLossesDb: 9.14,
    });
    expect(withReferenceLz.otherLossesDb).toBe(9.14);
    expect(
      withReferenceLz.lossDb - basicTransmissionLossDb(terms).lossDb,
    ).toBeCloseTo(0.42, 12);
  });

  it("itemises every term it was given", () => {
    const result = basicTransmissionLossDb(terms);
    expect(result.freeSpaceDb).toBeCloseTo(freeSpaceLossDb(14.1, 3200), 12);
    expect(result.absorptionDb).toBe(17.3);
    expect(result.aboveMufDb).toBe(0);
    expect(result.groundReflectionDb).toBe(2);
    expect(result.auroralDb).toBe(1.4);
  });

  it("carries every term into the total, one at a time", () => {
    // Each term is moved on its own and the total must move with it. A sum
    // that drops one term passes a spot check of the total and fails here.
    const base = basicTransmissionLossDb(terms).lossDb;
    const moves = [
      { absorptionDb: terms.absorptionDb + 3 },
      { aboveMufDb: terms.aboveMufDb + 3 },
      { groundReflectionDb: terms.groundReflectionDb + 3 },
      { auroralDb: terms.auroralDb + 3 },
      { otherLossesDb: OTHER_LOSSES_DB + 3 },
    ];
    for (const move of moves) {
      expect(
        basicTransmissionLossDb({ ...terms, ...move }).lossDb - base,
      ).toBeCloseTo(3, 12);
    }
  });

  it("rejects a frequency or slant range that is not positive and finite", () => {
    expect(() =>
      basicTransmissionLossDb({ ...terms, frequencyMHz: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      basicTransmissionLossDb({ ...terms, virtualSlantRangeKm: -1 }),
    ).toThrow(RangeError);
  });

  it("rejects a non-finite term, because a direct caller bypasses the leaf that computed it", () => {
    expect(() =>
      basicTransmissionLossDb({ ...terms, absorptionDb: Number.NaN }),
    ).toThrow(RangeError);
    expect(() =>
      basicTransmissionLossDb({
        ...terms,
        aboveMufDb: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(RangeError);
    expect(() =>
      basicTransmissionLossDb({ ...terms, groundReflectionDb: Number.NaN }),
    ).toThrow(RangeError);
    expect(() =>
      basicTransmissionLossDb({ ...terms, auroralDb: Number.NaN }),
    ).toThrow(RangeError);
    expect(() =>
      basicTransmissionLossDb({ ...terms, otherLossesDb: Number.NaN }),
    ).toThrow(RangeError);
  });

  it("accepts a zero term at every position, which is a valid loss of none", () => {
    expect(() =>
      basicTransmissionLossDb({
        ...terms,
        absorptionDb: 0,
        aboveMufDb: 0,
        groundReflectionDb: 0,
        auroralDb: 0,
        otherLossesDb: 0,
      }),
    ).not.toThrow();
  });
});
