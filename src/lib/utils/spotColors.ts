// ==========================================================================
// Spot Color Utilities
// Consolidated module for all spot color logic (mode-based and band-based).
// Replaces inline definitions previously scattered across multiple components.
// ==========================================================================

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Determines whether spots are colored by operating mode or by band. */
export type SpotColorMode = "mode" | "band";

// --------------------------------------------------------------------------
// Mode Colors
// --------------------------------------------------------------------------

/**
 * Hex color map keyed by canonical operating mode.
 *
 * Used for canvas / SVG rendering where raw hex values are needed.
 */
export const MODE_COLORS: Record<string, string> = {
  FT8: "#44DDFF", // Cosmic cyan
  FT4: "#44DDFF", // Cosmic cyan
  CW: "#FFD23F", // Caution amber
  SSB: "#00FF88", // Signal green
  RTTY: "#AA44FF", // Aurora purple
  DIGI: "#44DDFF", // Cosmic cyan (generic digital)
  DATA: "#44DDFF", // Cosmic cyan (generic data)
  default: "#888888", // Gray fallback
};

/**
 * Tailwind utility class map keyed by canonical operating mode.
 *
 * Used in React components that rely on Tailwind classes instead of raw hex.
 */
export const MODE_COLORS_TAILWIND: Record<string, string> = {
  FT8: "text-cyan-400",
  CW: "text-yellow-400",
  SSB: "text-green-400",
  RTTY: "text-purple-400",
  default: "text-gray-400",
};

/**
 * Return the hex color associated with an operating mode.
 *
 * Performs an exact lookup first, then falls back to partial / substring
 * matching so common variations (e.g. "USB", "LSB", "PSK31") resolve to
 * their parent mode color.
 *
 * @param mode - The operating mode string (case-insensitive). May be
 *   `undefined`, in which case the default gray is returned.
 * @returns A CSS hex color string.
 */
export function getModeColor(mode: string | undefined): string {
  if (!mode) {
    return MODE_COLORS.default;
  }

  const upperMode = mode.toUpperCase();

  // Direct match
  if (MODE_COLORS[upperMode]) {
    return MODE_COLORS[upperMode];
  }

  // Partial matches for common mode variations
  if (upperMode.includes("FT8") || upperMode.includes("FT4")) {
    return MODE_COLORS.FT8;
  }
  if (upperMode.includes("CW")) {
    return MODE_COLORS.CW;
  }
  if (
    upperMode.includes("SSB") ||
    upperMode.includes("USB") ||
    upperMode.includes("LSB")
  ) {
    return MODE_COLORS.SSB;
  }
  if (upperMode.includes("RTTY") || upperMode.includes("PSK")) {
    return MODE_COLORS.RTTY;
  }
  if (upperMode.includes("DIGI") || upperMode.includes("DATA")) {
    return MODE_COLORS.DIGI;
  }

  return MODE_COLORS.default;
}

/**
 * Return the Tailwind utility class associated with an operating mode.
 *
 * Uses the same partial-matching strategy as {@link getModeColor} but
 * returns a Tailwind `text-*` class instead of a hex value.
 *
 * @param mode - The operating mode string (case-insensitive). May be
 *   `undefined`, in which case the default gray class is returned.
 * @returns A Tailwind CSS class string (e.g. `"text-cyan-400"`).
 */
export function getModeTailwindColor(mode: string | undefined): string {
  if (!mode) {
    return MODE_COLORS_TAILWIND.default;
  }

  const upperMode = mode.toUpperCase();

  // Direct match
  if (MODE_COLORS_TAILWIND[upperMode]) {
    return MODE_COLORS_TAILWIND[upperMode];
  }

  // Partial matches
  if (upperMode.includes("FT8") || upperMode.includes("FT4")) {
    return MODE_COLORS_TAILWIND.FT8;
  }
  if (upperMode.includes("CW")) {
    return MODE_COLORS_TAILWIND.CW;
  }
  if (
    upperMode.includes("SSB") ||
    upperMode.includes("USB") ||
    upperMode.includes("LSB")
  ) {
    return MODE_COLORS_TAILWIND.SSB;
  }
  if (upperMode.includes("RTTY") || upperMode.includes("PSK")) {
    return MODE_COLORS_TAILWIND.RTTY;
  }

  return MODE_COLORS_TAILWIND.default;
}

