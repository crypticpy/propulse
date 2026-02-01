/**
 * Alert Matching Logic
 * Matches live spots against alert rules to determine which spots
 * should trigger notifications
 */

import type { LiveSpot } from "@/types/livespot";
import type { AlertRule } from "@/lib/db/types";

/** Maximum allowed pattern length to prevent complex patterns */
const MAX_PATTERN_LENGTH = 100;

/** Patterns known to cause catastrophic backtracking */
const DANGEROUS_PATTERNS = [
  /\(\.\*\)\+/, // (.*)+
  /\(\[^\]]+\)\+/, // ([^x]+)+
  /\(a\+\)\+/i, // (a+)+
  /\(\.\+\)\+/, // (.+)+
  /\(\?:.*\)\+\*/, // (?:...)+*
];

/** Cache for compiled regex patterns */
const regexCache = new Map<string, RegExp | null>();

/**
 * Check if a regex pattern is safe from ReDoS attacks
 *
 * @param pattern - Regex pattern string to validate
 * @returns Object with safe boolean and optional error message
 */
function isPatternSafe(pattern: string): { safe: boolean; error?: string } {
  // Check pattern length
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      safe: false,
      error: `Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters`,
    };
  }

  // Check for dangerous patterns that cause catastrophic backtracking
  for (const dangerous of DANGEROUS_PATTERNS) {
    if (dangerous.test(pattern)) {
      return {
        safe: false,
        error:
          "Pattern contains constructs that may cause catastrophic backtracking",
      };
    }
  }

  // Check for nested quantifiers (e.g., +?, *+, ?*, ++, **, etc.)
  // These can cause exponential backtracking
  if (/[+*?][+*?]/.test(pattern)) {
    return {
      safe: false,
      error:
        "Pattern contains nested quantifiers which may cause performance issues",
    };
  }

  return { safe: true };
}

/**
 * Safely compile a regex pattern with error handling and ReDoS protection
 * Returns null if the pattern is invalid or unsafe
 *
 * @param pattern - Regex pattern string
 * @param flags - Regex flags (default: 'i' for case-insensitive)
 * @returns Compiled RegExp or null if invalid/unsafe
 */
