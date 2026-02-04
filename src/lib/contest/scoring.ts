/**
 * Contest Score Computation Engine
 *
 * Implements contest-correct scoring formulas for ham radio contests.
 * Supports multiple score models:
 * - points_x_mults_per_band: CQWW style - Sum(bandPoints * bandMults)
 * - points_x_mults_total: Sweepstakes style - totalPoints * totalMults
 * - field_day: Field Day style - points + bonuses
 *
 * @module lib/contest/scoring
 */

import type {
  ContestDefinition,
  ContestQSO,
  MultiplierType,
} from "@/types/contest";
import { getEffectiveScoreModel } from "@/types/contest";
import type {
  ScoreSummary,
  BandScoreBreakdown,
  ModeScoreBreakdown,
  HourlyRate,
} from "./types";
import {
  getDXCCEntity,
  getContinent,
  type Continent,
} from "@/lib/utils/multipliers";

// ============================================================================
// Local Normalization Functions (avoid circular imports)
// ============================================================================

/**
 * Normalize band to standard format (e.g., "20m")
 */
function normalizeBandLocal(band: string): string {
  const cleaned = band.trim().toLowerCase();
  if (/^\d+m$/.test(cleaned)) {
    return cleaned;
  }
  const bandMap: Record<string, string> = {
    "160": "160m",
    "80": "80m",
    "40": "40m",
    "20": "20m",
    "15": "15m",
    "10": "10m",
    "6": "6m",
    "2": "2m",
  };
  const numericPart = cleaned.replace(/[mhz\s]/gi, "");
  return bandMap[numericPart] || cleaned;
}

/**
 * Normalize mode to standard contest format (CW, SSB, DIGITAL)
 */
function normalizeModeLocal(mode: string): string {
  const cleaned = mode.trim().toUpperCase();
  const phoneModes = new Set(["SSB", "USB", "LSB", "PHONE", "AM", "FM"]);
  if (phoneModes.has(cleaned)) {
    return "SSB";
  }
  if (cleaned === "CW") {
    return "CW";
  }
  const digitalModes = new Set([
    "RTTY",
    "PSK31",
    "PSK63",
    "PSK",
    "FT8",
    "FT4",
    "JT65",
    "JT9",
    "JS8",
    "MSK144",
    "MFSK",
    "OLIVIA",
    "CONTESTI",
    "DATA",
    "DIGITAL",
    "DIGI",
  ]);
  if (digitalModes.has(cleaned)) {
    return "DIGITAL";
  }
  return cleaned;
}

// ============================================================================
// QSO Points Calculation
// ============================================================================

/**
 * Calculate points for a single QSO based on contest scoring rules
 *
 * @param qso - Contest QSO to score
 * @param contest - Contest definition with scoring rules
 * @param myDXCC - Operator's DXCC entity prefix (e.g., "K" for USA)
 * @param myContinent - Operator's continent code (e.g., "NA")
 * @returns Points value for this QSO
 *
 * @example
 * ```ts
 * // Fixed points mode
 * computeQSOPoints(qso, fixedPointsContest, "K", "NA") // Returns fixedPoints value
 *
 * // Zone-based scoring (CQWW style)
 * computeQSOPoints(qso, cqwwContest, "K", "NA")
 * // Returns 0 for same country, 1 for same continent, 3 for different continent
 *
 * // Mixed mode scoring
 * computeQSOPoints(qso, mixedContest, "K", "NA")
 * // Returns different points based on CW/SSB/Digital
 * ```
 */
