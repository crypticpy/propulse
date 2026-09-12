import { describe, expect, it } from "vitest";
import { getQsoBandColor as legacyQso } from "@/lib/map/qsoBandColors";
import {
  getWsprBandColor as legacyWspr,
  WSPR_BAND_COLORS as legacyWsprColors,
} from "@/lib/map/wsprBandColors";
import { SPOT_SOURCE_COLORS as legacySources } from "@/types/livespot";
import { getBandColor, getFt8HudBandColor, FT8_HUD_BAND_COLORS } from "./spots";
import { getQsoBandColor } from "./qso";
import { getWsprBandColor, WSPR_BAND_COLORS } from "./wspr";
import { SPOT_SOURCE_COLORS } from "./spotSource";

describe("band context contracts", () => {
  it("keeps legacy consumers on the same authority", () => {
    expect(legacyQso).toBe(getQsoBandColor);
    expect(legacyWspr).toBe(getWsprBandColor);
    expect(legacyWsprColors).toBe(WSPR_BAND_COLORS);
    expect(legacySources).toBe(SPOT_SOURCE_COLORS);
  });

  it("preserves separate 20m palettes and frequency units", () => {
    expect(getBandColor(14074)).toBe("#66ff99");
    expect(getBandColor(14.074)).toBe("#4488ff");
    expect(getQsoBandColor("20m")).toBe("#ffdd00");
    expect(getWsprBandColor(14.074)).toBe("#22cc44");
    expect(getWsprBandColor(14074)).toBe("#9922cc");
    expect(getFt8HudBandColor("20m")).toBe("#00ff88");
  });

  it("does not unify band string normalization", () => {
    expect(getBandColor("20M")).toBe("#66ff99");
    expect(getFt8HudBandColor("20M")).toBe("#9ca3af");
    for (const band of ["20", "20 m", "band20"]) {
      expect(getBandColor(band)).toBe("#4488ff");
      expect(getQsoBandColor(band)).toBe("#ffdd00");
    }
    for (const band of ["020m", "20.0m", "70cm", "unknown"]) {
      expect(getQsoBandColor(band)).toBe("#aa88ff");
    }
  });

  it.each([
    [2.5, "#8b0000", "#cc2222"],
    [5, "#cc2222", "#ff6600"],
    [8.5, "#ff6600", "#ddcc00"],
    [12, "#ddcc00", "#22cc44"],
    [16, "#22cc44", "#00cccc"],
    [20, "#00cccc", "#2266ff"],
    [23, "#2266ff", "#4400cc"],
    [26, "#4400cc", "#9922cc"],
  ] as const)(
    "keeps WSPR exclusive MHz boundary %s",
    (bound, before, after) => {
      expect(getWsprBandColor(bound - 0.000001)).toBe(before);
      expect(getWsprBandColor(bound)).toBe(after);
      expect(getWsprBandColor(bound + 0.000001)).toBe(after);
    },
  );

  it("retains WSPR nonfinite bucketing", () => {
    expect(getWsprBandColor(-Infinity)).toBe("#8b0000");
    expect(getWsprBandColor(NaN)).toBe("#9922cc");
    expect(getWsprBandColor(Infinity)).toBe("#9922cc");
  });

  it("retains the complete HUD variant and rejects inherited keys", () => {
    expect(FT8_HUD_BAND_COLORS).toEqual({
      "160m": "#ff6b6b",
      "80m": "#e8596e",
      "60m": "#d4507a",
      "40m": "#f59e0b",
      "30m": "#f0c040",
      "20m": "#00ff88",
      "17m": "#22d3ee",
      "15m": "#3b82f6",
      "12m": "#818cf8",
      "10m": "#a855f7",
      "6m": "#f472b6",
      "2m": "#fb923c",
      "70cm": "#94a3b8",
    });
    for (const band of [null, "unknown", "constructor", "__proto__"]) {
      expect(getFt8HudBandColor(band)).toBe("#9ca3af");
    }
  });

  it("preserves source identity pairs, including WSJT-X opacity", () => {
    expect(SPOT_SOURCE_COLORS).toEqual({
      PSKReporter: { color: "#54a0ff", bgColor: "rgba(84, 160, 255, 0.2)" },
      RBN: { color: "#1dd1a1", bgColor: "rgba(29, 209, 161, 0.2)" },
      Cluster: { color: "#ff9f43", bgColor: "rgba(255, 159, 67, 0.2)" },
      "WSJT-X": { color: "#22d3ee", bgColor: "rgba(34, 211, 238, 0.15)" },
    });
  });
});
