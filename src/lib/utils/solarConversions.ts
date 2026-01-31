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
 * Convert Kp index to Ap index using the ITU standard conversion table
 * For values between table entries, linear interpolation is used
 *
 * @param kp - The Kp index value (0-9 scale)
 * @returns The corresponding Ap index value
 *
 * @example
 * kpToAp(3)    // returns 15
 * kpToAp(5)    // returns 48
 * kpToAp(3.5)  // returns ~20 (interpolated between 18 and 22)
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
