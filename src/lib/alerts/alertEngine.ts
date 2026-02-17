/**
 * Spot Alert Rules Engine
 *
 * Pure-function evaluation engine that checks incoming DX spots against
 * user-defined alert rules. Side effects (notifications, sounds) are
 * isolated in the `dispatchAlert` function.
 */

import type { AlertRule, AlertConditions } from "@/lib/db/types";
import { lookupEntity } from "@/lib/data/dxccEntities";
import type { DXCCLookupResult } from "@/lib/data/dxccEntities";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  applyContestThrottle,
  type ThrottleContext,
} from "@/lib/alerts/contestAlertLogic";
import { playAlertTone } from "@/lib/audio/alertSynthesizer";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Minimal spot shape for rule evaluation.
 * Works with both LiveSpot (frontend) and SpotHistoryRow (Supabase).
 */
export interface SpotLike {
  /** TX station callsign */
  callsign: string;
  /** Frequency in kHz */
  frequency: number;
  /** Operating mode */
  mode: string;
  /** Band designation (e.g., "20m") */
  band: string;
  /** Signal-to-noise ratio (optional) */
  snr?: number;
  /** Spot source identifier */
  source: string;
  /** DXCC entity number (pre-resolved, optional) */
  dxcc?: number;
  /** Country name (pre-resolved, optional) */
  country?: string;
  /** Continent code (pre-resolved, optional) */
  continent?: string;
  /** Maidenhead grid locator (optional) */
  grid?: string;
}

/**
 * Result of a spot matching a rule.
 */
export interface AlertMatch {
  /** The rule that matched */
  rule: AlertRule;
  /** The spot that triggered the match */
  spot: SpotLike;
  /** ISO timestamp when the match occurred */
  matchedAt: string;
  /** Which condition fields contributed to the match */
  matchedFields: string[];
}

// ─── Glob Matching ──────────────────────────────────────────────────────────

/**
 * Convert a glob-style pattern to a RegExp.
 * Supports:
 *   * → any characters (zero or more)
 *   ? → exactly one character
 *
 * @example
 * globToRegex("YB*")   → /^YB.*$/i
 * globToRegex("VK?ABC") → /^VK.ABC$/i
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const globbed = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${globbed}$`, "i");
}

// ─── Rule Matching (Pure) ───────────────────────────────────────────────────

/**
 * Check whether a single spot matches a single rule.
 * Returns true if ALL non-empty conditions are satisfied (AND logic).
 *
 * Pure function — no side effects.
 */
export function matchesRule(spot: SpotLike, rule: AlertRule): boolean {
  if (!rule.enabled) return false;

  const conditions = rule.conditions;

  // If there are no conditions at all, the rule matches everything
  // (but this is likely a misconfiguration, so we still allow it)
  const checks = getMatchedFields(spot, conditions);

  // If no conditions were specified, the rule vacuously matches
  if (checks.total === 0) return true;

  // All specified conditions must match
  return checks.matched === checks.total;
}

/**
 * Internal: evaluate each condition and return counts + field names.
 */
function getMatchedFields(
  spot: SpotLike,
  conditions: AlertConditions,
): { total: number; matched: number; fields: string[] } {
  let total = 0;
  let matched = 0;
  const fields: string[] = [];

  // Resolve DXCC entity from callsign if not pre-resolved
  let entityResult: DXCCLookupResult | null = null;
  const needsEntity =
    conditions.entityPattern ||
    (conditions.continents && conditions.continents.length > 0);

  if (needsEntity) {
    if (spot.dxcc || spot.country || spot.continent) {
      // Use pre-resolved data — construct a minimal result
      entityResult = null; // We'll check individual fields below
    } else {
      entityResult = lookupEntity(spot.callsign);
    }
  }

  // ── Callsign pattern ──
  if (conditions.callsignPattern && conditions.callsignPattern.trim()) {
    total++;
    const regex = globToRegex(conditions.callsignPattern.trim());
    if (regex.test(spot.callsign)) {
      matched++;
      fields.push("callsignPattern");
    }
  }

  // ── Entity pattern (DXCC name or number) ──
  if (conditions.entityPattern && conditions.entityPattern.trim()) {
    total++;
    const pattern = conditions.entityPattern.trim().toLowerCase();
    let entityMatch = false;

    // Try matching by entity name
    const entityName = spot.country ?? entityResult?.entity.name ?? "";
    if (entityName.toLowerCase().includes(pattern)) {
      entityMatch = true;
    }

    // Try matching by DXCC number
    const dxccId = spot.dxcc ?? entityResult?.entity.id;
    if (!entityMatch && dxccId !== undefined && String(dxccId) === pattern) {
      entityMatch = true;
    }

    // Try matching by prefix
    const prefix = entityResult?.entity.prefix ?? "";
    if (!entityMatch && prefix.toLowerCase() === pattern) {
      entityMatch = true;
    }

    if (entityMatch) {
      matched++;
      fields.push("entityPattern");
    }
  }

  // ── Bands ──
  if (conditions.bands && conditions.bands.length > 0) {
    total++;
    const normalizedBand = spot.band.toLowerCase();
    if (conditions.bands.some((b) => b.toLowerCase() === normalizedBand)) {
      matched++;
      fields.push("bands");
    }
  }

  // ── Modes ──
  if (conditions.modes && conditions.modes.length > 0) {
    total++;
    const normalizedMode = spot.mode.toUpperCase();
    if (conditions.modes.some((m) => m.toUpperCase() === normalizedMode)) {
      matched++;
      fields.push("modes");
    }
  }

  // ── Min SNR ──
  if (conditions.minSnr !== undefined && conditions.minSnr !== null) {
    total++;
    if (spot.snr !== undefined && spot.snr >= conditions.minSnr) {
      matched++;
      fields.push("minSnr");
    }
  }

  // ── Continents ──
  if (conditions.continents && conditions.continents.length > 0) {
    total++;
    const continent = spot.continent ?? entityResult?.entity.continent ?? "";
    if (
      continent &&
      conditions.continents.some(
        (c) => c.toUpperCase() === continent.toUpperCase(),
      )
    ) {
      matched++;
      fields.push("continents");
    }
  }

  return { total, matched, fields };
}

