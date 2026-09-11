import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemeToDocument,
  getAccentPreset,
  getTheme,
  type ThemeId,
} from "./index";
import {
  clampSaturation,
  DEFAULT_ACCENT_HEX,
  hexToChannels,
  SATURATION_DEFAULT,
  SATURATION_MAX,
  SATURATION_MIN,
  SATURATION_STEP,
  stationContrast,
  stationPalettes,
  stationTokens,
} from "./stationTokens";
import { hexToOklch, scaleHexChroma } from "./oklch";
import { DEUTERANOPIA_PALETTE, TRITANOPIA_PALETTE } from "./colorblind";
import {
  stationTokens as reExportedStationTokens,
  stationPalettes as reExportedStationPalettes,
  stationContrast as reExportedStationContrast,
} from "@/components/station-ui/tokens";

const COLOR_TOKENS = [
  "canvas",
  "panel",
  "input",
  "text",
  "muted",
  "line",
  "accent",
  "on-accent",
  "accent-edge",
  "accent-text",
  "info",
  "success",
  "warning",
  "danger",
  "purple",
] as const;

/**
 * The declarations inside the first `selector { ... }` block of a stylesheet.
 *
 * A whole-file `toContain` is not an assertion about a block: `globals.css`
 * declares the same neutral literals in `:root` and again in `.su-fixed-dark`,
 * so deleting one copy leaves the other satisfying the match and the test
 * green. Slice the block and assert inside it.
 */
