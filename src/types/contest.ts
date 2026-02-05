/**
 * Contest Types for Propulse
 * Types for ham radio contest definitions, sessions, and QSO logging
 *
 * vNext Schema (2026-02):
 * - Added DupeRule, MultiplierRule, ScoreModel for contest-correct scoring
 * - ContestDefinition extended with multiplierRules[], dupeRule, scoreModel
 * - Legacy fields (multiplierType, multiplierPerBand) kept for backward compatibility
 */

/**
 * Types of multipliers used in ham radio contests
 */
export type MultiplierType =
  | "DXCC" // DXCC entities (countries)
  | "CQ_ZONE" // CQ zones (1-40)
  | "ITU_ZONE" // ITU zones (1-90)
  | "STATE" // US states
  | "WPX_PREFIX" // WPX-style callsign prefixes
  | "GRID" // Maidenhead grid squares
  | "SECTION" // ARRL/RAC sections
  | "PROVINCE" // Canadian provinces
  | "COUNTY" // US county (for State QSO Parties)
  | "GRID_SQUARE" // 4-char Maidenhead grid (for VHF contests)
  | "NONE"; // No multipliers

// ============================================================================
// vNext Schema Types (Phase 0.1)
// ============================================================================

/**
 * Dupe checking rule configuration
 * Determines how duplicate QSOs are identified per contest rules
 *
 * @example CQWW: { perBand: true, perMode: false } - same call on different band is not dupe
 * @example Sweepstakes: { perBand: false, perMode: false } - same call anywhere is dupe
 * @example Field Day: { perBand: true, perMode: true } - same call on same band/mode is dupe
 */
export interface DupeRule {
  /** If true, dupes are checked per-band (same call on different band = not dupe) */
  perBand: boolean;
  /** If true, dupes are checked per-mode (same call/band but different mode = not dupe) */
  perMode: boolean;
}

/**
 * Multiplier rule configuration
 * Defines how multipliers are extracted and counted for a contest
 *
 * @example CQWW zone mult: { type: "CQ_ZONE", source: "exchange", perBand: true }
 * @example CQWW DXCC mult: { type: "DXCC", source: "callsign", perBand: true }
 * @example Sweepstakes section: { type: "SECTION", source: "exchange", perBand: false }
 */
export interface MultiplierRule {
  /** Type of multiplier to extract */
  type: MultiplierType;
  /** Where to extract the multiplier value from */
  source: "callsign" | "exchange";
  /** If true, multiplier counts per-band (same mult on different band = new mult) */
  perBand: boolean;
}

/**
 * Score calculation model
 * Defines how the final score is computed from QSO points and multipliers
 *
 * - "points_x_mults_per_band": CQWW style - Σ(bandPoints × bandMults)
 * - "points_x_mults_total": Sweepstakes style - totalPoints × totalMults
 * - "field_day": Field Day style - points + bonuses (no mult multiplication)
 * - "distance_based": Stew Perry style - points based on grid-to-grid distance
 */
export type ScoreModel =
  | "points_x_mults_per_band"
  | "points_x_mults_total"
  | "field_day"
  | "distance_based";

export function normalizeMultiplierType(value: string): MultiplierType {
  const normalized = value.trim().toUpperCase();
  switch (normalized) {
    case "DXCC":
    case "COUNTRY":
      return "DXCC";
    case "CQ_ZONE":
    case "CQZONE":
    case "ZONE":
      return "CQ_ZONE";
    case "ITU_ZONE":
    case "ITUZONE":
      return "ITU_ZONE";
    case "WPX_PREFIX":
    case "WPX":
    case "PREFIX":
      return "WPX_PREFIX";
    case "STATE":
      return "STATE";
    case "SECTION":
      return "SECTION";
    case "GRID":
      return "GRID";
    case "PROVINCE":
      return "PROVINCE";
    case "COUNTY":
      return "COUNTY";
    case "GRID_SQUARE":
      return "GRID_SQUARE";
    case "NONE":
      return "NONE";
    default:
      return "NONE";
  }
}

