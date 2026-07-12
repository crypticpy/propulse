import { describe, expect, it } from "vitest";
import { parse3DayForecast, parse45DayForecast } from "./forecast.js";

describe("forecast parsers", () => {
  it("preserves issue and valid times from the 45-day JSON product", () => {
    const parsed = parse45DayForecast({
      issued: "2026-07-12T00:00:00Z",
      source: "NOAA SWPC",
      product: "45 Day Forecast",
      units: { ap: "nT", f107: "sfu" },
      data: [
        { time: "2026-07-13T00:00:00Z", metric: "ap", value: 10 },
        { time: "2026-07-13T00:00:00Z", metric: "f107", value: 105 },
      ],
    });

    expect(parsed.issuedAt).toBe("2026-07-12T00:00:00.000Z");
    expect(parsed.values).toEqual([
      { validAt: "2026-07-13T00:00:00.000Z", metric: "ap", value: 10, unit: "nT" },
      { validAt: "2026-07-13T00:00:00.000Z", metric: "f107", value: 105, unit: "sfu" },
    ]);
  });

  it("extracts daily and 3-hour values from the NOAA text product", () => {
    const kRows = ["00-03", "03-06", "06-09", "09-12", "12-15", "15-18", "18-21", "21-00"]
      .map((range) => `Mid/${range}UT 2 3 1\nHigh/${range}UT 3 4 2`)
      .join("\n");
    const text = `:Issued: 2026 Jul 11 2200 UTC
:Prediction_dates: 2026 Jul 12 2026 Jul 13 2026 Jul 14
A_Planetary 24 10 6
:10cm_flux: 105 105 115
${kRows}`;
    const parsed = parse3DayForecast(text);

    expect(parsed.issuedAt).toBe("2026-07-11T22:00:00.000Z");
    expect(parsed.values).toHaveLength(54);
    expect(parsed.values).toContainEqual({
      validAt: "2026-07-12T00:00:00.000Z",
      metric: "planetary_ap",
      value: 24,
      unit: "index",
    });
    expect(parsed.values).toContainEqual({
      validAt: "2026-07-13T21:00:00.000Z",
      metric: "high_latitude_k",
      value: 4,
      unit: "K index",
    });
  });
});
