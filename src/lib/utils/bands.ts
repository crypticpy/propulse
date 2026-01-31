/**
 * Band condition calculation utilities
 * Calculates HF propagation estimates from solar indices
 */

import type {
  BandCondition,
  BandStatus,
  OverallCondition,
  VHFCondition,
} from "../../types/solar";

/**
 * Band configuration with frequency and propagation characteristics
 */
interface BandConfig {
  name: string;
  freq: string;
  /** Multiplier for daytime conditions (0-1) - higher = needs better indices */
  dayMultiplier: number;
  /** Multiplier for nighttime conditions (0-1) */
  nightMultiplier: number;
  /** Minimum SFI needed for band to open (0 = always possible) */
  minSfi: number;
  /** True if band is primarily a nighttime band */
  nightOnly: boolean;
  /** Best use case description */
  bestFor: string;
  /** True if this is a VHF band with different propagation rules */
  isVhf: boolean;
}

/**
 * Amateur HF/VHF band definitions
 */
const BANDS: BandConfig[] = [
  {
    name: "160m",
    freq: "1.8 MHz",
    dayMultiplier: 0.3,
    nightMultiplier: 0.8,
    minSfi: 0,
    nightOnly: true,
    bestFor: "Night DX, regional",
    isVhf: false,
  },
  {
    name: "80m",
    freq: "3.5 MHz",
    dayMultiplier: 0.4,
    nightMultiplier: 0.9,
    minSfi: 0,
    nightOnly: false,
    bestFor: "Night DX, regional nets",
    isVhf: false,
  },
  {
    name: "60m",
    freq: "5.3 MHz",
    dayMultiplier: 0.5,
    nightMultiplier: 0.85,
    minSfi: 0,
    nightOnly: false,
    bestFor: "NVIS, emergency",
    isVhf: false,
  },
  {
    name: "40m",
    freq: "7 MHz",
    dayMultiplier: 0.6,
    nightMultiplier: 0.9,
    minSfi: 0,
    nightOnly: false,
    bestFor: "All-day workhorse",
    isVhf: false,
  },
  {
    name: "30m",
    freq: "10 MHz",
    dayMultiplier: 0.7,
    nightMultiplier: 0.85,
    minSfi: 0,
    nightOnly: false,
    bestFor: "CW/digital, day/night",
    isVhf: false,
  },
  {
    name: "20m",
    freq: "14 MHz",
    dayMultiplier: 0.8,
    nightMultiplier: 0.7,
    minSfi: 70,
    nightOnly: false,
    bestFor: "Daytime DX",
    isVhf: false,
  },
  {
    name: "17m",
    freq: "18 MHz",
    dayMultiplier: 0.85,
    nightMultiplier: 0.6,
    minSfi: 80,
    nightOnly: false,
    bestFor: "Daytime DX",
    isVhf: false,
  },
  {
    name: "15m",
    freq: "21 MHz",
    dayMultiplier: 0.9,
    nightMultiplier: 0.5,
    minSfi: 90,
    nightOnly: false,
    bestFor: "Daytime DX, contests",
    isVhf: false,
  },
  {
    name: "12m",
    freq: "24 MHz",
    dayMultiplier: 0.95,
    nightMultiplier: 0.3,
    minSfi: 100,
    nightOnly: false,
    bestFor: "Solar max DX",
    isVhf: false,
  },
  {
    name: "10m",
    freq: "28 MHz",
    dayMultiplier: 1.0,
    nightMultiplier: 0.2,
    minSfi: 110,
    nightOnly: false,
    bestFor: "Solar max DX, local",
    isVhf: false,
  },
  {
    name: "6m",
    freq: "50 MHz",
    dayMultiplier: 1.0,
    nightMultiplier: 0.1,
    minSfi: 0,
    nightOnly: false,
    bestFor: "Sporadic E, tropo",
    isVhf: true,
  },
];

/**
 * Calculate propagation condition from solar indices
 * Score formula: (sfi / 200) * (1 - kp / 9) * multiplier
 *
 * @param kp - K-index (0-9, higher = more geomagnetic disturbance)
 * @param sfi - Solar Flux Index (70-300+, higher = better HF propagation)
 * @param multiplier - Band-specific adjustment factor
 * @returns Condition rating
 */
function getCondition(
  kp: number,
  sfi: number,
  multiplier: number,
): BandCondition {
  // Calculate base score: better with high SFI, worse with high Kp
  const baseScore = (sfi / 200) * (1 - kp / 9);
  const score = baseScore * multiplier;

  if (score > 0.6) return "Excellent";
  if (score > 0.45) return "Good";
  if (score > 0.3) return "Fair";
  return "Poor";
}

/**
 * Calculate VHF condition (6m band)
 * VHF propagation depends more on Sporadic E and aurora than solar flux
 *
 * @param kp - K-index
 * @returns VHF condition including possible Aurora mode
 */
function getVHFCondition(kp: number): VHFCondition {
  // High Kp can create aurora propagation opportunities
  if (kp >= 5) return "Aurora";
  if (kp >= 4) return "Fair";
  return "Poor";
}

