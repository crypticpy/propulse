/**
 * Contest One-Line Entry Parser
 *
 * Parses contest one-line entries into structured fields.
 * Supports various contest formats including CQWW, WPX, Field Day, and Sweepstakes.
 *
 * @module lib/contest/parsing
 */

import type { ContestDefinition } from "@/types/contest";
import type { ParsedEntry, ParseDefaults, ParseIssue } from "./types";

// ============================================================================
// Constants
// ============================================================================

/**
 * Basic callsign pattern for amateur radio callsigns
 * Matches standard formats like W1AW, K3LR, VE3XYZ, JA1ABC, etc.
 * Also handles portable/mobile suffixes like W1AW/P, W1AW/M, W1AW/3
 */
const CALLSIGN_PATTERN =
  /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}[A-Z](?:\/[A-Z0-9]+)?$/i;

/**
 * Pattern for RST-like values (including N shorthand)
 * Matches: 599, 59, 5NN, 5N, 579, etc.
 */
const RST_PATTERN = /^[1-5][0-9N][0-9N]?$/i;

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Parse a one-line contest entry into structured fields
 *
 * Parses user input like "W1AW 599 05" into callsign, RST, and exchange fields.
 * The parser is lenient and captures what it can, reporting issues separately.
 *
 * @param args.input - Raw user input string
 * @param args.contest - Contest definition with exchange format
 * @param args.defaults - Default values for missing fields
 * @returns Parsed entry with fields, errors, and warnings
 *
 * @example
 * parseOneLineEntry({
 *   input: "W1AW 599 05",
 *   contest: cqwwDefinition,
 *   defaults: { rst: "599" }
 * })
 * // Returns: { callsign: "W1AW", rstReceived: "599", parsedFields: { zone: "05" }, ... }
 */
export function parseOneLineEntry(args: {
  input: string;
  contest: ContestDefinition;
  defaults?: ParseDefaults;
}): ParsedEntry {
  const { input, contest, defaults = {} } = args;
  const tokens = tokenizeInput(input);

  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];

  // Default values
  const defaultRst = defaults.rst || (defaults.mode === "SSB" ? "59" : "599");

  // Parse result structure
  let callsign = "";
  let rstReceived = defaultRst;
  const exchangeTokens: string[] = [];
  const parsedFields: Record<string, string> = {};

  if (tokens.length === 0) {
    errors.push({
      field: "input",
      message: "Empty input",
      code: "MISSING_CALLSIGN",
    });

    return {
      callsign: "",
      rstReceived: defaultRst,
      exchangeTokens: [],
      exchangeReceived: "",
      parsedFields: {},
      errors,
      warnings,
      rawInput: input,
    };
  }

  // Get expected exchange fields from contest definition
  const exchangeFields = contest.exchange.fields.filter((f) => f !== "rst");
  const expectsRst = contest.exchange.fields.includes("rst");

  // Step 1: Find the callsign token
  let callsignIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (isValidCallsign(tokens[i])) {
      callsign = tokens[i].toUpperCase();
      callsignIndex = i;
      break;
    }
  }

  if (callsignIndex === -1) {
    // No valid callsign found - try first token anyway and report error
    if (tokens.length > 0) {
      callsign = tokens[0].toUpperCase();
      callsignIndex = 0;
      errors.push({
        field: "callsign",
        message: `Invalid callsign format: ${tokens[0]}`,
        code: "INVALID_CALLSIGN",
      });
    } else {
      errors.push({
        field: "callsign",
        message: "Missing callsign",
        code: "MISSING_CALLSIGN",
      });
    }
  }

  // Collect remaining tokens after callsign
  const remainingTokens =
    callsignIndex >= 0
      ? tokens.filter((_, i) => i !== callsignIndex)
      : tokens.slice(1);

  // Step 2: Find RST token if expected
  let rstIndex = -1;
  if (expectsRst && remainingTokens.length > 0) {
    for (let i = 0; i < remainingTokens.length; i++) {
      if (isRstLike(remainingTokens[i])) {
        rstReceived = normalizeRST(remainingTokens[i], defaults.mode || "CW");
        rstIndex = i;
        break;
      }
    }
  }

  // Collect exchange tokens (everything except callsign and RST)
  const exchangeOnlyTokens = remainingTokens.filter((_, i) => i !== rstIndex);

  // Step 3: Map exchange tokens to exchange fields
  // Special handling for different contest types
  const contestId = contest.id.toLowerCase();

  if (contestId.includes("sweepstakes") || contestId.includes("ss")) {
    // Sweepstakes: serial precedence callsign check section
    // Example: N0AX 123 A W1AW 78 CT
    // Note: input typically doesn't include callsign again, so format is: serial precedence check section
    mapSweepstakesExchange(
      exchangeOnlyTokens,
      parsedFields,
      exchangeTokens,
      errors,
      warnings,
    );
  } else if (contestId.includes("field") && contestId.includes("day")) {
    // Field Day: class section
    // Example: 2A ENY
    mapFieldDayExchange(
      exchangeOnlyTokens,
      parsedFields,
      exchangeTokens,
      errors,
      warnings,
    );
  } else {
    // Generic mapping: map tokens to fields in order
    mapGenericExchange(
      exchangeOnlyTokens,
      exchangeFields,
      parsedFields,
      exchangeTokens,
      errors,
      warnings,
    );
  }

  // Check for missing required exchange
  if (exchangeTokens.length === 0 && exchangeFields.length > 0) {
    warnings.push({
      field: "exchange",
      message: "No exchange received",
      code: "MISSING_EXCHANGE",
    });
  }

  // Build exchange string
  const exchangeReceived = exchangeTokens.join(" ");

  return {
    callsign,
    rstReceived,
    exchangeTokens,
    exchangeReceived,
    parsedFields,
    errors,
    warnings,
    rawInput: input,
  };
}

