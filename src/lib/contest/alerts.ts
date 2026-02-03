/**
 * Contest Alert Engine
 *
 * Generates actionable alerts for contest operation including:
 * - Band trending up - increased spot density
 * - Needed mults spotted recently - new multipliers appearing
 *
 * Features:
 * - Rate limiting to avoid alert spam
 * - Per-type mute controls
 * - Configurable thresholds
 *
 * @module lib/contest/alerts
 */

import type { DXSpot } from "@/types/dxcluster";
import type { ContestSession } from "@/stores/contestStore";
import type { MultiplierType } from "@/types/contest";

// ============================================================================
// Types
// ============================================================================

/**
 * Alert type identifiers
 */
export type ContestAlertType = "BAND_TRENDING_UP" | "NEEDED_MULT_SPOTTED";

/**
 * Alert priority levels
 */
export type AlertPriority = "high" | "medium" | "low";

/**
 * A contest operation alert
 */
export interface ContestAlert {
  /** Unique identifier */
  id: string;
  /** Alert type */
  type: ContestAlertType;
  /** Priority level */
  priority: AlertPriority;
  /** Short title */
  title: string;
  /** Detailed message */
  message: string;
  /** Band this alert relates to (if applicable) */
  band?: string;
  /** Multiplier value if type is NEEDED_MULT_SPOTTED */
  multValue?: string;
  /** Multiplier type if applicable */
  multType?: MultiplierType;
  /** Callsign that was spotted (for mult alerts) */
  callsign?: string;
  /** Timestamp when alert was generated */
  timestamp: Date;
  /** Whether alert has been dismissed */
  dismissed?: boolean;
}

/**
 * Options for alert generation
 */
export interface AlertOptions {
  /** Muted alert types */
  mutedTypes?: ContestAlertType[];
  /** Minimum spot count change to trigger band trending alert */
  bandTrendThreshold?: number;
  /** Time window in minutes for trend calculation */
  trendWindowMinutes?: number;
  /** Maximum age of spots to consider for mult alerts (minutes) */
  multSpotMaxAge?: number;
  /** Bands to monitor (defaults to HF contest bands) */
  monitoredBands?: string[];
}

/**
 * Previous state for trend comparison
 */
