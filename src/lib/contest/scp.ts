/**
 * Super Check Partial (SCP) - Partial Callsign Matching
 *
 * Provides fast callsign completion suggestions based on:
 * - Session history (calls already worked)
 * - Optional imported call history files (future extension)
 *
 * SCP helps operators quickly verify and complete partial callsigns
 * during high-speed contest operation.
 *
 * @module lib/contest/scp
 */

import type { ContestSession } from "@/stores/contestStore";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for SCP matching
 */
export interface SCPOptions {
  /** Maximum number of matches to return (default: 10) */
  maxMatches?: number;
  /** Minimum partial length to trigger matching (default: 2) */
  minPartialLength?: number;
  /** Case-sensitive matching (default: false) */
  caseSensitive?: boolean;
}

/**
 * SCP match result with metadata
 */
export interface SCPMatch {
  /** The matched callsign */
  callsign: string;
  /** Match type: prefix, contains, or suffix */
  matchType: "prefix" | "contains" | "suffix";
  /** Number of times this call was worked in the session */
  timesWorked: number;
  /** Last band this call was worked on */
  lastBand?: string;
  /** Timestamp of last QSO with this call */
  lastWorked?: string;
}

/**
 * SCP index entry for a callsign
 */
interface SCPIndexEntry {
  callsign: string;
  timesWorked: number;
  lastBand?: string;
  lastWorked?: string;
}

// ============================================================================
// SCP Index Builder
// ============================================================================

/**
 * Build an SCP index from session QSOs
 *
 * Creates an in-memory index optimized for partial matching.
 * The index maps normalized callsigns to their metadata.
 *
 * @param session - Contest session containing QSO history
 * @returns Map of normalized callsigns to index entries
 */
export function buildSCPIndex(
  session: ContestSession | null,
): Map<string, SCPIndexEntry> {
  const index = new Map<string, SCPIndexEntry>();

  if (!session) {
    return index;
  }

  for (const qso of session.qsos) {
    const normalized = qso.callsign.toUpperCase();
    const existing = index.get(normalized);

    if (existing) {
      existing.timesWorked++;
      // Update last worked info if this QSO is more recent
      if (!existing.lastWorked || qso.timestamp > existing.lastWorked) {
        existing.lastWorked = qso.timestamp;
        existing.lastBand = qso.band;
      }
    } else {
      index.set(normalized, {
        callsign: normalized,
        timesWorked: 1,
        lastBand: qso.band,
        lastWorked: qso.timestamp,
      });
    }
  }

  return index;
}

// ============================================================================
// SCP Matching Functions
// ============================================================================

/**
 * Get SCP matches for a partial callsign
 *
 * Searches the session history for callsigns matching the partial input.
 * Matching is done in order of preference:
 * 1. Prefix matches (partial at start)
 * 2. Contains matches (partial anywhere)
 * 3. Suffix matches (partial at end)
 *
 * @param partial - Partial callsign to match
 * @param session - Contest session with QSO history
 * @param options - Matching options
 * @returns Array of matching callsigns (most relevant first)
 *
 * @example
 * ```ts
 * // Get matches for "K3" from session history
 * const matches = getSCPMatches("K3", session);
 * // Returns: ["K3LR", "K3WW", "K3CR", ...]
 * ```
 */
