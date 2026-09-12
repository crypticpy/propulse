import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as legacyModes from "@/lib/sdr/modeColors";
import * as modes from "./sdrModes";
import {
  PALETTE_NAMES,
  SDR_WATERFALL_PALETTES,
  getWaterfallPaletteStops,
} from "./sdrWaterfall";
import type { WaterfallPaletteName } from "@/components/sdr/waterfallPalette";
import * as waterfall from "@/components/sdr/waterfallPalette";

describe("SDR palette ownership", () => {
  it("preserves all legacy mode exports and waterfall option identity", () => {
    for (const name of Object.keys(legacyModes) as Array<
      keyof typeof legacyModes
    >) {
      expect(legacyModes[name]).toBe(modes[name]);
    }
    expect(waterfall.PALETTE_NAMES).toBe(PALETTE_NAMES);
    expect(PALETTE_NAMES).toEqual([
      "classic",
      "viridis",
      "plasma",
      "inferno",
      "turbo",
      "magma",
      "hot-iron",
      "fire",
      "sunset",
      "copper",
      "deep-ocean",
      "arctic",
      "electric",
      "radioactive",
      "night-vision",
      "gray",
    ]);
  });

  it.each([
    ["classic", [0, 0, 0], [255, 0, 0]],
    ["viridis", [68, 1, 84], [253, 231, 37]],
    ["gray", [0, 0, 0], [255, 255, 255]],
    ["night-vision", [0, 0, 0], [100, 255, 80]],
  ] as const)(
    "preserves %s LUT endpoint bytes and identity",
    (name, first, last) => {
      const lut = waterfall.getWaterfallPaletteLut(name);
      expect(lut).toHaveLength(768);
      expect([...lut.slice(0, 3)]).toEqual(first);
      expect([...lut.slice(-3)]).toEqual(last);
      expect(waterfall.getWaterfallPaletteLut(name)).toBe(lut);
      expect(waterfall.getWaterfallPaletteLutWithGamma(name, 1)).toBe(lut);
    },
  );

  it("preserves byte interpolation and exact preview formatting", () => {
    const gray = waterfall.getWaterfallPaletteLut("gray");
    for (let i = 0; i < 256; i++)
      expect([...gray.slice(i * 3, i * 3 + 3)]).toEqual([i, i, i]);
    expect(waterfall.getWaterfallPaletteGradientCss("gray")).toBe(
      "linear-gradient(to right, rgb(0,0,0) 0%, rgb(36,36,36) 14%, rgb(73,73,73) 29%, rgb(109,109,109) 43%, rgb(146,146,146) 57%, rgb(182,182,182) 71%, rgb(219,219,219) 86%, rgb(255,255,255) 100%)",
    );
    expect(waterfall.getPaletteDisplayName("hot-iron")).toBe("Hot Iron");
  });

  it.each(["missing", "CLASSIC", " classic", "constructor", "__proto__"])(
    "uses classic data for unknown %s in every rendering path without aliasing cache keys",
    (unknown) => {
      const name = unknown as WaterfallPaletteName;
      expect(getWaterfallPaletteStops(name)).toBe(
        SDR_WATERFALL_PALETTES.classic,
      );
      const lut = waterfall.getWaterfallPaletteLut(name);
      expect(lut).toEqual(waterfall.getWaterfallPaletteLut("classic"));
      expect(lut).not.toBe(waterfall.getWaterfallPaletteLut("classic"));
      expect(waterfall.getWaterfallPaletteLut(name)).toBe(lut);
      expect(waterfall.getWaterfallPaletteLutWithGamma(name, 1)).toBe(lut);
      expect(waterfall.getWaterfallPaletteLutWithGamma(name, 1.4)).toEqual(
        waterfall.getWaterfallPaletteLutWithGamma("classic", 1.4),
      );
      expect(waterfall.getWaterfallPaletteGradientCss(name)).toBe(
        waterfall.getWaterfallPaletteGradientCss("classic"),
      );
    },
  );

  it("preserves gamma computation before key rounding and bounded cache clear", async () => {
    vi.resetModules();
    const fresh = await import("@/components/sdr/waterfallPalette");
    const base = fresh.getWaterfallPaletteLut("gray");
    const first = fresh.getWaterfallPaletteLutWithGamma("gray", 1.23441);
    expect(fresh.getWaterfallPaletteLutWithGamma("gray", 1.23449)).toBe(first);
    for (let i = 0; i < 256; i++) {
      expect(first[i * 3]).toBe(
        Math.round(Math.pow(i / 255, 1 / 1.23441) * 255),
      );
    }
    // One entry exists; 63 new keys fill the cache. Hits must not clear it.
    for (let i = 0; i < 63; i++)
      fresh.getWaterfallPaletteLutWithGamma("gray", 10 + i);
    expect(fresh.getWaterfallPaletteLutWithGamma("gray", 1.23441)).toBe(first);
    fresh.getWaterfallPaletteLutWithGamma("gray", 99);
    expect(fresh.getWaterfallPaletteLutWithGamma("gray", 1.23441)).not.toBe(
      first,
    );
    expect(fresh.getWaterfallPaletteLut("gray")).toBe(base);
  });

  it.each([
    ["usb", "ssb", "text-signal-green", "rgba(34, 197, 94, 0.9)"],
    ["CW-R", "cw", "text-cosmic-cyan", "rgba(0, 220, 255, 0.9)"],
    ["NFM", "am", "text-caution-amber", "rgba(245, 158, 11, 0.9)"],
    ["DIGU", "digital", "text-purple-400", "rgba(168, 85, 247, 0.9)"],
    ["JS8", "digital", "text-purple-400", "rgba(168, 85, 247, 0.9)"],
    ["PSK31", "unknown", "text-su-muted", "rgba(156, 163, 175, 0.5)"],
    ["DATA", "unknown", "text-su-muted", "rgba(156, 163, 175, 0.5)"],
    ["FT8/CW", "unknown", "text-su-muted", "rgba(156, 163, 175, 0.5)"],
    [" CW", "unknown", "text-su-muted", "rgba(156, 163, 175, 0.5)"],
  ])(
    "keeps SDR mode context %s distinct from spot substring aliases",
    (mode, group, text, accent) => {
      expect(modes.getModeGroup(mode)).toBe(group);
      expect(modes.getModeTextClass(mode)).toBe(text);
      expect(modes.getModeAccentCss(mode)).toBe(accent);
    },
  );

  it("retains view/DSP APIs and their separate mode semantics", () => {
    expect(waterfall.rfHzToAudioHz(14000100, 14000000, "CWR")).toBe(-100);
    expect(waterfall.audioHzToRfHz(-100, 14000000, "AM")).toBe(14000100);
    expect(
      waterfall.computePassbandHz({
        freqHz: 14000000,
        filterLowHz: 100,
        filterHighHz: 500,
        mode: "CWR",
      }),
    ).toEqual({ startHz: 14000100, endHz: 14000500 });
    expect(
      waterfall.computePassbandHz({
        freqHz: 14000000,
        filterLowHz: 100,
        filterHighHz: 500,
        mode: "LSB",
      }),
    ).toEqual({ startHz: 13999500, endHz: 13999900 });
  });

  it("keeps new palette authorities free of runtime imports", () => {
    for (const file of ["sdrWaterfall", "sdrModes"]) {
      const source = readFileSync(`src/lib/colors/palettes/${file}.ts`, "utf8");
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of parsed.statements) {
        if (ts.isImportDeclaration(statement))
          expect(statement.importClause?.isTypeOnly).toBe(true);
      }
    }
  });
});
