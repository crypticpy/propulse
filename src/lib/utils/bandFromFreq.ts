/**
 * Band-from-frequency utility
 *
 * Maps a frequency in kHz to its amateur radio band name.
 * Uses ITU Region 1/2/3 band edges for accurate identification.
 */

/** Band definition with frequency range in kHz */
interface BandRange {
  name: string;
  min: number;
  max: number;
}

/**
 * Amateur radio HF/VHF/UHF band ranges in kHz.
 * Covers all major allocations (ITU Regions 1, 2, 3 combined).
 */
const BAND_RANGES: BandRange[] = [
  { name: "2200m", min: 135.7, max: 137.8 },
  { name: "630m", min: 472, max: 479 },
  { name: "160m", min: 1800, max: 2000 },
  { name: "80m", min: 3500, max: 4000 },
  { name: "60m", min: 5330, max: 5410 },
  { name: "40m", min: 7000, max: 7300 },
  { name: "30m", min: 10100, max: 10150 },
  { name: "20m", min: 14000, max: 14350 },
  { name: "17m", min: 18068, max: 18168 },
  { name: "15m", min: 21000, max: 21450 },
  { name: "12m", min: 24890, max: 24990 },
  { name: "10m", min: 28000, max: 29700 },
  { name: "6m", min: 50000, max: 54000 },
  { name: "2m", min: 144000, max: 148000 },
  { name: "70cm", min: 420000, max: 450000 },
  { name: "23cm", min: 1240000, max: 1300000 },
];

/**
 * Get amateur band name from a frequency in kHz.
 *
 * @param freqKHz - Frequency in kHz
 * @returns Band name (e.g., "20m") or null if outside any band
 *
 * @example
 * ```ts
 * bandFromFreq(14074)  // "20m"
 * bandFromFreq(7074)   // "40m"
 * bandFromFreq(50313)  // "6m"
 * bandFromFreq(12345)  // null (not in a ham band)
 * ```
 */
export function bandFromFreq(freqKHz: number): string | null {
  for (const band of BAND_RANGES) {
    if (freqKHz >= band.min && freqKHz <= band.max) {
      return band.name;
    }
  }
  return null;
}

/**
 * Get amateur band name from a frequency in MHz.
 *
 * @param freqMHz - Frequency in MHz
 * @returns Band name (e.g., "20m") or null if outside any band
 *
 * @example
 * ```ts
 * bandFromFreqMHz(14.074)  // "20m"
 * bandFromFreqMHz(144.2)   // "2m"
 * ```
 */
export function bandFromFreqMHz(freqMHz: number): string | null {
  return bandFromFreq(freqMHz * 1000);
}
