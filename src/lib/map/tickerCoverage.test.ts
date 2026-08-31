import { describe, expect, it } from "vitest";
import {
  getTickerCoveragePreset,
  TICKER_COVERAGE_PRESETS,
  type TickerCoverageArea,
} from "./tickerCoverage";

describe("ticker coverage presets", () => {
  it("preserves the historical regional coverage as the safe default", () => {
    expect(getTickerCoveragePreset(undefined)).toEqual({
      label: "Regional",
      description: "Balanced default coverage",
      lightningKm: 500,
      weatherKm: 800,
    });
    expect(
      getTickerCoveragePreset("invalid" as TickerCoverageArea),
    ).toBe(TICKER_COVERAGE_PRESETS.regional);
  });

  it("offers meaningfully narrower and wider station-centered areas", () => {
    expect(TICKER_COVERAGE_PRESETS.nearby.lightningKm).toBeLessThan(
      TICKER_COVERAGE_PRESETS.regional.lightningKm,
    );
    expect(TICKER_COVERAGE_PRESETS.nearby.weatherKm).toBeLessThan(
      TICKER_COVERAGE_PRESETS.regional.weatherKm,
    );
    expect(TICKER_COVERAGE_PRESETS.wide.lightningKm).toBeGreaterThan(
      TICKER_COVERAGE_PRESETS.regional.lightningKm,
    );
    expect(TICKER_COVERAGE_PRESETS.wide.weatherKm).toBeGreaterThan(
      TICKER_COVERAGE_PRESETS.regional.weatherKm,
    );
  });
});
