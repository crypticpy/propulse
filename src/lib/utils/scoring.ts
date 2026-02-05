/**
 * Ham Radio Contest Scoring Utilities
 *
 * Provides functions for calculating QSO points, checking for duplicates,
 * computing total contest scores, and QSO rates.
 *
 * Works with the multiplier utilities to provide complete contest scoring.
 */

import {
  getDXCCEntity,
  getCQZone,
  getITUZone,
  getWPXPrefix,
  getUSState,
  getCanadianProvince,
  getContinent,
  type Continent,
} from "./multipliers";
import { normalizeMultiplierType, type MultiplierType } from "@/types/contest";

// ============================================================================
// Types
// ============================================================================

// MultiplierType is canonicalized in src/types/contest.ts

/**
 * Contest QSO record
 */
export interface ContestQSO {
  /** Unique QSO identifier */
  id: string;
  /** Worked station callsign */
  callsign: string;
  /** Operating band (e.g., "20m", "40m") */
  band: string;
  /** Operating mode (e.g., "CW", "SSB", "FT8") */
  mode: string;
  /** UTC timestamp of QSO */
  timestamp: string;
  /** RST sent */
  rstSent: string;
  /** RST received */
  rstReceived: string;
  /** Exchange sent */
  exchangeSent: string;
  /** Exchange received */
  exchangeReceived: string;
  /** Frequency in kHz (optional) */
  frequency?: number;
  /** Grid square if known */
  grid?: string;
  /** Calculated QSO points */
  points?: number;
  /** Is this QSO a dupe? */
  isDupe?: boolean;
  /** Multiplier value(s) from this QSO */
  multipliers?: string[];
  /** Notes */
  notes?: string;
}

/**
 * Contest point rules configuration
 */
export interface ContestPointRules {
  /** Points per QSO with same country */
  sameCountry: number;
  /** Points per QSO with same continent */
  sameContinent: number;
  /** Points per QSO with different continent */
  differentContinent: number;
  /** Points per phone QSO (if different from CW/digital) */
  phoneMultiplier?: number;
  /** Whether to count QSOs differently by mode */
  modeAware?: boolean;
  /** Bonus points for specific conditions */
  bonuses?: {
    /** Bonus for working new DXCC */
    newDXCC?: number;
    /** Bonus for working new zone */
    newZone?: number;
  };
}

/**
 * Contest definition for scoring
 */
export interface ContestDefinition {
  /** Contest identifier */
  id: string;
  /** Contest name */
  name: string;
  /** Point calculation rules */
  pointRules: ContestPointRules;
  /** Multiplier type(s) used */
  multiplierTypes: MultiplierType[];
  /** Is dupe checking per-band? */
  dupeCheckPerBand: boolean;
  /** Is dupe checking per-mode? */
  dupeCheckPerMode: boolean;
  /** My station's DXCC entity (for point calculation) */
  myDXCC?: string;
  /** My station's continent */
  myContinent?: Continent;
  /** My station's CQ zone */
  myCQZone?: number;
  /** Allowed bands */
  bands?: string[];
  /** Allowed modes */
  modes?: string[];
}

/**
 * Contest session with accumulated data
 */
export interface ContestSession {
  /** Session identifier */
  id: string;
  /** Contest definition */
  contest: ContestDefinition;
  /** Logged QSOs */
  qsos: ContestQSO[];
  /** Session start time */
  startTime: string;
  /** Session end time (if ended) */
  endTime?: string;
  /** My callsign for this session */
  myCallsign: string;
  /** My grid square */
  myGrid?: string;
  /** Worked multipliers by type */
  workedMultipliers: Record<MultiplierType, Set<string>>;
  /** Worked callsigns for dupe checking */
  workedCallsigns: Map<string, ContestQSO>;
}

/**
 * Score summary
 */
export interface ScoreSummary {
  /** Total QSO points */
  qsoPoints: number;
  /** Total unique multipliers */
  multiplierCount: number;
  /** Calculated total score */
  totalScore: number;
  /** QSO count */
  qsoCount: number;
  /** Dupe count */
  dupeCount: number;
  /** Breakdown by multiplier type */
  multiplierBreakdown: Record<MultiplierType, number>;
  /** Breakdown by band */
  bandBreakdown: Record<string, { qsos: number; points: number }>;
  /** Breakdown by mode */
  modeBreakdown: Record<string, { qsos: number; points: number }>;
}

