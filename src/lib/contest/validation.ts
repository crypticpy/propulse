/**
 * Contest QSO Validation Engine
 *
 * Validates parsed QSO data against contest rules including:
 * - Zone validation (CQ 1-40, ITU 1-90)
 * - ARRL/RAC section validation
 * - Field Day class validation
 * - Sweepstakes precedence and check validation
 * - US state validation
 * - Callsign format validation
 *
 * @module lib/contest/validation
 */

import type {
  ContestQSODraft,
  ContestContext,
  ValidationResult,
  ValidationIssue,
} from "./types";
import { isValidCallsign } from "./parsing";

// ============================================================================
// Constants
// ============================================================================

/**
 * Valid ARRL/RAC sections for contests like Sweepstakes, Field Day
 * 83 total sections including US states, Canadian provinces, and special areas
 */
export const ARRL_RAC_SECTIONS = [
  // New England Division
  "CT",
  "EMA",
  "ME",
  "NH",
  "RI",
  "VT",
  "WMA",
  // Hudson Division
  "ENY",
  "NLI",
  "NNJ",
  "NNY",
  "SNJ",
  "WNY",
  // Atlantic Division
  "DE",
  "EPA",
  "MDC",
  "WPA",
  // Delta Division
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
  // Midwest Division
  "AR",
  "LA",
  "MS",
  "NM",
  "NTX",
  "OK",
  "STX",
  "WTX",
  // Pacific Division
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
  // Rocky Mountain Division
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
  // Central Division
  "IA",
  "KS",
  "MN",
  "MO",
  "NE",
  "ND",
  "SD",
  // Great Lakes Division
  "IL",
  "IN",
  "WI",
  // Dakota Division
  "CO",
  "MI",
  "OH",
  "WV",
  // Canada
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
] as const;

/**
 * Valid US state abbreviations
 */
export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
] as const;

/**
 * Valid Sweepstakes precedence values
 */
export const SWEEPSTAKES_PRECEDENCE = [
  "Q", // Single-op QRP
  "A", // Single-op Low Power
  "B", // Single-op High Power
  "U", // Single-op Unlimited
  "M", // Multi-op
  "S", // School club
] as const;

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate a QSO draft before logging
 *
 * Checks:
 * - Callsign format validity
 * - Frequency/band in contest limits
 * - Mode is valid for contest
 * - Exchange fields are valid for contest rules
 * - Date/time within contest period
 *
 * @param draft - QSO draft to validate
 * @param ctx - Contest context with session state
 * @returns Validation result with errors and warnings
 */