/**
 * Normalize RST shorthand to standard format
 *
 * Converts CW shorthand (N = 9) to numeric format.
 * Handles both 2-digit (phone) and 3-digit (CW/digital) RST.
 *
 * @param rst - Raw RST input (e.g., "5NN", "5N", "599", "59")
 * @param mode - Operating mode to determine RST length
 * @returns Normalized RST string
 *
 * @example
 * normalizeRST("5NN", "CW") // Returns "599"
 * normalizeRST("5N", "SSB") // Returns "59"
 * normalizeRST("579", "CW") // Returns "579"
 */
export function normalizeRST(rst: string, mode: string): string {
  // Convert N to 9 (common CW shorthand)
  let normalized = rst.toUpperCase().replace(/N/g, "9");

  // Remove any non-numeric characters
  normalized = normalized.replace(/\D/g, "");

  // Determine expected length based on mode
  const isDigital = isDigitalOrCWMode(mode);
  const expectedLength = isDigital ? 3 : 2;

  // Pad or truncate to expected length
  if (normalized.length < expectedLength) {
    // Pad with 9s
    normalized = normalized.padEnd(expectedLength, "9");
  } else if (normalized.length > expectedLength) {
    // Truncate to expected length
    normalized = normalized.slice(0, expectedLength);
  }

  return normalized;
}

/**
 * Validate callsign format
 *
 * Checks if a string matches the basic amateur radio callsign pattern.
 * Note: This is format validation only, not lookup against a database.
 *
 * @param call - Callsign to validate
 * @returns True if callsign matches valid format
 *
 * @example
 * isValidCallsign("W1AW") // true
 * isValidCallsign("K3LR") // true
 * isValidCallsign("123ABC") // false
 */
export function isValidCallsign(call: string): boolean {
  if (!call || call.length < 3) {
    return false;
  }
  return CALLSIGN_PATTERN.test(call);
}

/**
 * Split input string into tokens
 *
 * Tokenizes by whitespace and removes empty tokens.
 *
 * @param input - Raw input string
 * @returns Array of non-empty tokens
 *
 * @example
 * tokenizeInput("W1AW 599 05") // ["W1AW", "599", "05"]
 * tokenizeInput("  K3LR   59   14  ") // ["K3LR", "59", "14"]
 */