/**
 * Scoring mode for QSO points
 */
export type ScoringMode =
  | "fixed" // Fixed points per QSO
  | "distance" // Points based on distance
  | "zone" // Different points for same/different continent
  | "mixed"; // Mode-dependent scoring

/**
 * Exchange format for contests
 */
export interface ExchangeFormat {
  /** Template for sent exchange (e.g., "599 {serial}" or "59 {state}") */
  sent: string;
  /** Template for received exchange */
  received: string;
  /** Fields included in exchange */
  fields: (
    | "rst"
    | "serial"
    | "state"
    | "zone"
    | "name"
    | "grid"
    | "check"
    | "precedence"
    | "section"
    | "class"
    | "power"
    | "county"
    | "island_ref"
    | "age"
  )[];
}

/**
 * Contest category options
 */
export interface ContestCategories {
  operator: (
    | "single-op"
    | "multi-op"
    | "multi-single"
    | "multi-two"
    | "multi-multi"
    | "checklog"
  )[];
  band: (
    | "all"
    | "single"
    | "160m"
    | "80m"
    | "40m"
    | "20m"
    | "15m"
    | "10m"
    | "6m"
  )[];
  power: ("high" | "low" | "qrp")[];
  mode: ("cw" | "ssb" | "rtty" | "mixed" | "digital")[];
  assisted: ("assisted" | "non-assisted")[];
}

/**
 * Contest definition
 */
export interface ContestDefinition {
  /** Unique identifier for the contest */
  id: string;
  /** Full contest name */
  name: string;
  /** Sponsoring organization */
  sponsor: string;
  /** Typical months (1-12) when this contest runs */
  months: number[];
  /** Duration in hours */
  durationHours: number;

  // ---- vNext fields (preferred) ----

  /**
   * Multiplier rules for this contest (vNext)
   * Defines all multiplier types and how they're extracted
   * @example CQWW has two rules: zones from exchange + DXCC from callsign
   */
  multiplierRules?: MultiplierRule[];

  /**
   * Dupe checking rule (vNext)
   * Defines per-band and/or per-mode dupe checking
   */
  dupeRule?: DupeRule;

  /**
   * Score calculation model (vNext)
   * How to compute final score from points and multipliers
   */
  scoreModel?: ScoreModel;

  // ---- Legacy fields (kept for backward compatibility) ----

  /** @deprecated Use multiplierRules instead. Primary multiplier type used */
  multiplierType: MultiplierType;
  /** @deprecated Use multiplierRules[].perBand instead. Whether multipliers count per-band */
  multiplierPerBand: boolean;

  /** Scoring configuration */
  scoring: {
    mode: ScoringMode;
    /** Points for same continent QSO */
    sameContinent?: number;
    /** Points for different continent QSO */
    diffContinent?: number;
    /** Fixed points per QSO (if mode="fixed") */
    fixedPoints?: number;
    /** Mode-specific points */
    cwPoints?: number;
    ssbPoints?: number;
    digitalPoints?: number;
    /** Points for same country (some contests) */
    sameCountry?: number;
  };
  /** Exchange format */
  exchange: ExchangeFormat;
  /** Available categories */
  categories: ContestCategories;
  /** Cabrillo contest identifier */
  cabrilloId: string;
  /** Official contest rules URL */
  rulesUrl?: string;
  /** Brief description of the contest */
  description?: string;

  /**
   * Off-time rules for contests with limited operating hours
   * Defines maximum operating time within a longer contest window
   */
  offTimeRules?: {
    /** Maximum hours of operating allowed */
    maxOperatingHours: number;
    /** Total contest duration in hours */
    contestDurationHours: number;
    /** Minimum gap in minutes that counts as off-time */
    minOffTimePeriodMinutes: number;
  };

  /**
   * State code for state QSO party contests
   * Used to determine which county list to validate against
   */
  stateQsoParty?: string;
}

