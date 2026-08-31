import { describe, expect, it } from "vitest";
import { shouldDimWallDisplay } from "./wallPresentation";

describe("shouldDimWallDisplay", () => {
  const equator = { lat: 0, lon: 0 };

  it("follows the QTH day/night boundary when enabled", () => {
    expect(
      shouldDimWallDisplay(
        true,
        equator,
        new Date("2026-03-20T12:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      shouldDimWallDisplay(
        true,
        equator,
        new Date("2026-03-20T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("does not dim when disabled or when no QTH is configured", () => {
    const midnight = new Date("2026-03-20T00:00:00.000Z");
    expect(shouldDimWallDisplay(false, equator, midnight)).toBe(false);
    expect(shouldDimWallDisplay(true, null, midnight)).toBe(false);
  });
});
