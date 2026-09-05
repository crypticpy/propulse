import { describe, expect, it } from "vitest";
import { formatSpeed, formatTemperature, resolveUnits } from "./units";

describe("resolveUnits", () => {
  it("honours an explicit choice regardless of grid", () => {
    expect(resolveUnits("metric", "EM10dg")).toBe("metric");
    expect(resolveUnits("imperial", "JO62")).toBe("imperial");
  });

  it("picks imperial for US grid fields and metric everywhere else", () => {
    for (const grid of [
      "CM87",
      "DM79",
      "DN31",
      "EL96",
      "EM10dg",
      "EN52",
      "FM19",
      "FN31",
      "BP51", // Anchorage
      "BL11", // Honolulu
    ]) {
      expect(resolveUnits("auto", grid)).toBe("imperial");
    }
    for (const grid of ["JO62", "PM95", "GF15", "IO91"]) {
      expect(resolveUnits("auto", grid)).toBe("metric");
    }
  });

  it("falls back to metric without a grid", () => {
    expect(resolveUnits("auto", null)).toBe("metric");
    expect(resolveUnits("auto", undefined)).toBe("metric");
    expect(resolveUnits("auto", "")).toBe("metric");
  });
});

describe("formatters", () => {
  it("converts temperature per unit system", () => {
    expect(formatTemperature(34.4, "imperial")).toBe("94°F");
    expect(formatTemperature(34.4, "metric")).toBe("34°C");
    expect(formatTemperature(null, "metric")).toBe("—");
  });

  it("converts speed per unit system", () => {
    expect(formatSpeed(100, "imperial")).toBe("62 mph");
    expect(formatSpeed(100, "metric")).toBe("100 km/h");
    expect(formatSpeed(undefined, "imperial")).toBe("—");
  });
});
