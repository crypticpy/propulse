import { describe, expect, it } from "vitest";
import { stationContrast, stationPalettes } from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";
import {
  AGE_COLOR_STOPS,
  getAgeColor,
  getBandColor,
  getModeColor,
  getSnrColor,
  getSpotColor,
  MODE_COLORS,
  MODE_INK_DARK,
  MODE_INK_LIGHT,
  modeInk,
  SNR_COLOR_STOPS,
} from "./spotColors";

describe("modeInk", () => {
  it("puts dark ink on FT8/FT4 cyan, CW yellow, and SSB green", () => {
    expect(modeInk("FT8")).toBe(MODE_INK_DARK);
    expect(modeInk("FT4")).toBe(MODE_INK_DARK);
    expect(modeInk("CW")).toBe(MODE_INK_DARK);
    expect(modeInk("SSB")).toBe(MODE_INK_DARK);
  });

  it("meets WCAG AA 4.5:1 against every MODE_COLORS fill", () => {
    for (const [mode, fill] of Object.entries(MODE_COLORS)) {
      const ink = modeInk(mode === "default" ? undefined : mode);
      expect(stationContrast(ink, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("rejects light ink on the known-failure fills", () => {
    expect(stationContrast(MODE_INK_LIGHT, MODE_COLORS.FT8)).toBeLessThan(4.5);
    expect(stationContrast(MODE_INK_LIGHT, MODE_COLORS.CW)).toBeLessThan(4.5);
    expect(stationContrast(MODE_INK_LIGHT, MODE_COLORS.SSB)).toBeLessThan(4.5);
    expect(
      stationContrast(MODE_INK_DARK, getModeColor("FT8")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("bare MODE_COLORS text (no inkOnFill) vs station surfaces", () => {
  // `modeInk`'s own tests above prove the *fill+ink pair* clears 4.5:1. This
  // table is the other half (issue #774): it measures the fill by itself, as
  // bare foreground text, against the four station themes' `panel`/`canvas`
  // surfaces -- the mistake every fixed #774 call site was making
  // (`style={{ color: getModeColor(mode) }}` with no ink at all). Where a
  // cell is `false` that failure is expected and documented, not a bug: the
  // fix is to route through `inkOnFill(fill)` / `modeInk(mode)`, never to
  // use a MODE_COLORS value directly as a text color. A `true` cell going
  // red means a palette or MODE_COLORS edit silently made bare accent text
  // newly safe (or newly unsafe) and this table is stale.
  //
  // #787 gave `aurora-purple` a per-theme `--su-purple` token, which moved
  // the *Tailwind* class `MODE_COLORS_TAILWIND.RTTY` (now AA in all four
  // themes) but not this table: `MODE_COLORS` is the raw-hex map for
  // canvas/SVG rendering, deliberately independent of the tokens, and no
  // palette surface changed. No cell moved, and RTTY's `false` cells still
  // describe `MODE_COLORS.RTTY` (`#AA44FF`), not the class.
  const AA = 4.5;
  const expectedPass: Record<ThemeId, Record<string, boolean>> = {
    dark: {
      FT8: true,
      FT4: true,
      CW: true,
      SSB: true,
      RTTY: false,
      DIGI: true,
      DATA: true,
      default: true,
    },
    light: {
      FT8: false,
      FT4: false,
      CW: false,
      SSB: false,
      RTTY: false,
      DIGI: false,
      DATA: false,
      default: false,
    },
    "high-contrast": {
      FT8: true,
      FT4: true,
      CW: true,
      SSB: true,
      RTTY: true,
      DIGI: true,
      DATA: true,
      default: true,
    },
    midnight: {
      FT8: true,
      FT4: true,
      CW: true,
      SSB: true,
      RTTY: false,
      DIGI: true,
      DATA: true,
      default: true,
    },
  };
  // midnight/RTTY passes against the darker canvas but not the lighter
  // panel -- the one cell where panel and canvas disagree.
  const canvasOverrides: Partial<Record<ThemeId, Record<string, boolean>>> = {
    midnight: { RTTY: true },
  };

  for (const theme of Object.keys(stationPalettes) as ThemeId[]) {
    const palette = stationPalettes[theme];
    for (const [mode, fill] of Object.entries(MODE_COLORS)) {
      const passes = expectedPass[theme][mode];
      const canvasPasses = canvasOverrides[theme]?.[mode] ?? passes;

      it(`${theme}/${mode} bare text on panel ${passes ? "clears" : "misses"} AA -- use inkOnFill/modeInk instead`, () => {
        const ratio = stationContrast(fill, palette.panel);
        if (passes) {
          expect(ratio).toBeGreaterThanOrEqual(AA);
        } else {
          expect(ratio).toBeLessThan(AA);
        }
      });

      it(`${theme}/${mode} bare text on canvas ${canvasPasses ? "clears" : "misses"} AA -- use inkOnFill/modeInk instead`, () => {
        const ratio = stationContrast(fill, palette.canvas);
        if (canvasPasses) {
          expect(ratio).toBeGreaterThanOrEqual(AA);
        } else {
          expect(ratio).toBeLessThan(AA);
        }
      });
    }
  }
});

describe("getSnrColor", () => {
  it("runs weak-to-strong, the direction the Colors popover describes", () => {
    // Legend order is the ramp order, so the array itself has to ascend or the
    // legend reads green-to-red under a "weak red to strong green" label.
    expect(getSnrColor(-30)).toBe(SNR_COLOR_STOPS[0].color);
    expect(getSnrColor(25)).toBe(
      SNR_COLOR_STOPS[SNR_COLOR_STOPS.length - 1].color,
    );
    const bounds = SNR_COLOR_STOPS.map((s) => s.minDb);
    expect(bounds).toEqual([...bounds].sort((a, b) => a - b));
  });

  it("gives every stop a distinct color", () => {
    const colors = new Set(SNR_COLOR_STOPS.map((s) => s.color));
    expect(colors.size).toBe(SNR_COLOR_STOPS.length);
  });

  it("puts each stop's lower bound in that stop", () => {
    for (const stop of SNR_COLOR_STOPS) {
      if (Number.isFinite(stop.minDb)) {
        expect(getSnrColor(stop.minDb)).toBe(stop.color);
      }
    }
  });
});

describe("getAgeColor", () => {
  it("returns the newest stop for a fresh spot and the oldest for a stale one", () => {
    expect(getAgeColor(0)).toBe(AGE_COLOR_STOPS[0].color);
    expect(getAgeColor(10000)).toBe(
      AGE_COLOR_STOPS[AGE_COLOR_STOPS.length - 1].color,
    );
  });

  it("clamps a negative age to the newest stop rather than falling through", () => {
    // Clock skew between the spot source and the browser can put a spot
    // slightly in the future.
    expect(getAgeColor(-2)).toBe(AGE_COLOR_STOPS[0].color);
  });

  it("gives every stop a distinct color", () => {
    const colors = new Set(AGE_COLOR_STOPS.map((s) => s.color));
    expect(colors.size).toBe(AGE_COLOR_STOPS.length);
  });
});

describe("getSpotColor", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("colors by SNR when the mode is snr and the spot reports one", () => {
    expect(getSpotColor({ band: "20m", snr: 15 }, "snr")).toBe(getSnrColor(15));
  });

  it("uses a reported SNR of 0 rather than treating it as missing", () => {
    // 0 dB is a real, decodable signal -- a truthiness check would drop it.
    expect(getSpotColor({ band: "20m", snr: 0 }, "snr")).toBe(getSnrColor(0));
  });

  it("falls back to band color when a spot reports no SNR", () => {
    // Mixed feeds are normal: RBN reports SNR, DX cluster usually does not.
    expect(getSpotColor({ band: "20m" }, "snr")).toBe(getBandColor("20m"));
  });

  it("colors by age against the supplied reference time", () => {
    const time = new Date(now - 20 * 60000);
    expect(getSpotColor({ band: "20m", time }, "age", now)).toBe(
      getAgeColor(20),
    );
  });

  it("accepts a string timestamp, which is how spots arrive over JSON", () => {
    const time = new Date(now - 20 * 60000).toISOString();
    expect(getSpotColor({ band: "20m", time }, "age", now)).toBe(
      getAgeColor(20),
    );
  });

  it("falls back to band color for an unparseable timestamp", () => {
    expect(getSpotColor({ band: "20m", time: "not a date" }, "age", now)).toBe(
      getBandColor("20m"),
    );
  });

  it("still honors mode and band coloring", () => {
    expect(getSpotColor({ band: "20m", snr: 15 }, "band")).toBe(
      getBandColor("20m"),
    );
    expect(getSpotColor({ band: "20m", snr: 15, mode: "CW" }, "mode")).not.toBe(
      getSnrColor(15),
    );
  });

  it("distinguishes snr and age modes from band coloring", () => {
    // The regression this file exists for: both modes were routed straight
    // through getBandColor, so selecting either changed nothing on the map.
    const spot = { band: "20m", snr: 15, time: new Date(now) };
    expect(getSpotColor(spot, "snr", now)).not.toBe(getBandColor("20m"));
    expect(getSpotColor(spot, "age", now)).not.toBe(getBandColor("20m"));
  });
});

describe("unknown band keys", () => {
  it.each(["constructor", "__proto__", "hasOwnProperty", "toString"])(
    "returns the documented unknown color for %s through the legacy API",
    (band) => {
      expect(getBandColor(band)).toBe("#4488ff");
      expect(getSpotColor({ band }, "band")).toBe("#4488ff");
    },
  );
});
