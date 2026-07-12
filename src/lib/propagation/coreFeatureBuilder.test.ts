import { describe, expect, it } from "vitest";
import { buildCorePathFeatures } from "./coreFeatureBuilder";

describe("buildCorePathFeatures", () => {
  it("matches the archive geometry and missingness contract", () => {
    const values = buildCorePathFeatures({
      origin: { lat: 30.2672, lon: -97.7431 },
      target: { lat: 51.5074, lon: -0.1278 },
      band: "20m",
      declaredPowerWatts: 5,
      validTime: new Date("2024-10-15T12:00:00Z"),
      weather: { kp: 2, f107: 150, bz_gsm: -3 },
    });

    expect(values.band_mhz).toBe(14.1);
    expect(values.power_bin_dbm).toBe(35);
    expect(values.dist_km).toBeCloseTo(7910, -1);
    expect(values.band_20m).toBe(1);
    expect(values.band_40m).toBe(0);
    expect(values.kp).toBe(2);
    expect(values.kp_missing).toBe(0);
    expect(values.bt_missing).toBe(1);
    expect(values.path_prev1_available).toBe(0);
  });

  it("rejects unsupported bands and non-positive power", () => {
    const base = {
      origin: { lat: 0, lon: 0 },
      target: { lat: 1, lon: 1 },
      band: "20m",
      declaredPowerWatts: 5,
      validTime: new Date("2024-01-01T00:00:00Z"),
    };
    expect(() => buildCorePathFeatures({ ...base, band: "6m" })).toThrow(
      "Unsupported HF model band",
    );
    expect(() => buildCorePathFeatures({ ...base, declaredPowerWatts: 0 })).toThrow(
      "Declared power must be positive",
    );
  });
});
