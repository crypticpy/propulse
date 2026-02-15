/**
 * Band Opening Service — singleton wrapper for BandOpeningDetector
 *
 * Provides a single shared instance of BandOpeningDetector that can be used
 * by both the BandConditionsPanel (for display) and useSolarAlerts (for alerts).
 * The detector accumulates spot data across all consumers.
 */

import { BandOpeningDetector } from "./bandOpeningDetector";

let detector: BandOpeningDetector | null = null;

/**
 * Get the shared BandOpeningDetector singleton.
 * Creates the instance on first call. The detector persists for the app lifetime.
 */
export function getBandOpeningDetector(): BandOpeningDetector {
  if (!detector) {
    detector = new BandOpeningDetector();
  }
  return detector;
}

/**
 * Adjust the band opening detector's sensitivity for contest conditions.
 *
 * During active contests with high spot density, the detector should be more
 * sensitive (lower threshold) to detect band openings faster.
 *
 * @param multiplier - Sensitivity multiplier. 1.0 = normal, 1.5-2.0 = contest mode.
 *   Higher values lower the spot threshold for declaring a band opening.
 *   Clamped internally to 0.5-5.0.
 */
export function setContestSensitivity(multiplier: number): void {
  const det = getBandOpeningDetector();
  det.sensitivity = multiplier;
}
