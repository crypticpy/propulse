import { describe, expect, it } from "vitest";
import {
  categoryForAqi,
  normalizeAirNowPayload,
  normalizeWaqiPayload,
  parseLatLon,
} from "./atmosAqi";

describe("parseLatLon", () => {
  it("accepts in-range coordinates", () => {
    expect(parseLatLon("40.7", "-74.0")).toEqual({ lat: 40.7, lon: -74.0 });
  });

  it("rejects missing, non-numeric, or out-of-range values", () => {
    expect(parseLatLon(null, "-74.0")).toBeNull();
    expect(parseLatLon("abc", "-74.0")).toBeNull();
    expect(parseLatLon("95", "-74.0")).toBeNull();
    expect(parseLatLon("40.7", "-200")).toBeNull();
  });
});

describe("categoryForAqi", () => {
  it("maps EPA breakpoints", () => {
    expect(categoryForAqi(25)).toBe("Good");
    expect(categoryForAqi(75)).toBe("Moderate");
    expect(categoryForAqi(125)).toBe("Unhealthy for Sensitive Groups");
    expect(categoryForAqi(175)).toBe("Unhealthy");
    expect(categoryForAqi(250)).toBe("Very Unhealthy");
    expect(categoryForAqi(400)).toBe("Hazardous");
  });
});

describe("normalizeAirNowPayload", () => {
  it("picks the worst-pollutant observation and normalizes fields", () => {
    expect(
      normalizeAirNowPayload([
        {
          DateObserved: "2026-08-29",
          HourObserved: 14,
          ParameterName: "O3",
          AQI: 42,
          Category: { Number: 1, Name: "Good" },
        },
        {
          DateObserved: "2026-08-29",
          HourObserved: 14,
          ParameterName: "PM2.5",
          AQI: 88,
          Category: { Number: 2, Name: "Moderate" },
        },
      ]),
    ).toEqual({
      aqi: 88,
      category: "Moderate",
      pollutant: "PM2.5",
      observedAt: "2026-08-29T14:00:00",
      source: "airnow",
    });
  });

  it("returns null for empty or malformed input", () => {
    expect(normalizeAirNowPayload([])).toBeNull();
    expect(normalizeAirNowPayload(null)).toBeNull();
    expect(normalizeAirNowPayload([{ AQI: "not-a-number" }])).toBeNull();
  });
});

describe("normalizeWaqiPayload", () => {
  it("normalizes a successful WAQI response", () => {
    expect(
      normalizeWaqiPayload({
        status: "ok",
        data: {
          aqi: 63,
          dominentpol: "pm25",
          time: { iso: "2026-08-29T14:00:00-04:00" },
        },
      }),
    ).toEqual({
      aqi: 63,
      category: "Moderate",
      pollutant: "pm25",
      observedAt: "2026-08-29T14:00:00-04:00",
      source: "waqi",
    });
  });

  it("returns null when status is not ok or data is missing", () => {
    expect(normalizeWaqiPayload({ status: "error" })).toBeNull();
    expect(normalizeWaqiPayload({ status: "ok" })).toBeNull();
    expect(normalizeWaqiPayload(null)).toBeNull();
  });
});
