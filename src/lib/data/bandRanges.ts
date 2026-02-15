/**
 * Band Ranges for Band Map Rendering
 *
 * Provides frequency range data (in kHz) for all HF amateur bands
 * from 160m through 6m. Used by the BandMap widget to position
 * spots along the frequency axis.
 */

// ── Band Range Definition ───────────────────────────────────────────────────

export interface BandRange {
  /** Start of band in kHz */
  startKHz: number;
  /** End of band in kHz */
  endKHz: number;
  /** Display label (e.g., "20m") */
  label: string;
}

/**
 * HF amateur band frequency ranges (kHz).
 * Covers 160m through 6m using the widest ITU allocations.
 */
export const BAND_RANGES: Record<string, BandRange> = {
  "160m": { startKHz: 1800, endKHz: 2000, label: "160m" },
  "80m": { startKHz: 3500, endKHz: 4000, label: "80m" },
  "60m": { startKHz: 5330, endKHz: 5405, label: "60m" },
  "40m": { startKHz: 7000, endKHz: 7300, label: "40m" },
  "30m": { startKHz: 10100, endKHz: 10150, label: "30m" },
  "20m": { startKHz: 14000, endKHz: 14350, label: "20m" },
  "17m": { startKHz: 18068, endKHz: 18168, label: "17m" },
  "15m": { startKHz: 21000, endKHz: 21450, label: "15m" },
  "12m": { startKHz: 24890, endKHz: 24990, label: "12m" },
  "10m": { startKHz: 28000, endKHz: 29700, label: "10m" },
  "6m": { startKHz: 50000, endKHz: 54000, label: "6m" },
};

/** Ordered band keys from lowest to highest frequency */
export const BAND_ORDER = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
] as const;

/**
 * Get a 0-1 normalized position for a frequency within a band.
 *
 * @param freqKHz - Frequency in kHz
 * @param band - Band designator (e.g., "20m")
 * @returns 0-1 normalized position, clamped to [0, 1]
 */
export function getFrequencyPosition(freqKHz: number, band: string): number {
  const range = BAND_RANGES[band];
  if (!range) return 0;

  const span = range.endKHz - range.startKHz;
  if (span <= 0) return 0;

  const position = (freqKHz - range.startKHz) / span;
  return Math.max(0, Math.min(1, position));
}

/**
 * Determine which band a frequency falls within.
 *
 * @param freqKHz - Frequency in kHz
 * @returns Band designator (e.g., "20m") or null if outside all bands
 */
export function getBandForFrequency(freqKHz: number): string | null {
  for (const [band, range] of Object.entries(BAND_RANGES)) {
    if (freqKHz >= range.startKHz && freqKHz <= range.endKHz) {
      return band;
    }
  }
  return null;
}
