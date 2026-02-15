/**
 * Mode normalization utility
 *
 * Maps raw rig mode strings (e.g., "USB", "LSB", "CW-R", "PSK31")
 * to simplified UI categories for display and filtering.
 */

/** Simplified mode categories for UI display */
export type UIMode =
  | "SSB"
  | "CW"
  | "FT8"
  | "FT4"
  | "RTTY"
  | "AM"
  | "FM"
  | "DATA";

/** All UI modes in conventional display order */
export const ALL_UI_MODES: readonly UIMode[] = [
  "SSB",
  "CW",
  "FT8",
  "FT4",
  "RTTY",
  "AM",
  "FM",
  "DATA",
] as const;

/** Raw rig mode → simplified UI mode mapping */
const MODE_MAP: Record<string, UIMode> = {
  // SSB
  USB: "SSB",
  LSB: "SSB",
  SSB: "SSB",

  // CW
  CW: "CW",
  "CW-R": "CW",

  // Weak-signal digital
  FT8: "FT8",
  FT4: "FT4",

  // RTTY
  RTTY: "RTTY",
  "RTTY-R": "RTTY",

  // Analog voice
  AM: "AM",
  FM: "FM",

  // Catch-all digital / data modes
  DATA: "DATA",
  "DATA-R": "DATA",
  PSK: "DATA",
  PSK31: "DATA",
  PSK63: "DATA",
  OLIVIA: "DATA",
  JT65: "DATA",
  JT9: "DATA",
  MFSK: "DATA",
  SSTV: "DATA",
};

/**
 * Normalize a raw rig mode string to a simplified UI category.
 *
 * @param raw - Raw mode string from rig or ADIF (e.g., "USB", "CW-R", "PSK31")
 * @returns Simplified UIMode (e.g., "SSB", "CW", "DATA")
 *
 * @example
 * ```ts
 * normalizeMode("USB")    // "SSB"
 * normalizeMode("CW-R")   // "CW"
 * normalizeMode("PSK31")  // "DATA"
 * normalizeMode("ft8")    // "FT8"
 * normalizeMode("XYZ")    // "DATA" (unknown modes fall back to DATA)
 * ```
 */
export function normalizeMode(raw: string): UIMode {
  const key = raw.toUpperCase().trim();
  return MODE_MAP[key] ?? "DATA";
}
