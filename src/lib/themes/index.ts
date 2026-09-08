/**
 * Theme System
 *
 * Defines available themes and utilities for applying them.
 */

import type { ColorBlindMode } from "./colorblind";
import {
  DEFAULT_ACCENT_HEX,
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
  /**
   * Only rendered by the accent-preset swatch (`AppearanceSettings.tsx`'s
   * dual-colour circle). The custom-hex accent built from `customPrimary`
   * (see `themeStore.ts`) has no secondary, so this is optional rather than
   * a second custom colour input — that control was removed in #533 because
   * the `--theme-accent-secondary` CSS var it wrote had no consumer.
   */
  secondary?: string;
}

/**
 * Legacy `Theme.colors` metadata, derived from the station palette rather than
 * kept as a second copy of it: `applyThemeToDocument` paints from
 * `stationPalettes`, and the Settings theme swatch
 * (`AppearanceSection.tsx`) renders `theme.colors.bgPrimary`, so a hand-written
 * hex here would preview a colour other than the one selecting it applies.
 * `accentPrimary` is the per-theme default accent (the fallback when no accent
 * is passed).
 */
function paletteColors(id: ThemeId, accentPrimary: string): ThemeColors {
  const palette = stationPalettes[id];
  return {
    bgPrimary: palette.canvas,
    bgSecondary: palette.panel,
    bgPanel: palette.panel,
    textPrimary: palette.text,
    textSecondary: palette.muted,
    accentPrimary,
    border: palette.line,
    glow: palette.info,
  };
}

export const THEMES: Theme[] = [
  {
    id: "dark",
    name: "Dark",
    description: "Default dark theme with vibrant accents",
    isDark: true,
    colors: paletteColors("dark", "#ff6b35"),
  },
  {
    id: "light",
    name: "Light",
    description: "Light theme for daytime use",
    isDark: false,
    colors: paletteColors("light", "#ea580c"),
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Maximum readability with strong contrast",
    isDark: true,
    colors: paletteColors("high-contrast", "#ffaa00"),
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Extra dark with muted colors",
    isDark: true,
    colors: paletteColors("midnight", "#c084fc"),
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
  const requestedAccent = accent?.primary || colors.accentPrimary;
  // Normalised once so the --theme-* derivation below and the --su-* tokens
  // stationTokens() emits can never disagree about what a malformed
  // persisted accent falls back to.
  const accentPrimary = /^#[0-9a-f]{6}$/i.test(requestedAccent)
    ? requestedAccent
    : DEFAULT_ACCENT_HEX;
  const palette = stationPalettes[theme.id];

  // Legacy --theme-* vars, derived from the same station palette/accent as
  // the --su-* tokens below so the two systems agree instead of drifting.
  root.style.setProperty("--theme-bg-primary", palette.canvas);
  root.style.setProperty("--theme-bg-secondary", palette.panel);
  root.style.setProperty("--theme-bg-panel", "rgb(var(--su-panel-rgb) / 0.95)");
  root.style.setProperty("--theme-text-primary", palette.text);
  root.style.setProperty("--theme-text-secondary", palette.muted);
  root.style.setProperty("--theme-accent-primary", accentPrimary);
  root.style.setProperty("--theme-border", "rgb(var(--su-line-rgb) / 0.4)");
  root.style.setProperty("--theme-glow", "rgb(var(--su-accent-rgb) / 0.3)");

  // RGB channel variables for Tailwind opacity modifier support
  root.style.setProperty(
    "--theme-accent-primary-rgb",
    hexToChannels(accentPrimary),
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

  // The dark palette's colour-blind-aware tone triples, always emitted
  // regardless of the active theme: `.su-fixed-dark` (globals.css) reads
  // these to pin its tone roles alongside the neutrals it already pins, so a
  // fill like `bg-alert-red` and an ink like `text-su-canvas` inside a pinned
  // SDR/rank-card subtree always come from the same (dark) palette instead of
  // the active one — see the contrast bug this fixes in stationTokens.test.ts.
  const fixedDarkTones = stationTokens(
    "dark",
    DEFAULT_ACCENT_HEX,
    colorBlindMode,
  );
  for (const role of ["info", "success", "warning", "danger"] as const) {
    root.style.setProperty(
      `--su-fixed-dark-${role}`,
      fixedDarkTones[`--su-${role}`],
    );
    root.style.setProperty(
      `--su-fixed-dark-${role}-rgb`,
      fixedDarkTones[`--su-${role}-rgb`],
    );
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