export function computeQSOPoints(
  qso: ContestQSO,
  contest: ContestDefinition,
  myDXCC?: string,
  myContinent?: Continent,
): number {
  // Dupes are worth 0 points
  if (qso.isDupe) {
    return 0;
  }

  const {scoring} = contest;

  switch (scoring.mode) {
    case "fixed":
      return scoring.fixedPoints ?? 1;

    case "zone": {
      // Zone-based scoring - different points for same country/continent/diff continent
      const workedEntity = getDXCCEntity(qso.callsign);
      const workedContinent = getContinent(qso.callsign);

      // Same country - typically 0 or low points
      if (myDXCC && workedEntity?.prefix === myDXCC) {
        return scoring.sameCountry ?? 0;
      }

      // Same continent
      if (myContinent && workedContinent === myContinent) {
        return scoring.sameContinent ?? 1;
      }

      // Different continent
      return scoring.diffContinent ?? 3;
    }

    case "mixed": {
      // Mode-dependent scoring
      const mode = normalizeModeLocal(qso.mode);

      switch (mode) {
        case "CW":
          return scoring.cwPoints ?? 2;
        case "SSB":
          return scoring.ssbPoints ?? 1;
        case "DIGITAL":
          return scoring.digitalPoints ?? 2;
        default:
          return scoring.fixedPoints ?? 1;
      }
    }

    case "distance":
      // Distance-based scoring not implemented yet
      // Would require grid square calculation
      return 1;

    default:
      return 1;
  }
}

// ============================================================================
// Rate Calculations
// ============================================================================

/**
 * Calculate QSO rate over a rolling time window
 *
 * @param qsos - List of contest QSOs (should be sorted by time)
 * @param windowMinutes - Size of the rolling window in minutes (default: 60)
 * @returns QSO rate per hour over the window
 *
 * @example
 * ```ts
 * // Calculate rate over last hour
 * computeRunningRate(qsos, 60) // Returns QSOs/hour
 *
 * // Calculate rate over last 10 minutes (extrapolated to hourly)
 * computeRunningRate(qsos, 10)
 * ```
 */
export function computeRunningRate(
  qsos: ContestQSO[],
  windowMinutes: number = 60,
): number {
  if (qsos.length === 0) {
    return 0;
  }

  // Get the most recent QSO time
  const sortedQsos = [...qsos].sort((a, b) => {
    const timeA = `${a.date}T${a.time.slice(0, 2)}:${a.time.slice(2)}:00Z`;
    const timeB = `${b.date}T${b.time.slice(0, 2)}:${b.time.slice(2)}:00Z`;
    return new Date(timeB).getTime() - new Date(timeA).getTime();
  });

  const mostRecentTime = parseQSODateTime(
    sortedQsos[0].date,
    sortedQsos[0].time,
  );
  const windowStart = new Date(
    mostRecentTime.getTime() - windowMinutes * 60 * 1000,
  );

  // Count QSOs in the window (excluding dupes)
  let qsoCount = 0;
  for (const qso of sortedQsos) {
    const qsoTime = parseQSODateTime(qso.date, qso.time);
    if (qsoTime >= windowStart) {
      if (!qso.isDupe) {
        qsoCount++;
      }
    } else {
      break; // Sorted by time, no need to check further
    }
  }

  // Extrapolate to hourly rate
  return Math.round((qsoCount * 60) / windowMinutes);
}

/**
 * Parse QSO date and time into a Date object
 */
function parseQSODateTime(date: string, time: string): Date {
  // date format: YYYY-MM-DD, time format: HHMM
  const hours = time.slice(0, 2);
  const minutes = time.slice(2, 4);
  return new Date(`${date}T${hours}:${minutes}:00Z`);
}

/**
 * Calculate QSOs and points per hour for each hour of the contest
 *
 * @param qsos - List of contest QSOs
 * @returns Array of hourly rate data
 */
