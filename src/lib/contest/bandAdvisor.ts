/**
 * Band-Change Advisor - Intelligent QSY Recommendations
 *
 * Provides real-time advice on when to change bands during contest operation
 * based on rate analysis, spot density, propagation predictions, and
 * needed multiplier opportunities.
 *
 * Decision logic:
 * - "stay": Current rate is good (>60/hr), keep operating
 * - "consider_qsy": Rate is dropping and another band has better activity
 * - "opportunity": Needed multiplier spotted on another band (high priority)
 * - "predicted_opening": Propagation model predicts an imminent band opening
 *
 * @module lib/contest/bandAdvisor
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Band change advice result
 */
export interface BandAdvice {
  /** Type of advice being given */
  type: "stay" | "consider_qsy" | "opportunity" | "predicted_opening";
  /** Human-readable advice message */
  message: string;
  /** Suggested target band for QSY (if applicable) */
  targetBand?: string;
  /** How urgently the operator should act */
  urgency: "low" | "medium" | "high";
  /** Explanation of why this advice is being given */
  reason: string;
  /** Number of spots on the target band (if applicable) */
  spotCount?: number;
  /** Predicted QSO rate on the target band (QSOs/hr) */
  predictedRate?: number;
}

/**
 * Needed multiplier spotted on a band
 */
export interface NeededMultOnBand {
  /** Callsign of the spotted station */
  callsign: string;
  /** Band where the multiplier was spotted */
  band: string;
  /** Multiplier value (e.g., section, zone, DXCC entity) */
  multiplier: string;
}

/**
 * Propagation prediction for a band
 */
