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
import { getIonosphericParameters } from "./ionosphere";
import { predictSignalStrength } from "./signal";
import type { SignalPrediction, SUnit } from "@/types/signal";
import { traceRayPath } from "./rayTrace";
import { getGeomagneticLatitude, pathCrossesAuroralZone } from "./geomagnetic";
import { getEsSeasonalProbability } from "./sporadicE";

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

  if (score > 0.6) {
    return "Excellent";
  }
  if (score > 0.45) {
    return "Good";
  }
  if (score > 0.3) {
    return "Fair";
  }
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
  if (kp >= 5) {
    return "Aurora";
  }
  if (kp >= 4) {
    return "Fair";
  }
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
  if (hfScore > 0.6) {
    hf = "Excellent";
  } else if (hfScore > 0.45) {
    hf = "Good";
  } else if (hfScore > 0.3) {
    hf = "Fair";
  } else {
    hf = "Poor";
  }

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
  if (kp <= 1) {
    return "#00ff88";
  }
  if (kp <= 2) {
    return "#44dd66";
  }
  if (kp <= 3) {
    return "#88cc44";
  }
  if (kp <= 4) {
    return "#ffaa00";
  }
  if (kp <= 5) {
    return "#ff7700";
  }
  if (kp <= 6) {
    return "#ff4400";
  }
  if (kp <= 7) {
    return "#ff0044";
  }
  return "#ff0088";
}

/**
 * Get K-index description text
 *
 * @param kp - K-index value (0-9)
 * @returns Human-readable description
 */
export function getKIndexDescription(kp: number): string {
  if (kp <= 2) {
    return "Quiet";
  }
  if (kp <= 4) {
    return "Unsettled";
  }
  if (kp <= 5) {
    return "Active";
  }
  if (kp <= 6) {
    return "Minor Storm";
  }
  if (kp <= 7) {
    return "Moderate Storm";
  }
  if (kp <= 8) {
    return "Strong Storm";
  }
  return "Severe Storm";
}

/**
 * Path-specific band condition with SNR estimate
 */
export interface PathBandCondition {
  /** Band name (e.g., '20m') */
  band: string;
  /** Center frequency (e.g., '14 MHz') */
  frequency: string;
  /** Propagation status for this path */
  status: "excellent" | "good" | "fair" | "poor" | "closed";
  /** Estimated SNR in dB (realistic range: -30 to -5 dB for FT8) */
  snrEstimate: number;
  /** Explanatory notes for this band/path combination */
  notes: string;
  /** S-meter reading (from enhanced calculation) */
  sUnit?: SUnit;
  /** Total path loss in dB (from enhanced calculation) */
  pathLoss?: number;
  /** D-layer absorption loss in dB (from enhanced calculation) */
  absorptionLoss?: number;
  /** Full signal prediction object (from enhanced calculation) */
  signalPrediction?: SignalPrediction;
  /** Antenna gain in dBi used for this prediction */
  antennaGainDbi?: number;
}

/**
 * Band parameters for path-specific calculations
 */
interface PathBandParams {
  name: string;
  freq: string;
  /** Optimal distance range in km [min, max] */
  optimalRange: [number, number];
  /** Whether band prefers daylight paths */
  prefersDaylight: boolean;
  /** Minimum SFI for reliable opening */
  minSfi: number;
  /** Base SNR at optimal conditions (dB) */
  baseSNR: number;
  /** SNR penalty per 1000km beyond optimal range */
  distancePenalty: number;
}

/**
 * Band parameters for path-specific SNR estimation
 */
