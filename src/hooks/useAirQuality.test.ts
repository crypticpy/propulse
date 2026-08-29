import { describe, expect, it } from "vitest";
import { aqiSeverityClass } from "@/hooks/useAirQuality";

describe("aqiSeverityClass", () => {
  it("classifies Good (0-50) as green", () => {
    expect(aqiSeverityClass(0)).toBe("text-signal-green");
    expect(aqiSeverityClass(50)).toBe("text-signal-green");
  });

  it("classifies Moderate (51-100) as amber", () => {
    expect(aqiSeverityClass(51)).toBe("text-caution-amber");
    expect(aqiSeverityClass(100)).toBe("text-caution-amber");
  });

  it("classifies Unhealthy for Sensitive Groups (101-150) as orange", () => {
    expect(aqiSeverityClass(101)).toBe("text-plasma-orange");
    expect(aqiSeverityClass(150)).toBe("text-plasma-orange");
  });

  it("classifies Unhealthy (151-200) as red", () => {
    expect(aqiSeverityClass(151)).toBe("text-alert-red");
    expect(aqiSeverityClass(200)).toBe("text-alert-red");
  });

  it("classifies Very Unhealthy and Hazardous (201+) as violet", () => {
    expect(aqiSeverityClass(250)).toBe("text-aurora-purple");
    expect(aqiSeverityClass(400)).toBe("text-aurora-purple");
  });

  it("falls back to neutral gray for missing/invalid data", () => {
    expect(aqiSeverityClass(null)).toBe("text-gray-400");
    expect(aqiSeverityClass(undefined)).toBe("text-gray-400");
    expect(aqiSeverityClass(NaN)).toBe("text-gray-400");
  });
});
