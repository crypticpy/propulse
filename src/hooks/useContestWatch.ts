/**
 * useContestWatch Hook
 *
 * Bridges the watch system (watchStore v2) to the contest multiplier engine.
 * Computes needed multipliers, identifies new-multiplier spots from the watch
 * match stream, and tracks QSO rates for the active contest session.
 *
 * Designed to be lightweight and called every render cycle in PropSphere.
 * All derived data is wrapped in useMemo to avoid unnecessary recomputation.
 *
 * @module hooks/useContestWatch
 */

import { useMemo } from "react";
import { useWatchStore } from "@/stores/watchStore";
import { useContestStore } from "@/stores/contestStore";
import type { ContestSession, MultiplierEntry } from "@/stores/contestStore";
import { useFeatureFlags } from "@/lib/featureFlags";
import { getContestById } from "@/lib/data/contests";
import { getNeededMultipliers } from "@/lib/contest/strategy";
import type { MatchedSpot } from "@/stores/watchStore";
import { getDXCCEntity } from "@/lib/utils/multipliers";

// ============================================================================
// Types
// ============================================================================

/** A spot that represents a new (unworked) multiplier */
export interface NewMultiplierSpot {
  /** Spot ID from the matched spot */
  spotId: string;
  /** DX station callsign */
  callsign: string;
  /** Band the spot was heard on */
  band: string;
  /** Type of multiplier (e.g., "DXCC", "CQ_ZONE") */
  multiplierType: string;
  /** The multiplier value (e.g., "DL", "14") */
  multiplierValue: string;
}

/**
 * Result returned by useContestWatch.
 *
 * All fields are stable references when inputs have not changed,
 * so downstream consumers can rely on referential equality for
 * React.memo / shouldComponentUpdate checks.
 */
export interface ContestWatchResult {
  /** Whether contest watch is active (has session + contest criteria + feature flag) */
  isContestWatchActive: boolean;
  /** Number of needed multipliers remaining */
  neededMultCount: number;
  /** Spots from recent matches that represent new multipliers */
  newMultiplierSpots: NewMultiplierSpot[];
  /** QSO rate per hour (from session QSOs in last 60 minutes) */
  ratePerHour: number;
  /** Rate per hour grouped by band */
  rateByBand: Record<string, number>;
  /** Active contest name (for display) */
  contestName: string | null;
}

// ============================================================================
// Constants
// ============================================================================

/** Rolling window for QSO rate calculation (ms) */
const RATE_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

/** Regex to extract CQ zone from spot comments (e.g., "CQ Zone 14", "CQ14", "Z14") */
const CQ_ZONE_REGEX = /(?:CQ\s*(?:Zone\s*)?|Z)(\d{1,2})/i;

// ============================================================================
// Defaults
// ============================================================================

const EMPTY_NEW_MULT_SPOTS: NewMultiplierSpot[] = [];
const EMPTY_RATE_BY_BAND: Record<string, number> = {};

