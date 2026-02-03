/**
 * Contest Dupe Checking Engine
 *
 * Provides contest-correct duplicate QSO detection based on contest rules.
 * Supports various dupe checking strategies:
 * - Per contest (same call anywhere = dupe)
 * - Per band (same call on different band = not dupe)
 * - Per band+mode (same call/band on different mode = not dupe)
 *
 * @module lib/contest/dupes
 */

import type { DupeRule } from "@/types/contest";
import { getEffectiveDupeRule } from "@/types/contest";
import type { ContestQSODraft, ContestContext, DupeResult } from "./types";

// ============================================================================
// Dupe Key Generation
// ============================================================================

/**
 * Generate a dupe key for a QSO based on contest dupe rules
 *
 * Key format depends on contest rules:
 * - perBand && perMode: "CALLSIGN|BAND|MODE"
 * - perBand && !perMode: "CALLSIGN|BAND"
 * - !perBand && perMode: "CALLSIGN|MODE"
 * - !perBand && !perMode: "CALLSIGN" (once per contest)
 *
 * @param callsign - Normalized callsign (uppercase)
 * @param band - Normalized band (e.g., "20m")
 * @param mode - Normalized mode (e.g., "CW", "SSB")
 * @param dupeRule - Contest dupe rule configuration
 * @returns Dupe key string
 *
 * @example
 * ```ts
 * // CQWW: perBand=true, perMode=false
 * generateDupeKey("W1AW", "20m", "CW", { perBand: true, perMode: false })
 * // Returns: "W1AW|20m"
 *
 * // Sweepstakes: perBand=false, perMode=false
 * generateDupeKey("W1AW", "20m", "CW", { perBand: false, perMode: false })
 * // Returns: "W1AW"
 *
 * // Field Day: perBand=true, perMode=true
 * generateDupeKey("W1AW", "20m", "CW", { perBand: true, perMode: true })
 * // Returns: "W1AW|20m|CW"
 * ```
 */
export function generateDupeKey(
  callsign: string,
  band: string,
  mode: string,
  dupeRule: DupeRule,
): string {
  const normalizedCall = callsign.toUpperCase().trim();
  const normalizedBand = band.toLowerCase().trim();
  const normalizedMode = mode.toUpperCase().trim();

  if (dupeRule.perBand && dupeRule.perMode) {
    return `${normalizedCall}|${normalizedBand}|${normalizedMode}`;
  }

  if (dupeRule.perBand && !dupeRule.perMode) {
    return `${normalizedCall}|${normalizedBand}`;
  }

  if (!dupeRule.perBand && dupeRule.perMode) {
    return `${normalizedCall}|${normalizedMode}`;
  }

  // !perBand && !perMode - contest-wide dupe (once per contest)
  return normalizedCall;
}

// ============================================================================
// Dupe Lookup
// ============================================================================

/**
 * Check if a dupe key exists in the set of worked keys
 *
 * @param dupeKey - Dupe key to check
 * @param workedKeys - Set of previously worked dupe keys
 * @returns True if this is a duplicate
 *
 * @example
 * ```ts
 * const worked = new Set(["W1AW|20m", "K3LR|40m"]);
 * isDupeInLog("W1AW|20m", worked) // true
 * isDupeInLog("W1AW|40m", worked) // false (different band)
 * ```
 */
export function isDupeInLog(dupeKey: string, workedKeys: Set<string>): boolean {
  return workedKeys.has(dupeKey);
}

// ============================================================================
// Dupe Status Computation
// ============================================================================

/**
 * Determine dupe reason based on contest rules
 *
 * @param dupeRule - Contest dupe rule
 * @returns Reason string for dupe status
 */
function getDupeReason(dupeRule: DupeRule): "contest" | "band" | "band_mode" {
  if (dupeRule.perBand && dupeRule.perMode) {
    return "band_mode";
  }
  if (dupeRule.perBand) {
    return "band";
  }
  return "contest";
}