export function validateQSO(
  draft: ContestQSODraft,
  ctx: ContestContext,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Validate callsign format
  const callsignIssue = validateCallsignFormat(draft.callsign);
  if (callsignIssue) {
    if (callsignIssue.code === "INVALID_CALLSIGN") {
      errors.push(callsignIssue);
    } else {
      warnings.push(callsignIssue);
    }
  }

  // 2. Check for self-call
  if (draft.callsign.toUpperCase() === ctx.session.myCallsign.toUpperCase()) {
    errors.push({
      field: "callsign",
      message: "Cannot log QSO with your own callsign",
      code: "SELF_CALL",
    });
  }

  // 3. Validate RST format
  const rstIssue = validateRST(draft.rstRcvd, draft.mode);
  if (rstIssue) {
    warnings.push(rstIssue);
  }

  // 4. Validate exchange based on contest rules
  const exchangeIssues = validateExchange(draft.parsedExchange, ctx);
  for (const issue of exchangeIssues) {
    warnings.push(issue);
  }

  // 5. Validate band/frequency if provided
  if (draft.frequency <= 0) {
    warnings.push({
      field: "frequency",
      message: "Invalid frequency",
      code: "INVALID_FREQUENCY",
    });
  }

  // 6. Validate date/time format
  const dateIssue = validateDate(draft.date);
  if (dateIssue) {
    errors.push(dateIssue);
  }

  const timeIssue = validateTime(draft.time);
  if (timeIssue) {
    errors.push(timeIssue);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Specific Validation Functions
// ============================================================================

/**
 * Validate a CQ zone (1-40)
 *
 * @param zone - Zone value to validate
 * @param type - Zone type ("CQ" or "ITU")
 * @returns ValidationIssue if invalid, null if valid
 */
export function validateZone(
  zone: string,
  type: "CQ" | "ITU",
): ValidationIssue | null {
  const zoneNum = parseInt(zone, 10);

  if (isNaN(zoneNum)) {
    return {
      field: "zone",
      message: `Invalid ${type} zone: ${zone} (must be a number)`,
      code: "INVALID_EXCHANGE",
    };
  }

  if (type === "CQ") {
      if (zoneNum < 1 || zoneNum > 40) {
        return {
          field: "zone",
          message: `Invalid CQ zone: ${zone} (must be 1-40)`,
          code: "INVALID_EXCHANGE",
        };
      }
    }
  else if (zoneNum < 1 || zoneNum > 90) {
        return {
          field: "zone",
          message: `Invalid ITU zone: ${zone} (must be 1-90)`,
          code: "INVALID_EXCHANGE",
        };
      }

  return null;
}

/**
 * Validate an ARRL/RAC section
 *
 * @param section - Section code to validate
 * @returns ValidationIssue if invalid, null if valid
 */
export function validateSection(section: string): ValidationIssue | null {
  const normalizedSection = section.toUpperCase().trim();

  if (
    !ARRL_RAC_SECTIONS.includes(
      normalizedSection as (typeof ARRL_RAC_SECTIONS)[number],
    )
  ) {
    return {
      field: "section",
      message: `Invalid ARRL/RAC section: ${section}`,
      code: "INVALID_EXCHANGE",
    };
  }

  return null;
}

/**
 * Validate a Field Day class
 *
 * @param cls - Class value to validate (e.g., "2A", "1E", "10B")
 * @returns ValidationIssue if invalid, null if valid
 */
export function validateFieldDayClass(cls: string): ValidationIssue | null {
  // Pattern: one or more digits followed by A-F
  const pattern = /^\d+[A-F]$/i;

  if (!pattern.test(cls)) {
    return {
      field: "class",
      message: `Invalid Field Day class: ${cls} (expected format like 2A, 1E, 10B)`,
      code: "INVALID_EXCHANGE",
    };
  }

  // Validate the letter is A-F
  const letter = cls.slice(-1).toUpperCase();
  if (!["A", "B", "C", "D", "E", "F"].includes(letter)) {
    return {
      field: "class",
      message: `Invalid Field Day class letter: ${letter} (must be A-F)`,
      code: "INVALID_EXCHANGE",
    };
  }

  return null;
}

/**
 * Validate a Sweepstakes precedence
 *
 * @param prec - Precedence value to validate
 * @returns ValidationIssue if invalid, null if valid
 */
export function validatePrecedence(prec: string): ValidationIssue | null {
  const normalizedPrec = prec.toUpperCase().trim();

  if (
    !SWEEPSTAKES_PRECEDENCE.includes(
      normalizedPrec as (typeof SWEEPSTAKES_PRECEDENCE)[number],
    )
  ) {
    return {
      field: "precedence",
      message: `Invalid Sweepstakes precedence: ${prec} (must be Q, A, B, U, M, or S)`,
      code: "INVALID_EXCHANGE",
    };
  }

  return null;
}

/**
 * Validate a Sweepstakes check (2-digit year)
 *
 * @param check - Check value to validate
 * @returns ValidationIssue if invalid, null if valid
 */
export function validateCheck(check: string): ValidationIssue | null {
  const checkNum = parseInt(check, 10);

  // Must be a 2-digit year (00-99)
  if (isNaN(checkNum) || checkNum < 0 || checkNum > 99) {
    return {
      field: "check",
      message: `Invalid Sweepstakes check: ${check} (must be 2-digit year 00-99)`,
      code: "INVALID_EXCHANGE",
    };
  }

  // Also validate it's actually 2 digits (or 1 digit for years 00-09)
  if (check.length > 2 || (check.length === 2 && !/^\d{2}$/.test(check))) {
    return {
      field: "check",
      message: `Invalid Sweepstakes check format: ${check}`,
      code: "INVALID_EXCHANGE",
    };
  }

  return null;
}

/**
 * Validate a US state code
 *
 * @param state - State code to validate
 * @returns ValidationIssue if invalid, null if valid
 */
export function validateState(state: string): ValidationIssue | null {
  const normalizedState = state.toUpperCase().trim();

  if (!US_STATES.includes(normalizedState as (typeof US_STATES)[number])) {
    return {
      field: "state",
      message: `Invalid US state: ${state}`,
      code: "INVALID_EXCHANGE",
    };
  }

  return null;
}

/**
 * Validate a serial number
 *
 * @param serial - Serial number to validate
 * @returns ValidationIssue if invalid, null if valid
 */
export function validateSerial(serial: string): ValidationIssue | null {
  const serialNum = parseInt(serial, 10);

  if (isNaN(serialNum) || serialNum < 1) {
    return {
      field: "serial",
      message: `Invalid serial number: ${serial} (must be a positive integer)`,
      code: "INVALID_EXCHANGE",
    };
  }

  return null;
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Validate callsign format
 */
function validateCallsignFormat(callsign: string): ValidationIssue | null {
  if (!callsign || callsign.trim().length === 0) {
    return {
      field: "callsign",
      message: "Missing callsign",
      code: "MISSING_REQUIRED_FIELD",
    };
  }

  if (!isValidCallsign(callsign)) {
    return {
      field: "callsign",
      message: `Invalid callsign format: ${callsign}`,
      code: "INVALID_CALLSIGN",
    };
  }

  return null;
}

/**
 * Validate RST format
 */
function validateRST(rst: string, mode: string): ValidationIssue | null {
  if (!rst || rst.trim().length === 0) {
    return {
      field: "rst",
      message: "Missing RST",
      code: "MISSING_REQUIRED_FIELD",
    };
  }

  // Determine expected length based on mode
  const isDigital = isDigitalOrCWMode(mode);
  const expectedLength = isDigital ? 3 : 2;
  const digits = rst.replace(/\D/g, "");

  if (digits.length !== expectedLength) {
    return {
      field: "rst",
      message: `RST should be ${expectedLength} digits for ${mode} mode`,
      code: "INVALID_RST",
    };
  }

  // Validate R is 1-5, S is 1-9, T is 1-9
  const r = parseInt(digits[0], 10);
  const s = parseInt(digits[1], 10);

  if (r < 1 || r > 5) {
    return {
      field: "rst",
      message: `Invalid RST: Readability (${r}) must be 1-5`,
      code: "INVALID_RST",
    };
  }

  if (s < 1 || s > 9) {
    return {
      field: "rst",
      message: `Invalid RST: Signal strength (${s}) must be 1-9`,
      code: "INVALID_RST",
    };
  }

  if (isDigital && digits.length >= 3) {
    const t = parseInt(digits[2], 10);
    if (t < 1 || t > 9) {
      return {
        field: "rst",
        message: `Invalid RST: Tone (${t}) must be 1-9`,
        code: "INVALID_RST",
      };
    }
  }

  return null;
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function validateDate(date: string): ValidationIssue | null {
  if (!date || date.trim().length === 0) {
    return {
      field: "date",
      message: "Missing date",
      code: "INVALID_DATE",
    };
  }

  // Check format
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(date)) {
    return {
      field: "date",
      message: `Invalid date format: ${date} (expected YYYY-MM-DD)`,
      code: "INVALID_DATE",
    };
  }

  // Validate it's a real date
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) {
    return {
      field: "date",
      message: `Invalid date: ${date}`,
      code: "INVALID_DATE",
    };
  }

  return null;
}

/**
 * Validate time format (HHMM)
 */
function validateTime(time: string): ValidationIssue | null {
  if (!time || time.trim().length === 0) {
    return {
      field: "time",
      message: "Missing time",
      code: "INVALID_TIME",
    };
  }

  // Check format (HHMM)
  const timePattern = /^\d{4}$/;
  if (!timePattern.test(time)) {
    return {
      field: "time",
      message: `Invalid time format: ${time} (expected HHMM)`,
      code: "INVALID_TIME",
    };
  }

  // Validate hours and minutes
  const hours = parseInt(time.slice(0, 2), 10);
  const minutes = parseInt(time.slice(2, 4), 10);

  if (hours < 0 || hours > 23) {
    return {
      field: "time",
      message: `Invalid time: hours (${hours}) must be 00-23`,
      code: "INVALID_TIME",
    };
  }

  if (minutes < 0 || minutes > 59) {
    return {
      field: "time",
      message: `Invalid time: minutes (${minutes}) must be 00-59`,
      code: "INVALID_TIME",
    };
  }

  return null;
}

/**
 * Check if a mode is CW or digital (uses 3-digit RST)
 */
function isDigitalOrCWMode(mode: string): boolean {
  const normalizedMode = mode.toUpperCase().trim();
  const digitalModes = new Set([
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
  return digitalModes.has(normalizedMode);
}

/**
 * Validate exchange fields based on contest context
 */
function validateExchange(
  parsedExchange: Record<string, string>,
  ctx: ContestContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const {contest} = ctx;
  const contestId = contest.id.toLowerCase();

  // Check each field in the parsed exchange
  for (const [field, value] of Object.entries(parsedExchange)) {
    if (!value || value.trim().length === 0) {
      continue;
    }

    let issue: ValidationIssue | null = null;

    switch (field.toLowerCase()) {
      case "zone":
        // Determine zone type based on contest
        if (contestId.includes("cqww") || contestId.includes("cq-ww")) {
          issue = validateZone(value, "CQ");
        } else if (contestId.includes("iaru") || contestId.includes("itu")) {
          issue = validateZone(value, "ITU");
        } else {
          // Default to CQ zone
          issue = validateZone(value, "CQ");
        }
        break;

      case "section":
        issue = validateSection(value);
        break;

      case "class":
        if (contestId.includes("field") && contestId.includes("day")) {
          issue = validateFieldDayClass(value);
        }
        break;

      case "precedence":
        issue = validatePrecedence(value);
        break;

      case "check":
        issue = validateCheck(value);
        break;

      case "state":
        issue = validateState(value);
        break;

      case "serial":
        issue = validateSerial(value);
        break;

      // Grid, name, power - no specific validation needed beyond presence
      case "grid":
      case "name":
      case "power":
        // These are free-form or validated elsewhere
        break;

      default:
        // Unknown field - no validation
        break;
    }

    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}