const PATH_BANDS: PathBandParams[] = [
  {
    name: "160m",
    freq: "1.8 MHz",
    optimalRange: [500, 3000],
    prefersDaylight: false,
    minSfi: 0,
    baseSNR: -8,
    distancePenalty: 3,
  },
  {
    name: "80m",
    freq: "3.5 MHz",
    optimalRange: [300, 4000],
    prefersDaylight: false,
    minSfi: 0,
    baseSNR: -6,
    distancePenalty: 2.5,
  },
  {
    name: "60m",
    freq: "5.3 MHz",
    optimalRange: [200, 3500],
    prefersDaylight: false,
    minSfi: 0,
    baseSNR: -7,
    distancePenalty: 2.5,
  },
  {
    name: "40m",
    freq: "7 MHz",
    optimalRange: [500, 8000],
    prefersDaylight: false,
    minSfi: 0,
    baseSNR: -5,
    distancePenalty: 1.5,
  },
  {
    name: "30m",
    freq: "10 MHz",
    optimalRange: [1000, 10000],
    prefersDaylight: true,
    minSfi: 0,
    baseSNR: -6,
    distancePenalty: 1.2,
  },
  {
    name: "20m",
    freq: "14 MHz",
    optimalRange: [2000, 15000],
    prefersDaylight: true,
    minSfi: 70,
    baseSNR: -5,
    distancePenalty: 1.0,
  },
  {
    name: "17m",
    freq: "18 MHz",
    optimalRange: [3000, 18000],
    prefersDaylight: true,
    minSfi: 80,
    baseSNR: -6,
    distancePenalty: 0.9,
  },
  {
    name: "15m",
    freq: "21 MHz",
    optimalRange: [3000, 20000],
    prefersDaylight: true,
    minSfi: 90,
    baseSNR: -7,
    distancePenalty: 0.8,
  },
  {
    name: "12m",
    freq: "24 MHz",
    optimalRange: [4000, 20000],
    prefersDaylight: true,
    minSfi: 100,
    baseSNR: -8,
    distancePenalty: 0.7,
  },
  {
    name: "10m",
    freq: "28 MHz",
    optimalRange: [5000, 20000],
    prefersDaylight: true,
    minSfi: 110,
    baseSNR: -9,
    distancePenalty: 0.6,
  },
];

/**
 * Calculate band-by-band propagation conditions for a specific path
 *
 * @param homeLat - Home station latitude
 * @param homeLon - Home station longitude
 * @param targetLat - Target station latitude
 * @param targetLon - Target station longitude
 * @param kp - Current K-index (0-9)
 * @param sfi - Current Solar Flux Index
 * @param pathIllumination - Percentage of path in daylight (0-100)
 * @returns Array of band conditions with SNR estimates
 *
 * @example
 * ```ts
 * const conditions = getBandConditionsForPath(
 *   40.7, -74.0,   // New York
 *   51.5, -0.1,    // London
 *   3, 150, 75     // Kp=3, SFI=150, 75% daylight
 * );
 * // Returns realistic SNR estimates for each band
 * ```
 */
