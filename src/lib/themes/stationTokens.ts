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

/**
 * `--su-*` pinned to the midnight palette, for content drawn on a surface that
 * stays dark whatever the app theme — `AccessibleDialog`'s chrome is a fixed
 * `bg-[#090b17]/95`. Without it, `text-su-text` / `text-su-muted` inside such a
 * dialog flip to the light palette and fall to roughly 2.4:1 against that
 * panel. Pass it through `panelProps={{ style: fixedDarkSurfaceTokens }}`, or
 * set it on the content root where the dialog takes no panel props. Drop it
 * when the dialog surface itself is themed.
 *
 * The accent-derived roles are deliberately left inherited: `--su-accent` is
 * the operator's own colour and is theme-independent.
 */
export const fixedDarkSurfaceTokens: StationTokenStyle = {
  ...Object.fromEntries(
    Object.entries(stationPalettes.midnight).map(([name, value]) => [
      `--su-${name}`,
      value,
    ]),
  ),
  colorScheme: "dark",
};

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
): StationTokenStyle {
  const palette = stationPalettes[theme];
  const accent = /^#[0-9a-f]{6}$/i.test(requestedAccent)
    ? requestedAccent
    : "#ff6b35";
  const onAccent =
    stationContrast(accent, "#000000") >= stationContrast(accent, "#ffffff")
      ? "#000000"
      : "#ffffff";
  return {
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
    colorScheme: theme === "light" ? "light" : "dark",
  };
}