function cssBlock(css: string, selector: string) {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

function rootTokens() {
  const style = document.documentElement.style;
  return (name: string) => style.getPropertyValue(name);
}

describe("station tokens on the document root", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("emits the Propulse dark palette and channel triplets on <html>", () => {
    applyThemeToDocument(getTheme("dark"), getAccentPreset("plasma"));
    const token = rootTokens();
    expect(token("--su-text")).toBe("#cad2dc");
    expect(token("--su-text-rgb")).toBe("202 210 220");
    expect(token("--su-canvas")).toBe("#141827");
    expect(token("--su-canvas-rgb")).toBe("20 24 39");
    expect(token("--su-panel")).toBe("#191e2e");
    expect(token("--su-muted")).toBe("#a0abba");
    expect(token("--su-line")).toBe("#637088");
    expect(token("--su-accent")).toBe("#ff6b35");
    expect(token("--su-accent-rgb")).toBe("255 107 53");
  });

  it("sets an -rgb triplet for every colour token in every theme", () => {
    for (const themeId of Object.keys(stationPalettes) as ThemeId[]) {
      document.documentElement.removeAttribute("style");
      applyThemeToDocument(getTheme(themeId), getAccentPreset("cosmic"));
      const token = rootTokens();
      for (const name of COLOR_TOKENS) {
        expect(token(`--su-${name}`)).toMatch(/^#[0-9a-f]{6}$/i);
        expect(token(`--su-${name}-rgb`)).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      }
    }
  });

  it("follows the theme and the accent, and leaves the legacy --theme-* vars intact", () => {
    applyThemeToDocument(getTheme("light"), getAccentPreset("aurora"));
    const token = rootTokens();
    expect(token("--su-canvas")).toBe(stationPalettes.light.canvas);
    expect(token("--su-accent")).toBe("#a855f7");
    expect(token("--theme-accent-primary")).toBe("#a855f7");
  });

  it("keeps the station-ui re-export resolving to the same implementation", () => {
    expect(reExportedStationTokens).toBe(stationTokens);
    expect(reExportedStationPalettes).toBe(stationPalettes);
    expect(reExportedStationContrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("emits an -rgb triplet in the scoped token set itself (StationProvider overrides)", () => {
    const tokens = stationTokens("dark", "#ff6b35");
    expect(tokens["--su-text-rgb"]).toBe("202 210 220");
    expect(tokens["--su-accent-rgb"]).toBe("255 107 53");
    expect(tokens["--su-on-accent-rgb"]).toBe("0 0 0");
  });

  it("keeps the globals.css :root fallbacks in sync with the dark palette", () => {
    const css = readFileSync(
      resolve(__dirname, "../../styles/globals.css"),
      "utf8",
    );
    // The first `:root` block is the token block; `.su-fixed-dark` below it
    // repeats most of these literals, so a whole-file match would be
    // satisfied by the wrong block and deleting a `:root` line would stay
    // green -- which is exactly what a reviewer proved by deleting
    // `--su-purple-rgb` from `:root`.
    const root = cssBlock(css, ":root {");
    const tokens = stationTokens("dark", "#ff6b35");
    for (const name of COLOR_TOKENS) {
      const value = tokens[`--su-${name}`];
      expect(root).toContain(`--su-${name}: ${value};`);
      const channels = value
        .replace("#", "")
        .match(/../g)!
        .map((pair) => parseInt(pair, 16))
        .join(" ");
      expect(root).toContain(`--su-${name}-rgb: ${channels};`);
    }
  });

  it("keeps the .su-fixed-dark pre-JS tone fallbacks in sync with the dark palette", () => {
    // .su-fixed-dark (SDR cockpit skins, rank card back) pins its tone roles
    // to --su-fixed-dark-*, whose :root fallback must match the dark
    // palette's un-swapped tones the same way the neutral fallbacks above do.
    const css = readFileSync(
      resolve(__dirname, "../../styles/globals.css"),
      "utf8",
    );
    const root = cssBlock(css, ":root {");
    for (const role of ["info", "success", "warning", "danger"] as const) {
      const value = stationPalettes.dark[role];
      expect(root).toContain(`--su-fixed-dark-${role}: ${value};`);
      expect(root).toContain(
        `--su-fixed-dark-${role}-rgb: ${hexToChannels(value)};`,
      );
    }
    // `purple` takes no colour-blind swap, so `.su-fixed-dark` pins it
    // directly rather than through a --su-fixed-dark-* triple. Read the block
    // itself: the same declaration also appears in the :root fallbacks above.
    const fixedDark = cssBlock(css, ".su-fixed-dark {");
    expect(fixedDark).toContain(`--su-purple: ${stationPalettes.dark.purple};`);
    expect(fixedDark).toContain(
      `--su-purple-rgb: ${hexToChannels(stationPalettes.dark.purple)};`,
    );
  });

  it("keeps Home's high-contrast text override on the high-contrast palette", () => {
    const css = readFileSync(
      resolve(__dirname, "../../styles/home.css"),
      "utf8",
    );
    expect(css).toContain(
      `.dark.contrast-more .home-dashboard{--su-text:${stationPalettes["high-contrast"].text}}`,
    );
  });

  it("keeps the HamClock su- pin in sync with the Propulse dark palette", () => {
    // The wall is standalone dark wall art, so hamclock-themes.css pins the
    // surface roles under [data-hamclock-theme]. Values live in CSS (one
    // selector covers the wall and its portalled panels); this keeps them from
    // drifting away from stationPalettes.dark.
    const css = readFileSync(
      resolve(__dirname, "../../styles/hamclock-themes.css"),
      "utf8",
    );
    for (const name of ["canvas", "panel", "input", "text", "muted", "line"]) {
      const value = stationPalettes.dark[name as "canvas"];
      expect(css).toContain(`--su-${name}: ${value};`);
      expect(css).toContain(`--su-${name}-rgb: ${hexToChannels(value)};`);
    }
    // The tone roles are not pinned to fixed hexes: they are routed through the
    // wall's own --hc-*-rgb triples, so they keep their pre-DS-09 values.
    expect(css).toContain("--su-success-rgb: var(--hc-good-rgb);");
    expect(css).toContain("--su-warning-rgb: var(--hc-warn-rgb);");
    expect(css).toContain("--su-danger-rgb: var(--hc-bad-rgb);");
    // `purple` has no --hc-* triple to route through and is not a tone role,
    // so the wall pins it to the dark palette's violet like the surfaces.
    expect(css).toContain(`--su-purple: ${stationPalettes.dark.purple};`);
    expect(css).toContain(
      `--su-purple-rgb: ${hexToChannels(stationPalettes.dark.purple)};`,
    );
  });

  it("previews the canvas it applies in the Settings theme swatch", () => {
    // AppearanceSection.tsx renders theme.colors.bgPrimary as the swatch while
    // applyThemeToDocument paints stationPalettes[id].canvas; the two used to
    // be independent hexes and disagreed for all four themes.
    for (const themeId of Object.keys(stationPalettes) as ThemeId[]) {
      expect(getTheme(themeId).colors.bgPrimary).toBe(
        stationPalettes[themeId].canvas,
      );
    }
  });
});

describe("the aurora-purple token (--su-purple)", () => {
  // #787: `aurora-purple` was the only station accent still bound to a fixed
  // hex in tailwind.config.js, so it could not follow the palette and measured
  // 3.93:1 on the dark panel, 3.81:1 on the light panel and 4.30:1 on the
  // midnight panel as bare foreground text — under the 4.5:1 AA floor in three
  // of four themes, and identical in all four because it never moved. Every
  // palette now carries its own violet and Tailwind reads --su-purple-rgb.
  const surfaces = ["panel", "canvas"] as const;
  const cases = (Object.keys(stationPalettes) as ThemeId[]).flatMap((themeId) =>
    surfaces.map((surface) => [themeId, surface] as const),
  );

  it.each(cases)(
    "clears the status-text floor as bare text on %s %s",
    (themeId, surface) => {
      const palette = stationPalettes[themeId];
      expect(
        stationContrast(palette.purple, palette[surface]),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("stays a violet in every theme rather than being greyed to pass", () => {
    // The cheap way to clear the floor is to drain the hue, which would cost
    // the app the colour this token exists to carry. Violet means blue is the
    // dominant channel and red leads green, and the chroma has to be real.
    for (const themeId of Object.keys(stationPalettes) as ThemeId[]) {
      const [red, green, blue] = hexToChannels(stationPalettes[themeId].purple)
        .split(" ")
        .map(Number);
      expect(blue).toBeGreaterThan(red);
      expect(red).toBeGreaterThan(green);
      expect(blue - green).toBeGreaterThan(80);
    }
  });

  it("is not remapped by colour-blind mode", () => {
    // The swap is for the status roles (good/fair/poor). `purple` is a
    // decorative accent — Pro badges, RTTY, hazardous AQI — so it keeps its
    // palette value and does not spend one of the distinguishable hues.
    for (const mode of ["deuteranopia", "protanopia", "tritanopia"] as const) {
      for (const themeId of Object.keys(stationPalettes) as ThemeId[]) {
        expect(stationTokens(themeId, "#ff6b35", mode)["--su-purple"]).toBe(
          stationPalettes[themeId].purple,
        );
      }
    }
  });

  it("emits the channel triplet Tailwind's aurora-purple utilities read", () => {
    applyThemeToDocument(getTheme("light"), getAccentPreset("plasma"));
    const token = rootTokens();
    expect(token("--su-purple")).toBe(stationPalettes.light.purple);
    expect(token("--su-purple-rgb")).toBe(
      hexToChannels(stationPalettes.light.purple),
    );
  });
});

describe("colour-blind tone tokens", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("survives a theme change and an accent change", () => {
    // Regression: the swap used to be layered on after applyThemeToDocument(),
    // so switching theme or accent silently reverted the tones to the palette.
    applyThemeToDocument(
      getTheme("dark"),
      getAccentPreset("plasma"),
      "deuteranopia",
    );
    const token = rootTokens();
    // fair already clears the floor on the dark panel, so it is used verbatim.
    expect(token("--su-warning")).toBe(DEUTERANOPIA_PALETTE.fair);
    expect(token("--su-success")).not.toBe(stationPalettes.dark.success);
    expect(token("--su-danger")).not.toBe(stationPalettes.dark.danger);

    applyThemeToDocument(
      getTheme("light"),
      getAccentPreset("plasma"),
      "deuteranopia",
    );
    expect(token("--su-success")).not.toBe(stationPalettes.light.success);
    expect(token("--su-canvas")).toBe(stationPalettes.light.canvas);

    applyThemeToDocument(
      getTheme("light"),
      getAccentPreset("aurora"),
      "deuteranopia",
    );
    expect(token("--su-danger")).not.toBe(stationPalettes.light.danger);
    expect(token("--su-accent")).toBe("#a855f7");
  });

  it("keeps every swapped tone above the status-text floor on its panel", () => {
    // The colour-blind palette is one fixed set of hues; the station palettes
    // are not. Raw tritanopia fair (#DDCC77) is 1.5:1 on the Light panel and
    // raw deuteranopia good (#0077BB) 3.7:1 on the dark one, so the tones are
    // blended toward the far pole until they clear 4.5:1.
    expect(
      stationContrast(TRITANOPIA_PALETTE.fair, stationPalettes.light.panel),
    ).toBeLessThan(4.5);
    for (const mode of ["deuteranopia", "protanopia", "tritanopia"] as const) {
      for (const themeId of Object.keys(stationPalettes) as ThemeId[]) {
        const tokens = stationTokens(themeId, "#ff6b35", mode);
        for (const role of ["success", "warning", "danger"] as const) {
          expect(
            stationContrast(
              tokens[`--su-${role}`],
              stationPalettes[themeId].panel,
            ),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps the three swapped tones distinguishable from each other", () => {
    const tokens = stationTokens("light", "#ff6b35", "tritanopia");
    const tones = new Set([
      tokens["--su-success"],
      tokens["--su-warning"],
      tokens["--su-danger"],
    ]);
    expect(tones.size).toBe(3);
  });

  it("emits matching -rgb triplets for the swapped tones", () => {
    applyThemeToDocument(
      getTheme("dark"),
      getAccentPreset("plasma"),
      "tritanopia",
    );
    const token = rootTokens();
    expect(token("--su-warning")).toBe(TRITANOPIA_PALETTE.fair);
    expect(token("--su-warning-rgb")).toBe("221 204 119");
  });

  it("swaps the same tones in the scoped token set StationProvider injects", () => {
    const scoped = stationTokens("dark", "#ff6b35", "protanopia");
    // Both protanopia tones already clear the dark panel, so they pass through.
    expect(scoped["--su-warning"]).toBe("#EE7733");
    expect(scoped["--su-success"]).toBe("#009988");
    expect(scoped["--su-success-rgb"]).toBe("0 153 136");
    expect(stationTokens("dark", "#ff6b35")["--su-success"]).toBe(
      stationPalettes.dark.success,
    );
  });

  it("leaves the tones on the palette when no mode is active", () => {
    applyThemeToDocument(getTheme("dark"), getAccentPreset("plasma"), "none");
    expect(rootTokens()("--su-danger")).toBe(stationPalettes.dark.danger);
  });
});

describe("--su-fixed-dark-* tone triples for .su-fixed-dark", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("stays on the dark palette's tones regardless of the active theme", () => {
    // .su-fixed-dark pins its tone roles to these; a pinned SDR/rank-card
    // subtree must read the dark palette's danger, not Light's, or a fill
    // (bg-alert-red) and the pinned-dark ink on it (text-su-canvas) come from
    // different palettes — the bug this token pair exists to fix.
    applyThemeToDocument(getTheme("light"), getAccentPreset("plasma"));
    const token = rootTokens();
    expect(token("--su-fixed-dark-danger")).toBe(stationPalettes.dark.danger);
    expect(token("--su-fixed-dark-danger-rgb")).toBe(
      hexToChannels(stationPalettes.dark.danger),
    );
    expect(token("--su-fixed-dark-info")).toBe(stationPalettes.dark.info);
    expect(token("--su-fixed-dark-success")).toBe(stationPalettes.dark.success);
    expect(token("--su-fixed-dark-warning")).toBe(stationPalettes.dark.warning);
  });

  it("stays colour-blind-aware even though the theme's own tones are not swapped", () => {
    applyThemeToDocument(
      getTheme("light"),
      getAccentPreset("plasma"),
      "deuteranopia",
    );
    const token = rootTokens();
    expect(token("--su-fixed-dark-danger")).not.toBe(
      stationPalettes.dark.danger,
    );
    expect(token("--su-fixed-dark-danger")).toBe(
      stationTokens("dark", DEFAULT_ACCENT_HEX, "deuteranopia")["--su-danger"],
    );
  });
});

describe("hexToChannels", () => {
  it("expands three-digit hex", () => {
    expect(hexToChannels("#abc")).toBe("170 187 204");
  });

  it("reads six-digit hex with or without the hash", () => {
    expect(hexToChannels("#ff6b35")).toBe("255 107 53");
    expect(hexToChannels("FF6B35")).toBe("255 107 53");
  });

  it("falls back to the dark canvas channels for non-hex input", () => {
    const darkCanvasChannels = hexToChannels(stationPalettes.dark.canvas);
    expect(hexToChannels("rebeccapurple")).toBe(darkCanvasChannels);
    expect(hexToChannels("#12345")).toBe(darkCanvasChannels);
    expect(hexToChannels("")).toBe(darkCanvasChannels);
  });
});

const TONE_ROLES = [
  "accent",
  "info",
  "success",
  "warning",
  "danger",
] as const;

const SURFACE_ROLES = [
  "canvas",
  "panel",
  "input",
  "text",
  "muted",
  "line",
  "purple",
] as const;

function chromaOf(hex: string): number {
  const oklch = hexToOklch(hex);
  expect(oklch).not.toBeNull();
  return oklch!.C;
}

describe("oklch conversion", () => {
  it("matches Ottosson's linear-sRGB green primary", () => {
    const oklch = hexToOklch("#00ff00");
    expect(oklch).not.toBeNull();
    expect(oklch!.L).toBeCloseTo(0.86644, 4);
    expect(oklch!.C).toBeCloseTo(0.29483, 4);
  });

  it("round-trips an in-gamut hex at factor 1 without changing the string", () => {
    expect(scaleHexChroma("#8bdbb0", 1)).toBe("#8bdbb0");
  });
});

describe("clampSaturation", () => {
  it("defaults a missing key to 1, the pre-slider identity", () => {
    expect(clampSaturation(undefined)).toBe(SATURATION_DEFAULT);
    expect(clampSaturation(null)).toBe(SATURATION_DEFAULT);
    expect(clampSaturation("1")).toBe(SATURATION_DEFAULT);
  });

  it("snaps onto the 0.05 grid and stays inside 0.8…1.4", () => {
    expect(clampSaturation(1.37)).toBe(1.35);
    expect(clampSaturation(0.82)).toBe(0.8);
    expect(clampSaturation(2)).toBe(SATURATION_MAX);
    expect(clampSaturation(0.1)).toBe(SATURATION_MIN);
    expect(clampSaturation(1)).toBe(SATURATION_DEFAULT);
    expect(SATURATION_STEP).toBe(0.05);
  });
});

describe("station token saturation", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("treats factor 1 as identity for every token", () => {
    for (const themeId of Object.keys(stationPalettes) as ThemeId[]) {
      const unscaled = stationTokens(themeId, DEFAULT_ACCENT_HEX);
      expect(stationTokens(themeId, DEFAULT_ACCENT_HEX, "none", 1)).toEqual(
        unscaled,
      );
    }
  });

  it("raises chroma at 1.4 and keeps accent-text on panel at 4.5:1", () => {
    for (const themeId of ["dark", "light"] as const) {
      const base = stationTokens(themeId, DEFAULT_ACCENT_HEX, "none", 1);
      const vivid = stationTokens(themeId, DEFAULT_ACCENT_HEX, "none", 1.4);
      // Plasma orange sits on the sRGB hull at this L/h, so 140% cannot
      // raise its C. The four palette tones are inside the hull and move.
      expect(chromaOf(vivid["--su-accent"])).toBeGreaterThanOrEqual(
        chromaOf(base["--su-accent"]),
      );
      for (const role of ["info", "success", "warning", "danger"] as const) {
        expect(chromaOf(vivid[`--su-${role}`])).toBeGreaterThan(
          chromaOf(base[`--su-${role}`]),
        );
      }
      for (const role of SURFACE_ROLES) {
        expect(vivid[`--su-${role}`]).toBe(base[`--su-${role}`]);
      }
      expect(
        stationContrast(
          vivid["--su-accent-text"],
          stationPalettes[themeId].panel,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("lowers chroma at 0.8 and leaves surfaces untouched", () => {
    for (const themeId of ["dark", "light"] as const) {
      const base = stationTokens(themeId, DEFAULT_ACCENT_HEX, "none", 1);
      const muted = stationTokens(themeId, DEFAULT_ACCENT_HEX, "none", 0.8);
      for (const role of TONE_ROLES) {
        expect(chromaOf(muted[`--su-${role}`])).toBeLessThan(
          chromaOf(base[`--su-${role}`]),
        );
      }
      for (const role of SURFACE_ROLES) {
        expect(muted[`--su-${role}`]).toBe(base[`--su-${role}`]);
      }
    }
  });

  it("swaps colour-blind tones before scaling their chroma", () => {
    const swapped = stationTokens("dark", DEFAULT_ACCENT_HEX, "deuteranopia", 1);
    const scaled = stationTokens(
      "dark",
      DEFAULT_ACCENT_HEX,
      "deuteranopia",
      1.4,
    );
    expect(swapped["--su-success"]).not.toBe(stationPalettes.dark.success);
    expect(chromaOf(scaled["--su-success"])).toBeGreaterThan(
      chromaOf(swapped["--su-success"]),
    );
  });

  it("writes the scaled tones onto the document and keeps --theme-accent-primary in lockstep", () => {
    applyThemeToDocument(
      getTheme("dark"),
      getAccentPreset("plasma"),
      "none",
      1.4,
    );
    const token = rootTokens();
    expect(token("--su-success")).not.toBe(stationPalettes.dark.success);
    expect(token("--theme-accent-primary")).toBe(token("--su-accent"));
    expect(token("--su-canvas")).toBe(stationPalettes.dark.canvas);
  });

  it("raises chroma of an in-gamut accent that still has headroom", () => {
    const inside = "#3b82f6";
    const base = stationTokens("dark", inside, "none", 1);
    const vivid = stationTokens("dark", inside, "none", 1.4);
    expect(chromaOf(vivid["--su-accent"])).toBeGreaterThan(
      chromaOf(base["--su-accent"]),
    );
    expect(vivid["--su-accent"]).not.toBe(inside);
  });
});
