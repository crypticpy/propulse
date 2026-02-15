/**
 * Contest Alert Throttle Middleware
 *
 * Provides intelligent alert filtering during contests to prevent
 * notification flooding. Supports built-in and custom alert profiles
 * that define which alerts pass through during contest activity.
 *
 * Key concepts:
 * - **Profile**: A named set of rules governing alert behavior
 * - **Throttle**: Reduce frequency (e.g., 4x means once per 20m instead of 5m)
 * - **Suppress**: Completely silence alerts matching a condition
 * - **Allow**: Always let alerts through regardless of contest state
 *
 * @module lib/alerts/contestAlertLogic
 */

import type { AlertMatch } from "@/lib/alerts/alertEngine";
import type { ContestCalendarEntry } from "@/lib/contest/contestCalendarTypes";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Condition type for a profile rule.
 * Determines what kind of alert the rule applies to.
 */
export type ProfileCondition =
  | "new_dxcc"
  | "new_band"
  | "new_mode"
  | "any_match";

/**
 * Action to take when a rule condition is met.
 * - allow: Always pass the alert through
 * - suppress: Completely silence the alert
 * - throttle: Reduce alert frequency by the throttle multiplier
 */
export type ProfileAction = "allow" | "suppress" | "throttle";

/**
 * A single rule within an alert profile.
 * Rules are evaluated in order; first match wins.
 */
export interface ProfileRule {
  /** What kind of alert this rule applies to */
  condition: ProfileCondition;
  /** What to do when the condition matches */
  action: ProfileAction;
}

/**
 * An alert profile defining behavior during contests.
 */
export interface AlertProfile {
  /** Unique identifier for the profile */
  id: string;
  /** Human-readable profile name */
  name: string;
  /** Short description of the profile's behavior */
  description: string;
  /** Ordered list of rules — first match wins */
  rules: ProfileRule[];
}

/**
 * Context passed to throttle functions to determine contest state.
 */
export interface ThrottleContext {
  /** Whether any contest is currently active */
  isContestWeekend: boolean;
  /** List of currently active contests */
  activeContests: ContestCalendarEntry[];
  /** The active alert profile */
  profile: AlertProfile;
  /** Rate reduction factor (e.g., 4 = alert once per 20min instead of 5min) */
  throttleMultiplier: number;
}

// ─── Throttle Tracking ──────────────────────────────────────────────────────

/**
 * In-memory map tracking the last alert time for throttled rules.
 * Key: `${ruleId}:${condition}`, Value: Unix timestamp of last alert.
 */
const throttleTimestamps = new Map<string, number>();

/** Base alert interval in milliseconds (5 minutes) */
const BASE_ALERT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Reset all throttle tracking state.
 * Useful for testing or when switching profiles.
 */
export function resetThrottleTimestamps(): void {
  throttleTimestamps.clear();
}

// ─── Built-in Profiles ──────────────────────────────────────────────────────

/**
 * Built-in alert profiles that ship with the application.
 * Users can customize these but cannot delete them.
 */
export const BUILT_IN_PROFILES: AlertProfile[] = [
  {
    id: "normal",
    name: "Normal",
    description: "All alerts pass through with no throttling or suppression.",
    rules: [{ condition: "any_match", action: "allow" }],
  },
  {
    id: "contest-dx-only",
    name: "Contest: DX Only",
    description:
      "During contests, only alert for new DXCC entities. All other alerts are suppressed.",
    rules: [
      { condition: "new_dxcc", action: "allow" },
      { condition: "any_match", action: "suppress" },
    ],
  },
  {
    id: "contest-new-band",
    name: "Contest: New Band Only",
    description:
      "During contests, only alert for new band slots. Other alerts are throttled.",
    rules: [
      { condition: "new_band", action: "allow" },
      { condition: "any_match", action: "suppress" },
    ],
  },
  {
    id: "contest-minimal",
    name: "Contest: Minimal",
    description:
      "Suppress all except new DXCC entities on new bands. Maximum noise reduction.",
    rules: [
      { condition: "new_dxcc", action: "allow" },
      { condition: "new_band", action: "throttle" },
      { condition: "any_match", action: "suppress" },
    ],
  },
  {
    id: "contest-silent",
    name: "Contest: Silent",
    description:
      "Suppress all alerts during contests. Complete silence for focused operating.",
    rules: [{ condition: "any_match", action: "suppress" }],
  },
];

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Determine what condition(s) an alert match satisfies.
 * Returns a list of matching conditions from most specific to least.
 */