/**
 * Build the set of worked dupe keys from contest context
 *
 * Filters out QSOs already marked as dupes (consistent with log-checking behavior).
 *
 * @param ctx - Contest context with QSO log
 * @param dupeRule - Contest dupe rule
 * @returns Set of dupe keys for non-dupe QSOs
 */
function buildWorkedKeysSet(
  ctx: ContestContext,
  dupeRule: DupeRule,
): Set<string> {
  const workedKeys = new Set<string>();

  for (const qso of ctx.qsos) {
    // Skip QSOs already marked as dupes - they don't count for dupe checking
    if (qso.isDupe) {
      continue;
    }

    const key = generateDupeKey(qso.callsign, qso.band, qso.mode, dupeRule);
    workedKeys.add(key);
  }

  return workedKeys;
}

/**
 * Find the original QSO if this is a duplicate
 *
 * @param ctx - Contest context with QSO log
 * @param dupeKey - Dupe key to search for
 * @param dupeRule - Contest dupe rule
 * @returns Original QSO info or undefined
 */
function findOriginalQso(
  ctx: ContestContext,
  dupeKey: string,
  dupeRule: DupeRule,
): { id: string; time: string } | undefined {
  for (const qso of ctx.qsos) {
    // Skip dupes when looking for original
    if (qso.isDupe) {
      continue;
    }

    const key = generateDupeKey(qso.callsign, qso.band, qso.mode, dupeRule);
    if (key === dupeKey) {
      return {
        id: qso.id,
        time: `${qso.date} ${qso.time}`,
      };
    }
  }

  return undefined;
}

/**
 * Check if a QSO is a duplicate based on contest rules
 *
 * Uses contest DupeRule (from contest definition or legacy fields) to determine:
 * - perBand: same call on different band is NOT a dupe
 * - perMode: same call/band on different mode is NOT a dupe
 *
 * Important: QSOs already marked as dupes in the log are ignored when checking
 * for duplicates (consistent with standard log-checking behavior).
 *
 * @param draft - QSO draft to check
 * @param ctx - Contest context with session state and QSO log
 * @returns Dupe result with status, key, reason, and original QSO reference
 *
 * @example
 * ```ts
 * // For CQWW (perBand=true, perMode=false):
 * // W1AW worked on 20m CW, checking 20m SSB -> DUPE (same band)
 * // W1AW worked on 20m CW, checking 40m CW -> NOT DUPE (different band)
 *
 * // For Field Day (perBand=true, perMode=true):
 * // W1AW worked on 20m CW, checking 20m SSB -> NOT DUPE (different mode)
 * // W1AW worked on 20m CW, checking 20m CW -> DUPE (same band+mode)
 *
 * // For Sweepstakes (perBand=false, perMode=false):
 * // W1AW worked anywhere -> any W1AW QSO is DUPE
 * ```
 */
export function computeDupeStatus(
  draft: ContestQSODraft,
  ctx: ContestContext,
): DupeResult {
  // Get effective dupe rule (vNext or legacy fallback)
  const dupeRule = getEffectiveDupeRule(ctx.contest);

  // Generate dupe key for this QSO
  const dupeKey = generateDupeKey(
    draft.callsign,
    draft.band,
    draft.mode,
    dupeRule,
  );

  // Build worked keys set (excluding existing dupes)
  const workedKeys = buildWorkedKeysSet(ctx, dupeRule);

  // Check if this is a dupe
  const isDupe = isDupeInLog(dupeKey, workedKeys);

  // Build result
  const result: DupeResult = {
    isDupe,
    dupeKey,
    reason: getDupeReason(dupeRule),
  };

  // If dupe, find the original QSO
  if (isDupe) {
    const original = findOriginalQso(ctx, dupeKey, dupeRule);
    if (original) {
      result.originalQsoId = original.id;
      result.originalQsoTime = original.time;
    }
  }

  return result;
}
