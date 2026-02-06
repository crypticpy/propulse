/**
 * Intelligent Recommendations Engine
 * Provides actionable band recommendations with time windows for target paths
 *
 * Uses existing propagation calculations from bands.ts and signal.ts
 * to generate user-friendly recommendations.
 */

import type {
  OperatingMode,
  BandRecommendation,
  TimeWindow,
  PropagationRecommendations,
} from "@/types/recommendations";
import {
  getEnhancedBandConditions,
  getForecastForPath,
  getBestWindows,
  type PathBandCondition,
  type BestWindow,
} from "./bands";
import { MODE_PARAMETERS } from "./signal";
import type { BandCorrelationSummary } from "./spotCorrelation";
import { getHistoricalNote } from "@/lib/data/historicalPropagation";

/**
 * Mode-specific minimum SNR thresholds
 * Signals below these levels are not usable for the mode
 */
const MODE_SNR_THRESHOLDS: Record<OperatingMode, number> = {
  SSB: -6,
  CW: -15,
  FT8: -21,
  RTTY: -10,
};

/**
 * Calculate a confidence score (0-100) from band condition data
 *
 * Score factors:
 * - SNR relative to mode threshold (primary factor)
 * - Status rating bonus
 * - Signal strength bonus for S-unit readings
 */
