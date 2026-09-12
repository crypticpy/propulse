import { describe, expect, it } from "vitest";
import * as legacy from "@/lib/utils/spotColors";
import * as spots from "./spots";

describe("spot palette authority", () => {
  it("keeps every legacy runtime export on the same authority", () => {
    for (const name of Object.keys(legacy) as Array<keyof typeof legacy>) {
      expect(legacy[name], name).toBe(spots[name]);
    }
  });

  it.each([
    ["ft4", "#44DDFF", "text-cosmic-cyan"],
    ["FT8/CW", "#44DDFF", "text-cosmic-cyan"],
    ["CW/USB", "#FFD23F", "text-caution-amber"],
    ["LSB", "#00FF88", "text-signal-green"],
    ["PSK31", "#AA44FF", "text-aurora-purple"],
    ["DIGI", "#44DDFF", "text-su-muted"],
    ["DATA", "#44DDFF", "text-su-muted"],
    ["DIGU", "#888888", "text-su-muted"],
    ["JS8", "#888888", "text-su-muted"],
  ])("preserves mode alias %s and its text context", (mode, fill, text) => {
    expect(spots.getModeColor(mode)).toBe(fill);
    expect(spots.getModeTailwindColor(mode)).toBe(text);
  });

  it.each([
    [1800, 2000, "160m"],
    [3500, 4000, "80m"],
    [5300, 5400, "60m"],
    [7000, 7300, "40m"],
    [10100, 10150, "30m"],
    [14000, 14350, "20m"],
    [18068, 18168, "17m"],
    [21000, 21450, "15m"],
    [24890, 24990, "12m"],
    [28000, 29700, "10m"],
    [50000, 54000, "6m"],
    [144000, 148000, "2m"],
  ] as const)("keeps inclusive kHz allocation %s–%s", (min, max, band) => {
    expect(spots.getBandFromFrequency(min)).toBe(band);
    expect(spots.getBandFromFrequency(max)).toBe(band);
    expect(spots.getBandFromFrequency(min - 0.001)).toBe("unknown");
    expect(spots.getBandFromFrequency(max + 0.001)).toBe("unknown");
  });

  it("preserves per-spot fallback precedence and shared age time", () => {
    const now = Date.parse("2026-09-12T12:00:00Z");
    expect(spots.getSpotColor({ band: "20m" }, "mode", now)).toBe("#888888");
    expect(
      spots.getSpotColor({ band: "unknown", frequency: 14074 }, "band", now),
    ).toBe("#4488ff");
    expect(
      spots.getSpotColor({ band: "", frequency: 14074 }, "band", now),
    ).toBe("#66ff99");
    for (const snr of [NaN, Infinity, -Infinity]) {
      expect(spots.getSpotColor({ band: "20m", snr }, "snr", now)).toBe(
        "#66ff99",
      );
    }
    for (const time of ["bad", new Date(NaN)]) {
      expect(spots.getSpotColor({ band: "20m", time }, "age", now)).toBe(
        "#66ff99",
      );
    }
    for (const time of [
      "2026-09-12T11:55:00Z",
      new Date("2026-09-12T11:55:00Z"),
    ]) {
      expect(spots.getSpotColor({ time }, "age", now)).toBe("#4bd4e8");
    }
  });
});
