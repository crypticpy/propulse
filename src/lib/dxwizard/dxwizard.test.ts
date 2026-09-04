import { describe, expect, it } from "vitest";
import {
  clampWatts,
  clampCeilingToKit,
  estimateRequiredPowerWatts,
  parseWizardDeepLink,
  buildWizardSearchParams,
  bandPlannerHrefForTarget,
  buildWizardRecommendation,
} from "@/lib/dxwizard";

describe("dxwizard power", () => {
  it("clamps watts to 1–1500", () => {
    expect(clampWatts(0)).toBe(1);
    expect(clampWatts(2000)).toBe(1500);
    expect(clampWatts(Number.NaN)).toBe(100);
  });

  it("clamps ceiling to kit max", () => {
    expect(clampCeilingToKit(500, 100)).toBe(100);
    expect(clampCeilingToKit(50, 100)).toBe(50);
  });

  it("estimates required power from SNR delta", () => {
    expect(estimateRequiredPowerWatts(-10, -18)).toBe(10);
    expect(estimateRequiredPowerWatts(-24, -18)).toBeGreaterThan(10);
  });
});

describe("dxwizard deepLink", () => {
  it("parses grid and mode", () => {
    const deep = parseWizardDeepLink("?grid=FN31pr&mode=CW&path=long");
    expect(deep.target?.grid).toBe("FN31PR");
    expect(deep.mode).toBe("CW");
    expect(deep.pathMode).toBe("long");
  });

  it("parses lat/lon", () => {
    const deep = parseWizardDeepLink("?lat=35.68&lon=139.76&call=JA1ABC");
    expect(deep.target?.callsign).toBe("JA1ABC");
    expect(deep.target?.lat).toBeCloseTo(35.68, 1);
  });

  it("builds planner href", () => {
    expect(bandPlannerHrefForTarget("fn31")).toBe("/planner?grid=FN31");
  });

  it("round-trips search params", () => {
    const params = buildWizardSearchParams({
      target: {
        label: "FN31",
        grid: "FN31",
        lat: 41,
        lon: -73,
        source: "grid",
        callsign: "W1AW",
      },
      mode: "FT4",
      pathMode: "long",
    });
    expect(params.get("call")).toBe("W1AW");
    expect(params.get("mode")).toBe("FT4");
    expect(params.get("path")).toBe("long");
  });
});

describe("dxwizard recommend", () => {
  it("returns ranked candidates for a mid-latitude path", () => {
    const result = buildWizardRecommendation({
      station: { lat: 41.7, lon: -72.7, grid: "FN31" },
      target: {
        label: "Tokyo",
        grid: "PM95",
        lat: 35.68,
        lon: 139.76,
        source: "grid",
      },
      mode: "FT8",
      ituRegion: "ITU2",
      licenseClass: "EXTRA",
      currentKp: 2,
      currentSfi: 150,
      txPowerCeilingWatts: 100,
      kitMaxPowerWatts: 100,
      antennaGainDbi: 0,
      pathMode: "short",
      date: new Date("2026-03-15T18:00:00Z"),
    });

    expect(result.bands.length).toBeGreaterThan(0);
    if (result.type === "ok") {
      expect(result.best.freqsKHz.length).toBeGreaterThan(0);
      expect(result.candidates[0].band).toBe(result.best.band);
    }
  });
});