export interface AlertState {
  /** Previous spot counts by band */
  previousSpotCounts: Record<string, number>;
  /** Timestamp of last state snapshot */
  lastSnapshot: Date;
  /** Recently fired alerts (for rate limiting) */
  firedAlerts: Map<string, Date>;
  /** Alert cooldown in milliseconds */
  cooldownMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default HF contest bands */
const HF_CONTEST_BANDS = ["160m", "80m", "40m", "20m", "15m", "10m"] as const;

/** Default cooldown between same-type alerts (5 minutes) */
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

/** Default band trend threshold (increase of 3+ spots) */
const DEFAULT_BAND_TREND_THRESHOLD = 3;

/** Default trend window (10 minutes) */
const DEFAULT_TREND_WINDOW_MINUTES = 10;

/** Default max age for mult spots (15 minutes) */
const DEFAULT_MULT_SPOT_MAX_AGE = 15;

// ============================================================================
// State Management
// ============================================================================

/**
 * Create initial alert state
 */
export function createAlertState(cooldownMs = DEFAULT_COOLDOWN_MS): AlertState {
  return {
    previousSpotCounts: {},
    lastSnapshot: new Date(),
    firedAlerts: new Map(),
    cooldownMs,
  };
}

/**
 * Update spot counts snapshot
 */
export function updateSpotSnapshot(
  state: AlertState,
  spots: DXSpot[],
  bands: readonly string[] = HF_CONTEST_BANDS,
): AlertState {
  const counts: Record<string, number> = {};

  for (const band of bands) {
    counts[band] = 0;
  }

  const cutoffTime = Date.now() - DEFAULT_TREND_WINDOW_MINUTES * 60 * 1000;

  for (const spot of spots) {
    if (spot.band && spot.time.getTime() >= cutoffTime) {
      if (bands.includes(spot.band as (typeof bands)[number])) {
        counts[spot.band] = (counts[spot.band] || 0) + 1;
      }
    }
  }

  return {
    ...state,
    previousSpotCounts: counts,
    lastSnapshot: new Date(),
  };
}

// ============================================================================
// Alert Generation
// ============================================================================

/**
 * Check if an alert type is in cooldown
 */
function isInCooldown(state: AlertState, alertKey: string): boolean {
  const lastFired = state.firedAlerts.get(alertKey);
  if (!lastFired) return false;
  return Date.now() - lastFired.getTime() < state.cooldownMs;
}

/**
 * Record that an alert was fired
 */
function recordAlertFired(state: AlertState, alertKey: string): AlertState {
  const newFiredAlerts = new Map(state.firedAlerts);
  newFiredAlerts.set(alertKey, new Date());
  return { ...state, firedAlerts: newFiredAlerts };
}

/**
 * Generate a unique alert ID
 */
function generateAlertId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Detect band trending up alerts
 */
function detectBandTrending(
  spots: DXSpot[],
  state: AlertState,
  options: AlertOptions,
): { alerts: ContestAlert[]; newState: AlertState } {
  const alerts: ContestAlert[] = [];
  let newState = state;

  const threshold = options.bandTrendThreshold ?? DEFAULT_BAND_TREND_THRESHOLD;
  const windowMinutes =
    options.trendWindowMinutes ?? DEFAULT_TREND_WINDOW_MINUTES;
  const bands = options.monitoredBands ?? [...HF_CONTEST_BANDS];

  // Calculate current spot counts within window
  const currentCounts: Record<string, number> = {};
  const cutoffTime = Date.now() - windowMinutes * 60 * 1000;

  for (const band of bands) {
    currentCounts[band] = 0;
  }

  for (const spot of spots) {
    if (spot.band && spot.time.getTime() >= cutoffTime) {
      if (bands.includes(spot.band)) {
        currentCounts[spot.band] = (currentCounts[spot.band] || 0) + 1;
      }
    }
  }

  // Compare with previous counts
  for (const band of bands) {
    const previous = state.previousSpotCounts[band] ?? 0;
    const current = currentCounts[band] ?? 0;
    const increase = current - previous;

    if (increase >= threshold) {
      const alertKey = `BAND_TRENDING_UP:${band}`;

      if (!isInCooldown(state, alertKey)) {
        alerts.push({
          id: generateAlertId(),
          type: "BAND_TRENDING_UP",
          priority: increase >= threshold * 2 ? "high" : "medium",
          title: `${band} Opening`,
          message: `${band} activity increasing (+${increase} spots in ${windowMinutes}min)`,
          band,
          timestamp: new Date(),
        });

        newState = recordAlertFired(newState, alertKey);
      }
    }
  }

  return { alerts, newState };
}

/**
 * Extract DXCC prefix from callsign (simplified)
 */
function extractDXCCPrefix(callsign: string): string {
  const upper = callsign.toUpperCase();

  // Handle portable indicators
  const parts = upper.split("/");
  const mainCall =
    parts.length > 1 && parts[0].length <= 3 ? parts[1] : parts[0];

  // Extract prefix (letters before first number, plus number)
  const match = mainCall.match(/^([A-Z]{1,2}\d)/);
  if (match) {
    return match[1];
  }

  // Fallback: first 2-3 characters
  return mainCall.slice(0, 2);
}

/**
 * Check if a callsign matches any needed multiplier
 */
function matchesNeededMult(
  callsign: string,
  session: ContestSession,
  _workedMults: Set<string>,
): { matches: boolean; type?: MultiplierType; value?: string } {
  const prefix = extractDXCCPrefix(callsign);

  // Check if this DXCC prefix is already worked
  const workedDXCC = new Set(
    session.multipliers
      .filter((m) => m.type === "DXCC")
      .map((m) => m.value.toUpperCase()),
  );

  if (!workedDXCC.has(prefix)) {
    return { matches: true, type: "DXCC", value: prefix };
  }

  return { matches: false };
}

/**
 * Detect needed multiplier spotted alerts
 */
function detectNeededMultSpotted(
  spots: DXSpot[],
  session: ContestSession,
  state: AlertState,
  options: AlertOptions,
): { alerts: ContestAlert[]; newState: AlertState } {
  const alerts: ContestAlert[] = [];
  let newState = state;

  const maxAge = options.multSpotMaxAge ?? DEFAULT_MULT_SPOT_MAX_AGE;
  const cutoffTime = Date.now() - maxAge * 60 * 1000;

  // Build set of worked mults for efficient lookup
  const workedMults = new Set(
    session.multipliers.map((m) => `${m.type}:${m.value.toUpperCase()}`),
  );

  // Check recent spots for needed mults
  const recentSpots = spots.filter((s) => s.time.getTime() >= cutoffTime);

  // Track spotted mults to avoid duplicate alerts
  const spottedMults = new Set<string>();

  for (const spot of recentSpots) {
    const match = matchesNeededMult(spot.dx, session, workedMults);

    if (match.matches && match.type && match.value) {
      const multKey = `${match.type}:${match.value}`;

      // Skip if already spotted in this batch
      if (spottedMults.has(multKey)) continue;
      spottedMults.add(multKey);

      const alertKey = `NEEDED_MULT_SPOTTED:${multKey}`;

      if (!isInCooldown(state, alertKey)) {
        alerts.push({
          id: generateAlertId(),
          type: "NEEDED_MULT_SPOTTED",
          priority: "high",
          title: `Needed Mult: ${match.value}`,
          message: `${spot.dx} spotted on ${spot.band ?? "?"} - new ${match.type} mult`,
          band: spot.band,
          multValue: match.value,
          multType: match.type,
          callsign: spot.dx,
          timestamp: new Date(),
        });

        newState = recordAlertFired(newState, alertKey);
      }
    }
  }

  return { alerts, newState };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get active alerts based on current state
 *
 * @param session - Active contest session
 * @param spots - Current DX spots
 * @param state - Alert state for rate limiting
 * @param options - Alert generation options
 * @returns Array of alerts and updated state
 */
export function getActiveAlerts(
  session: ContestSession | null,
  spots: DXSpot[],
  state: AlertState,
  options: AlertOptions = {},
): { alerts: ContestAlert[]; newState: AlertState } {
  const allAlerts: ContestAlert[] = [];
  let newState = state;

  const mutedTypes = options.mutedTypes ?? [];

  // Detect band trending alerts
  if (!mutedTypes.includes("BAND_TRENDING_UP")) {
    const bandResult = detectBandTrending(spots, newState, options);
    allAlerts.push(...bandResult.alerts);
    newState = bandResult.newState;
  }

  // Detect needed mult alerts (only if session is active)
  if (session && !mutedTypes.includes("NEEDED_MULT_SPOTTED")) {
    const multResult = detectNeededMultSpotted(
      spots,
      session,
      newState,
      options,
    );
    allAlerts.push(...multResult.alerts);
    newState = multResult.newState;
  }

  // Sort by priority (high first) then by timestamp (newest first)
  const priorityOrder: Record<AlertPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  allAlerts.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  return { alerts: allAlerts, newState };
}

/**
 * Dismiss an alert by ID
 */
export function dismissAlert(
  alerts: ContestAlert[],
  alertId: string,
): ContestAlert[] {
  return alerts.map((alert) =>
    alert.id === alertId ? { ...alert, dismissed: true } : alert,
  );
}

/**
 * Filter out dismissed alerts
 */
export function filterActiveAlerts(alerts: ContestAlert[]): ContestAlert[] {
  return alerts.filter((alert) => !alert.dismissed);
}

/**
 * Get alert type display name
 */
export function getAlertTypeName(type: ContestAlertType): string {
  switch (type) {
    case "BAND_TRENDING_UP":
      return "Band Opening";
    case "NEEDED_MULT_SPOTTED":
      return "Needed Mult";
    default:
      return "Alert";
  }
}

/**
 * Get alert priority color class
 */
export function getAlertPriorityColor(priority: AlertPriority): string {
  switch (priority) {
    case "high":
      return "text-plasma-orange";
    case "medium":
      return "text-cosmic-cyan";
    case "low":
      return "text-gray-400";
    default:
      return "text-white";
  }
}

/**
 * Get alert priority background class
 */
export function getAlertPriorityBg(priority: AlertPriority): string {
  switch (priority) {
    case "high":
      return "bg-plasma-orange/20 border-plasma-orange/40";
    case "medium":
      return "bg-cosmic-cyan/20 border-cosmic-cyan/40";
    case "low":
      return "bg-white/10 border-white/20";
    default:
      return "bg-white/5 border-white/10";
  }
}