export function getSCPMatches(
  partial: string,
  session: ContestSession | null,
  options: SCPOptions = {},
): string[] {
  const { maxMatches = 10, minPartialLength = 2 } = options;

  // Return empty if partial is too short or no session
  if (!partial || partial.length < minPartialLength || !session) {
    return [];
  }

  const normalizedPartial = partial.toUpperCase();
  const index = buildSCPIndex(session);

  // Collect matches by type
  const prefixMatches: SCPIndexEntry[] = [];
  const containsMatches: SCPIndexEntry[] = [];
  const suffixMatches: SCPIndexEntry[] = [];

  for (const entry of index.values()) {
    if (entry.callsign.startsWith(normalizedPartial)) {
      prefixMatches.push(entry);
    } else if (entry.callsign.endsWith(normalizedPartial)) {
      suffixMatches.push(entry);
    } else if (entry.callsign.includes(normalizedPartial)) {
      containsMatches.push(entry);
    }
  }

  // Sort each group by times worked (most frequent first), then alphabetically
  const sortByRelevance = (a: SCPIndexEntry, b: SCPIndexEntry): number => {
    if (a.timesWorked !== b.timesWorked) {
      return b.timesWorked - a.timesWorked;
    }
    return a.callsign.localeCompare(b.callsign);
  };

  prefixMatches.sort(sortByRelevance);
  containsMatches.sort(sortByRelevance);
  suffixMatches.sort(sortByRelevance);

  // Combine results in preference order
  const allMatches = [...prefixMatches, ...containsMatches, ...suffixMatches];

  // Return just callsigns, limited to maxMatches
  return allMatches.slice(0, maxMatches).map((entry) => entry.callsign);
}

/**
 * Get detailed SCP matches with metadata
 *
 * Similar to getSCPMatches but returns full match objects with
 * metadata about each match (times worked, last band, etc.)
 *
 * @param partial - Partial callsign to match
 * @param session - Contest session with QSO history
 * @param options - Matching options
 * @returns Array of SCPMatch objects with metadata
 */
export function getSCPMatchesDetailed(
  partial: string,
  session: ContestSession | null,
  options: SCPOptions = {},
): SCPMatch[] {
  const { maxMatches = 10, minPartialLength = 2 } = options;

  if (!partial || partial.length < minPartialLength || !session) {
    return [];
  }

  const normalizedPartial = partial.toUpperCase();
  const index = buildSCPIndex(session);

  const matches: SCPMatch[] = [];

  for (const entry of index.values()) {
    let matchType: SCPMatch["matchType"] | null = null;

    if (entry.callsign.startsWith(normalizedPartial)) {
      matchType = "prefix";
    } else if (entry.callsign.endsWith(normalizedPartial)) {
      matchType = "suffix";
    } else if (entry.callsign.includes(normalizedPartial)) {
      matchType = "contains";
    }

    if (matchType) {
      matches.push({
        callsign: entry.callsign,
        matchType,
        timesWorked: entry.timesWorked,
        lastBand: entry.lastBand,
        lastWorked: entry.lastWorked,
      });
    }
  }

  // Sort by match type preference, then by times worked
  const typeOrder = { prefix: 0, contains: 1, suffix: 2 };
  matches.sort((a, b) => {
    const typeComparison = typeOrder[a.matchType] - typeOrder[b.matchType];
    if (typeComparison !== 0) {
      return typeComparison;
    }

    if (a.timesWorked !== b.timesWorked) {
      return b.timesWorked - a.timesWorked;
    }
    return a.callsign.localeCompare(b.callsign);
  });

  return matches.slice(0, maxMatches);
}

/**
 * Check if a callsign exists in the SCP index
 *
 * Fast lookup to check if a complete callsign has been worked before.
 *
 * @param callsign - Full callsign to check
 * @param session - Contest session with QSO history
 * @returns True if callsign exists in session history
 */
export function isCallInSCP(
  callsign: string,
  session: ContestSession | null,
): boolean {
  if (!callsign || !session) {
    return false;
  }

  const normalized = callsign.toUpperCase();
  return session.qsos.some((qso) => qso.callsign.toUpperCase() === normalized);
}

/**
 * Get count of unique callsigns in session
 *
 * @param session - Contest session with QSO history
 * @returns Number of unique callsigns worked
 */
export function getSCPIndexSize(session: ContestSession | null): number {
  if (!session) {
    return 0;
  }

  const unique = new Set<string>();
  for (const qso of session.qsos) {
    unique.add(qso.callsign.toUpperCase());
  }
  return unique.size;
}
