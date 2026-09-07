import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemeToDocument,
  getAccentPreset,
  getTheme,
  type ThemeId,
} from "./index";
import { stationPalettes, stationTokens } from "./stationTokens";
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