function getMatchConditions(match: AlertMatch): ProfileCondition[] {
  const conditions: ProfileCondition[] = [];

  // Check for DXCC-related match
  if (match.matchedFields.includes("entityPattern")) {
    conditions.push("new_dxcc");
  }

  // Check for band-related match
  if (match.matchedFields.includes("bands")) {
    conditions.push("new_band");
  }

  // Check for mode-related match
  if (match.matchedFields.includes("modes")) {
    conditions.push("new_mode");
  }

  // Always include the catch-all
  conditions.push("any_match");

  return conditions;
}

/**
 * Find the first profile rule that matches any of the alert's conditions.
 * Returns the matching rule or undefined if no rules match.
 */
function findMatchingRule(
  match: AlertMatch,
  rules: ProfileRule[],
): ProfileRule | undefined {
  const alertConditions = getMatchConditions(match);

  for (const rule of rules) {
    if (alertConditions.includes(rule.condition)) {
      return rule;
    }
  }

  return undefined;
}

/**
 * Check whether a throttled alert should be allowed through based on timing.
 * Returns true if enough time has elapsed since the last alert for this key.
 */
function isThrottleWindowOpen(
  throttleKey: string,
  multiplier: number,
): boolean {
  const now = Date.now();
  const lastAlertTime = throttleTimestamps.get(throttleKey);
  const throttledInterval = BASE_ALERT_INTERVAL_MS * multiplier;

  if (lastAlertTime === undefined) {
    // First alert for this key — allow and record
    throttleTimestamps.set(throttleKey, now);
    return true;
  }

  if (now - lastAlertTime >= throttledInterval) {
    // Enough time has passed — allow and update timestamp
    throttleTimestamps.set(throttleKey, now);
    return true;
  }

  return false;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Determine if a single alert should be suppressed during a contest.
 *
 * Returns `true` if the alert should be throttled (i.e., NOT sent).
 * Returns `false` if the alert should pass through.
 *
 * When no contest is active, all alerts pass through regardless of profile.
 */
export function shouldThrottleAlert(
  match: AlertMatch,
  context: ThrottleContext,
): boolean {
  // No contest active — never throttle
  if (!context.isContestWeekend) {
    return false;
  }

  // Find the first matching profile rule
  const rule = findMatchingRule(match, context.profile.rules);

  // No rule matched — default to allowing the alert
  if (!rule) {
    return false;
  }

  switch (rule.action) {
    case "allow":
      return false;

    case "suppress":
      return true;

    case "throttle": {
      // Build a unique key for this rule + alert combination
      const throttleKey = `${match.rule.id}:${rule.condition}`;
      return !isThrottleWindowOpen(throttleKey, context.throttleMultiplier);
    }

    default:
      return false;
  }
}

/**
 * Filter an array of alert matches through the contest throttle.
 *
 * Returns only the matches that should be dispatched.
 * When no contest is active, all matches pass through unchanged.
 */
export function applyContestThrottle(
  matches: AlertMatch[],
  context: ThrottleContext,
): AlertMatch[] {
  // Fast path: no contest active — return everything
  if (!context.isContestWeekend) {
    return matches;
  }

  return matches.filter((match) => !shouldThrottleAlert(match, context));
}

/**
 * Get the effective alert profile based on the current context.
 *
 * When a contest is active and auto-switch is implied by providing
 * a contest profile, returns that profile. Otherwise returns the
 * "Normal" profile as fallback.
 */
export function getActiveAlertProfile(context: ThrottleContext): AlertProfile {
  if (context.isContestWeekend && context.profile) {
    return context.profile;
  }

  // Fallback to Normal profile
  return (
    BUILT_IN_PROFILES.find((p) => p.id === "normal") ?? BUILT_IN_PROFILES[0]
  );
}

/**
 * Look up a profile by ID from built-in profiles.
 * Returns the Normal profile if not found.
 */
export function getProfileById(id: string): AlertProfile {
  return (
    BUILT_IN_PROFILES.find((p) => p.id === id) ??
    BUILT_IN_PROFILES.find((p) => p.id === "normal") ??
    BUILT_IN_PROFILES[0]
  );
}
