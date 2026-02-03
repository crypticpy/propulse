/**
 * Contest Engine
 *
 * Stable API surface for contest QSO processing including:
 * - Input normalization (callsign, band, mode)
 * - One-line entry parsing
 * - QSO validation
 * - Duplicate detection
 * - Multiplier extraction
 * - Score computation
 *
 * @module lib/contest
 */

import type {
  ContestDefinition,
  ContestSession,
  ContestQSO,
} from "@/types/contest";

import type { ParsedEntry, ContestContext, ScoreSummary } from "./types";
import { computeContestScore as computeContestScoreImpl } from "./scoring";

// Re-export all types from this module
export * from "./types";

// Import and re-export from parsing engine
export {
  parseOneLineEntry,
  normalizeRST,
  isValidCallsign,
  tokenizeInput,
} from "./parsing";

// Import and re-export from validation engine
export {
  validateQSO,
  validateZone,
  validateSection,
  validateFieldDayClass,
  validatePrecedence,
  validateCheck,
  validateState,
  validateSerial,
  ARRL_RAC_SECTIONS,
  US_STATES,
  SWEEPSTAKES_PRECEDENCE,
} from "./validation";

// Import and re-export from dupe checking engine
export { computeDupeStatus, generateDupeKey, isDupeInLog } from "./dupes";

// Import and re-export from multiplier extraction engine
export {
  extractMultipliers,
  extractMultiplierValue,
  isNewMultiplier,
  markNewMultipliers,
  addToWorkedMults,
  countTotalMultipliers,
  generateMultKey,
} from "./multipliers";

// Import and re-export from scoring engine
export {
  computeContestScore,
  computeQSOPoints,
  computeRunningRate,
  computeHourlyRates,
  computeBandBreakdown,
  computeModeBreakdown,
  projectFinalScore,
} from "./scoring";

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize a callsign to standard format
 *
 * - Converts to uppercase
 * - Trims whitespace
 * - Removes invalid characters (future enhancement)
 *
 * @param callsign - Raw callsign input
 * @returns Normalized callsign
 *
 * @example
 * normalizeCallsign("  w1aw  ") // Returns "W1AW"
 * normalizeCallsign("W1AW/P") // Returns "W1AW/P"
 */
export function normalizeCallsign(callsign: string): string {
  return callsign.trim().toUpperCase();
}

/**
 * Normalize a band designation to standard format
 *
 * Standardizes various band representations to canonical form (e.g., "20m").
 * Handles inputs like "14", "14MHz", "14000", "20", "20m", etc.
 *
 * @param band - Raw band input
 * @returns Normalized band (e.g., "20m", "40m", "80m")
 *
 * @example
 * normalizeBand("20") // Returns "20m"
 * normalizeBand("14MHz") // Returns "20m"
 * normalizeBand("14000") // Returns "20m" (frequency in kHz)
 */
export function normalizeBand(band: string): string {
  const cleaned = band.trim().toLowerCase();

  // If already in standard format (e.g., "20m")
  if (/^\d+m$/.test(cleaned)) {
    return cleaned;
  }

  // Map common variations
  const bandMap: Record<string, string> = {
    // Frequency-based (MHz)
    "1.8": "160m",
    "3.5": "80m",
    "7": "40m",
    "14": "20m",
    "21": "15m",
    "28": "10m",
    "50": "6m",
    "144": "2m",
    "432": "70cm",
    // Frequency-based (kHz) - rough mapping
    "1800": "160m",
    "3500": "80m",
    "7000": "40m",
    "14000": "20m",
    "21000": "15m",
    "28000": "10m",
    "50000": "6m",
    // Meter-based without suffix
    "160": "160m",
    "80": "80m",
    "40": "40m",
    "20": "20m",
    "15": "15m",
    "10": "10m",
    "6": "6m",
    "2": "2m",
  };

  // Remove common suffixes and look up
  const numericPart = cleaned.replace(/[mhz\s]/gi, "");
  return bandMap[numericPart] || cleaned;
}

/**
 * Normalize a mode to standard format
 *
 * Standardizes mode to one of: CW, SSB, DIGITAL
 * Maps various digital modes to "DIGITAL" for contest purposes.
 *
 * @param mode - Raw mode input
 * @returns Normalized mode (CW, SSB, or DIGITAL)
 *
 * @example
 * normalizeMode("cw") // Returns "CW"
 * normalizeMode("FT8") // Returns "DIGITAL"
 * normalizeMode("phone") // Returns "SSB"
 */
export function normalizeMode(mode: string): string {
  const cleaned = mode.trim().toUpperCase();

  // Phone modes -> SSB
  const phoneModes = new Set(["SSB", "USB", "LSB", "PHONE", "AM", "FM"]);
  if (phoneModes.has(cleaned)) {
    return "SSB";
  }

  // CW stays CW
  if (cleaned === "CW") {
    return "CW";
  }

  // Digital modes -> DIGITAL
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

  // Unknown mode - return as-is but uppercased
  return cleaned;
}

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Compute the full score summary for a contest session
 *
 * Calculates:
 * - Final score using contest ScoreModel
 * - Band and mode breakdowns
 * - Multiplier counts by type
 * - Hourly rates and projections
 *
 * @param session - Contest session with QSOs (requires qsos array)
 * @param contest - Contest definition with scoring rules
 * @param qsos - Array of contest QSOs to score
 * @param workedMults - Map of worked multipliers by type
 * @returns Complete score summary
 */
export function computeScore(
  session: ContestSession,
  contest: ContestDefinition,
  qsos: ContestQSO[] = [],
  workedMults: Map<string, Set<string>> = new Map(),
): ScoreSummary {
  void session; // Session info may be used for elapsed time calculation in future
  return computeContestScoreImpl(qsos, contest, workedMults);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an empty ContestContext for testing/initialization
 *
 * @param session - Contest session
 * @param contest - Contest definition
 * @returns Empty contest context
 */
export function createEmptyContext(
  session: ContestSession,
  contest: ContestDefinition,
): ContestContext {
  return {
    session,
    contest,
    workedCallsigns: new Set(),
    workedByBand: new Map(),
    workedByBandMode: new Map(),
    workedMultipliers: new Map(),
    workedMultipliersByBand: new Map(),
    qsos: [],
  };
}

/**
 * Create a default ParsedEntry for error cases
 *
 * @param rawInput - Original input string
 * @returns ParsedEntry with error state
 */
export function createEmptyParsedEntry(rawInput: string): ParsedEntry {
  return {
    callsign: "",
    rstReceived: "",
    exchangeTokens: [],
    exchangeReceived: "",
    parsedFields: {},
    errors: [],
    warnings: [],
    rawInput,
  };
}
