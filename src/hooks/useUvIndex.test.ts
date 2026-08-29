import { describe, expect, it } from "vitest";
import { uvSeverityClass } from "@/hooks/useUvIndex";

describe("uvSeverityClass", () => {
  it("classifies low UV (0-2) as green", () => {
    expect(uvSeverityClass(0)).toBe("text-signal-green");
    expect(uvSeverityClass(2)).toBe("text-signal-green");
  });

  it("classifies moderate UV (3-5) as amber", () => {
    expect(uvSeverityClass(3)).toBe("text-caution-amber");
    expect(uvSeverityClass(5)).toBe("text-caution-amber");
  });

  it("classifies high UV (6-7) as orange", () => {
    expect(uvSeverityClass(6)).toBe("text-plasma-orange");
    expect(uvSeverityClass(7)).toBe("text-plasma-orange");
  });

  it("classifies very high UV (8-10) as red", () => {
    expect(uvSeverityClass(8)).toBe("text-alert-red");
    expect(uvSeverityClass(10)).toBe("text-alert-red");
  });

  it("classifies extreme UV (11+) as violet", () => {
    expect(uvSeverityClass(11)).toBe("text-aurora-purple");
    expect(uvSeverityClass(15)).toBe("text-aurora-purple");
  });

  it("falls back to neutral gray for missing/invalid data", () => {
    expect(uvSeverityClass(null)).toBe("text-gray-400");
    expect(uvSeverityClass(undefined)).toBe("text-gray-400");
    expect(uvSeverityClass(NaN)).toBe("text-gray-400");
  });
});