const INACTIVE_RESULT: ContestWatchResult = {
  isContestWatchActive: false,
  neededMultCount: 0,
  newMultiplierSpots: EMPTY_NEW_MULT_SPOTS,
  ratePerHour: 0,
  rateByBand: EMPTY_RATE_BY_BAND,
  contestName: null,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a set of worked multiplier keys from session multipliers.
 * Keys are formatted as `TYPE|VALUE` or `TYPE|VALUE|BAND` for per-band mults.
 */
function buildWorkedKeySet(multipliers: MultiplierEntry[]): Set<string> {
  const keys = new Set<string>();
  for (const m of multipliers) {
    const base = `${m.type}|${m.value.toUpperCase()}`;
    keys.add(base);
    if (m.band) {
      keys.add(`${base}|${m.band.toLowerCase()}`);
    }
  }
  return keys;
}

/**
 * Lightweight DXCC prefix extraction from a callsign.
 * Uses the full getDXCCEntity lookup for accuracy.
 */
function extractDXCCPrefix(callsign: string): string | null {
  const entity = getDXCCEntity(callsign.toUpperCase());
  return entity ? entity.prefix.toUpperCase() : null;
}

/**
 * Extract CQ zone number from a spot comment string.
 * Returns a zero-padded string (e.g., "05", "14") or null.
 */
function extractCQZoneFromComment(comment: string): string | null {
  if (!comment) return null;
  const match = comment.match(CQ_ZONE_REGEX);
  if (match) {
    const zone = parseInt(match[1], 10);
    if (zone >= 1 && zone <= 40) {
      return String(zone).padStart(2, "0");
    }
  }
  return null;
}

/**
 * Check a single matched spot against the session's worked multipliers.
 * Returns an array of NewMultiplierSpot entries (0, 1, or 2 if the spot
 * yields both a DXCC and a CQ_ZONE multiplier simultaneously).
 */
function checkSpotForNewMults(
  match: MatchedSpot,
  workedKeys: Set<string>,
  multTypes: Set<string>,
  perBandTypes: Set<string>,
): NewMultiplierSpot[] {
  const results: NewMultiplierSpot[] = [];
  const spot = match.spot;
  const band = spot.band?.toLowerCase() ?? "";

  // --- DXCC check ---
  if (multTypes.has("DXCC")) {
    const prefix = extractDXCCPrefix(spot.dx);
    if (prefix) {
      const isPerBand = perBandTypes.has("DXCC");
      const baseKey = `DXCC|${prefix}`;
      // Consider it new if the base key is not worked, OR if per-band and this band is not worked
      const alreadyWorked =
        isPerBand && band
          ? workedKeys.has(`${baseKey}|${band}`)
          : workedKeys.has(baseKey);

      if (!alreadyWorked) {
        results.push({
          spotId: spot.id,
          callsign: spot.dx,
          band: spot.band ?? "",
          multiplierType: "DXCC",
          multiplierValue: prefix,
        });
      }
    }
  }

  // --- CQ_ZONE check ---
  if (multTypes.has("CQ_ZONE")) {
    const zone = extractCQZoneFromComment(spot.comment);
    if (zone) {
      const isPerBand = perBandTypes.has("CQ_ZONE");
      const baseKey = `CQ_ZONE|${zone}`;
      const alreadyWorked =
        isPerBand && band
          ? workedKeys.has(`${baseKey}|${band}`)
          : workedKeys.has(baseKey);

      if (!alreadyWorked) {
        results.push({
          spotId: spot.id,
          callsign: spot.dx,
          band: spot.band ?? "",
          multiplierType: "CQ_ZONE",
          multiplierValue: zone,
        });
      }
    }
  }

  // --- ITU_ZONE check ---
  if (multTypes.has("ITU_ZONE")) {
    // ITU zone may also appear in comments with similar format
    const zone = extractCQZoneFromComment(spot.comment);
    if (zone) {
      const zoneNum = parseInt(zone, 10);
      // ITU zones go up to 90
      if (zoneNum >= 1 && zoneNum <= 90) {
        const ituZone = String(zoneNum).padStart(2, "0");
        const isPerBand = perBandTypes.has("ITU_ZONE");
        const baseKey = `ITU_ZONE|${ituZone}`;
        const alreadyWorked =
          isPerBand && band
            ? workedKeys.has(`${baseKey}|${band}`)
            : workedKeys.has(baseKey);

        if (!alreadyWorked) {
          results.push({
            spotId: spot.id,
            callsign: spot.dx,
            band: spot.band ?? "",
            multiplierType: "ITU_ZONE",
            multiplierValue: ituZone,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Compute QSO rate per hour and per-band rates from session QSOs
 * within the last 60 minutes.
 */
function computeQSORates(session: ContestSession): {
  ratePerHour: number;
  rateByBand: Record<string, number>;
} {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  let totalInWindow = 0;
  const bandCounts: Record<string, number> = {};

  for (const qso of session.qsos) {
    const ts = new Date(qso.timestamp).getTime();
    if (ts >= cutoff) {
      totalInWindow++;
      const band = qso.band?.toLowerCase() ?? "unknown";
      bandCounts[band] = (bandCounts[band] || 0) + 1;
    }
  }

  // Since the window is exactly 1 hour, the count IS the rate/hour
  return {
    ratePerHour: totalInWindow,
    rateByBand: bandCounts,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Bridge between the watch system and the contest multiplier engine.
 *
 * Reads from watchStore (criteria, neededOnly, recentMatches),
 * contestStore (activeSession), and featureFlags (contestWatch gate)
 * to produce a unified ContestWatchResult.
 *
 * All expensive computation is memoized. The hook is safe to call
 * on every render cycle in PropSphere.
 *
 * @returns ContestWatchResult with contest watch state
 */
export function useContestWatch(): ContestWatchResult {
  // ─── Store selectors ────────────────────────────────────────────────
  const featureFlags = useFeatureFlags();
  const activeSession = useContestStore((s) => s.activeSession);
  const criteria = useWatchStore((s) => s.criteria);
  const recentMatches = useWatchStore((s) => s.recentMatches);

  // ─── Gate check ─────────────────────────────────────────────────────
  const isActive = !!(
    featureFlags.contestWatch &&
    activeSession &&
    criteria?.contestId
  );

  // ─── Contest definition ─────────────────────────────────────────────
  const contestDef = useMemo(
    () => (isActive ? getContestById(activeSession!.contestId) : undefined),
    [isActive, activeSession?.contestId],
  );

  const contestName = useMemo(() => contestDef?.name ?? null, [contestDef]);

  // ─── Needed multipliers count ───────────────────────────────────────
  const neededMultCount = useMemo(() => {
    if (!isActive || !activeSession || !contestDef) return 0;
    const needed = getNeededMultipliers(activeSession, contestDef);
    return needed.length;
  }, [isActive, activeSession, contestDef]);

  // ─── Multiplier type sets (which mult types + which are per-band) ──
  const { multTypes, perBandTypes } = useMemo(() => {
    if (!contestDef?.multiplierRules) {
      return { multTypes: new Set<string>(), perBandTypes: new Set<string>() };
    }
    const mt = new Set<string>();
    const pbt = new Set<string>();
    for (const rule of contestDef.multiplierRules) {
      mt.add(rule.type);
      if (rule.perBand) pbt.add(rule.type);
    }
    return { multTypes: mt, perBandTypes: pbt };
  }, [contestDef]);

  // ─── Worked multiplier keys ─────────────────────────────────────────
  const workedKeys = useMemo(() => {
    if (!isActive || !activeSession) return new Set<string>();
    return buildWorkedKeySet(activeSession.multipliers);
  }, [isActive, activeSession?.multipliers]);

  // ─── New multiplier spots ──────────────────────────────────────────
  const newMultiplierSpots = useMemo(() => {
    if (!isActive || multTypes.size === 0) return EMPTY_NEW_MULT_SPOTS;

    const spots: NewMultiplierSpot[] = [];
    // Deduplicate by spotId + multiplierType to avoid showing the same
    // spot twice for the same mult type
    const seen = new Set<string>();

    for (const match of recentMatches) {
      const newMults = checkSpotForNewMults(
        match,
        workedKeys,
        multTypes,
        perBandTypes,
      );
      for (const nm of newMults) {
        const dedupeKey = `${nm.spotId}|${nm.multiplierType}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          spots.push(nm);
        }
      }
    }

    return spots.length > 0 ? spots : EMPTY_NEW_MULT_SPOTS;
  }, [isActive, recentMatches, workedKeys, multTypes, perBandTypes]);

  // ─── QSO rates ─────────────────────────────────────────────────────
  const { ratePerHour, rateByBand } = useMemo(() => {
    if (!isActive || !activeSession || activeSession.qsos.length === 0) {
      return { ratePerHour: 0, rateByBand: EMPTY_RATE_BY_BAND };
    }
    return computeQSORates(activeSession);
  }, [isActive, activeSession?.qsos]);

  // ─── Assemble result ───────────────────────────────────────────────
  return useMemo(() => {
    if (!isActive) return INACTIVE_RESULT;

    return {
      isContestWatchActive: true,
      neededMultCount,
      newMultiplierSpots,
      ratePerHour,
      rateByBand,
      contestName,
    };
  }, [
    isActive,
    neededMultCount,
    newMultiplierSpots,
    ratePerHour,
    rateByBand,
    contestName,
  ]);
}