function safeCompileRegex(pattern: string, flags: string = "i"): RegExp | null {
  const cacheKey = `${pattern}:${flags}`;

  // Check cache first
  if (regexCache.has(cacheKey)) {
    return regexCache.get(cacheKey)!;
  }

  // Validate pattern safety
  const safetyCheck = isPatternSafe(pattern);
  if (!safetyCheck.safe) {
    console.warn(
      `Unsafe regex pattern rejected: ${pattern} - ${safetyCheck.error}`,
    );
    regexCache.set(cacheKey, null);
    return null;
  }

  try {
    const regex = new RegExp(pattern, flags);
    regexCache.set(cacheKey, regex);
    return regex;
  } catch {
    console.warn(`Invalid regex pattern: ${pattern}`);
    regexCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Check if a value is empty (null, undefined, or empty array)
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

/**
 * Check if a spot's callsign matches a callsign pattern
 *
 * @param spotCallsign - The DX station callsign from the spot
 * @param pattern - Regex pattern to match against (case-insensitive)
 * @returns true if the callsign matches the pattern
 */
function matchesCallsignPattern(
  spotCallsign: string | undefined,
  pattern: string | undefined,
): boolean {
  // If no pattern specified, match all
  if (isEmpty(pattern)) return true;

  // If spot has no callsign, can't match
  if (!spotCallsign) return false;

  const regex = safeCompileRegex(pattern!, "i");
  if (!regex) return false;

  return regex.test(spotCallsign);
}

/**
 * Check if a spot's DX prefix matches an entity pattern
 *
 * @param spotCallsign - The DX station callsign from the spot
 * @param pattern - Regex pattern for DXCC entity prefix
 * @returns true if the callsign prefix matches the pattern
 */
function matchesEntityPattern(
  spotCallsign: string | undefined,
  pattern: string | undefined,
): boolean {
  // If no pattern specified, match all
  if (isEmpty(pattern)) return true;

  // If spot has no callsign, can't match
  if (!spotCallsign) return false;

  // Extract prefix from callsign (characters before first digit, or up to first /)
  // Examples: W1ABC -> W, VK2ABC -> VK, 3Y/W1ABC -> 3Y
  const prefixMatch = spotCallsign.match(/^([A-Z0-9]+)\//i);
  const prefix = prefixMatch
    ? prefixMatch[1]
    : spotCallsign.match(/^([A-Z]{1,2}|[0-9][A-Z])/i)?.[1];

  if (!prefix) return false;

  const regex = safeCompileRegex(pattern!, "i");
  if (!regex) return false;

  return regex.test(prefix);
}

/**
 * Check if a spot's band is in the allowed bands list
 *
 * @param spotBand - The band from the spot (e.g., "20m", "40m")
 * @param allowedBands - Array of allowed bands
 * @returns true if the band is allowed (or if no filter specified)
 */
function matchesBandFilter(
  spotBand: string | undefined,
  allowedBands: string[] | undefined,
): boolean {
  // Empty array or undefined means match all bands
  if (isEmpty(allowedBands)) return true;

  // If spot has no band, can't match specific filter
  if (!spotBand) return false;

  // Normalize band names for comparison (lowercase, trim whitespace)
  const normalizedSpotBand = spotBand.toLowerCase().trim();
  const normalizedAllowed = allowedBands!.map((b) => b.toLowerCase().trim());

  return normalizedAllowed.includes(normalizedSpotBand);
}

/**
 * Check if a spot's mode is in the allowed modes list
 *
 * @param spotMode - The mode from the spot (e.g., "FT8", "CW")
 * @param allowedModes - Array of allowed modes
 * @returns true if the mode is allowed (or if no filter specified)
 */
function matchesModeFilter(
  spotMode: string | undefined,
  allowedModes: string[] | undefined,
): boolean {
  // Empty array or undefined means match all modes
  if (isEmpty(allowedModes)) return true;

  // If spot has no mode, can't match specific filter
  if (!spotMode) return false;

  // Normalize mode names for comparison (uppercase, trim whitespace)
  const normalizedSpotMode = spotMode.toUpperCase().trim();
  const normalizedAllowed = allowedModes!.map((m) => m.toUpperCase().trim());

  return normalizedAllowed.includes(normalizedSpotMode);
}

/**
 * Check if a spot's SNR meets the minimum threshold
 *
 * @param spotSnr - The SNR value from the spot (dB)
 * @param minSnr - Minimum required SNR threshold
 * @returns true if SNR meets or exceeds threshold (or if no threshold specified)
 */
function matchesSnrThreshold(
  spotSnr: number | undefined,
  minSnr: number | undefined,
): boolean {
  // If no threshold specified, match all
  if (minSnr === undefined || minSnr === null) return true;

  // If spot has no SNR, can't match specific threshold
  if (spotSnr === undefined || spotSnr === null) return false;

  return spotSnr >= minSnr;
}

/**
 * Check if a spot matches all conditions in an alert rule
 * All specified (non-empty) conditions must match (AND logic)
 *
 * @param spot - The live spot to check
 * @param rule - The alert rule to match against
 * @returns true if the spot matches all rule conditions
 *
 * @example
 * ```ts
 * const spot: LiveSpot = {
 *   id: '123',
 *   dx: '3Y0J',
 *   frequency: 14074,
 *   band: '20m',
 *   mode: 'FT8',
 *   snr: -12,
 *   source: 'PSKReporter',
 *   // ... other fields
 * };
 *
 * const rule: AlertRule = {
 *   id: 'rule1',
 *   name: 'Bouvet Island',
 *   enabled: true,
 *   conditions: {
 *     callsignPattern: '^3Y.*',
 *     bands: ['20m', '15m'],
 *     minSnr: -20,
 *   },
 *   notification: { sound: true, browser: true, highlight: true },
 *   createdAt: new Date().toISOString(),
 * };
 *
 * matchesRule(spot, rule); // true
 * ```
 */
export function matchesRule(spot: LiveSpot, rule: AlertRule): boolean {
  const conditions = rule.conditions;

  // Check callsign pattern (uses spot.dx for DX station callsign)
  if (!matchesCallsignPattern(spot.dx, conditions.callsignPattern)) {
    return false;
  }

  // Check entity pattern (uses spot.dx to extract prefix)
  if (!matchesEntityPattern(spot.dx, conditions.entityPattern)) {
    return false;
  }

  // Check bands filter
  if (!matchesBandFilter(spot.band, conditions.bands)) {
    return false;
  }

  // Check modes filter
  if (!matchesModeFilter(spot.mode, conditions.modes)) {
    return false;
  }

  // Check SNR threshold
  if (!matchesSnrThreshold(spot.snr, conditions.minSnr)) {
    return false;
  }

  // All specified conditions match
  return true;
}

/**
 * Find all enabled rules that match a spot
 *
 * @param spot - The live spot to check
 * @param rules - Array of alert rules to check against
 * @returns Array of matching rules (only enabled rules are considered)
 *
 * @example
 * ```ts
 * const matchingRules = findMatchingRules(spot, allRules);
 * if (matchingRules.length > 0) {
 *   console.log('Spot matched rules:', matchingRules.map(r => r.name));
 * }
 * ```
 */
export function findMatchingRules(
  spot: LiveSpot,
  rules: AlertRule[],
): AlertRule[] {
  return rules.filter((rule) => rule.enabled && matchesRule(spot, rule));
}

/**
 * Result of checking spots for alerts
 */
export interface SpotAlertMatch {
  /** The spot that matched */
  spot: LiveSpot;
  /** All rules that matched this spot */
  rules: AlertRule[];
}

/**
 * Check multiple spots against rules and return matching pairs
 * Only returns spots that have at least one matching rule
 *
 * @param spots - Array of live spots to check
 * @param rules - Array of alert rules to check against
 * @returns Array of matches (spots with their matching rules)
 *
 * @example
 * ```ts
 * const matches = checkSpotsForAlerts(liveSpots, alertRules);
 * for (const { spot, rules } of matches) {
 *   console.log(`${spot.dx} matched ${rules.length} rules`);
 *   // Trigger notifications...
 * }
 * ```
 */
export function checkSpotsForAlerts(
  spots: LiveSpot[],
  rules: AlertRule[],
): SpotAlertMatch[] {
  const matches: SpotAlertMatch[] = [];

  // Filter to only enabled rules once
  const enabledRules = rules.filter((rule) => rule.enabled);

  // Skip if no enabled rules
  if (enabledRules.length === 0) {
    return matches;
  }

  for (const spot of spots) {
    const matchingRules = enabledRules.filter((rule) =>
      matchesRule(spot, rule),
    );

    if (matchingRules.length > 0) {
      matches.push({
        spot,
        rules: matchingRules,
      });
    }
  }

  return matches;
}

/**
 * Test a callsign against a pattern (for rule preview/testing)
 *
 * @param callsign - The callsign to test
 * @param pattern - The regex pattern to test against
 * @returns Object with match result and any error
 */
export function testCallsignPattern(
  callsign: string,
  pattern: string,
): { matches: boolean; error?: string } {
  if (!pattern || pattern.trim().length === 0) {
    return { matches: true };
  }

  // Use safe compilation which includes ReDoS protection
  const regex = safeCompileRegex(pattern, "i");
  if (!regex) {
    const safetyCheck = isPatternSafe(pattern);
    return {
      matches: false,
      error: safetyCheck.error || "Invalid regex pattern",
    };
  }

  return { matches: regex.test(callsign) };
}

/**
 * Validate an alert pattern for UI validation
 * Checks both regex validity and ReDoS safety
 *
 * @param pattern - The regex pattern to validate
 * @returns Object with valid boolean and optional error message
 */
export function validateAlertPattern(pattern: string): {
  valid: boolean;
  error?: string;
} {
  // Empty patterns are valid (match all)
  if (!pattern || pattern.trim().length === 0) {
    return { valid: true };
  }

  // Check ReDoS safety first
  const safetyCheck = isPatternSafe(pattern);
  if (!safetyCheck.safe) {
    return { valid: false, error: safetyCheck.error };
  }

  // Try to compile the regex to check syntax
  try {
    new RegExp(pattern, "i");
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Invalid regex pattern",
    };
  }
}

/**
 * Clear the regex pattern cache
 * Useful for testing or memory management
 */
export function clearRegexCache(): void {
  regexCache.clear();
}
