import { describe, expect, it } from "vitest";
import {
  getGreylineGlowIntensity,
  getGreylineVisualParams,
  type GreylineIntensity,
} from "./greyline";

const ALL_LEVELS: GreylineIntensity[] = ["peak", "enhanced", "normal", "none"];

describe("getGreylineGlowIntensity", () => {
  it("returns 0 when greyline is inactive so the glow renders nothing", () => {
    // TerminatorEnhancement3D early-returns on intensity <= 0. This is the
    // whole point of the helper: outside greyline hours the animated glow
    // must disappear instead of painting a permanent second amber band on
    // top of the static Greyline ribbon.
    expect(getGreylineGlowIntensity("none")).toBe(0);
  });

  it("is strictly increasing from normal to peak", () => {
    const normal = getGreylineGlowIntensity("normal");
    const enhanced = getGreylineGlowIntensity("enhanced");
    const peak = getGreylineGlowIntensity("peak");

    expect(normal).toBeGreaterThan(0);
    expect(enhanced).toBeGreaterThan(normal);
    expect(peak).toBeGreaterThan(enhanced);
  });

  it("stays within the 0-1 opacity multiplier range for every level", () => {
    for (const level of ALL_LEVELS) {
      const value = getGreylineGlowIntensity(level);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("peaks at full strength", () => {
    expect(getGreylineGlowIntensity("peak")).toBe(1);
  });

  it("orders the same way as the static greyline band opacity", () => {
    // The glow and the band underneath it are driven by the same intensity
    // level, so a level that brightens one must not dim the other.
    const active: GreylineIntensity[] = ["normal", "enhanced", "peak"];
    const glow = active.map(getGreylineGlowIntensity);
    const band = active.map((l) => getGreylineVisualParams(l).opacity);

    for (let i = 1; i < active.length; i++) {
      expect(glow[i]).toBeGreaterThan(glow[i - 1]);
      expect(band[i]).toBeGreaterThan(band[i - 1]);
    }
  });
});
