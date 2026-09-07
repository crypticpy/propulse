import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemeToDocument,
  getAccentPreset,
  getTheme,
  type ThemeId,
} from "./index";
import { hexToChannels, stationPalettes, stationTokens } from "./stationTokens";
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
] as const;

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
    const tokens = stationTokens("dark", "#ff6b35");
    for (const name of COLOR_TOKENS) {
      const value = tokens[`--su-${name}`];
      expect(css).toContain(`--su-${name}: ${value};`);
      const channels = value
        .replace("#", "")
        .match(/../g)!
        .map((pair) => parseInt(pair, 16))
        .join(" ");
      expect(css).toContain(`--su-${name}-rgb: ${channels};`);
    }
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
    // The tone roles are not pinned to fixed hexes: they follow the same
    // colour-blind-aware --hc-*-rgb triples as the wall's own state colours.
    expect(css).toContain("--su-success-rgb: var(--hc-good-rgb);");
    expect(css).toContain("--su-warning-rgb: var(--hc-warn-rgb);");
    expect(css).toContain("--su-danger-rgb: var(--hc-bad-rgb);");
  });

  it("no longer declares the unused --color-text-* variables", () => {
    const css = readFileSync(
      resolve(__dirname, "../../styles/design-tokens.css"),
      "utf8",
    );
    expect(css).not.toContain("--color-text-primary");
    expect(css).not.toContain("--color-text-secondary");
    expect(css).not.toContain("--color-text-muted");
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
    expect(token("--su-success")).toBe(DEUTERANOPIA_PALETTE.good);
    expect(token("--su-warning")).toBe(DEUTERANOPIA_PALETTE.fair);
    expect(token("--su-danger")).toBe(DEUTERANOPIA_PALETTE.poor);

    applyThemeToDocument(
      getTheme("light"),
      getAccentPreset("plasma"),
      "deuteranopia",
    );
    expect(token("--su-success")).toBe(DEUTERANOPIA_PALETTE.good);
    expect(token("--su-canvas")).toBe(stationPalettes.light.canvas);

    applyThemeToDocument(
      getTheme("light"),
      getAccentPreset("aurora"),
      "deuteranopia",
    );
    expect(token("--su-danger")).toBe(DEUTERANOPIA_PALETTE.poor);
    expect(token("--su-accent")).toBe("#a855f7");
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

describe("hexToChannels", () => {
  it("expands three-digit hex", () => {
    expect(hexToChannels("#abc")).toBe("170 187 204");
  });

  it("reads six-digit hex with or without the hash", () => {
    expect(hexToChannels("#ff6b35")).toBe("255 107 53");
    expect(hexToChannels("FF6B35")).toBe("255 107 53");
  });

  it("falls back to the dark canvas channels for non-hex input", () => {
    expect(hexToChannels("rebeccapurple")).toBe("20 24 39");
    expect(hexToChannels("#12345")).toBe("20 24 39");
    expect(hexToChannels("")).toBe("20 24 39");
  });
});
