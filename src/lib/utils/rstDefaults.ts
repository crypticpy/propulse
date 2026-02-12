/**
 * RST (Readability-Signal-Tone) default values by mode
 *
 * Each operating mode has a conventional "perfect" RST value.
 * - Phone (SSB/AM/FM): RS only, 2 digits (max "59")
 * - CW/RTTY: RST, 3 digits (max "599")
 * - Digital (FT8/FT4/etc.): Signal report in dB (e.g., "-10")
 */

/** Mode categories for RST classification */
type RSTCategory = "phone" | "cw" | "digital";

/** Map of operating mode to its RST category */
const MODE_CATEGORY: Record<string, RSTCategory> = {
  // Phone modes
  SSB: "phone",
  USB: "phone",
  LSB: "phone",
  AM: "phone",
  FM: "phone",
  NFM: "phone",
  WFM: "phone",
  DSB: "phone",

  // CW / Tone modes
  CW: "cw",
  RTTY: "cw",

  // Digital modes
  FT8: "digital",
  FT4: "digital",
  JS8: "digital",
  JT65: "digital",
  JT9: "digital",
  PSK31: "digital",
  PSK63: "digital",
  OLIVIA: "digital",
  MFSK: "digital",
  WSPR: "digital",
  MSK144: "digital",
  Q65: "digital",
  FST4: "digital",
  FST4W: "digital",
  FREEDV: "digital",
  SSTV: "digital",
  C4FM: "digital",
  "D-STAR": "digital",
  DMR: "digital",
  VARA: "digital",
  WINLINK: "digital",
};

/** Default RST values per category */
const RST_DEFAULTS: Record<RSTCategory, string> = {
  phone: "59",
  cw: "599",
  digital: "-10",
};

/**
 * Get the default RST value for a given mode.
 *
 * @param mode - Operating mode (e.g., "SSB", "CW", "FT8")
 * @returns Default RST string (e.g., "59", "599", "-10")
 *
 * @example
 * ```ts
 * getRSTDefault("SSB")   // "59"
 * getRSTDefault("CW")    // "599"
 * getRSTDefault("FT8")   // "-10"
 * getRSTDefault("RTTY")  // "599"
 * getRSTDefault("")       // "59" (fallback to phone)
 * ```
 */
export function getRSTDefault(mode: string): string {
  const normalized = mode.toUpperCase().trim();
  const category = MODE_CATEGORY[normalized] ?? "phone";
  return RST_DEFAULTS[category];
}

/**
 * Check if a mode uses numeric signal reports (dB) instead of RST.
 *
 * @param mode - Operating mode
 * @returns true for digital modes that report signal in dB
 */
export function isDigitalSignalReport(mode: string): boolean {
  const normalized = mode.toUpperCase().trim();
  return MODE_CATEGORY[normalized] === "digital";
}

/**
 * Get the RST category for a mode.
 *
 * @param mode - Operating mode
 * @returns "phone", "cw", or "digital"
 */
export function getRSTCategory(mode: string): RSTCategory {
  const normalized = mode.toUpperCase().trim();
  return MODE_CATEGORY[normalized] ?? "phone";
}
