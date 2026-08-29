import { describe, expect, it } from "vitest";
import { normalizeUvPayload, parseLatLon } from "./atmosUv";

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

describe("normalizeUvPayload", () => {
  const openMeteoResponse = {
    utc_offset_seconds: -14400, // UTC-4
    daily: {
      time: ["2026-08-29", "2026-08-30", "2026-08-31"],
      uv_index_max: [7.5, 6.1, 8.0],
      uv_index_clear_sky_max: [8.0, 8.0, 8.0],
    },
    hourly: {
      time: ["2026-08-29T12:00", "2026-08-29T13:00", "2026-08-30T12:00"],
      uv_index: [5.0, 6.5, 4.0],
    },
  };

  it("picks the nearest hour to now (adjusting for utc_offset_seconds)", () => {
    // 13:00 local (UTC-4) == 17:00:00Z
    const nowMs = Date.parse("2026-08-29T17:05:00Z");
    const result = normalizeUvPayload(openMeteoResponse, nowMs);
    expect(result.current).toEqual({ time: "2026-08-29T13:00", uvIndex: 6.5 });
  });

  it("derives today's max and daily/hourly arrays", () => {
    const result = normalizeUvPayload(openMeteoResponse, Date.parse("2026-08-29T17:05:00Z"));
    expect(result.todayMax).toBe(7.5);
    expect(result.daily).toHaveLength(3);
    expect(result.hourlyToday).toEqual([
      { time: "2026-08-29T12:00", uvIndex: 5.0 },
      { time: "2026-08-29T13:00", uvIndex: 6.5 },
    ]);
  });

  it("returns an empty payload for malformed input", () => {
    expect(normalizeUvPayload(null)).toEqual({
      current: null,
      todayMax: null,
      daily: [],
      hourlyToday: [],
    });
  });
});