// ============================================================================
// Common Contest Definitions
// ============================================================================

/**
 * Predefined contest point rules
 */
export const CONTEST_RULES: Record<string, ContestPointRules> = {
  // CQ World Wide DX Contest
  CQ_WW: {
    sameCountry: 0,
    sameContinent: 1, // 2 for phone
    differentContinent: 3,
    modeAware: true,
  },
  // CQ WPX Contest
  CQ_WPX: {
    sameCountry: 1,
    sameContinent: 1, // same continent, different country
    differentContinent: 3, // 6 on low bands
    modeAware: true,
  },
  // ARRL DX Contest
  ARRL_DX: {
    sameCountry: 0,
    sameContinent: 3, // W/VE stations work DX
    differentContinent: 3,
  },
  // ARRL Field Day
  FIELD_DAY: {
    sameCountry: 1,
    sameContinent: 1,
    differentContinent: 1,
    phoneMultiplier: 1,
    modeAware: true,
  },
  // IARU HF Championship
  IARU: {
    sameCountry: 1,
    sameContinent: 1,
    differentContinent: 3,
  },
  // Generic DX contest
  GENERIC_DX: {
    sameCountry: 0,
    sameContinent: 1,
    differentContinent: 2,
  },
};

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Calculate QSO points based on contest rules
 *
 * @param qso - The QSO to calculate points for
 * @param contest - Contest definition with rules
 * @param myContinent - My station's continent
 * @returns Number of points for this QSO
 *
 * @example
 * ```ts
 * const points = calculateQSOPoints(qso, contest, "NA");
 * // Returns 3 for DX contact in CQ WW
 * ```
 */
export function calculateQSOPoints(
  qso: ContestQSO,
  contest: ContestDefinition,
  myContinent: Continent,
): number {
  const rules = contest.pointRules;

  // Check if this is a dupe
  if (qso.isDupe) {
    return 0;
  }

  // Get the worked station's info
  const workedContinent = getContinent(qso.callsign);
  const workedDXCC = getDXCCEntity(qso.callsign);

  // Same country check
  if (contest.myDXCC && workedDXCC?.entity === contest.myDXCC) {
    return rules.sameCountry;
  }

  // Continent-based scoring
  if (!workedContinent) {
    // Unknown continent - use different continent points
    return rules.differentContinent;
  }

  if (workedContinent === myContinent) {
    let points = rules.sameContinent;

    // Some contests give different points for phone vs CW
    if (rules.modeAware && rules.phoneMultiplier && isPhoneMode(qso.mode)) {
      points = Math.floor(points * rules.phoneMultiplier);
    }

    return points;
  }

  // Different continent
  let points = rules.differentContinent;

  // Some contests have different points for low bands
  if (isLowBand(qso.band) && contest.id.includes("WPX")) {
    points = 6;
  }

  return points;
}

/**
 * Check if a QSO is a duplicate
 *
 * @param callsign - Callsign to check
 * @param band - Operating band
 * @param mode - Operating mode
 * @param workedLog - Array of already-worked QSOs
 * @param perBand - Check dupes per-band (default true)
 * @param perMode - Check dupes per-mode (default false)
 * @returns True if this is a dupe
 *
 * @example
 * ```ts
 * const isDupe = isDupeQSO("W1ABC", "20m", "CW", workedQSOs);
 * ```
 */
export function isDupeQSO(
  callsign: string,
  band: string,
  mode: string,
  workedLog: ContestQSO[],
  perBand: boolean = true,
  perMode: boolean = false,
): boolean {
  const normalizedCall = callsign.toUpperCase().trim();
  const normalizedBand = normalizeBand(band);
  const normalizedMode = normalizeMode(mode);

  for (const qso of workedLog) {
    // Skip duped QSOs in the log (don't double-count)
    if (qso.isDupe) {
      continue;
    }

    const logCall = qso.callsign.toUpperCase().trim();
    if (logCall !== normalizedCall) {
      continue;
    }

    // Check band if required
    if (perBand) {
      const logBand = normalizeBand(qso.band);
      if (logBand !== normalizedBand) {
        continue;
      }
    }

    // Check mode if required
    if (perMode) {
      const logMode = normalizeMode(qso.mode);
      if (logMode !== normalizedMode) {
        continue;
      }
    }

    // Match found - it's a dupe
    return true;
  }

  return false;
}

