/**
 * Contest Sub-Band Frequency Ranges
 *
 * Defines the conventional frequency segments where contest activity
 * concentrates on each HF band. These ranges are based on standard
 * contest operating conventions and ITU Region allocations.
 *
 * Used by:
 * - BandMapContestMarker: renders shaded overlays on the band map
 * - spotContestClassifier: classifies spots as contest-related based on frequency
 *
 * @module lib/data/contestSubBands
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubBandRange {
  /** Start frequency in kHz */
  startKHz: number;
  /** End frequency in kHz */
  endKHz: number;
  /** Mode type for this sub-band */
  type: "cw" | "ssb" | "digital";
  /** Display label, e.g. "CW Contest" */
  label: string;
}

// ── Contest Sub-Band Data ────────────────────────────────────────────────────

/**
 * Standard contest sub-band ranges per amateur band.
 *
 * These represent the frequency segments where contest stations typically
 * concentrate. Based on ITU Region 2 (Americas) conventions with Region 1
 * (Europe/Africa) SSB segments noted where they differ.
 */
export const CONTEST_SUB_BANDS: Record<string, SubBandRange[]> = {
  "160m": [
    { startKHz: 1800, endKHz: 1850, type: "cw", label: "CW Contest" },
    { startKHz: 1850, endKHz: 2000, type: "ssb", label: "SSB Contest" },
  ],
  "80m": [
    { startKHz: 3500, endKHz: 3600, type: "cw", label: "CW Contest" },
    // Region 2 SSB: 3600-3800, Region 1: 3700-3800
    { startKHz: 3600, endKHz: 3800, type: "ssb", label: "SSB Contest" },
  ],
  "40m": [
    { startKHz: 7000, endKHz: 7050, type: "cw", label: "CW Contest" },
    // Region 2 SSB: 7050-7200, Region 1: 7100-7200
    { startKHz: 7050, endKHz: 7200, type: "ssb", label: "SSB Contest" },
  ],
  "20m": [
    { startKHz: 14000, endKHz: 14070, type: "cw", label: "CW Contest" },
    { startKHz: 14100, endKHz: 14350, type: "ssb", label: "SSB Contest" },
  ],
  "15m": [
    { startKHz: 21000, endKHz: 21070, type: "cw", label: "CW Contest" },
    { startKHz: 21150, endKHz: 21450, type: "ssb", label: "SSB Contest" },
  ],
  "10m": [
    { startKHz: 28000, endKHz: 28070, type: "cw", label: "CW Contest" },
    { startKHz: 28300, endKHz: 28600, type: "ssb", label: "SSB Contest" },
  ],
};

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get all contest sub-band ranges for a given band.
 *
 * @param band - Band designator (e.g. "20m")
 * @returns Array of sub-band ranges, or empty array if band has no contest sub-bands
 */
export function getSubBandsForBand(band: string): SubBandRange[] {
  return CONTEST_SUB_BANDS[band] ?? [];
}

/**
 * Check whether a frequency falls within a known contest sub-band.
 *
 * @param frequencyKHz - Frequency in kHz
 * @param band - Band designator (e.g. "20m")
 * @returns Object indicating whether the frequency is in a contest sub-band
 */
export function isInContestSubBand(
  frequencyKHz: number,
  band: string,
): { inSubBand: boolean; type?: "cw" | "ssb" | "digital" } {
  const subBands = CONTEST_SUB_BANDS[band];
  if (!subBands) return { inSubBand: false };

  for (const sb of subBands) {
    if (frequencyKHz >= sb.startKHz && frequencyKHz <= sb.endKHz) {
      return { inSubBand: true, type: sb.type };
    }
  }

  return { inSubBand: false };
}
