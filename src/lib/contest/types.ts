/**
 * Contest Engine Types
 *
 * Engine-specific types for contest QSO parsing, validation, scoring, and duplicate checking.
 * These types support the contest engine's internal processing pipeline.
 *
 * @module lib/contest/types
 */

import type {
  ContestDefinition,
  ContestSession,
  ContestQSO,
  MultiplierType,
  MultiplierRule,
  ScoreModel,
} from "@/types/contest";

// ============================================================================
// Parsing Types
// ============================================================================

/**
 * Result of parsing a one-line contest entry
 *
 * The parser extracts callsign, RST, and exchange fields from user input.
 * Parsing is lenient - it captures what it can and reports issues separately.
 *
 * @example
 * Input: "W1AW 599 05" for CQWW
 * Result: { callsign: "W1AW", rstReceived: "599", exchangeTokens: ["05"], ... }
 */
export interface ParsedEntry {
  /** Parsed callsign (normalized to uppercase) */
  callsign: string;

  /** RST received (e.g., "599" for CW, "59" for phone) */
  rstReceived: string;

  /** Raw exchange tokens as parsed (before field mapping) */
  exchangeTokens: string[];

  /** Full exchange string as received */
  exchangeReceived: string;

  /**
   * Parsed exchange fields mapped by field name
   * Keys match ContestDefinition.exchange.fields (e.g., "zone", "serial", "state")
   */
  parsedFields: Record<string, string>;

  /** Parsing errors that prevent valid QSO creation */
  errors: ParseIssue[];

  /** Parsing warnings that don't prevent QSO creation but may need attention */
  warnings: ParseIssue[];

  /** Original raw input string */
  rawInput: string;
}

/**
 * Issue encountered during parsing
 */
export interface ParseIssue {
  /** Field or token that caused the issue (e.g., "callsign", "zone", "token[2]") */
  field: string;

  /** Human-readable message describing the issue */
  message: string;

  /** Machine-readable error code for programmatic handling */
  code: ParseIssueCode;
}

/**
 * Error codes for parsing issues
 */
export type ParseIssueCode =
  | "MISSING_CALLSIGN"
  | "INVALID_CALLSIGN"
  | "MISSING_RST"
  | "INVALID_RST"
  | "MISSING_EXCHANGE"
  | "INVALID_EXCHANGE"
  | "INVALID_ZONE"
  | "INVALID_STATE"
  | "INVALID_SERIAL"
  | "AMBIGUOUS_FIELD"
  | "EXTRA_TOKENS"
  | "UNKNOWN";

// ============================================================================
// QSO Draft Types
// ============================================================================

/**
 * Draft QSO before logging
 *
 * Contains all fields needed to create a ContestQSO but hasn't been
 * persisted yet. Used for validation, dupe checking, and scoring preview.
 */
export interface ContestQSODraft {
  /** Worked station callsign (normalized) */
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

  /** Parsed exchange fields for validation */
  parsedExchange: Record<string, string>;

  /** Optional notes */
  notes?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Context for QSO validation
 *
 * Provides session state needed for validation (dupe checking, mult tracking).
 */
export interface ContestContext {
  /** Active contest session */
  session: ContestSession;

  /** Contest definition with rules */
  contest: ContestDefinition;

  /** Set of callsigns already worked (for quick dupe lookup) */
  workedCallsigns: Set<string>;

  /** Map of worked callsigns by band (band -> Set<callsign>) */
  workedByBand: Map<string, Set<string>>;

  /** Map of worked callsigns by band+mode (bandMode -> Set<callsign>) */
  workedByBandMode: Map<string, Set<string>>;

  /** Worked multipliers overall (mult value -> count) */
  workedMultipliers: Map<string, number>;

  /** Worked multipliers by band (band -> Set<mult value>) */
  workedMultipliersByBand: Map<string, Set<string>>;

  /** List of logged QSOs in this session */
  qsos: ContestQSO[];
}

/**
 * Result of QSO validation
 */
export interface ValidationResult {
  /** Whether the QSO is valid for logging */
  valid: boolean;

  /** Validation errors that prevent logging */
  errors: ValidationIssue[];

  /** Validation warnings that don't prevent logging */
  warnings: ValidationIssue[];
}

/**
 * Issue found during validation
 */
export interface ValidationIssue {
  /** Field that has the issue (e.g., "callsign", "exchange", "frequency") */
  field: string;

  /** Human-readable description of the issue */
  message: string;

  /** Machine-readable error code */
  code: ValidationIssueCode;
}

/**
 * Error codes for validation issues
 */
export type ValidationIssueCode =
  | "INVALID_CALLSIGN"
  | "INVALID_FREQUENCY"
  | "INVALID_BAND"
  | "INVALID_MODE"
  | "INVALID_RST"
  | "INVALID_EXCHANGE"
  | "INVALID_DATE"
  | "INVALID_TIME"
  | "MISSING_REQUIRED_FIELD"
  | "OUT_OF_BAND"
  | "OUT_OF_CONTEST_PERIOD"
  | "SELF_CALL"
  | "UNKNOWN";

// ============================================================================
// Dupe Checking Types
// ============================================================================

/**
 * Result of duplicate QSO check
 */
export interface DupeResult {
  /** Whether this QSO is a duplicate */
  isDupe: boolean;