// --------------------------------------------------------------------------
// Band Colors (OpenHamClock rainbow spectrum palette)
// --------------------------------------------------------------------------

/**
 * Hex color map keyed by amateur radio band designation.
 *
 * Follows the OpenHamClock rainbow spectrum convention where lower bands
 * are warm (red/orange) and higher bands progress through the spectrum
 * toward violet.
 */
export const BAND_COLORS: Record<string, string> = {
  "160m": "#ff6666",
  "80m": "#ff9966",
  "60m": "#e8963c",
  "40m": "#ffcc66",
  "30m": "#99ff66",
  "20m": "#66ff99",
  "17m": "#66ffcc",
  "15m": "#66ccff",
  "12m": "#6699ff",
  "10m": "#9966ff",
  "6m": "#ff66ff",
  "2m": "#ff6699",
  default: "#4488ff",
};

/**
 * Frequency-to-band mapping table.
 *
 * Each entry defines the lower and upper bounds (in kHz, inclusive) and the
 * corresponding band designation string.
 *
 * Sorted from lowest to highest frequency for clarity; lookup order does
 * not affect correctness since ranges are non-overlapping.
 */
const FREQ_BAND_RANGES: ReadonlyArray<
  Readonly<{ min: number; max: number; band: string }>
> = [
  { min: 1800, max: 2000, band: "160m" },
  { min: 3500, max: 4000, band: "80m" },
  { min: 5300, max: 5400, band: "60m" },
  { min: 7000, max: 7300, band: "40m" },
  { min: 10100, max: 10150, band: "30m" },
  { min: 14000, max: 14350, band: "20m" },
  { min: 18068, max: 18168, band: "17m" },
  { min: 21000, max: 21450, band: "15m" },
  { min: 24890, max: 24990, band: "12m" },
  { min: 28000, max: 29700, band: "10m" },
  { min: 50000, max: 54000, band: "6m" },
  { min: 144000, max: 148000, band: "2m" },
];

/**
 * Derive the amateur radio band name from a frequency in kHz.
 *
 * @param freq - Frequency in kHz (e.g. `14074` for 20 m FT8).
 * @returns The band designation (e.g. `"20m"`) or `"unknown"` if the
 *   frequency does not fall within a recognized amateur allocation.
 */
export function getBandFromFrequency(freq: number): string {
  for (const range of FREQ_BAND_RANGES) {
    if (freq >= range.min && freq <= range.max) {
      return range.band;
    }
  }
  return "unknown";
}

/**
 * Return the hex color associated with an amateur radio band.
 *
 * Accepts either a band designation string (e.g. `"20m"`) or a frequency
 * in kHz. When a frequency is provided it is first resolved to a band via
 * {@link getBandFromFrequency}.
 *
 * @param bandOrFreq - A band string like `"20m"` or a numeric frequency
 *   in kHz.
 * @returns A CSS hex color string.
 */
export function getBandColor(bandOrFreq: string | number): string {
  if (typeof bandOrFreq === "number") {
    const band = getBandFromFrequency(bandOrFreq);
    return BAND_COLORS[band] ?? BAND_COLORS.default;
  }

  // String input — normalize to lowercase for consistent lookup
  const normalized = bandOrFreq.toLowerCase();
  return BAND_COLORS[normalized] ?? BAND_COLORS.default;
}

// --------------------------------------------------------------------------
// Unified Entry Point
// --------------------------------------------------------------------------

/**
 * Single entry point for determining a spot's display color.
 *
 * Delegates to either mode-based or band-based coloring depending on the
 * active {@link SpotColorMode}.
 *
 * @param spot - A minimal spot descriptor carrying optional mode,
 *   frequency (kHz), and/or band fields.
 * @param colorMode - The active coloring strategy (`"mode"` or `"band"`).
 * @returns A CSS hex color string.
 */
export function getSpotColor(
  spot: { mode?: string; frequency?: number; band?: string },
  colorMode: SpotColorMode,
): string {
  if (colorMode === "mode") {
    return getModeColor(spot.mode);
  }

  // Band-based coloring: prefer explicit band, fall back to frequency
  if (spot.band) {
    return getBandColor(spot.band);
  }
  if (spot.frequency != null) {
    return getBandColor(spot.frequency);
  }

  return BAND_COLORS.default;
}
