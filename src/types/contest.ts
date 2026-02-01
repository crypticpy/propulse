/**
 * Contest Types for Propulse
 * Types for ham radio contest definitions, sessions, and QSO logging
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
  | "NONE"; // No multipliers

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
  /** Multiplier type used */
  multiplierType: MultiplierType;
  /** Whether multipliers count per-band or overall */
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