/**
 * Calculate total contest score
 *
 * @param session - Contest session with all QSOs
 * @returns Score summary with breakdown
 *
 * @example
 * ```ts
 * const score = calculateContestScore(session);
 * console.log(`Total: ${score.totalScore} = ${score.qsoPoints} × ${score.multiplierCount}`);
 * ```
 */
export function calculateContestScore(session: ContestSession): ScoreSummary {
  const { contest, qsos } = session;

  // Initialize tracking
  const workedMults: Record<MultiplierType, Set<string>> = {
    DXCC: new Set(),
    CQ_ZONE: new Set(),
    ITU_ZONE: new Set(),
    WPX_PREFIX: new Set(),
    STATE: new Set(),
    SECTION: new Set(),
    GRID: new Set(),
    PROVINCE: new Set(),
    COUNTY: new Set(),
    GRID_SQUARE: new Set(),
    NONE: new Set(),
  };

  const bandBreakdown: Record<string, { qsos: number; points: number }> = {};
  const modeBreakdown: Record<string, { qsos: number; points: number }> = {};

  let qsoPoints = 0;
  let dupeCount = 0;
  let qsoCount = 0;

  const myContinent = contest.myContinent || "NA";

  for (const qso of qsos) {
    // Count dupes
    if (qso.isDupe) {
      dupeCount++;
      continue;
    }

    qsoCount++;

    // Calculate points
    const points = qso.points ?? calculateQSOPoints(qso, contest, myContinent);
    qsoPoints += points;

    // Track band breakdown
    const band = normalizeBand(qso.band);
    if (!bandBreakdown[band]) {
      bandBreakdown[band] = { qsos: 0, points: 0 };
    }
    bandBreakdown[band].qsos++;
    bandBreakdown[band].points += points;

    // Track mode breakdown
    const mode = normalizeMode(qso.mode);
    if (!modeBreakdown[mode]) {
      modeBreakdown[mode] = { qsos: 0, points: 0 };
    }
    modeBreakdown[mode].qsos++;
    modeBreakdown[mode].points += points;

    // Track multipliers
    for (const multType of contest.multiplierTypes) {
      const multValue = getMultiplierValue(qso, multType);
      if (multValue) {
        // For per-band multipliers, include band in key
        const multKey = contest.dupeCheckPerBand
          ? `${band}:${multValue}`
          : multValue;
        workedMults[multType].add(multKey);
      }
    }
  }

  // Calculate total multipliers
  let multiplierCount = 0;
  const multiplierBreakdown: Record<MultiplierType, number> = {
    DXCC: 0,
    CQ_ZONE: 0,
    ITU_ZONE: 0,
    WPX_PREFIX: 0,
    STATE: 0,
    SECTION: 0,
    GRID: 0,
    PROVINCE: 0,
    COUNTY: 0,
    GRID_SQUARE: 0,
    NONE: 0,
  };

  for (const multType of contest.multiplierTypes) {
    const count = workedMults[multType].size;
    multiplierBreakdown[multType] = count;
    multiplierCount += count;
  }

  // Calculate total score
  const totalScore = qsoPoints * multiplierCount;

  return {
    qsoPoints,
    multiplierCount,
    totalScore,
    qsoCount,
    dupeCount,
    multiplierBreakdown,
    bandBreakdown,
    modeBreakdown,
  };
}

/**
 * Calculate QSO rate (QSOs per hour)
 *
 * @param qsoCount - Number of QSOs
 * @param startTime - Session start time (ISO string)
 * @param endTime - Session end time (ISO string, optional - defaults to now)
 * @returns QSOs per hour
 *
 * @example
 * ```ts
 * const rate = calculateQSORate(60, "2024-01-15T14:00:00Z", "2024-01-15T15:00:00Z");
 * // Returns 60 (one QSO per minute)
 * ```
 */