  /**
   * Dupe key used for lookup
   * Format depends on contest rules:
   * - "contest": just callsign (e.g., "W1AW")
   * - "band": callsign-band (e.g., "W1AW-20m")
   * - "band_mode": callsign-band-mode (e.g., "W1AW-20m-CW")
   */
  dupeKey: string;

  /**
   * Reason why this is or isn't a dupe
   * - "contest": Contest-wide dupe (same call anywhere)
   * - "band": Same call on same band
   * - "band_mode": Same call on same band and mode
   */
  reason: "contest" | "band" | "band_mode";

  /** Reference to original QSO if this is a dupe */
  originalQsoId?: string;

  /** Timestamp of original QSO if this is a dupe */
  originalQsoTime?: string;
}

// ============================================================================
// Multiplier Types
// ============================================================================

/**
 * Multiplier extracted from a QSO
 */
export interface ExtractedMultiplier {
  /** Type of multiplier (DXCC, CQ_ZONE, STATE, etc.) */
  type: MultiplierType;

  /** Multiplier value (e.g., "14" for zone, "K" for DXCC entity, "CA" for state) */
  value: string;

  /** Band key if multiplier is per-band (e.g., "20m") */
  bandKey?: string;

  /** Whether this is a new multiplier (not previously worked) */
  isNew?: boolean;

  /** Source field the multiplier was extracted from */
  source?: "callsign" | "exchange";

  /** The multiplier rule that matched */
  rule?: MultiplierRule;
}

// ============================================================================
// Scoring Types
// ============================================================================

/**
 * Band breakdown for scoring
 */
export interface BandScoreBreakdown {
  /** Band designation (e.g., "20m") */
  band: string;

  /** QSO count on this band */
  qsoCount: number;

  /** Dupe count on this band */
  dupeCount: number;

  /** Points earned on this band */
  points: number;

  /** Multiplier count on this band (if per-band scoring) */
  multipliers: number;

  /** Band contribution to final score (if per-band scoring) */
  bandScore?: number;
}

/**
 * Mode breakdown for scoring
 */
export interface ModeScoreBreakdown {
  /** Mode designation (CW, SSB, DIGITAL) */
  mode: string;

  /** QSO count for this mode */
  qsoCount: number;

  /** Points earned for this mode */
  points: number;
}

/**
 * Hourly rate data point
 */
export interface HourlyRate {
  /** Hour number (0-23 or contest hour offset) */
  hour: number;

  /** Number of QSOs in this hour */
  qsoCount: number;

  /** Points earned in this hour */
  points: number;

  /** Running total QSOs at end of hour */
  runningTotal: number;
}

/**
 * Detailed score summary
 *
 * Provides comprehensive breakdown of contest scoring including
 * band/mode analysis, rates, and multiplier details.
 */
export interface ScoreSummary {
  /** Final calculated score */
  finalScore: number;

  /** Total QSO points (before multipliers) */
  totalPoints: number;

  /** Total unique multipliers */
  totalMultipliers: number;

  /** Total valid QSOs */
  totalQsos: number;

  /** Total duplicate QSOs */
  totalDupes: number;

  /** Score model used for calculation */
  scoreModel: ScoreModel;

  /** Breakdown by band */
  byBand: BandScoreBreakdown[];

  /** Breakdown by mode */
  byMode: ModeScoreBreakdown[];

  /** Multipliers by type */
  multipliersByType: Record<MultiplierType, number>;

  /** List of worked multipliers by type */
  workedMultipliers: Record<MultiplierType, string[]>;

  /** Hourly rate data */
  hourlyRates: HourlyRate[];

  /** Current running rate (QSOs/hour over last 10 minutes) */
  currentRate: number;

  /** Best hour rate achieved */
  bestHourRate: number;

  /** Best hour number */
  bestHour: number;

  /** Contest time elapsed in minutes */
  elapsedMinutes: number;

  /** Projected final score based on current rate */
  projectedScore?: number;
}

// ============================================================================
// Engine Configuration Types
// ============================================================================

/**
 * Default values for one-line entry parsing
 */
export interface ParseDefaults {
  /** Default RST to use (typically "599" for CW, "59" for phone) */
  rst?: string;

  /** Default band if not specified */
  band?: string;

  /** Default mode if not specified */
  mode?: string;

  /** Current serial number to send */
  serialSent?: number;

  /** My exchange to send */
  myExchange?: string;
}

/**
 * Options for the contest engine
 */
export interface ContestEngineOptions {
  /** Whether to auto-increment serial on successful log */
  autoIncrementSerial?: boolean;

  /** Whether to allow logging duplicate QSOs */
  allowDupes?: boolean;

  /** Whether to show warnings for potential issues */
  showWarnings?: boolean;

  /** Strict validation mode (reject any validation errors) */
  strictMode?: boolean;
}