function calculateScore(
  condition: PathBandCondition,
  mode: OperatingMode,
): number {
  const threshold = MODE_SNR_THRESHOLDS[mode];
  const snrMargin = condition.snrEstimate - threshold;

  // Base score from SNR margin (0-60 points)
  // +3 dB margin = 30 points, +10 dB margin = 60 points
  let score = Math.min(60, Math.max(0, (snrMargin + 3) * 4));

  // Status bonus (0-25 points)
  const statusBonus: Record<PathBandCondition["status"], number> = {
    excellent: 25,
    good: 20,
    fair: 12,
    poor: 5,
    closed: 0,
  };
  score += statusBonus[condition.status];

  // S-unit bonus (0-15 points based on S-meter reading)
  if (condition.sUnit) {
    const sValue = condition.sUnit.value;
    score += Math.min(15, sValue * 1.5);
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Generate reason text explaining why a band is recommended
 */
function generateReason(
  condition: PathBandCondition,
  mode: OperatingMode,
  isOptimal: boolean,
): string {
  const parts: string[] = [];

  if (isOptimal) {
    if (condition.status === "excellent") {
      parts.push("Best propagation conditions");
    } else if (condition.status === "good") {
      parts.push("Strong propagation");
    } else {
      parts.push("Best available option");
    }
  }

  // Add specific notes
  if (condition.notes) {
    const notesList = condition.notes.split(", ");
    for (const note of notesList) {
      if (
        note === "Strong signals expected" ||
        note === "Reliable contacts" ||
        note === "Marginal conditions" ||
        note === "No propagation"
      ) {
        continue; // Skip generic notes
      }
      parts.push(note);
    }
  }

  // Add mode-specific context
  const threshold = MODE_SNR_THRESHOLDS[mode];
  const margin = condition.snrEstimate - threshold;
  if (margin >= 15) {
    parts.push(`excellent margin for ${mode}`);
  } else if (margin >= 6) {
    parts.push(`good margin for ${mode}`);
  } else if (margin >= 0) {
    parts.push(`workable for ${mode}`);
  }

  return parts.length > 0 ? parts.join(", ") : "Available for contacts";
}

/**
 * Annotate a recommendation reason with correlation data if available.
 * Appends a correlation-specific suffix based on the agreement status.
 */
function annotateWithCorrelation(
  reason: string,
  bandName: string,
  correlationData?: BandCorrelationSummary[],
): string {
  if (!correlationData || correlationData.length === 0) {
    return reason;
  }

  const bandCorrelation = correlationData.find((c) => c.band === bandName);
  if (!bandCorrelation) {
    return reason;
  }

  switch (bandCorrelation.agreement) {
    case "confirmed":
      return `${reason} (confirmed by ${bandCorrelation.spotCount} spots)`;
    case "surprise":
      return `${reason} (surprise opening detected -- ${bandCorrelation.spotCount} spots despite model prediction)`;
    case "discrepancy":
      return `${reason} (caution: model predicts Good but no spots detected)`;
    case "unverified":
      return `${reason} (unverified -- no recent spots)`;
    default:
      return reason;
  }
}

/**
 * Get the optimal band recommendation for a specific path
 *
 * @param homeLat - Home station latitude
 * @param homeLon - Home station longitude
 * @param targetLat - Target station latitude
 * @param targetLon - Target station longitude
 * @param kp - Current K-index (0-9)
 * @param sfi - Current Solar Flux Index
 * @param time - Current time for calculations
 * @param mode - Operating mode (affects SNR thresholds)
 * @returns Best band recommendation or null if no bands are open
 */
export function getOptimalBand(
  homeLat: number,
  homeLon: number,
  targetLat: number,
  targetLon: number,
  kp: number,
  sfi: number,
  time: Date,
  mode: OperatingMode,
  correlationData?: BandCorrelationSummary[],
  antennaGainDbi: number = 0,
): BandRecommendation | null {
  const conditions = getEnhancedBandConditions(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    kp,
    sfi,
    time,
    100, // Default 100W
    mode === "FT8" ? "FT8" : mode === "CW" ? "CW" : "SSB",
    antennaGainDbi,
  );

  // Filter out closed bands and score the rest
  const scoredBands = conditions
    .filter((c) => c.status !== "closed")
    .map((c) => ({
      condition: c,
      score: calculateScore(c, mode),
    }))
    .sort((a, b) => b.score - a.score);

  if (scoredBands.length === 0) {
    return null;
  }

  const best = scoredBands[0];
  const reason = generateReason(best.condition, mode, true);
  return {
    band: best.condition.band,
    score: best.score,
    snr: best.condition.snrEstimate,
    sUnit: best.condition.sUnit?.text || "N/A",
    status: best.condition.status,
    reason: annotateWithCorrelation(
      reason,
      best.condition.band,
      correlationData,
    ),
  };
}

/**
 * Get alternative band recommendations (excluding the optimal)
 *
 * @returns Array of up to 3 alternative bands ranked by score
 */
export function getAlternateBands(
  homeLat: number,
  homeLon: number,
  targetLat: number,
  targetLon: number,
  kp: number,
  sfi: number,
  time: Date,
  mode: OperatingMode,
  correlationData?: BandCorrelationSummary[],
  antennaGainDbi: number = 0,
): BandRecommendation[] {
  const conditions = getEnhancedBandConditions(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    kp,
    sfi,
    time,
    100,
    mode === "FT8" ? "FT8" : mode === "CW" ? "CW" : "SSB",
    antennaGainDbi,
  );

  // Score and sort all non-closed bands
  const scoredBands = conditions
    .filter((c) => c.status !== "closed")
    .map((c) => ({
      condition: c,
      score: calculateScore(c, mode),
    }))
    .sort((a, b) => b.score - a.score);

  // Return 2nd, 3rd, 4th best (skip the optimal)
  return scoredBands.slice(1, 4).map((sb) => {
    const reason = generateReason(sb.condition, mode, false);
    return {
      band: sb.condition.band,
      score: sb.score,
      snr: sb.condition.snrEstimate,
      sUnit: sb.condition.sUnit?.text || "N/A",
      status: sb.condition.status,
      reason: annotateWithCorrelation(
        reason,
        sb.condition.band,
        correlationData,
      ),
    };
  });
}

/**
 * Get best time windows for each band over the next 24 hours
 *
 * @returns Array of time windows sorted by peak SNR
 */
export function getBestTimeWindows(
  homeLat: number,
  homeLon: number,
  targetLat: number,
  targetLon: number,
  kp: number,
  sfi: number,
  time: Date,
  mode: OperatingMode,
): TimeWindow[] {
  const forecast = getForecastForPath(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    kp,
    sfi,
    time,
  );

  const windows = getBestWindows(forecast);
  const currentHour = time.getUTCHours();

  // Filter windows based on mode SNR threshold
  const threshold = MODE_SNR_THRESHOLDS[mode];

  return windows
    .filter((w) => w.peakSnr >= threshold)
    .map((w: BestWindow) => {
      // Calculate hours until window starts
      let hoursUntilStart: number;
      if (currentHour >= w.startHour && currentHour <= w.endHour) {
        hoursUntilStart = -1; // Currently active
      } else if (currentHour < w.startHour) {
        hoursUntilStart = w.startHour - currentHour;
      } else {
        // Window is tomorrow
        hoursUntilStart = 24 - currentHour + w.startHour;
      }

      return {
        band: w.band,
        startHour: w.startHour,
        endHour: w.endHour,
        peakHour: w.peakHour,
        peakStatus: w.peakStatus,
        hoursUntilStart,
      };
    });
}

/**
 * Generate a human-readable summary of recommendations
 */
export function getRecommendationSummary(
  optimal: BandRecommendation | null,
  timeWindows: TimeWindow[],
  mode: OperatingMode,
): string {
  if (!optimal) {
    return `No bands currently open for ${mode}. Check back later or try a more sensitive mode like FT8.`;
  }

  const parts: string[] = [];

  // Optimal band statement
  if (optimal.status === "excellent" || optimal.status === "good") {
    parts.push(
      `${optimal.band} is your best bet right now with ${optimal.status} conditions.`,
    );
  } else {
    parts.push(
      `${optimal.band} offers the best available conditions (${optimal.status}).`,
    );
  }

  // Find next improvement if current isn't excellent
  if (optimal.status !== "excellent") {
    const betterWindow = timeWindows.find(
      (w) =>
        w.peakStatus === "excellent" &&
        w.hoursUntilStart > 0 &&
        w.hoursUntilStart <= 6,
    );
    if (betterWindow) {
      parts.push(
        `Excellent conditions expected on ${betterWindow.band} in ${betterWindow.hoursUntilStart}h.`,
      );
    }
  }

  // Mode-specific advice
  const modeParams = MODE_PARAMETERS[mode];
  if (optimal.snr < modeParams.minSNR + 6) {
    if (mode === "SSB") {
      parts.push("Consider switching to CW or FT8 for better margin.");
    } else if (mode === "CW") {
      parts.push("FT8 may provide more reliable decodes.");
    }
  }

  return parts.join(" ");
}

/**
 * Main function: Get complete propagation recommendations
 *
 * This is the primary entry point for the recommendations engine.
 * Returns optimal band, alternatives, time windows, and summary.
 */
export function getRecommendations(
  homeLat: number,
  homeLon: number,
  targetLat: number,
  targetLon: number,
  kp: number,
  sfi: number,
  time: Date,
  mode: OperatingMode,
  correlationData?: BandCorrelationSummary[],
  antennaGainDbi: number = 0,
): PropagationRecommendations {
  const optimal = getOptimalBand(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    kp,
    sfi,
    time,
    mode,
    correlationData,
    antennaGainDbi,
  );

  const alternatives = getAlternateBands(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    kp,
    sfi,
    time,
    mode,
    correlationData,
    antennaGainDbi,
  );

  const timeWindows = getBestTimeWindows(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    kp,
    sfi,
    time,
    mode,
  );

  // If no optimal band found, create a "closed" recommendation
  const effectiveOptimal: BandRecommendation = optimal || {
    band: "None",
    score: 0,
    snr: -30,
    sUnit: "N/A",
    status: "closed",
    reason: "No bands currently open for this path",
  };

  const summary = getRecommendationSummary(optimal, timeWindows, mode);

  return {
    optimal: effectiveOptimal,
    alternatives,
    timeWindows,
    summary,
    mode,
    generatedAt: new Date(),
  };
}

/**
 * Format hours until start as human-readable text
 */
export function formatTimeUntil(hoursUntilStart: number): string {
  if (hoursUntilStart === -1) {
    return "Now";
  }
  if (hoursUntilStart === 0) {
    return "Starting now";
  }
  if (hoursUntilStart === 1) {
    return "In 1 hour";
  }
  return `In ${hoursUntilStart}h`;
}

/**
 * Get status color class for recommendations display
 */
export function getStatusColorClass(
  status: BandRecommendation["status"],
): string {
  switch (status) {
    case "excellent":
      return "text-signal-green";
    case "good":
      return "text-emerald-400";
    case "fair":
      return "text-caution-amber";
    case "poor":
      return "text-alert-red";
    case "closed":
      return "text-gray-500";
  }
}

/**
 * Get status background color class for badges
 */
export function getStatusBgColorClass(
  status: BandRecommendation["status"],
): string {
  switch (status) {
    case "excellent":
      return "bg-signal-green/20";
    case "good":
      return "bg-emerald-400/20";
    case "fair":
      return "bg-caution-amber/20";
    case "poor":
      return "bg-alert-red/20";
    case "closed":
      return "bg-gray-500/20";
  }
}

/**
 * Get historical propagation note for current conditions
 */
export function getHistoricalContext(sfi: number, band: string): string | null {
  const month = new Date().getUTCMonth() + 1;
  return getHistoricalNote(sfi, month, band);
}