export function calculateQSORate(
  qsoCount: number,
  startTime: string,
  endTime?: string,
): number {
  if (qsoCount === 0) {
    return 0;
  }

  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();

  const hoursElapsed = (end - start) / (1000 * 60 * 60);

  if (hoursElapsed <= 0) {
    return 0;
  }

  return Math.round((qsoCount / hoursElapsed) * 10) / 10;
}

/**
 * Calculate running rate (last N minutes)
 *
 * @param qsos - Array of QSOs
 * @param windowMinutes - Time window in minutes (default 60)
 * @returns QSOs per hour in the time window
 */
export function calculateRunningRate(
  qsos: ContestQSO[],
  windowMinutes: number = 60,
): number {
  if (qsos.length === 0) {
    return 0;
  }

  const now = Date.now();
  const windowStart = now - windowMinutes * 60 * 1000;

  // Count QSOs in the window
  const recentQSOs = qsos.filter((qso) => {
    const qsoTime = new Date(qso.timestamp).getTime();
    return qsoTime >= windowStart && !qso.isDupe;
  });

  // Calculate hourly rate
  const hoursInWindow = windowMinutes / 60;
  return Math.round((recentQSOs.length / hoursInWindow) * 10) / 10;
}

/**
 * Get multiplier value from QSO based on multiplier type
 *
 * @param qso - The QSO to extract multiplier from
 * @param multiplierType - Type of multiplier to extract
 * @returns Multiplier value or null
 *
 * @example
 * ```ts
 * const mult = getMultiplierValue(qso, "DXCC");
 * // Returns "Germany" for DL callsign
 * ```
 */