/**
 * Calculate conditions for all amateur radio bands
 *
 * @param kp - Current K-index (0-9)
 * @param sfi - Current Solar Flux Index (typically 70-300)
 * @returns Array of band status objects with day/night conditions
 *
 * @example
 * ```ts
 * const bands = calculateBandConditions(3, 150);
 * // bands[5] = { name: '20m', freq: '14 MHz', dayCondition: 'Good', ... }
 * ```
 */
export function calculateBandConditions(kp: number, sfi: number): BandStatus[] {
  return BANDS.map((band) => {
    let dayCondition: BandCondition | VHFCondition;
    let nightCondition: BandCondition | VHFCondition;

    if (band.isVhf) {
      // VHF has different propagation rules
      dayCondition = getVHFCondition(kp);
      nightCondition = "Poor";
    } else if (band.nightOnly) {
      // 160m is essentially day-dead
      dayCondition = "Poor";
      nightCondition = getCondition(kp, sfi, band.nightMultiplier);
    } else {
      // Check if band can open based on SFI threshold
      const effectiveSfi = sfi >= band.minSfi ? sfi : sfi * 0.5;

      dayCondition = getCondition(kp, effectiveSfi, band.dayMultiplier);
      nightCondition = getCondition(kp, effectiveSfi, band.nightMultiplier);
    }

    return {
      name: band.name,
      freq: band.freq,
      dayCondition,
      nightCondition,
      bestFor: band.bestFor,
    };
  });
}

/**
 * Get overall propagation assessment summary
 *
 * @param kp - Current K-index (0-9)
 * @param sfi - Current Solar Flux Index
 * @returns Overall condition assessment with plain language summary
 *
 * @example
 * ```ts
 * const overall = getOverallCondition(2, 160);
 * // { hf: 'Good', vhf: 'Poor', summary: 'Good HF conditions. Higher bands favored.' }
 * ```
 */
export function getOverallCondition(kp: number, sfi: number): OverallCondition {
  // Calculate general HF condition
  const hfScore = (sfi / 200) * (1 - kp / 9);
  let hf: BandCondition;
  if (hfScore > 0.6) hf = "Excellent";
  else if (hfScore > 0.45) hf = "Good";
  else if (hfScore > 0.3) hf = "Fair";
  else hf = "Poor";

  // VHF condition
  const vhf = getVHFCondition(kp);

  // Generate summary
  const summaryParts: string[] = [];

  // HF assessment
  if (hf === "Excellent") {
    summaryParts.push("Excellent HF conditions.");
  } else if (hf === "Good") {
    summaryParts.push("Good HF conditions.");
  } else if (hf === "Fair") {
    summaryParts.push("Fair HF conditions.");
  } else {
    summaryParts.push("Poor HF conditions.");
  }

  // Band recommendations based on SFI
  if (sfi >= 120) {
    summaryParts.push("Higher bands (10-17m) favored.");
  } else if (sfi >= 90) {
    summaryParts.push("Mid-bands (15-20m) should be open.");
  } else {
    summaryParts.push("Lower bands (20-40m) recommended.");
  }

  // Geomagnetic warnings
  if (kp >= 5) {
    summaryParts.push("Geomagnetic storm in progress - expect degradation.");
  } else if (kp >= 4) {
    summaryParts.push("Elevated geomagnetic activity.");
  }

  // VHF note
  if (vhf === "Aurora") {
    summaryParts.push("Aurora propagation possible on 6m.");
  }

  return {
    hf,
    vhf,
    summary: summaryParts.join(" "),
  };
}

/**
 * Get condition color for UI display
 *
 * @param condition - Band condition rating
 * @returns Hex color code
 */
export function getConditionColor(
  condition: BandCondition | VHFCondition,
): string {
  switch (condition) {
    case "Excellent":
      return "#00ff88";
    case "Good":
      return "#44dd66";
    case "Fair":
      return "#ffaa00";
    case "Poor":
      return "#ff4455";
    case "Aurora":
      return "#aa44ff";
    default:
      return "#666666";
  }
}

/**
 * Get K-index color for UI display
 *
 * @param kp - K-index value (0-9)
 * @returns Hex color code
 */
export function getKIndexColor(kp: number): string {
  if (kp <= 1) return "#00ff88";
  if (kp <= 2) return "#44dd66";
  if (kp <= 3) return "#88cc44";
  if (kp <= 4) return "#ffaa00";
  if (kp <= 5) return "#ff7700";
  if (kp <= 6) return "#ff4400";
  if (kp <= 7) return "#ff0044";
  return "#ff0088";
}

/**
 * Get K-index description text
 *
 * @param kp - K-index value (0-9)
 * @returns Human-readable description
 */
export function getKIndexDescription(kp: number): string {
  if (kp <= 2) return "Quiet";
  if (kp <= 4) return "Unsettled";
  if (kp <= 5) return "Active";
  if (kp <= 6) return "Minor Storm";
  if (kp <= 7) return "Moderate Storm";
  if (kp <= 8) return "Strong Storm";
  return "Severe Storm";
}