export interface BandPrediction {
  /** Band designation (e.g., "20m") */
  band: string;
  /** Predicted propagation status */
  status: string;
  /** Minutes until predicted opening (if applicable) */
  minutesUntilOpen?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Rate threshold above which we advise staying (QSOs/hr) */
const GOOD_RATE_THRESHOLD = 60;

/** Rate threshold below which we consider QSY (QSOs/hr) */
const LOW_RATE_THRESHOLD = 30;

/** Minimum spot count on target band to suggest QSY */
const MIN_SPOTS_FOR_QSY = 20;

/** Minimum spot advantage over current band to suggest QSY */
const MIN_SPOT_ADVANTAGE = 10;

/** Time window for predicted openings to trigger advice (minutes) */
const PREDICTED_OPENING_WINDOW_MIN = 30;

/** Minimum time between notifications of the same type (ms) */
const MIN_NOTIFY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Minimum time between high-urgency notifications (ms) */
const MIN_HIGH_URGENCY_INTERVAL_MS = 60 * 1000; // 1 minute

/** Band labels for human-readable messages */
const BAND_LABELS: Record<string, string> = {
  "160m": "160m (Top Band)",
  "80m": "80m",
  "40m": "40m",
  "20m": "20m",
  "15m": "15m",
  "10m": "10m",
  "6m": "6m",
};

// ============================================================================
// Core Advisor Logic
// ============================================================================

/**
 * Get band-change advice based on current operating conditions
 *
 * Evaluates multiple factors to determine if the operator should stay
 * on the current band or consider moving to another band.
 *
 * Priority order:
 * 1. Needed multiplier opportunity (highest priority)
 * 2. Rate too low with better band available
 * 3. Predicted band opening imminent
 * 4. Stay put (default when conditions are good)
 *
 * @param currentBand - Currently operating band (e.g., "20m")
 * @param currentRate - Current QSO rate (5-minute rolling average, QSOs/hr)
 * @param historicalRate - Typical rate for this band/hour from history
 * @param spotsByBand - Spot count per band from DX cluster
 * @param predictions - Propagation predictions for each band
 * @param neededMults - Spotted needed multipliers on other bands
 * @returns Band change advice with urgency and reasoning
 *
 * @example
 * ```ts
 * const advice = getBandChangeAdvice(
 *   "20m",
 *   25, // only 25 QSOs/hr
 *   55, // normally 55/hr on 20m
 *   { "20m": 12, "15m": 35, "40m": 8 },
 *   [{ band: "15m", status: "open" }],
 *   [{ callsign: "PY2XB", band: "15m", multiplier: "PY" }]
 * );
 * // Returns: { type: "opportunity", targetBand: "15m", urgency: "high", ... }
 * ```
 */
export function getBandChangeAdvice(
  currentBand: string,
  currentRate: number,
  historicalRate: number,
  spotsByBand: Record<string, number>,
  predictions: BandPrediction[],
  neededMults: NeededMultOnBand[],
): BandAdvice {
  // Priority 1: Check for needed multiplier opportunities
  const multAdvice = checkNeededMultipliers(currentBand, neededMults);
  if (multAdvice) {
    return multAdvice;
  }

  // Priority 2: Check if rate is low and better band available
  const rateAdvice = checkRateAndSpots(
    currentBand,
    currentRate,
    historicalRate,
    spotsByBand,
  );
  if (rateAdvice) {
    return rateAdvice;
  }

  // Priority 3: Check for predicted band openings
  const predictionAdvice = checkPredictedOpenings(currentBand, predictions);
  if (predictionAdvice) {
    return predictionAdvice;
  }

  // Default: Stay on current band
  return buildStayAdvice(currentBand, currentRate);
}

/**
 * Determine if a notification should be shown based on timing and urgency
 *
 * Implements debouncing to avoid notification fatigue:
 * - High urgency: minimum 1 minute between notifications
 * - Medium/Low urgency: minimum 5 minutes between notifications
 * - "stay" type: never generates a notification
 *
 * @param advice - The current band advice
 * @param lastNotifyTime - Timestamp of last notification (ms since epoch)
 * @returns True if notification should be shown
 */
export function shouldNotify(
  advice: BandAdvice,
  lastNotifyTime: number,
): boolean {
  // Never notify for "stay" advice
  if (advice.type === "stay") {
    return false;
  }

  const now = Date.now();
  const elapsed = now - lastNotifyTime;

  // High urgency gets shorter interval
  if (advice.urgency === "high") {
    return elapsed >= MIN_HIGH_URGENCY_INTERVAL_MS;
  }

  // Medium and low urgency use standard interval
  return elapsed >= MIN_NOTIFY_INTERVAL_MS;
}

/**
 * Get the frequency to tune to for a given band (center of CW/SSB activity)
 *
 * Returns typical contest frequency centers for CAT rig control.
 *
 * @param band - Target band designation
 * @param mode - Operating mode ("CW", "SSB", "DIGITAL")
 * @returns Frequency in Hz, or null if band not recognized
 */
export function getBandContestFrequency(
  band: string,
  mode: string,
): number | null {
  const frequencies: Record<string, Record<string, number>> = {
    "160m": { CW: 1_810_000, SSB: 1_845_000, DIGITAL: 1_840_000 },
    "80m": { CW: 3_530_000, SSB: 3_790_000, DIGITAL: 3_580_000 },
    "40m": { CW: 7_030_000, SSB: 7_200_000, DIGITAL: 7_070_000 },
    "20m": { CW: 14_030_000, SSB: 14_250_000, DIGITAL: 14_070_000 },
    "15m": { CW: 21_030_000, SSB: 21_300_000, DIGITAL: 21_070_000 },
    "10m": { CW: 28_030_000, SSB: 28_400_000, DIGITAL: 28_070_000 },
    "6m": { CW: 50_090_000, SSB: 50_150_000, DIGITAL: 50_313_000 },
  };

  const bandFreqs = frequencies[band];
  if (!bandFreqs) return null;

  const normalizedMode = mode.toUpperCase();
  return bandFreqs[normalizedMode] ?? bandFreqs["CW"] ?? null;
}

// ============================================================================
// Internal Analysis Functions
// ============================================================================

/**
 * Check for needed multiplier opportunities on other bands
 */
function checkNeededMultipliers(
  currentBand: string,
  neededMults: NeededMultOnBand[],
): BandAdvice | null {
  // Filter to multipliers on other bands
  const otherBandMults = neededMults.filter((m) => m.band !== currentBand);

  if (otherBandMults.length === 0) {
    return null;
  }

  // Take the first needed multiplier (they should already be prioritized)
  const topMult = otherBandMults[0];
  const bandLabel = BAND_LABELS[topMult.band] || topMult.band;

  return {
    type: "opportunity",
    message: `Needed mult ${topMult.multiplier} spotted on ${bandLabel}`,
    targetBand: topMult.band,
    urgency: "high",
    reason: `${topMult.callsign} spotted with needed multiplier "${topMult.multiplier}" on ${topMult.band}. This multiplier has not been worked yet.`,
    spotCount: 1,
  };
}

/**
 * Check if rate is low enough to suggest band change
 */
function checkRateAndSpots(
  currentBand: string,
  currentRate: number,
  historicalRate: number,
  spotsByBand: Record<string, number>,
): BandAdvice | null {
  // If rate is good, no need to suggest QSY
  if (currentRate > GOOD_RATE_THRESHOLD) {
    return null;
  }

  // If rate is still acceptable, only suggest for strong opportunities
  if (currentRate > LOW_RATE_THRESHOLD) {
    return null;
  }

  // Rate is low - find a better band
  const currentSpots = spotsByBand[currentBand] || 0;
  let bestBand: string | null = null;
  let bestSpots = 0;

  for (const [band, spotCount] of Object.entries(spotsByBand)) {
    if (band === currentBand) continue;

    // The band must have significantly more spots than current
    if (
      spotCount >= MIN_SPOTS_FOR_QSY &&
      spotCount > currentSpots + MIN_SPOT_ADVANTAGE &&
      spotCount > bestSpots
    ) {
      bestBand = band;
      bestSpots = spotCount;
    }
  }

  if (!bestBand) {
    return null;
  }

  const bandLabel = BAND_LABELS[bestBand] || bestBand;
  const rateDrop =
    historicalRate > 0
      ? Math.round(((historicalRate - currentRate) / historicalRate) * 100)
      : 0;

  return {
    type: "consider_qsy",
    message: `Rate down to ${Math.round(currentRate)}/hr. ${bandLabel} has ${bestSpots} spots.`,
    targetBand: bestBand,
    urgency: "medium",
    reason:
      rateDrop > 0
        ? `Your current rate of ${Math.round(currentRate)} QSOs/hr is ${rateDrop}% below the typical rate of ${Math.round(historicalRate)}/hr for this band. ${bandLabel} shows ${bestSpots} active spots vs ${currentSpots} on ${currentBand}.`
        : `Your current rate of ${Math.round(currentRate)} QSOs/hr is below the ${LOW_RATE_THRESHOLD}/hr threshold. ${bandLabel} shows ${bestSpots} active spots vs ${currentSpots} on ${currentBand}.`,
    spotCount: bestSpots,
    predictedRate: estimateRateFromSpots(bestSpots),
  };
}

/**
 * Check for predicted propagation openings
 */
function checkPredictedOpenings(
  currentBand: string,
  predictions: BandPrediction[],
): BandAdvice | null {
  for (const pred of predictions) {
    // Skip current band and already-open bands
    if (pred.band === currentBand) continue;

    const status = pred.status.toLowerCase();

    // Check for imminent openings
    if (
      pred.minutesUntilOpen !== undefined &&
      pred.minutesUntilOpen > 0 &&
      pred.minutesUntilOpen <= PREDICTED_OPENING_WINDOW_MIN &&
      (status === "predicted" || status === "possible" || status === "likely")
    ) {
      const bandLabel = BAND_LABELS[pred.band] || pred.band;

      return {
        type: "predicted_opening",
        message: `${bandLabel} predicted to open in ~${pred.minutesUntilOpen} min`,
        targetBand: pred.band,
        urgency: pred.minutesUntilOpen <= 10 ? "medium" : "low",
        reason: `Propagation models predict ${pred.band} will open in approximately ${pred.minutesUntilOpen} minutes. Consider preparing to QSY when the opening begins.`,
      };
    }
  }

  return null;
}

/**
 * Build a "stay" advice result
 */
function buildStayAdvice(currentBand: string, currentRate: number): BandAdvice {
  const bandLabel = BAND_LABELS[currentBand] || currentBand;

  if (currentRate >= GOOD_RATE_THRESHOLD) {
    return {
      type: "stay",
      message: `Running ${Math.round(currentRate)}/hr on ${bandLabel}`,
      urgency: "low",
      reason: `Current rate of ${Math.round(currentRate)} QSOs/hr is above the ${GOOD_RATE_THRESHOLD}/hr threshold. Keep running.`,
    };
  }

  return {
    type: "stay",
    message: `${Math.round(currentRate)}/hr on ${bandLabel}`,
    urgency: "low",
    reason: `No better band opportunities detected. Continue operating on ${bandLabel}.`,
  };
}

/**
 * Rough estimate of achievable rate from spot count
 *
 * Based on typical contest correlation between DX cluster spot density
 * and actual QSO rates. This is a very rough heuristic.
 */
function estimateRateFromSpots(spotCount: number): number {
  if (spotCount >= 50) return 80;
  if (spotCount >= 30) return 60;
  if (spotCount >= 20) return 45;
  if (spotCount >= 10) return 30;
  return 15;
}

// ============================================================================
// Rate Trend Analysis
// ============================================================================

/**
 * Compute rate trend from a series of rate measurements
 *
 * @param rates - Array of rate measurements (newest first)
 * @param windowSize - Number of measurements to compare
 * @returns Trend direction: "up", "down", or "stable"
 */
export function computeRateTrend(
  rates: number[],
  windowSize = 3,
): "up" | "down" | "stable" {
  if (rates.length < 2) return "stable";

  const recent = rates.slice(0, Math.min(windowSize, rates.length));
  const older = rates.slice(windowSize, Math.min(windowSize * 2, rates.length));

  if (older.length === 0) return "stable";

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const diff = recentAvg - olderAvg;
  const threshold = olderAvg * 0.1; // 10% change threshold

  if (diff > threshold) return "up";
  if (diff < -threshold) return "down";
  return "stable";
}
