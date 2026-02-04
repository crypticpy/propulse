/**
 * Theme System
 *
 * Defines available themes and utilities for applying them.
 */

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
      accentPrimary: "#f97316",
      accentSecondary: "#06b6d4",
      border: "rgba(255, 255, 255, 0.1)",
      glow: "rgba(249, 115, 22, 0.3)",
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
    primary: "#f97316",
    secondary: "#06b6d4",
  },
  {
    id: "cosmic",
    name: "Cosmic Cyan",
    primary: "#06b6d4",
    secondary: "#f97316",
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

export function applyThemeToDocument(theme: Theme, accent?: AccentColor): void {
  const root = document.documentElement;
  const {colors} = theme;
  const accentPrimary = accent?.primary || colors.accentPrimary;
  const accentSecondary = accent?.secondary || colors.accentSecondary;

  root.style.setProperty("--theme-bg-primary", colors.bgPrimary);
  root.style.setProperty("--theme-bg-secondary", colors.bgSecondary);
  root.style.setProperty("--theme-bg-panel", colors.bgPanel);
  root.style.setProperty("--theme-text-primary", colors.textPrimary);
  root.style.setProperty("--theme-text-secondary", colors.textSecondary);
  root.style.setProperty("--theme-accent-primary", accentPrimary);
  root.style.setProperty("--theme-accent-secondary", accentSecondary);
  root.style.setProperty("--theme-border", colors.border);
  root.style.setProperty("--theme-glow", colors.glow);

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