/**
 * Helper function to get effective dupe rule from contest definition
 * Uses vNext dupeRule if present, otherwise derives from legacy multiplierPerBand
 */
export function getEffectiveDupeRule(contest: ContestDefinition): DupeRule {
  if (contest.dupeRule) {
    return contest.dupeRule;
  }
  // Legacy fallback: per-band if multiplierPerBand, no per-mode
  return {
    perBand: contest.multiplierPerBand,
    perMode: false,
  };
}

/**
 * Helper function to get effective multiplier rules from contest definition
 * Uses vNext multiplierRules if present, otherwise derives from legacy fields
 */
export function getEffectiveMultiplierRules(
  contest: ContestDefinition,
): MultiplierRule[] {
  if (contest.multiplierRules && contest.multiplierRules.length > 0) {
    return contest.multiplierRules;
  }
  // Legacy fallback: create single rule from multiplierType/multiplierPerBand
  if (contest.multiplierType === "NONE") {
    return [];
  }
  return [
    {
      type: contest.multiplierType,
      // Legacy: zones come from exchange, DXCC/WPX from callsign, states from exchange
      source: [
        "CQ_ZONE",
        "ITU_ZONE",
        "STATE",
        "SECTION",
        "GRID",
        "COUNTY",
        "GRID_SQUARE",
      ].includes(contest.multiplierType)
        ? "exchange"
        : "callsign",
      perBand: contest.multiplierPerBand,
    },
  ];
}

/**
 * Helper function to get effective score model from contest definition
 * Uses vNext scoreModel if present, otherwise derives from scoring.mode
 */
export function getEffectiveScoreModel(contest: ContestDefinition): ScoreModel {
  if (contest.scoreModel) {
    return contest.scoreModel;
  }
  // Legacy fallback based on contest characteristics
  if (contest.id.includes("fd") || contest.id.includes("field-day")) {
    return "field_day";
  }
  // Per-band mults typically mean per-band scoring
  if (contest.multiplierPerBand) {
    return "points_x_mults_per_band";
  }
  return "points_x_mults_total";
}

/**
 * Active contest session state
 */
export interface ContestSession {
  /** Reference to contest definition ID */
  contestId: string;
  /** Session start time (ISO timestamp) */
  startTime: string;
  /** Session end time (ISO timestamp) */
  endTime?: string;
  /** Operator's exchange to send */
  myExchange: string;
  /** Operator's callsign for this contest */
  myCallsign: string;
  /** Selected categories for this session */
  categories: {
    operator: string;
    band: string;
    power: string;
    mode: string;
    assisted: string;
  };
  /** Current serial number */
  currentSerial: number;
  /** Total QSO count */
  qsoCount: number;
  /** Multiplier tracking */
  multipliers: {
    type: MultiplierType;
    /** List of worked multipliers (overall) */
    worked: string[];
    /** Band-specific multipliers if per-band counting */
    perBand?: Record<string, string[]>;
  };
  /** Total QSO points */
  totalPoints: number;
  /** Final score (points x multipliers) */
  score: number;
}

/**
 * QSO entry with contest-specific fields
 */
export interface ContestQSO {
  /** Unique QSO identifier */
  id: string;
  /** Worked station callsign */
  callsign: string;
  /** Operating frequency in kHz */
  frequency: number;
  /** Band designation (e.g., "20m") */
  band: string;
  /** Operating mode (CW, SSB, RTTY, etc.) */
  mode: string;
  /** QSO date (YYYY-MM-DD) */
  date: string;
  /** QSO time UTC (HHMM) */
  time: string;
  /** RST sent */
  rstSent: string;
  /** RST received */
  rstRcvd: string;
  /** Serial number sent (if applicable) */
  serialSent?: number;
  /** Serial number received (if applicable) */
  serialRcvd?: number;
  /** Full exchange sent */
  exchangeSent: string;
  /** Full exchange received */
  exchangeRcvd: string;
  /** Points earned for this QSO */
  points: number;
  /** Whether this QSO is a new multiplier */
  isMultiplier: boolean;
  /** The multiplier value if isMultiplier is true */
  multiplierValue?: string;
  /** Whether this is a duplicate QSO */
  isDupe: boolean;
  /** Operator's notes */
  notes?: string;
}