export function getBandConditionsForPath(
  homeLat: number,
  homeLon: number,
  targetLat: number,
  targetLon: number,
  kp: number,
  sfi: number,
  pathIllumination: number,
): PathBandCondition[] {
  // Calculate great circle distance
  const distance = calculateGreatCircleDistance(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
  );

  // Calculate number of F-layer hops (avg ~3000km per hop)
  const hops = Math.ceil(distance / 3000);

  // Is this primarily a day path or night path?
  const isDayPath = pathIllumination > 50;

  return PATH_BANDS.map((band) => {
    let snr = band.baseSNR;
    const notes: string[] = [];

    // 1. Distance factor - penalize paths outside optimal range
    const [minDist, maxDist] = band.optimalRange;
    if (distance < minDist) {
      // Too short for skip - might be in skip zone
      const shortfall = (minDist - distance) / 1000;
      snr -= shortfall * 4;
      notes.push("Skip zone");
    } else if (distance > maxDist) {
      // Beyond optimal range - more hops = more loss
      const excess = (distance - maxDist) / 1000;
      snr -= excess * band.distancePenalty;
      notes.push("Extended path");
    }

    // 2. Hop loss - each additional hop adds attenuation
    const hopPenalty = (hops - 1) * 2;
    snr -= hopPenalty;
    if (hops > 3) {
      notes.push(`${hops} hops`);
    }

    // 3. Day/night preference
    if (band.prefersDaylight && !isDayPath) {
      // Daytime band on night path
      snr -= 8;
      notes.push("Night path");
    } else if (!band.prefersDaylight && isDayPath && pathIllumination > 80) {
      // Nighttime band with mostly daylight path - significant D-layer absorption
      snr -= 12;
      notes.push("D-layer absorption");
    }

    // 4. SFI effect - high bands need high SFI to open
    if (sfi < band.minSfi) {
      const deficit = band.minSfi - sfi;
      const penalty = Math.min(deficit * 0.3, 15);
      snr -= penalty;
      if (deficit > 20) {
        notes.push("Low SFI");
      }
    } else if (sfi > band.minSfi + 50) {
      // Bonus for high SFI on bands that benefit
      const bonus = Math.min((sfi - band.minSfi - 50) * 0.05, 3);
      snr += bonus;
    }

    // 5. Kp effect - geomagnetic disturbance degrades propagation
    if (kp >= 3) {
      const kpPenalty = (kp - 2) * 2;
      snr -= kpPenalty;
      if (kp >= 5) {
        notes.push("Storm conditions");
      } else if (kp >= 4) {
        notes.push("Disturbed");
      }
    }

    // 6. Polar path penalty (using geomagnetic latitude)
    const maxGeomagLat = Math.abs(
      Math.max(
        getGeomagneticLatitude(homeLat, homeLon),
        getGeomagneticLatitude(targetLat, targetLon),
      ),
    );
    if (maxGeomagLat > 60) {
      snr -= 4;
      notes.push("Polar path");
    }

    // Clamp SNR to realistic range
    snr = Math.max(-30, Math.min(-5, Math.round(snr)));

    // Determine status based on SNR
    // FT8 threshold is around -24 dB
    let status: PathBandCondition["status"];
    if (snr >= -8) {
      status = "excellent";
    } else if (snr >= -12) {
      status = "good";
    } else if (snr >= -18) {
      status = "fair";
    } else if (snr >= -24) {
      status = "poor";
    } else {
      status = "closed";
    }

    // Check if band is completely closed
    const isBandClosed =
      sfi < band.minSfi - 30 ||
      (band.prefersDaylight && pathIllumination < 20) ||
      (!band.prefersDaylight && pathIllumination > 90 && band.name === "160m");

    if (isBandClosed) {
      status = "closed";
      snr = -30;
      if (notes.length === 0) {
        notes.push("Band closed");
      }
    }

    // Sporadic E annotation for 6m and 10m
    if (
      (band.name === "6m" || band.name === "10m") &&
      (status === "closed" || status === "poor")
    ) {
      const month = new Date().getMonth();
      const midLat = (homeLat + targetLat) / 2;
      const esProbability = getEsSeasonalProbability(month, midLat);
      if (esProbability > 0.3) {
        notes.push(
          `Es possible (seasonal probability: ${Math.round(esProbability * 100)}%)`,
        );
      }
    }

    return {
      band: band.name,
      frequency: band.freq,
      status,
      snrEstimate: snr,
      notes: notes.length > 0 ? notes.join(", ") : getDefaultNote(status),
    };
  });
}

/**
 * Get default note based on status
 */
function getDefaultNote(status: PathBandCondition["status"]): string {
  switch (status) {
    case "excellent":
      return "Strong signals expected";
    case "good":
      return "Reliable contacts";
    case "fair":
      return "Marginal conditions";
    case "poor":
      return "Weak signals, FT8 recommended";
    case "closed":
      return "No propagation";
  }
}

/**
 * Band frequency lookup table for enhanced calculations
 */
const BAND_FREQUENCIES: Record<string, number> = {
  "160m": 1.85,
  "80m": 3.6,
  "60m": 5.35,
  "40m": 7.1,
  "30m": 10.1,
  "20m": 14.1,
  "17m": 18.1,
  "15m": 21.1,
  "12m": 24.9,
  "10m": 28.3,
};

/**
 * Get enhanced band conditions with full signal analysis
 * Uses the ionospheric model and signal calculations for more accurate predictions
 *
 * This function provides physics-based propagation predictions including:
 * - Actual D-layer absorption calculated for path midpoint
 * - Proper path loss model from signal.ts
 * - S-unit estimates based on real physics
 * - Full signal prediction objects for detailed analysis
 *
 * @param homeLat - Home station latitude
 * @param homeLon - Home station longitude
 * @param targetLat - Target station latitude
 * @param targetLon - Target station longitude
 * @param kp - Current K-index (0-9)
 * @param sfi - Current Solar Flux Index
 * @param date - Date/time for calculation (affects ionospheric conditions)
 * @param txPowerWatts - Transmitter power in watts (default 100W)
 * @param mode - Operating mode: 'SSB', 'CW', or 'FT8' (default 'FT8')
 * @returns Array of band conditions with enhanced signal analysis
 *
 * @example
 * ```ts
 * const conditions = getEnhancedBandConditions(
 *   40.7, -74.0,   // New York
 *   51.5, -0.1,    // London
 *   3, 150,        // Kp=3, SFI=150
 *   new Date(),
 *   100,           // 100W
 *   'FT8'
 * );
 * // Returns detailed band conditions with S-unit readings and path loss
 * ```
 */
