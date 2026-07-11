/**
 * Solar index conversion utilities
 * Implements ITU standard conversions between geomagnetic indices
 */

/**
 * ITU standard Kp to Ap conversion table
 * The Kp-to-Ap relationship is nonlinear and follows established standards
 * Kp values are in thirds (0, 0.33, 0.67, 1, 1.33, etc.)
 * Ap values are the corresponding planetary A-index values
 *
 * Source: ITU-R P.533-14, NOAA/SWPC documentation
 */
const KP_TO_AP: Record<number, number> = {
  0: 0,
  0.33: 2,
  0.67: 3,
  1: 4,
  1.33: 5,
  1.67: 6,
  2: 7,
  2.33: 9,
  2.67: 12,
  3: 15,
  3.33: 18,
  3.67: 22,
  4: 27,
  4.33: 32,
  4.67: 39,
  5: 48,
  5.33: 56,
  5.67: 67,
  6: 80,
  6.33: 94,
  6.67: 111,
  7: 132,
  7.33: 154,
  7.67: 179,
  8: 207,
  8.33: 236,
  8.67: 300,
  9: 400,
};

/**
 * Get all valid Kp values from the conversion table, sorted ascending
 */
const SORTED_KP_VALUES = Object.keys(KP_TO_AP)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * Converts a single Kp index value to its Ap equivalent using the ITU standard lookup table.
 *
 * IMPORTANT: This returns the Ap equivalent for a single Kp reading, NOT the true A-index.
 * The true daily A-index is calculated as the average of eight 3-hourly Ap values.
 * This function is useful for understanding the instantaneous geomagnetic condition.
 *
 * The Kp-to-Ap relationship is nonlinear (quasi-logarithmic to linear conversion):
 * - Low Kp values (0-2) map to small Ap differences
 * - High Kp values (7-9) map to large Ap differences
 *
 * For values between standard Kp increments (0, 0.33, 0.67, 1, etc.),
 * linear interpolation is used between the nearest table entries.
 *
 * @param kp - The planetary K-index (0-9, supports decimal values)
 * @returns The equivalent Ap value (rounded to nearest integer)
 *
 * @example
 * kpToAp(3)    // returns 15 (exact table match)
 * kpToAp(5)    // returns 48 (exact table match)
 * kpToAp(3.5)  // returns ~20 (interpolated between 18 and 22)
 * kpToAp(7.5)  // returns ~166 (interpolated between 154 and 179)
 */
export function kpToAp(kp: number): number {
  // Clamp Kp to valid range
  const clampedKp = Math.max(0, Math.min(9, kp));

  // Check for exact match in table
  if (KP_TO_AP[clampedKp] !== undefined) {
    return KP_TO_AP[clampedKp];
  }

  // Find the two closest Kp values for interpolation
  let lowerKp = 0;
  let upperKp = 9;

  for (const tableKp of SORTED_KP_VALUES) {
    if (tableKp <= clampedKp) {
      lowerKp = tableKp;
    }
    if (tableKp >= clampedKp) {
      upperKp = tableKp;
      break;
    }
  }

  // If we found exact bounds (shouldn't happen due to earlier check, but safety)
  if (lowerKp === upperKp) {
    return KP_TO_AP[lowerKp];
  }

  // Linear interpolation between the two closest table values
  const lowerAp = KP_TO_AP[lowerKp];
  const upperAp = KP_TO_AP[upperKp];
  const fraction = (clampedKp - lowerKp) / (upperKp - lowerKp);
  const interpolatedAp = lowerAp + fraction * (upperAp - lowerAp);

  return Math.round(interpolatedAp);
}

/**
 * Convert Ap index back to approximate Kp index
 * Uses inverse lookup with interpolation for values between table entries
 *
 * @param ap - The Ap index value
 * @returns The approximate Kp index value (0-9 scale)
 */
export function apToKp(ap: number): number {
  // Clamp Ap to valid range
  const clampedAp = Math.max(0, Math.min(400, ap));

  // Find the two closest Ap values for inverse interpolation
  let lowerKp = 0;
  let upperKp = 0;

  for (let i = 0; i < SORTED_KP_VALUES.length; i++) {
    const kp = SORTED_KP_VALUES[i];
    const tableAp = KP_TO_AP[kp];

    if (tableAp === clampedAp) {
      return kp;
    }

    if (tableAp < clampedAp) {
      lowerKp = kp;
    }

    if (tableAp > clampedAp) {
      upperKp = kp;
      break;
    }
  }

  // Handle edge case where Ap is above max table value
  if (upperKp === 0 && lowerKp > 0) {
    return 9;
  }

  // Linear interpolation
  const lowerAp = KP_TO_AP[lowerKp];
  const upperAp = KP_TO_AP[upperKp];
  const fraction = (clampedAp - lowerAp) / (upperAp - lowerAp);

  return lowerKp + fraction * (upperKp - lowerKp);
}

/**
 * Get a human-readable description of geomagnetic conditions based on Kp
 *
 * @param kp - The Kp index value (0-9 scale)
 * @returns Description of geomagnetic conditions
 */
export function getGeomagneticCondition(kp: number): string {
  if (kp < 2) return "Quiet";
  if (kp < 4) return "Unsettled";
  if (kp < 5) return "Active";
  if (kp < 6) return "Minor Storm (G1)";
  if (kp < 7) return "Moderate Storm (G2)";
  if (kp < 8) return "Strong Storm (G3)";
  if (kp < 9) return "Severe Storm (G4)";
  return "Extreme Storm (G5)";
}

/**
 * Geomagnetic storm severity levels based on NOAA G-scale
 */
export type StormSeverity =
  | "none"
  | "minor"
  | "moderate"
  | "strong"
  | "severe"
  | "extreme";

/**
 * Determines geomagnetic storm severity from Kp index
 * Based on NOAA Space Weather Scales for Geomagnetic Storms
 *
 * @param kp - The Kp index value (0-9 scale)
 * @returns Storm severity level
 */
export function getStormSeverity(kp: number): StormSeverity {
  if (kp < 5) return "none";
  if (kp < 6) return "minor"; // G1
  if (kp < 7) return "moderate"; // G2
  if (kp < 8) return "strong"; // G3
  if (kp < 9) return "severe"; // G4
  return "extreme"; // G5
}
