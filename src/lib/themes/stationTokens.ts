/**
 * Station design tokens
 *
 * Canonical palette for the unified design system. The dark palette is the
 * Propulse default; the other themes are token swaps of the same roles.
 * Consumers only ever read the semantic `--su-*` custom properties, which are
 * emitted on the document root by `applyThemeToDocument` and, scoped to a
 * subtree, by `StationProvider`.
 *
 * This module must not import from `src/components/**`: `src/lib/themes/index.ts`
 * depends on it.
 */

import type { CSSProperties } from "react";
import { COLOR_BLIND_PALETTES, type ColorBlindMode } from "./colorblind";
import type { ThemeId } from "./index";

export type StationTokenStyle = CSSProperties &
  Record<`--su-${string}`, string>;

/** Canonical palette; components only consume semantic --su-* properties. */
export const stationPalettes = {
  dark: {
    canvas: "#141827",
    panel: "#191e2e",
    input: "#111624",
    text: "#cad2dc",
    muted: "#a0abba",
    line: "#637088",
    info: "#85c4d0",
    success: "#8bdbb0",
    warning: "#f5cf79",
    danger: "#fda4af",
  },
  light: {
    canvas: "#e9ece7",
    panel: "#f3f4ef",
    input: "#edf0ea",
    text: "#1e293b",
    muted: "#425168",
    line: "#748297",
    info: "#176477",
    success: "#166534",
    warning: "#854d0e",
    danger: "#9f1239",
  },
  "high-contrast": {
    canvas: "#000000",
    panel: "#080808",
    input: "#000000",
    text: "#e7e5df",
    muted: "#dddddd",
    line: "#aaaaaa",
    info: "#99eeff",
    success: "#aaffbb",
    warning: "#ffdd88",
    danger: "#ffb4c0",
  },
  midnight: {
    canvas: "#090b16",
    panel: "#111525",
    input: "#080c17",
    text: "#c4cdd7",
    muted: "#b0b9ca",
    line: "#637088",
    info: "#9fcddb",
    success: "#97dfb7",
    warning: "#efd29a",
    danger: "#f5b2c4",
  },
} satisfies Record<ThemeId, Record<string, string>>;

function luminance(hex: string) {
  const values = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

export function stationContrast(first: string, second: string) {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Custom accents get a contrasting label; malformed persisted values use plasma. */
export function stationTokens(
  theme: ThemeId,
  requestedAccent: string,
  colorBlindMode: ColorBlindMode = "none",
): StationTokenStyle {
  const palette = stationPalettes[theme];
  const accent = /^#[0-9a-f]{6}$/i.test(requestedAccent)
    ? requestedAccent
    : "#ff6b35";
  const onAccent =
    stationContrast(accent, "#000000") >= stationContrast(accent, "#ffffff")
      ? "#000000"
      : "#ffffff";
  const colors: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(palette).map(([name, value]) => [`--su-${name}`, value]),
    ),
    "--su-accent": accent,
    "--su-on-accent": onAccent,
    "--su-accent-edge":
      stationContrast(accent, palette.panel) >= 3 ? accent : palette.info,
    // A custom brand color is never assumed to be legible as text on a panel.
    "--su-accent-text":
      stationContrast(accent, palette.panel) >= 4.5 ? accent : palette.info,
  };
  // Colour-blind mode swaps the three tone roles for a palette whose hues stay
  // distinguishable. It is folded in here (rather than layered on afterwards by
  // a CSS rule or a second pass) so the document root and every scoped
  // `.station-ui` subtree agree, and so a later theme/accent change cannot
  // silently overwrite the swap.
  const colorBlind = COLOR_BLIND_PALETTES[colorBlindMode];
  if (colorBlind) {
    colors["--su-success"] = colorBlind.good;
    colors["--su-warning"] = colorBlind.fair;
    colors["--su-danger"] = colorBlind.poor;
  }
  // Channel triplets so Tailwind opacity modifiers (text-su-text/70) resolve
  // inside a scoped StationProvider as well as on the document root.
  const channels = Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [
      `${name}-rgb`,
      hexToChannels(value),
    ]),
  );
  return {
    ...colors,
    ...channels,
    colorScheme: theme === "light" ? "light" : "dark",
  };
}

/**
 * `"#ff6b35"` -> `"255 107 53"`; three-digit hex expands first (`"#abc"` ->
 * `"170 187 204"`). Anything that is not a hex colour falls back to the dark
 * palette's canvas channels rather than emitting an invalid custom property —
 * callers normalise user-supplied accents before they reach here.
 */
export function hexToChannels(hex: string): string {
  const raw = hex.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3 ? raw.replace(/./g, (digit) => digit + digit) : raw;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return "20 24 39";
  return expanded
    .match(/../g)!
    .map((pair) => parseInt(pair, 16))
    .join(" ");
}