export function computeHourlyRates(qsos: ContestQSO[]): HourlyRate[] {
  if (qsos.length === 0) {
    return [];
  }

  // Sort QSOs by time
  const sortedQsos = [...qsos].sort((a, b) => {
    const timeA = `${a.date}T${a.time.slice(0, 2)}:${a.time.slice(2)}:00Z`;
    const timeB = `${b.date}T${b.time.slice(0, 2)}:${b.time.slice(2)}:00Z`;
    return new Date(timeA).getTime() - new Date(timeB).getTime();
  });

  // Find contest start time (first QSO)
  const contestStart = parseQSODateTime(
    sortedQsos[0].date,
    sortedQsos[0].time,
  ).getTime();

  // Group QSOs by contest hour
  const hourlyData = new Map<
    number,
    { qsoCount: number; points: number; runningTotal: number }
  >();
  let runningTotal = 0;

  for (const qso of sortedQsos) {
    const qsoTime = parseQSODateTime(qso.date, qso.time).getTime();
    const hoursSinceStart = Math.floor(
      (qsoTime - contestStart) / (60 * 60 * 1000),
    );

    if (!hourlyData.has(hoursSinceStart)) {
      hourlyData.set(hoursSinceStart, { qsoCount: 0, points: 0, runningTotal });
    }

    const hourData = hourlyData.get(hoursSinceStart)!;

    if (!qso.isDupe) {
      hourData.qsoCount++;
      hourData.points += qso.points;
      runningTotal++;
    }

    hourData.runningTotal = runningTotal;
  }

  // Convert to array
  const rates: HourlyRate[] = [];
  const maxHour = Math.max(...hourlyData.keys());

  for (let hour = 0; hour <= maxHour; hour++) {
    const data = hourlyData.get(hour) || {
      qsoCount: 0,
      points: 0,
      runningTotal: rates.length > 0 ? rates[rates.length - 1].runningTotal : 0,
    };

    rates.push({
      hour,
      qsoCount: data.qsoCount,
      points: data.points,
      runningTotal: data.runningTotal,
    });
  }

  return rates;
}

// ============================================================================
// Breakdown Calculations
// ============================================================================

/**
 * Compute score breakdown by band
 *
 * @param qsos - List of contest QSOs
 * @returns Array of band breakdowns sorted by band
 */
export function computeBandBreakdown(qsos: ContestQSO[]): BandScoreBreakdown[] {
  const bandData = new Map<
    string,
    { qsoCount: number; dupeCount: number; points: number }
  >();

  for (const qso of qsos) {
    const band = normalizeBandLocal(qso.band);

    if (!bandData.has(band)) {
      bandData.set(band, { qsoCount: 0, dupeCount: 0, points: 0 });
    }

    const data = bandData.get(band)!;
    data.qsoCount++;

    if (qso.isDupe) {
      data.dupeCount++;
    } else {
      data.points += qso.points;
    }
  }

  // Convert to array and sort by band
  const bandOrder = ["160m", "80m", "40m", "20m", "15m", "10m", "6m", "2m"];
  const breakdowns: BandScoreBreakdown[] = [];

  for (const [band, data] of bandData) {
    breakdowns.push({
      band,
      qsoCount: data.qsoCount,
      dupeCount: data.dupeCount,
      points: data.points,
      multipliers: 0, // Will be filled in by computeContestScore
    });
  }

  // Sort by standard band order
  breakdowns.sort((a, b) => {
    const indexA = bandOrder.indexOf(a.band);
    const indexB = bandOrder.indexOf(b.band);
    if (indexA === -1 && indexB === -1) {
      return a.band.localeCompare(b.band);
    }
    if (indexA === -1) {
      return 1;
    }
    if (indexB === -1) {
      return -1;
    }
    return indexA - indexB;
  });

  return breakdowns;
}

/**
 * Compute score breakdown by mode
 *
 * @param qsos - List of contest QSOs
 * @returns Array of mode breakdowns
 */
