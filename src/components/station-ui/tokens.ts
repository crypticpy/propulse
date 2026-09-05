import type { CSSProperties } from "react";
import type { ThemeId } from "@/lib/themes";

export type StationDensity = "comfortable" | "compact";
export type StationTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StationTokenStyle = CSSProperties &
  Record<`--su-${string}`, string>;

/** Canonical palette; components only consume semantic --su-* properties. */
export const stationPalettes = {
  dark: {
    canvas: "#141827",
    panel: "#191e2e",
    input: "#111624",
    text: "#e2e8f0",
    muted: "#a0abba",
    line: "#637088",
    info: "#85c4d0",
    success: "#8bdbb0",
    warning: "#f5cf79",
    danger: "#fda4af",
  },
  light: {
    canvas: "#f4f6fa",
    panel: "#ffffff",
    input: "#f8fafc",
    text: "#1e293b",
    muted: "#526174",
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
    text: "#ffffff",
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
    text: "#e2e8f0",
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
    "--su-accent-edge": stationContrast(accent, palette.panel) >= 3 ? accent : palette.info,
    // A custom brand color is never assumed to be legible as text on a panel.
    "--su-accent-text":
      stationContrast(accent, palette.panel) >= 4.5 ? accent : palette.info,
    colorScheme: theme === "light" ? "light" : "dark",
  };
}