export function getEnhancedBandConditions(
  homeLat: number,
  homeLon: number,
  targetLat: number,
  targetLon: number,
  kp: number,
  sfi: number,
  date: Date,
  txPowerWatts: number = 100,
  mode: "SSB" | "CW" | "FT8" = "FT8",
  antennaGainDbi: number = 0,
): PathBandCondition[] {
  // Calculate great circle distance
  const distance = calculateGreatCircleDistance(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
  );

  // Calculate path midpoint for ionospheric calculations
  const midLat = (homeLat + targetLat) / 2;
  const midLon = (homeLon + targetLon) / 2;

  // Get ionospheric parameters at path midpoint
  const ionoParams = getIonosphericParameters(midLat, midLon, date, sfi);

  // Compute geomagnetic-based polar path assessment
  const crossesAuroral = pathCrossesAuroralZone(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
  );

  return PATH_BANDS.map((band) => {
    const frequencyMHz = BAND_FREQUENCIES[band.name] || 14.0;

    // Use multi-hop ray trace for more accurate absorption and viability
    const rayResult = traceRayPath({
      startLat: homeLat,
      startLon: homeLon,
      endLat: targetLat,
      endLon: targetLon,
      frequencyMHz,
      date,
      sfi,
      kp,
    });

    // Use ray trace absorption (summed across all hops) instead of midpoint-only
    const absorptionDb = rayResult.totalAbsorptionDb;
    const hops = rayResult.hops.length;

    // Get full signal prediction using the signal.ts model
    const signalPred = predictSignalStrength(
      frequencyMHz,
      distance,
      hops,
      absorptionDb,
      txPowerWatts,
      mode,
      antennaGainDbi,
    );

    // Build notes array
    const notes: string[] = [];

    // Distance-based notes
    const [minDist, maxDist] = band.optimalRange;
    if (distance < minDist) {
      notes.push("Skip zone");
    } else if (distance > maxDist) {
      notes.push("Extended path");
    }

    // Multi-hop notation
    if (hops > 3) {
      notes.push(`${hops} hops`);
    }

    // Day/night path notes
    if (band.prefersDaylight && !ionoParams.isDaytime) {
      notes.push("Night path");
    } else if (
      !band.prefersDaylight &&
      ionoParams.isDaytime &&
      ionoParams.zenithAngle < 45
    ) {
      notes.push("D-layer absorption");
    }

    // SFI-based notes
    if (sfi < band.minSfi && band.minSfi - sfi > 20) {
      notes.push("Low SFI");
    }

    // Geomagnetic notes
    if (kp >= 5) {
      notes.push("Storm conditions");
    } else if (kp >= 4) {
      notes.push("Disturbed");
    }

    // Polar path notes (using geomagnetic latitude)
    if (crossesAuroral) {
      notes.push("Polar path");
    }

    // Ray trace viability note
    if (!rayResult.isPathViable) {
      notes.push(`MUF exceeded at hop ${rayResult.limitingHop + 1}`);
    }

    // Absorption note for high absorption
    if (absorptionDb > 15) {
      notes.push(`High absorption (${Math.round(absorptionDb)} dB)`);
    }

    // Use signal prediction SNR but apply Kp penalty
    let adjustedSNR = signalPred.expectedSNR;
    if (kp >= 3) {
      const kpPenalty = (kp - 2) * 2;
      adjustedSNR -= kpPenalty;
    }

    // Also check SFI requirements for high bands
    if (sfi < band.minSfi) {
      const deficit = band.minSfi - sfi;
      const penalty = Math.min(deficit * 0.3, 15);
      adjustedSNR -= penalty;
    }

    // Clamp SNR to realistic range
    adjustedSNR = Math.max(-30, Math.min(-5, Math.round(adjustedSNR)));

    // Determine status based on adjusted SNR
    let status: PathBandCondition["status"];
    if (adjustedSNR >= -8) {
      status = "excellent";
    } else if (adjustedSNR >= -12) {
      status = "good";
    } else if (adjustedSNR >= -18) {
      status = "fair";
    } else if (adjustedSNR >= -24) {
      status = "poor";
    } else {
      status = "closed";
    }

    // Check if band is completely closed
    const isBandClosed =
      sfi < band.minSfi - 30 ||
      (band.prefersDaylight &&
        !ionoParams.isDaytime &&
        ionoParams.zenithAngle > 100) ||
      (!band.prefersDaylight &&
        ionoParams.isDaytime &&
        ionoParams.zenithAngle < 30 &&
        band.name === "160m");

    if (isBandClosed) {
      status = "closed";
      adjustedSNR = -30;
      if (notes.length === 0) {
        notes.push("Band closed");
      }
    }

    // Sporadic E annotation for 6m and 10m
    if (
      (band.name === "6m" || band.name === "10m") &&
      (status === "closed" || status === "poor")
    ) {
      const month = date.getMonth();
      const esMidLat = (homeLat + targetLat) / 2;
      const esProbability = getEsSeasonalProbability(month, esMidLat);
      if (esProbability > 0.3) {
        notes.push(
          `Es possible (seasonal probability: ${Math.round(esProbability * 100)}%)`,
        );
      }
    }

    // Recalculate S-unit based on adjusted SNR
    // Approximate: SNR of -10 dB typically corresponds to around S5-S6 for FT8
    // We'll use the signal prediction's S-unit but note it's based on unadjusted path loss
    const { sUnit } = signalPred;

    return {
      band: band.name,
      frequency: band.freq,
      status,
      snrEstimate: adjustedSNR,
      notes: notes.length > 0 ? notes.join(", ") : getDefaultNote(status),
      sUnit,
      pathLoss: signalPred.pathLoss,
      absorptionLoss: absorptionDb,
      signalPrediction: signalPred,
      antennaGainDbi,
    };
  });
}

