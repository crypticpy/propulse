/**
 * Theme System
 *
 * Defines available themes and utilities for applying them.
 */

import type { ColorBlindMode } from "./colorblind";
import {
  hexToChannels,
  stationPalettes,
  stationTokens,
} from "./stationTokens";

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgPanel: string;
  textPrimary: string;
  textSecondary: string;
  accentPrimary: string;
  accentSecondary: string;
  border: string;
  glow: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  isDark: boolean;
  colors: ThemeColors;
}

export type ThemeId = "dark" | "light" | "high-contrast" | "midnight";

export interface AccentColor {
  id: string;
  name: string;
  primary: string;
  secondary: string;
}

export const THEMES: Theme[] = [
  {
    id: "dark",
    name: "Dark",
    description: "Default dark theme with vibrant accents",
    isDark: true,
    colors: {
      bgPrimary: "#0a0a1a",
      bgSecondary: "#1a1a2e",
      bgPanel: "rgba(20, 28, 46, 0.95)",
      textPrimary: "#ffffff",
      textSecondary: "#94a3b8",
      accentPrimary: "#ff6b35",
      accentSecondary: "#00ff88",
      border: "rgba(255, 255, 255, 0.1)",
      glow: "rgba(255, 107, 53, 0.3)",
    },
  },
  {
    id: "light",
    name: "Light",
    description: "Light theme for daytime use",
    isDark: false,
    colors: {
      bgPrimary: "#f8fafc",
      bgSecondary: "#e2e8f0",
      bgPanel: "rgba(255, 255, 255, 0.95)",
      textPrimary: "#1e293b",
      textSecondary: "#64748b",
      accentPrimary: "#ea580c",
      accentSecondary: "#0891b2",
      border: "rgba(0, 0, 0, 0.1)",
      glow: "rgba(234, 88, 12, 0.2)",
    },
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Maximum readability with strong contrast",
    isDark: true,
    colors: {
      bgPrimary: "#000000",
      bgSecondary: "#1a1a1a",
      bgPanel: "rgba(0, 0, 0, 0.98)",
      textPrimary: "#ffffff",
      textSecondary: "#cccccc",
      accentPrimary: "#ffaa00",
      accentSecondary: "#00ffff",
      border: "rgba(255, 255, 255, 0.3)",
      glow: "rgba(255, 170, 0, 0.4)",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Extra dark with muted colors",
    isDark: true,
    colors: {
      bgPrimary: "#050510",
      bgSecondary: "#0f0f1f",
      bgPanel: "rgba(10, 10, 25, 0.95)",
      textPrimary: "#d1d5db",
      textSecondary: "#6b7280",
      accentPrimary: "#c084fc",
      accentSecondary: "#22d3ee",
      border: "rgba(255, 255, 255, 0.05)",
      glow: "rgba(192, 132, 252, 0.2)",
    },
  },
];

export const ACCENT_PRESETS: AccentColor[] = [
  {
    id: "plasma",
    name: "Plasma Orange",
    primary: "#ff6b35",
    secondary: "#00ff88",
  },
  {
    id: "cosmic",
    name: "Cosmic Cyan",
    primary: "#06b6d4",
    secondary: "#ff6b35",
  },
  {
    id: "aurora",
    name: "Aurora Purple",
    primary: "#a855f7",
    secondary: "#22c55e",
  },
  {
    id: "signal",
    name: "Signal Green",
    primary: "#22c55e",
    secondary: "#f97316",
  },
  { id: "solar", name: "Solar Gold", primary: "#eab308", secondary: "#06b6d4" },
  { id: "crimson", name: "Crimson", primary: "#ef4444", secondary: "#06b6d4" },
  { id: "ocean", name: "Ocean Blue", primary: "#3b82f6", secondary: "#f97316" },
  { id: "rose", name: "Rose", primary: "#ec4899", secondary: "#06b6d4" },
];

export function getTheme(id: ThemeId): Theme {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function getAccentPreset(id: string): AccentColor {
  return ACCENT_PRESETS.find((a) => a.id === id) || ACCENT_PRESETS[0];
}

/**
 * Write the active theme onto `<html>`: the station tokens (`--su-*` plus
 * their `-rgb` triplets), the legacy `--theme-*` vars derived from the same
 * palette, and the `dark`/`light` class.
 *
 * `colorBlindMode` is applied here, as part of the same write, because the
 * tone tokens it swaps (`--su-success`/`-warning`/`-danger`) are inline styles
 * on `<html>`: a separate CSS rule could never outrank them, and a separate
 * second pass would be undone by the next theme or accent change.
 */
export function applyThemeToDocument(
  theme: Theme,
  accent?: AccentColor,
  colorBlindMode: ColorBlindMode = "none",
): void {
  const root = document.documentElement;
  const { colors } = theme;
  const accentPrimary = accent?.primary || colors.accentPrimary;
  // No station role maps to a "secondary" accent, so the legacy
  // --theme-accent-secondary var (Settings' "Secondary Color" control, and
  // anything still reading it) keeps the chosen accent's own secondary and
  // falls back to the palette's info role rather than a hard-coded hex.
  const palette = stationPalettes[theme.id];
  const accentSecondary = accent?.secondary || palette.info;

  // Legacy --theme-* vars, derived from the same station palette/accent as
  // the --su-* tokens below so the two systems agree instead of drifting.
  root.style.setProperty("--theme-bg-primary", palette.canvas);
  root.style.setProperty("--theme-bg-secondary", palette.panel);
  root.style.setProperty("--theme-bg-panel", "rgb(var(--su-panel-rgb) / 0.95)");
  root.style.setProperty("--theme-text-primary", palette.text);
  root.style.setProperty("--theme-text-secondary", palette.muted);
  root.style.setProperty("--theme-accent-primary", accentPrimary);
  root.style.setProperty("--theme-accent-secondary", accentSecondary);
  root.style.setProperty("--theme-border", "rgb(var(--su-line-rgb) / 0.4)");
  root.style.setProperty("--theme-glow", "rgb(var(--su-accent-rgb) / 0.3)");

  // RGB channel variables for Tailwind opacity modifier support
  root.style.setProperty(
    "--theme-accent-primary-rgb",
    hexToChannels(accentPrimary),
  );
  root.style.setProperty(
    "--theme-accent-secondary-rgb",
    hexToChannels(accentSecondary),
  );

  // Station design tokens (--su-*) on the document root, so `su-` Tailwind
  // utilities work anywhere. StationProvider still injects the same variables
  // inline on its `.station-ui` element, which wins over the root, so local
  // `theme`/`accent` overrides keep working.
  for (const [name, value] of Object.entries(
    stationTokens(theme.id, accentPrimary, colorBlindMode),
  )) {
    if (!name.startsWith("--su-") || typeof value !== "string") continue;
    root.style.setProperty(name, value);
  }

  root.classList.toggle("dark", theme.isDark);
  root.classList.toggle("light", !theme.isDark);
}

// Re-export color blind utilities for convenient access
export {
  type ColorBlindMode,
  type ColorBlindPalette,
  type StatusType,
  COLOR_BLIND_PALETTES,
  COLOR_BLIND_MODE_NAMES,
  COLOR_BLIND_MODE_DESCRIPTIONS,
  STANDARD_COLORS,
  DEUTERANOPIA_PALETTE,
  PROTANOPIA_PALETTE,
  TRITANOPIA_PALETTE,
  getColorBlindColor,
  getColorBlindBgColor,
  getStatusIcon,
  getStatusColorStyles,
} from "./colorblind";