export function tokenizeInput(input: string): string[] {
  return input
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

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
 * Check if a token looks like an RST value
 */
function isRstLike(token: string): boolean {
  return RST_PATTERN.test(token);
}

/**
 * Map generic exchange fields in order
 */
function mapGenericExchange(
  tokens: string[],
  fields: string[],
  parsedFields: Record<string, string>,
  exchangeTokens: string[],
  errors: ParseIssue[],
  _warnings: ParseIssue[],
): void {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    exchangeTokens.push(token);

    if (i < fields.length) {
      const field = fields[i];
      parsedFields[field] = token.toUpperCase();
    } else if (tokens.length > fields.length) {
      // Extra token beyond expected fields
      // Only add error once for extra tokens
      if (i === fields.length) {
        errors.push({
          field: `token[${i}]`,
          message: `Extra token(s) in exchange: ${tokens.slice(fields.length).join(" ")}`,
          code: "EXTRA_TOKENS",
        });
      }
    }
  }
}

/**
 * Map Sweepstakes exchange fields
 * Format: serial precedence check section
 */
function mapSweepstakesExchange(
  tokens: string[],
  parsedFields: Record<string, string>,
  exchangeTokens: string[],
  errors: ParseIssue[],
  _warnings: ParseIssue[],
): void {
  // Expected: serial precedence check section
  // Or with call: serial precedence callsign check section (but call is usually omitted since we have it)
  const expectedFields = ["serial", "precedence", "check", "section"];

  for (let i = 0; i < tokens.length && i < expectedFields.length; i++) {
    const token = tokens[i];
    const field = expectedFields[i];
    exchangeTokens.push(token);
    parsedFields[field] = token.toUpperCase();
  }

  // Check for extra tokens
  if (tokens.length > expectedFields.length) {
    errors.push({
      field: `token[${expectedFields.length}]`,
      message: `Extra token(s) in Sweepstakes exchange: ${tokens.slice(expectedFields.length).join(" ")}`,
      code: "EXTRA_TOKENS",
    });
  }
}

/**
 * Map Field Day exchange fields
 * Format: class section
 */
function mapFieldDayExchange(
  tokens: string[],
  parsedFields: Record<string, string>,
  exchangeTokens: string[],
  errors: ParseIssue[],
  _warnings: ParseIssue[],
): void {
  // Expected: class section (e.g., "2A ENY")
  // Class might be two tokens if entered as "2 A" instead of "2A"
  const expectedFields = ["class", "section"];

  // Check if first token is just a number (class without letter)
  if (
    tokens.length >= 2 &&
    /^\d+$/.test(tokens[0]) &&
    /^[A-F]$/i.test(tokens[1])
  ) {
    // Combine first two tokens as class
    const classValue = tokens[0] + tokens[1].toUpperCase();
    parsedFields["class"] = classValue;
    exchangeTokens.push(classValue);

    // Rest are mapped to remaining fields
    for (let i = 2; i < tokens.length; i++) {
      if (i === 2) {
        parsedFields["section"] = tokens[i].toUpperCase();
        exchangeTokens.push(tokens[i]);
      } else {
        errors.push({
          field: `token[${i}]`,
          message: `Extra token in Field Day exchange: ${tokens[i]}`,
          code: "EXTRA_TOKENS",
        });
      }
    }
  } else {
    // Standard mapping
    for (let i = 0; i < tokens.length && i < expectedFields.length; i++) {
      const token = tokens[i];
      const field = expectedFields[i];
      exchangeTokens.push(token);
      parsedFields[field] = token.toUpperCase();
    }

    // Check for extra tokens
    if (tokens.length > expectedFields.length) {
      errors.push({
        field: `token[${expectedFields.length}]`,
        message: `Extra token(s) in Field Day exchange: ${tokens.slice(expectedFields.length).join(" ")}`,
        code: "EXTRA_TOKENS",
      });
    }
  }
}