export function computeModeBreakdown(qsos: ContestQSO[]): ModeScoreBreakdown[] {
  const modeData = new Map<string, { qsoCount: number; points: number }>();

  for (const qso of qsos) {
    const mode = normalizeModeLocal(qso.mode);

    if (!modeData.has(mode)) {
      modeData.set(mode, { qsoCount: 0, points: 0 });
    }

    const data = modeData.get(mode)!;
    data.qsoCount++;

    if (!qso.isDupe) {
      data.points += qso.points;
    }
  }

  // Convert to array
  const breakdowns: ModeScoreBreakdown[] = [];
  const modeOrder = ["CW", "SSB", "DIGITAL"];

  for (const [mode, data] of modeData) {
    breakdowns.push({
      mode,
      qsoCount: data.qsoCount,
      points: data.points,
    });
  }

  // Sort by standard mode order
  breakdowns.sort((a, b) => {
    const indexA = modeOrder.indexOf(a.mode);
    const indexB = modeOrder.indexOf(b.mode);
    if (indexA === -1 && indexB === -1) {
      return a.mode.localeCompare(b.mode);
    }
    if (indexA === -1) {
      return 1;
    }
    if (indexB === -1) {
      return -1;
    }
    return indexA - indexB;
  });

  return breakdowns;
}

// ============================================================================
// Score Projection
// ============================================================================

/**
 * Project final score based on current pace
 *
 * @param currentScore - Current calculated score
 * @param elapsedMinutes - Minutes elapsed in the contest
 * @param contestDuration - Total contest duration in hours
 * @returns Projected final score
 */
export function projectFinalScore(
  currentScore: number,
  elapsedMinutes: number,
  contestDuration: number,
): number {
  if (elapsedMinutes <= 0) {
    return 0;
  }

  const totalMinutes = contestDuration * 60;
  const projectionFactor = totalMinutes / elapsedMinutes;

  // Apply a dampening factor - rate typically decreases over time
  // Use a more conservative 0.85 factor for longer contests
  const dampeningFactor = contestDuration > 24 ? 0.8 : 0.85;

  return Math.round(currentScore * projectionFactor * dampeningFactor);
}

// ============================================================================
// Main Scoring Function
// ============================================================================

/**
 * Compute the full contest score summary
 *
 * Calculates final score using the appropriate score model:
 * - points_x_mults_per_band: Sum(bandPoints * bandMults) per band
 * - points_x_mults_total: totalPoints * totalMults
 * - field_day: totalPoints + bonuses (no multiplier multiplication)
 *
 * @param qsos - List of contest QSOs
 * @param contest - Contest definition with scoring rules
 * @param workedMults - Map of worked multipliers by type (type -> Set<value|band>)
 * @returns Complete score summary
 *
 * @example
 * ```ts
 * const workedMults = new Map([
 *   ["CQ_ZONE", new Set(["05|20m", "14|20m", "14|40m"])],
 *   ["DXCC", new Set(["K|20m", "DL|20m", "JA|20m"])]
 * ]);
 *
 * const summary = computeContestScore(qsos, cqwwContest, workedMults);
 * // Returns ScoreSummary with finalScore, breakdowns, rates, etc.
 * ```
 */