export function getMultiplierValue(
  qso: ContestQSO,
  multiplierType: MultiplierType,
): string | null {
  switch (multiplierType) {
    case "DXCC": {
      const dxcc = getDXCCEntity(qso.callsign);
      return dxcc?.entity || null;
    }

    case "CQ_ZONE": {
      const zone = getCQZone(qso.callsign);
      return zone ? zone.toString() : null;
    }

    case "ITU_ZONE": {
      const zone = getITUZone(qso.callsign);
      return zone ? zone.toString() : null;
    }

    case "WPX_PREFIX": {
      return getWPXPrefix(qso.callsign) || null;
    }

    case "STATE": {
      // Try exchange first, then callsign
      return (
        getUSState(qso.exchangeReceived) || getUSState(qso.callsign) || null
      );
    }

    case "PROVINCE": {
      return (
        getCanadianProvince(qso.exchangeReceived) ||
        getCanadianProvince(qso.callsign) ||
        null
      );
    }

    case "SECTION": {
      // ARRL/RAC section from exchange
      return extractSection(qso.exchangeReceived);
    }

    case "GRID": {
      // Grid square from QSO or exchange
      return qso.grid || extractGrid(qso.exchangeReceived);
    }

    default:
      return null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if mode is a phone mode (SSB, FM, AM)
 */
function isPhoneMode(mode: string): boolean {
  const phoneTypes = ["SSB", "USB", "LSB", "FM", "AM", "PHONE"];
  return phoneTypes.includes(mode.toUpperCase());
}

/**
 * Check if band is a low band (160m, 80m, 40m)
 */
function isLowBand(band: string): boolean {
  const lowBands = ["160M", "80M", "40M", "160", "80", "40"];
  return lowBands.includes(band.toUpperCase().replace(/\s/g, ""));
}

/**
 * Normalize band string for comparison
 */
function normalizeBand(band: string): string {
  // Remove spaces and convert to uppercase
  let normalized = band.toUpperCase().replace(/\s/g, "");

  // Add 'm' suffix if just a number
  if (/^\d+$/.test(normalized)) {
    normalized += "M";
  }

  // Standardize common variations
  const bandMap: Record<string, string> = {
    "1.8MHZ": "160M",
    "3.5MHZ": "80M",
    "7MHZ": "40M",
    "10MHZ": "30M",
    "14MHZ": "20M",
    "18MHZ": "17M",
    "21MHZ": "15M",
    "24MHZ": "12M",
    "28MHZ": "10M",
    "50MHZ": "6M",
    "144MHZ": "2M",
    "430MHZ": "70CM",
    "432MHZ": "70CM",
  };

  return bandMap[normalized] || normalized;
}

/**
 * Normalize mode string for comparison
 */
function normalizeMode(mode: string): string {
  const normalized = mode.toUpperCase().trim();

  // Group phone modes
  if (["SSB", "USB", "LSB", "AM", "FM"].includes(normalized)) {
    return "PHONE";
  }

  // Group digital modes
  if (
    ["FT8", "FT4", "RTTY", "PSK31", "JS8", "JT65", "JT9"].includes(normalized)
  ) {
    return "DIGITAL";
  }

  // CW stays as CW
  if (normalized === "CW") {
    return "CW";
  }

  return normalized;
}

/**
 * Extract ARRL section from exchange
 */
function extractSection(exchange: string): string | null {
  if (!exchange) {
    return null;
  }

  // Common ARRL/RAC sections
  const sections = [
    // US Sections
    "CT",
    "EMA",
    "ME",
    "NH",
    "RI",
    "VT",
    "WMA",
    "ENY",
    "NLI",
    "NNJ",
    "NNY",
    "SNJ",
    "WNY",
    "DE",
    "EPA",
    "MDC",
    "WPA",
    "AL",
    "GA",
    "KY",
    "NC",
    "NFL",
    "SC",
    "SFL",
    "TN",
    "VA",
    "WCF",
    "PR",
    "VI",
    "AR",
    "LA",
    "MS",
    "NM",
    "NTX",
    "OK",
    "STX",
    "WTX",
    "EB",
    "LAX",
    "ORG",
    "PAC",
    "SB",
    "SCV",
    "SDG",
    "SF",
    "SJV",
    "SV",
    "AZ",
    "EWA",
    "ID",
    "MT",
    "NV",
    "OR",
    "UT",
    "WWA",
    "WY",
    "AK",
    "IA",
    "KS",
    "MN",
    "MO",
    "NE",
    "ND",
    "SD",
    "IL",
    "IN",
    "WI",
    "CO",
    "MI",
    "OH",
    "WV",
    // Canadian Sections
    "MAR",
    "QC",
    "ONE",
    "ONN",
    "ONS",
    "GTA",
    "MB",
    "SK",
    "AB",
    "BC",
    "NT",
    "YT",
  ];

  const upper = exchange.toUpperCase().trim();

  // Check for exact match or embedded section
  for (const section of sections) {
    if (
      upper === section ||
      upper.includes(` ${section} `) ||
      upper.startsWith(`${section} `) ||
      upper.endsWith(` ${section}`)
    ) {
      return section;
    }
  }

  // Try to extract from format like "A 123 CT"
  const parts = upper.split(/\s+/);
  for (const part of parts) {
    if (sections.includes(part)) {
      return part;
    }
  }

  return null;
}

/**
 * Extract grid square from exchange
 */
function extractGrid(exchange: string): string | null {
  if (!exchange) {
    return null;
  }

  // Grid format: 2 letters + 2 digits + optional 2 letters
  const gridMatch = exchange.match(/\b([A-R]{2}[0-9]{2}([A-X]{2})?)\b/i);
  return gridMatch ? gridMatch[1].toUpperCase() : null;
}

// ============================================================================
// Session Management Helpers
// ============================================================================

/**
 * Create a new contest session
 *
 * @param contest - Contest definition
 * @param myCallsign - Operator's callsign
 * @param myGrid - Operator's grid square
 * @returns New contest session
 */
export function createContestSession(
  contest: ContestDefinition,
  myCallsign: string,
  myGrid?: string,
): ContestSession {
  return {
    id: `session-${Date.now()}`,
    contest,
    qsos: [],
    startTime: new Date().toISOString(),
    myCallsign,
    myGrid,
    workedMultipliers: {
      DXCC: new Set(),
      CQ_ZONE: new Set(),
      ITU_ZONE: new Set(),
      WPX_PREFIX: new Set(),
      STATE: new Set(),
      SECTION: new Set(),
      GRID: new Set(),
      PROVINCE: new Set(),
      COUNTY: new Set(),
      GRID_SQUARE: new Set(),
      NONE: new Set(),
    },
    workedCallsigns: new Map(),
  };
}

/**
 * Add a QSO to a contest session
 *
 * @param session - Current session
 * @param qso - QSO to add
 * @returns Updated session with calculated points and dupe check
 */
export function addQSOToSession(
  session: ContestSession,
  qso: ContestQSO,
): ContestSession {
  const { contest } = session;

  // Check for dupe
  const isDupe = isDupeQSO(
    qso.callsign,
    qso.band,
    qso.mode,
    session.qsos,
    contest.dupeCheckPerBand,
    contest.dupeCheckPerMode,
  );

  // Calculate points
  const myContinent = contest.myContinent || "NA";
  const points = isDupe ? 0 : calculateQSOPoints(qso, contest, myContinent);

  // Extract multipliers
  const multipliers: string[] = [];
  for (const multType of contest.multiplierTypes) {
    const multValue = getMultiplierValue(qso, multType);
    if (multValue) {
      multipliers.push(multValue);

      // Track new multipliers
      if (!isDupe) {
        const band = normalizeBand(qso.band);
        const multKey = contest.dupeCheckPerBand
          ? `${band}:${multValue}`
          : multValue;
        session.workedMultipliers[multType].add(multKey);
      }
    }
  }

  // Create updated QSO
  const updatedQSO: ContestQSO = {
    ...qso,
    isDupe,
    points,
    multipliers,
  };

  // Update session
  return {
    ...session,
    qsos: [...session.qsos, updatedQSO],
  };
}

/**
 * Get statistics about new multipliers in a QSO
 *
 * @param session - Current session
 * @param qso - QSO to check
 * @returns Object indicating which multiplier types are new
 */
export function getNewMultipliers(
  session: ContestSession,
  qso: ContestQSO,
): Record<MultiplierType, boolean> {
  const { contest } = session;
  const result: Record<MultiplierType, boolean> = {
    DXCC: false,
    CQ_ZONE: false,
    ITU_ZONE: false,
    WPX_PREFIX: false,
    STATE: false,
    SECTION: false,
    GRID: false,
    PROVINCE: false,
    COUNTY: false,
    GRID_SQUARE: false,
    NONE: false,
  };

  const band = normalizeBand(qso.band);

  for (const multType of contest.multiplierTypes) {
    const multValue = getMultiplierValue(qso, multType);
    if (multValue) {
      const multKey = contest.dupeCheckPerBand
        ? `${band}:${multValue}`
        : multValue;

      if (!session.workedMultipliers[multType].has(multKey)) {
        result[multType] = true;
      }
    }
  }

  return result;
}

/**
 * Check if a potential QSO would be valuable (new mult, high points, etc.)
 *
 * @param session - Current session
 * @param callsign - Callsign to evaluate
 * @param band - Band
 * @param mode - Mode
 * @returns Value assessment
 */
export function evaluateQSOValue(
  session: ContestSession,
  callsign: string,
  band: string,
  mode: string,
): {
  isDupe: boolean;
  potentialPoints: number;
  newMultipliers: MultiplierType[];
  priority: "high" | "medium" | "low";
} {
  const { contest } = session;

  // Check dupe status
  const isDupe = isDupeQSO(
    callsign,
    band,
    mode,
    session.qsos,
    contest.dupeCheckPerBand,
    contest.dupeCheckPerMode,
  );

  if (isDupe) {
    return {
      isDupe: true,
      potentialPoints: 0,
      newMultipliers: [],
      priority: "low",
    };
  }

  // Create a mock QSO to calculate potential value
  const mockQSO: ContestQSO = {
    id: "mock",
    callsign,
    band,
    mode,
    timestamp: new Date().toISOString(),
    rstSent: "599",
    rstReceived: "599",
    exchangeSent: "",
    exchangeReceived: "",
  };

  // Calculate potential points
  const myContinent = contest.myContinent || "NA";
  const potentialPoints = calculateQSOPoints(mockQSO, contest, myContinent);

  // Check for new multipliers
  const newMults = getNewMultipliers(session, mockQSO);
  const newMultipliers: MultiplierType[] = [];
  for (const [type, isNew] of Object.entries(newMults)) {
    if (isNew) {
      newMultipliers.push(normalizeMultiplierType(type));
    }
  }

  // Determine priority
  let priority: "high" | "medium" | "low" = "low";
  if (newMultipliers.length > 0) {
    priority = "high";
  } else if (potentialPoints >= 3) {
    priority = "medium";
  }

  return {
    isDupe: false,
    potentialPoints,
    newMultipliers,
    priority,
  };
}