/**
 * Calculate great circle distance using Haversine formula
 */
export function calculateGreatCircleDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get status color for UI display (Tailwind class)
 */
export function getPathStatusColor(
  status: PathBandCondition["status"],
): string {
  switch (status) {
    case "excellent":
      return "text-signal-green";
    case "good":
      return "text-good";
    case "fair":
      return "text-caution-amber";
    case "poor":
      return "text-alert-red";
    case "closed":
      return "text-gray-500";
  }
}

/**
 * Get status background color for UI badges (Tailwind class)
 */
export function getPathStatusBgColor(
  status: PathBandCondition["status"],
): string {
  switch (status) {
    case "excellent":
      return "bg-signal-green/20";
    case "good":
      return "bg-good/20";
    case "fair":
      return "bg-caution-amber/20";
    case "poor":
      return "bg-alert-red/20";
    case "closed":
      return "bg-gray-500/20";
  }
}

/**
 * Hourly forecast data for a single hour
 */
export interface HourlyForecast {
  /** Hour in UTC (0-23) */
  hour: number;
  /** Band conditions for this hour */
  bands: {
    band: string;
    status: "excellent" | "good" | "fair" | "poor" | "closed";
    snrEstimate: number;
    /** Prediction confidence 0-100 (from signal model, if available) */
    confidence?: number;
  }[];
}

/**
 * Best operating window recommendation
 */
export interface BestWindow {
  band: string;
  startHour: number;
  endHour: number;
  peakHour: number;
  peakStatus: "excellent" | "good" | "fair" | "poor" | "closed";
  peakSnr: number;
}

/**
 * Forecast bands (excluding 60m and 6m for cleaner display)
 */
const FORECAST_BANDS = [
  "160m",
  "80m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
];

/**
 * Calculate path illumination at a specific time
 * Simplified version that uses subsolar point calculation
 */
function getPathIlluminationAtTime(
  homeLat: number,
  homeLon: number,
  targetLat: number,
  targetLon: number,
  date: Date,
): number {
  // Calculate subsolar point for given time
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const declination = -23.45 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  let subsolarLon = (12 - utcHours) * 15;
  if (subsolarLon > 180) {
    subsolarLon -= 360;
  }
  if (subsolarLon < -180) {
    subsolarLon += 360;
  }

  // Sample points along path
  const numPoints = 10;
  let daylightCount = 0;

  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;
    const lat = homeLat + (targetLat - homeLat) * fraction;
    const lon = homeLon + (targetLon - homeLon) * fraction;

    // Check if point is in daylight (within 90° of subsolar point)
    const distance = calculateGreatCircleDistance(
      lat,
      lon,
      declination,
      subsolarLon,
    );
    if (distance < 10018) {
      // ~90° at Earth's surface
      daylightCount++;
    }
  }

  return (daylightCount / (numPoints + 1)) * 100;
}

