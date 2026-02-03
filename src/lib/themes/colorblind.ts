/**
 * Color-Blind Friendly Mode
 *
 * Alternative color schemes for users with color vision deficiencies.
 * Supports Deuteranopia (red-green, most common), Protanopia (red),
 * and Tritanopia (blue-yellow) color blindness.
 *
 * Colors are chosen based on scientifically validated color-blind safe palettes
 * that maintain sufficient contrast and distinguishability.
 */

/**
 * Color blind mode type
 * - none: Standard colors (default)
 * - deuteranopia: Red-green color blindness (most common ~8% of males)
 * - protanopia: Red color blindness (~1% of males)
 * - tritanopia: Blue-yellow color blindness (rare, ~0.01%)
 */
export type ColorBlindMode =
  | "none"
  | "deuteranopia"
  | "protanopia"
  | "tritanopia";

/**
 * Color-blind safe palette definition
 * Includes both colors and icons for redundant status indication
 */
export interface ColorBlindPalette {
  /** Good/Excellent status color (replacing green) */
  good: string;
  /** Fair/Moderate status color (replacing yellow/amber) */
  fair: string;
  /** Poor/Bad status color (replacing red) */
  poor: string;
  /** Closed/Inactive status color (gray) */
  closed: string;

  /** Icon for good status - checkmark */
  goodIcon: string;
  /** Icon for fair status - tilde/wave */
  fairIcon: string;
  /** Icon for poor status - cross/x */
  poorIcon: string;
  /** Icon for closed status - empty circle */
  closedIcon: string;

  /** Background opacity variants for status badges */
  goodBg: string;
  fairBg: string;
  poorBg: string;
  closedBg: string;
}

/**
 * Standard colors (for reference and non-colorblind mode)
 */
export const STANDARD_COLORS = {
  good: "#22c55e", // signal-green
  fair: "#f59e0b", // caution-amber
  poor: "#ef4444", // alert-red
  closed: "#6b7280", // gray-500
};

/**
 * Deuteranopia-safe palette (Red-Green color blindness, most common)
 * Uses blue for good (instead of green) and vermillion for poor (instead of red)
 * Based on the IBM Color Blind Safe Palette and Wong's color palette
 */
export const DEUTERANOPIA_PALETTE: ColorBlindPalette = {
  good: "#0077BB", // Blue (replaces green)
  fair: "#EE7733", // Orange (distinct from both)
  poor: "#CC3311", // Vermillion (replaces red, distinct hue)
  closed: "#666666", // Gray

  goodIcon: "\u2713", // Checkmark
  fairIcon: "\u2248", // Approximately equal (wavy)
  poorIcon: "\u2717", // Cross/X
  closedIcon: "\u25CB", // Empty circle

  goodBg: "rgba(0, 119, 187, 0.15)",
  fairBg: "rgba(238, 119, 51, 0.15)",
  poorBg: "rgba(204, 51, 17, 0.15)",
  closedBg: "rgba(102, 102, 102, 0.15)",
};

/**
 * Protanopia-safe palette (Red color blindness)
 * Uses teal for good and vermillion with different saturation for poor
 * Avoids relying on red-green distinction
 */
export const PROTANOPIA_PALETTE: ColorBlindPalette = {
  good: "#009988", // Teal (replaces green)
  fair: "#EE7733", // Orange
  poor: "#AA4499", // Purple (replaces red - more visible)
  closed: "#666666", // Gray

  goodIcon: "\u2713", // Checkmark
  fairIcon: "\u2248", // Approximately equal
  poorIcon: "\u2717", // Cross/X
  closedIcon: "\u25CB", // Empty circle

  goodBg: "rgba(0, 153, 136, 0.15)",
  fairBg: "rgba(238, 119, 51, 0.15)",
  poorBg: "rgba(170, 68, 153, 0.15)",
  closedBg: "rgba(102, 102, 102, 0.15)",
};

/**
 * Tritanopia-safe palette (Blue-Yellow color blindness)
 * Avoids blue-yellow distinctions, uses cyan-ish and rose tones
 */
export const TRITANOPIA_PALETTE: ColorBlindPalette = {
  good: "#44AA99", // Cyan-ish teal
  fair: "#DDCC77", // Sand/tan
  poor: "#CC6677", // Rose/pink
  closed: "#888888", // Gray

  goodIcon: "\u2713", // Checkmark
  fairIcon: "\u2248", // Approximately equal
  poorIcon: "\u2717", // Cross/X
  closedIcon: "\u25CB", // Empty circle

  goodBg: "rgba(68, 170, 153, 0.15)",
  fairBg: "rgba(221, 204, 119, 0.15)",
  poorBg: "rgba(204, 102, 119, 0.15)",
  closedBg: "rgba(136, 136, 136, 0.15)",
};

/**
 * Map of color blind mode to palette
 * Returns null for 'none' mode (use standard colors)
 */
