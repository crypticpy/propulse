import { describe, expect, it } from "vitest";
import { aqiSeverityClass } from "@/hooks/useAirQuality";

describe("aqiSeverityClass", () => {
  it("classifies Good (0-50) as green", () => {
    expect(aqiSeverityClass(0)).toBe("text-su-success");
    expect(aqiSeverityClass(50)).toBe("text-su-success");
  });

  it("classifies Moderate (51-100) as amber", () => {
    expect(aqiSeverityClass(51)).toBe("text-su-warning");
    expect(aqiSeverityClass(100)).toBe("text-su-warning");
  });

  it("classifies Unhealthy for Sensitive Groups (101-150) as orange", () => {
    expect(aqiSeverityClass(101)).toBe("text-su-accent-text");
    expect(aqiSeverityClass(150)).toBe("text-su-accent-text");
  });

  it("classifies Unhealthy (151-200) as red", () => {
    expect(aqiSeverityClass(151)).toBe("text-su-danger");
    expect(aqiSeverityClass(200)).toBe("text-su-danger");
  });

  it("classifies Very Unhealthy and Hazardous (201+) as violet", () => {
    expect(aqiSeverityClass(250)).toBe("text-aurora-purple");
    expect(aqiSeverityClass(400)).toBe("text-aurora-purple");
  });

  it("falls back to neutral gray for missing/invalid data", () => {
    expect(aqiSeverityClass(null)).toBe("text-su-muted");
    expect(aqiSeverityClass(undefined)).toBe("text-su-muted");
    expect(aqiSeverityClass(NaN)).toBe("text-su-muted");
  });
});