/**
 * Generate a 24-hour propagation forecast for a specific path
 *
 * @param homeLat - Home station latitude
 * @param homeLon - Home station longitude
 * @param targetLat - Target station latitude
 * @param targetLon - Target station longitude
 * @param kp - Current K-index (0-9)
 * @param sfi - Current Solar Flux Index
 * @param baseTime - Base time for forecast (defaults to now)
 * @returns Array of 24 hourly forecasts
 *
 * @example
 * ```ts
 * const forecast = getForecastForPath(
 *   40.7, -74.0,   // New York
 *   51.5, -0.1,    // London
 *   3, 150         // Kp=3, SFI=150
 * );
 * // Returns 24 hours of band conditions
 * ```
 */
export function getForecastForPath(
  homeLat: number,
  homeLon: number,
  targetLat: number,
  targetLon: number,
  kp: number,
  sfi: number,
  baseTime: Date = new Date(),
): HourlyForecast[] {
  const forecasts: HourlyForecast[] = [];

  // Get the start of the current UTC day
  const baseDate = new Date(baseTime);

  for (let hour = 0; hour < 24; hour++) {
    // Create date for this hour
    const hourDate = new Date(baseDate);
    hourDate.setUTCHours(hour, 0, 0, 0);

    // Calculate path illumination at this hour
    const illumination = getPathIlluminationAtTime(
      homeLat,
      homeLon,
      targetLat,
      targetLon,
      hourDate,
    );

    // Get full band conditions for this hour
    const fullConditions = getBandConditionsForPath(
      homeLat,
      homeLon,
      targetLat,
      targetLon,
      kp,
      sfi,
      illumination,
    );

    // Filter to forecast bands and extract needed fields
    const bands = fullConditions
      .filter((c) => FORECAST_BANDS.includes(c.band))
      .map((c) => ({
        band: c.band,
        status: c.status,
        snrEstimate: c.snrEstimate,
        confidence: c.signalPrediction?.confidence,
      }));

    forecasts.push({
      hour,
      bands,
    });
  }

  return forecasts;
}

/**
 * Find the best operating windows from a 24-hour forecast
 * Returns recommended time windows for each band
 */
export function getBestWindows(forecast: HourlyForecast[]): BestWindow[] {
  const windows: BestWindow[] = [];

  // Analyze each band
  for (const band of FORECAST_BANDS) {
    let bestHour = -1;
    let bestSnr = -40;
    let bestStatus: BestWindow["peakStatus"] = "closed";

    // Find peak conditions for this band
    for (const hourData of forecast) {
      const bandData = hourData.bands.find((b) => b.band === band);
      if (bandData && bandData.snrEstimate > bestSnr) {
        bestSnr = bandData.snrEstimate;
        bestHour = hourData.hour;
        bestStatus = bandData.status;
      }
    }

    // Skip if band never opens
    if (bestStatus === "closed" || bestSnr <= -24) {
      continue;
    }

    // Find window around peak (consecutive hours with fair or better)
    let startHour = bestHour;
    let endHour = bestHour;

    // Expand backward
    for (let h = bestHour - 1; h >= 0; h--) {
      const bandData = forecast[h].bands.find((b) => b.band === band);
      if (
        bandData &&
        bandData.status !== "closed" &&
        bandData.status !== "poor"
      ) {
        startHour = h;
      } else {
        break;
      }
    }

    // Expand forward
    for (let h = bestHour + 1; h < 24; h++) {
      const bandData = forecast[h].bands.find((b) => b.band === band);
      if (
        bandData &&
        bandData.status !== "closed" &&
        bandData.status !== "poor"
      ) {
        endHour = h;
      } else {
        break;
      }
    }

    windows.push({
      band,
      startHour,
      endHour,
      peakHour: bestHour,
      peakStatus: bestStatus,
      peakSnr: bestSnr,
    });
  }

  // Sort by peak SNR (best first)
  windows.sort((a, b) => b.peakSnr - a.peakSnr);

  return windows;
}

/**
 * Get color for forecast status (hex color for SVG)
 */
export function getForecastStatusColor(
  status: "excellent" | "good" | "fair" | "poor" | "closed",
): string {
  switch (status) {
    case "excellent":
      return "#00ff88"; // signal-green
    case "good":
      return "#44dd66"; // good
    case "fair":
      return "#ffaa00"; // caution-amber
    case "poor":
      return "#ff4455"; // alert-red
    case "closed":
      return "#374151"; // gray-700
  }
}