export function computeContestScore(
  qsos: ContestQSO[],
  contest: ContestDefinition,
  workedMults: Map<string, Set<string>>,
): ScoreSummary {
  const scoreModel = getEffectiveScoreModel(contest);

  // Initialize empty multiplier tracking
  const emptyMultsByType: Record<MultiplierType, number> = {
    DXCC: 0,
    CQ_ZONE: 0,
    ITU_ZONE: 0,
    STATE: 0,
    WPX_PREFIX: 0,
    GRID: 0,
    SECTION: 0,
    PROVINCE: 0,
    NONE: 0,
  };

  const emptyWorkedMults: Record<MultiplierType, string[]> = {
    DXCC: [],
    CQ_ZONE: [],
    ITU_ZONE: [],
    STATE: [],
    WPX_PREFIX: [],
    GRID: [],
    SECTION: [],
    PROVINCE: [],
    NONE: [],
  };

  // Compute basic breakdowns
  const byBand = computeBandBreakdown(qsos);
  const byMode = computeModeBreakdown(qsos);
  const hourlyRates = computeHourlyRates(qsos);

  // Calculate totals
  let totalPoints = 0;
  let totalDupes = 0;

  for (const qso of qsos) {
    if (qso.isDupe) {
      totalDupes++;
    } else {
      totalPoints += qso.points;
    }
  }

  // Process worked multipliers by type
  const multipliersByType = { ...emptyMultsByType };
  const workedMultipliers = { ...emptyWorkedMults };
  const multipliersByBand = new Map<string, number>();

  for (const [multType, values] of workedMults) {
    const type = multType as MultiplierType;
    if (type in multipliersByType) {
      multipliersByType[type] = values.size;

      // Extract unique values (without band suffix) for the workedMultipliers list
      const uniqueValues = new Set<string>();
      for (const value of values) {
        // Value might be "14|20m" for per-band, or just "14" for overall
        const basePart = value.split("|")[0];
        uniqueValues.add(basePart);

        // Track multipliers per band for per-band scoring
        if (value.includes("|")) {
          const band = value.split("|")[1];
          multipliersByBand.set(band, (multipliersByBand.get(band) || 0) + 1);
        }
      }
      workedMultipliers[type] = Array.from(uniqueValues).sort();
    }
  }

  // Calculate total multipliers
  let totalMultipliers = 0;
  for (const count of Object.values(multipliersByType)) {
    totalMultipliers += count;
  }

  // Update band breakdown with multiplier counts
  for (const bandBreakdown of byBand) {
    bandBreakdown.multipliers = multipliersByBand.get(bandBreakdown.band) || 0;
  }

  // Calculate final score based on score model
  let finalScore = 0;

  switch (scoreModel) {
    case "points_x_mults_per_band": {
      // CQWW style: Sum(bandPoints * bandMults) for each band
      for (const bandBreakdown of byBand) {
        const bandScore = bandBreakdown.points * bandBreakdown.multipliers;
        bandBreakdown.bandScore = bandScore;
        finalScore += bandScore;
      }
      break;
    }

    case "points_x_mults_total": {
      // Sweepstakes style: totalPoints * totalMults
      finalScore = totalPoints * totalMultipliers;
      break;
    }

    case "field_day": {
      // Field Day style: just points (bonuses would be added separately)
      finalScore = totalPoints;
      break;
    }

    default:
      finalScore = totalPoints * totalMultipliers;
  }

  // Calculate rates
  const currentRate = computeRunningRate(qsos, 10); // Last 10 minutes, extrapolated
  let bestHourRate = 0;
  let bestHour = 0;

  for (const hourData of hourlyRates) {
    if (hourData.qsoCount > bestHourRate) {
      bestHourRate = hourData.qsoCount;
      bestHour = hourData.hour;
    }
  }

  // Calculate elapsed time
  let elapsedMinutes = 0;
  if (qsos.length >= 2) {
    const sortedQsos = [...qsos].sort((a, b) => {
      const timeA = `${a.date}T${a.time.slice(0, 2)}:${a.time.slice(2)}:00Z`;
      const timeB = `${b.date}T${b.time.slice(0, 2)}:${b.time.slice(2)}:00Z`;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    const firstQso = parseQSODateTime(sortedQsos[0].date, sortedQsos[0].time);
    const lastQso = parseQSODateTime(
      sortedQsos[sortedQsos.length - 1].date,
      sortedQsos[sortedQsos.length - 1].time,
    );

    elapsedMinutes = Math.round(
      (lastQso.getTime() - firstQso.getTime()) / (60 * 1000),
    );
  }

  // Project final score
  const projectedScore =
    elapsedMinutes > 0
      ? projectFinalScore(finalScore, elapsedMinutes, contest.durationHours)
      : undefined;

  return {
    finalScore,
    totalPoints,
    totalMultipliers,
    totalQsos: qsos.length,
    totalDupes,
    scoreModel,
    byBand,
    byMode,
    multipliersByType,
    workedMultipliers,
    hourlyRates,
    currentRate,
    bestHourRate,
    bestHour,
    elapsedMinutes,
    projectedScore,
  };
}
