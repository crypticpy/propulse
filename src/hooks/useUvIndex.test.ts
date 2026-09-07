import { describe, expect, it } from "vitest";
import { uvSeverityClass } from "@/hooks/useUvIndex";

describe("uvSeverityClass", () => {
  it("classifies low UV (0-2) as green", () => {
    expect(uvSeverityClass(0)).toBe("text-su-success");
    expect(uvSeverityClass(2)).toBe("text-su-success");
  });

  it("classifies moderate UV (3-5) as amber", () => {
    expect(uvSeverityClass(3)).toBe("text-su-warning");
    expect(uvSeverityClass(5)).toBe("text-su-warning");
  });

  it("classifies high UV (6-7) as orange", () => {
    expect(uvSeverityClass(6)).toBe("text-su-accent-text");
    expect(uvSeverityClass(7)).toBe("text-su-accent-text");
  });

  it("classifies very high UV (8-10) as red", () => {
    expect(uvSeverityClass(8)).toBe("text-su-danger");
    expect(uvSeverityClass(10)).toBe("text-su-danger");
  });

  it("classifies extreme UV (11+) as violet", () => {
    expect(uvSeverityClass(11)).toBe("text-aurora-purple");
    expect(uvSeverityClass(15)).toBe("text-aurora-purple");
  });

  it("falls back to neutral gray for missing/invalid data", () => {
    expect(uvSeverityClass(null)).toBe("text-su-muted");
    expect(uvSeverityClass(undefined)).toBe("text-su-muted");
    expect(uvSeverityClass(NaN)).toBe("text-su-muted");
  });
});
