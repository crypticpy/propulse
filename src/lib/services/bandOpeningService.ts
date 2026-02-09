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
