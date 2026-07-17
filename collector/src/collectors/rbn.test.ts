import { describe, expect, it } from "vitest";
import { rbnSpottedAt } from "./rbn.js";

describe("rbnSpottedAt", () => {
  it("never rounds an event into the future", () => {
    const now = Date.parse("2026-07-16T10:30:23.900Z");
    expect(rbnSpottedAt(now, 0)).toBe("2026-07-16T10:30:15.000Z");
    expect(Date.parse(rbnSpottedAt(now, 0))).toBeLessThanOrEqual(now);
  });

  it("clamps a negative upstream age before flooring", () => {
    const now = Date.parse("2026-07-16T10:30:23.900Z");
    expect(rbnSpottedAt(now, -5)).toBe("2026-07-16T10:30:15.000Z");
  });
});