/**
 * Cabrillo log file header information
 */
export interface CabrilloHeader {
  /** Cabrillo version (usually "3.0") */
  version: string;
  /** Contest identifier */
  contest: string;
  /** Operator callsign */
  callsign: string;
  /** Category operator */
  categoryOperator: string;
  /** Category assisted */
  categoryAssisted: string;
  /** Category band */
  categoryBand: string;
  /** Category mode */
  categoryMode: string;
  /** Category power */
  categoryPower: string;
  /** Category station (e.g., "FIXED", "PORTABLE") */
  categoryStation?: string;
  /** Category transmitter (e.g., "ONE", "TWO", "UNLIMITED") */
  categoryTransmitter?: string;
  /** Claimed score */
  claimedScore: number;
  /** Club affiliation */
  club?: string;
  /** Operator name(s) */
  operators?: string;
  /** Station location */
  location?: string;
  /** Soapbox comments */
  soapbox?: string[];
}

/**
 * Contest summary statistics
 */
export interface ContestSummary {
  /** Total valid QSOs */
  totalQsos: number;
  /** Duplicate QSOs */
  dupes: number;
  /** Total points from QSOs */
  totalPoints: number;
  /** Total unique multipliers */
  totalMultipliers: number;
  /** Final claimed score */
  finalScore: number;
  /** QSOs by band */
  qsosByBand: Record<string, number>;
  /** QSOs by mode */
  qsosByMode: Record<string, number>;
  /** Multipliers by band (if per-band) */
  multipliersByBand?: Record<string, number>;
  /** Hourly rate data */
  hourlyRates: { hour: number; qsos: number }[];
}

/**
 * Calculate contest score from points and multipliers
 */
export function calculateScore(points: number, multipliers: number): number {
  return points * multipliers;
}

/**
 * Format a contest time for Cabrillo (HHMM)
 */
export function formatCabrilloTime(date: Date): string {
  return date.toISOString().slice(11, 16).replace(":", "");
}

/**
 * Format a contest date for Cabrillo (YYYY-MM-DD)
 */
export function formatCabrilloDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Digital modes that use 3-digit RST (599) */
const DIGITAL_MODES = new Set([
  "CW",
  "RTTY",
  "DATA",
  "DIGITAL",
  "FT8",
  "FT4",
  "PSK31",
  "PSK63",
  "JS8",
  "JT65",
  "JT9",
  "MSK144",
  "OLIVIA",
  "CONTESTI",
  "MFSK",
]);

/**
 * Check if a mode uses 3-digit RST (CW/digital) vs 2-digit (phone)
 */
function isDigitalMode(mode: string): boolean {
  return DIGITAL_MODES.has(mode.toUpperCase().trim());
}

/**
 * Parse RST from string, handling CW/Digital (599) and Phone (59) formats
 */
export function parseRST(
  rst: string,
  mode: string,
): { r: number; s: number; t?: number } {
  const normalizedMode = mode.toUpperCase().trim();
  const digits = rst.replace(/\D/g, "");

  if (isDigitalMode(normalizedMode)) {
    return {
      r: parseInt(digits[0] || "5", 10),
      s: parseInt(digits[1] || "9", 10),
      t: parseInt(digits[2] || "9", 10),
    };
  }
  return {
    r: parseInt(digits[0] || "5", 10),
    s: parseInt(digits[1] || "9", 10),
  };
}

/**
 * Get default RST for a mode
 */
export function getDefaultRST(mode: string): string {
  const normalizedMode = mode.toUpperCase().trim();
  if (isDigitalMode(normalizedMode)) {
    return "599";
  }
  return "59";
}
