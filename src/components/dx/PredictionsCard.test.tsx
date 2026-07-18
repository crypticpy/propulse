import { describe, expect, it } from "vitest";
import {
  getRankedBandPredictions,
  isDaytime,
} from "@/lib/propagation/bandRanking";

describe("getRankedBandPredictions", () => {
  it("returns the best available bands when every condition is marginal", () => {
    const predictions = getRankedBandPredictions(1.33, 111, false, 3);

    expect(predictions).toHaveLength(3);
    expect(new Set(predictions.map((prediction) => prediction.band)).size).toBe(3);
    expect(predictions.every((prediction) => prediction.condition === "Fair")).toBe(true);
    expect(predictions.every((prediction) => !prediction.isOpening)).toBe(true);
  });

  it("keeps strong openings ahead of marginal bands", () => {
    const predictions = getRankedBandPredictions(1, 180, true, 3);

    expect(predictions.map((prediction) => prediction.band)).toEqual([
      "20m",
      "17m",
      "15m",
    ]);
    expect(predictions.every((prediction) => prediction.condition === "Excellent")).toBe(true);
  });

  it("uses the operator longitude for day and night", () => {
    const afternoonInTexas = new Date("2026-07-18T20:00:00Z");

    expect(isDaytime(-97, afternoonInTexas)).toBe(true);
    expect(isDaytime(120, afternoonInTexas)).toBe(false);
  });
});