// ─── Batch Evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate a spot against all provided rules.
 * Returns an AlertMatch for each rule that matches.
 *
 * Pure function — no side effects.
 */
export function evaluateSpot(spot: SpotLike, rules: AlertRule[]): AlertMatch[] {
  const matches: AlertMatch[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const checks = getMatchedFields(spot, rule.conditions);
    const isMatch = checks.total === 0 || checks.matched === checks.total;

    if (isMatch) {
      matches.push({
        rule,
        spot,
        matchedAt: new Date().toISOString(),
        matchedFields: checks.fields,
      });
    }
  }

  return matches;
}

// ─── Contest-Aware Evaluation ────────────────────────────────────────────────

/**
 * Evaluate a spot against all rules, then pipe results through the
 * contest throttle middleware.
 *
 * This is the recommended entry point when contest awareness is needed.
 * Falls back to standard `evaluateSpot()` behavior when no contest is active.
 *
 * @param spot - The incoming spot to evaluate
 * @param rules - All user-defined alert rules
 * @param throttleContext - Contest state and profile configuration
 * @returns AlertMatch[] — only matches that survive throttling
 */
export function evaluateSpotWithContest(
  spot: SpotLike,
  rules: AlertRule[],
  throttleContext: ThrottleContext,
): AlertMatch[] {
  const matches = evaluateSpot(spot, rules);
  return applyContestThrottle(matches, throttleContext);
}

// ─── Alert Dispatch (Side Effects) ──────────────────────────────────────────

/**
 * Dispatch a matched alert via browser notification, sound, and in-app toast.
 *
 * This is the ONLY function with side effects. Called by the monitoring hook.
 */
export function dispatchAlert(match: AlertMatch): void {
  const { rule, spot } = match;
  const notification = rule.notification;
  const settings = useSettingsStore.getState();

  // ── Browser Notification ──
  if (
    notification.browser &&
    settings.alertBrowserNotifications !== false &&
    typeof Notification !== "undefined"
  ) {
    if (Notification.permission === "granted") {
      const freq = spot.frequency.toFixed(1);
      new Notification(`Spot Alert: ${spot.callsign}`, {
        body: `${spot.callsign} on ${freq} kHz (${spot.band} ${spot.mode}) — Rule: ${rule.name}`,
        icon: "/favicon.ico",
        tag: `spot-alert-${spot.callsign}-${spot.band}`,
      });
    } else if (Notification.permission === "default") {
      // Request permission for next time
      Notification.requestPermission().catch(() => {
        // Silently ignore — user declined
      });
    }
  }

  // ── Sound ──
  if (notification.sound && settings.alertSoundEnabled !== false) {
    playAlertSound(settings.alertSoundVolume ?? 50);
  }
}

/**
 * Play a short alert tone using the Web Audio API.
 * Volume: 0-100 (maps to 0.0-1.0 gain).
 *
 * When `useEnhancedAlertSounds` is enabled in settings (default: true),
 * uses the synthesizer for a richer INFO-priority chime. Falls back to
 * the original 880Hz sine blip otherwise.
 */
function playAlertSound(volume: number): void {
  try {
    // Check if enhanced synthesized sounds are enabled (default: true)
    const settings = useSettingsStore.getState();
    const useEnhanced =
      settings.notifications?.useEnhancedAlertSounds !== false;

    if (useEnhanced) {
      // Spot alerts use INFO priority (non-solar, no specific AlertType)
      playAlertTone("INFO", undefined, volume);
      return;
    }

    // Legacy fallback: single 880Hz sine blip
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
    gainNode.gain.setValueAtTime(
      Math.max(0, Math.min(1, volume / 100)),
      ctx.currentTime,
    );

    // Quick fade out for a pleasant "blip"
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);

    // Cleanup after sound finishes
    oscillator.onended = () => {
      ctx.close().catch(() => {
        // Silently ignore AudioContext close errors
      });
    };
  } catch {
    // Web Audio API not available — silently skip
  }
}