export const COLOR_BLIND_PALETTES: Record<
  ColorBlindMode,
  ColorBlindPalette | null
> = {
  none: null,
  deuteranopia: DEUTERANOPIA_PALETTE,
  protanopia: PROTANOPIA_PALETTE,
  tritanopia: TRITANOPIA_PALETTE,
};

/**
 * Status type for color lookups
 */
export type StatusType = "good" | "excellent" | "fair" | "poor" | "closed";

/**
 * Get the appropriate color for a status based on color blind mode
 *
 * @param mode - The color blind mode
 * @param status - The status type (good, excellent, fair, poor, closed)
 * @returns The hex color string
 */
export function getColorBlindColor(
  mode: ColorBlindMode,
  status: StatusType,
): string {
  // Normalize excellent to good
  const normalizedStatus = status === "excellent" ? "good" : status;

  const palette = COLOR_BLIND_PALETTES[mode];
  if (!palette) {
    // Return default colors
    return STANDARD_COLORS[normalizedStatus];
  }

  return palette[normalizedStatus];
}

/**
 * Get the background color for a status based on color blind mode
 *
 * @param mode - The color blind mode
 * @param status - The status type
 * @returns The background color string (with opacity)
 */
export function getColorBlindBgColor(
  mode: ColorBlindMode,
  status: StatusType,
): string {
  // Normalize excellent to good
  const normalizedStatus = status === "excellent" ? "good" : status;

  const palette = COLOR_BLIND_PALETTES[mode];
  if (!palette) {
    // Return default semi-transparent backgrounds
    const defaults: Record<string, string> = {
      good: "rgba(34, 197, 94, 0.15)",
      fair: "rgba(245, 158, 11, 0.15)",
      poor: "rgba(239, 68, 68, 0.15)",
      closed: "rgba(107, 114, 128, 0.15)",
    };
    return defaults[normalizedStatus];
  }

  const bgKey = `${normalizedStatus}Bg` as keyof ColorBlindPalette;
  return palette[bgKey] as string;
}

/**
 * Get the status icon for a status based on color blind mode
 * Returns null if not in color blind mode
 *
 * @param mode - The color blind mode
 * @param status - The status type
 * @returns The icon character or null if no icon needed
 */
export function getStatusIcon(
  mode: ColorBlindMode,
  status: StatusType,
): string | null {
  if (mode === "none") return null;

  // Normalize excellent to good
  const normalizedStatus = status === "excellent" ? "good" : status;

  const palette = COLOR_BLIND_PALETTES[mode];
  if (!palette) return null;

  const iconKey = `${normalizedStatus}Icon` as keyof ColorBlindPalette;
  return palette[iconKey] as string;
}

/**
 * Get Tailwind CSS classes for status colors based on color blind mode
 * Returns inline styles when in color blind mode, CSS classes when not
 *
 * @param mode - The color blind mode
 * @param status - The status type
 * @returns Object with style and className properties
 */
export function getStatusColorStyles(
  mode: ColorBlindMode,
  status: StatusType,
): {
  textStyle?: React.CSSProperties;
  bgStyle?: React.CSSProperties;
  textClass: string;
  bgClass: string;
} {
  // Normalize excellent to good
  const normalizedStatus = status === "excellent" ? "good" : status;

  if (mode === "none") {
    // Use standard Tailwind classes
    const textClasses: Record<string, string> = {
      good: "text-signal-green",
      fair: "text-caution-amber",
      poor: "text-alert-red",
      closed: "text-gray-500",
    };

    const bgClasses: Record<string, string> = {
      good: "bg-signal-green/15",
      fair: "bg-caution-amber/15",
      poor: "bg-alert-red/15",
      closed: "bg-gray-500/15",
    };

    return {
      textClass: textClasses[normalizedStatus],
      bgClass: bgClasses[normalizedStatus],
    };
  }

  // Use inline styles for color blind palettes
  const color = getColorBlindColor(mode, normalizedStatus);
  const bgColor = getColorBlindBgColor(mode, normalizedStatus);

  return {
    textStyle: { color },
    bgStyle: { backgroundColor: bgColor },
    textClass: "",
    bgClass: "",
  };
}

/**
 * Display names for color blind modes (for UI)
 */
export const COLOR_BLIND_MODE_NAMES: Record<ColorBlindMode, string> = {
  none: "Standard",
  deuteranopia: "Deuteranopia (Red-Green)",
  protanopia: "Protanopia (Red)",
  tritanopia: "Tritanopia (Blue-Yellow)",
};

/**
 * Descriptions for color blind modes (for UI help text)
 */
export const COLOR_BLIND_MODE_DESCRIPTIONS: Record<ColorBlindMode, string> = {
  none: "Standard color scheme",
  deuteranopia:
    "Optimized for red-green color blindness, the most common type (~8% of males)",
  protanopia: "Optimized for red color blindness (~1% of males)",
  tritanopia: "Optimized for blue-yellow color blindness (rare, ~0.01%)",
};
