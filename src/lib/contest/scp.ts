/**
 * Super Check Partial (SCP) - Partial Callsign Matching
 *
 * Provides fast callsign completion suggestions based on:
 * - Session history (calls already worked) - highest priority
 * - Imported MASTER.SCP database from supercheckpartial.com
 * - Optional imported call history files
 *
 * SCP helps operators quickly verify and complete partial callsigns
 * during high-speed contest operation.
 *
 * @module lib/contest/scp
 */

import type { ContestSession } from "@/stores/contestStore";
import { getSCPDatabaseMatches } from "./scpImport";

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
  /** Include matches from imported SCP database (default: true) */
  includeImported?: boolean;
}

/**
 * Source of an SCP match
 */
export type SCPMatchSource = "session" | "imported" | "history";

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

// ============================================================================
// Merged SCP Matching (Session + Imported Database)
// ============================================================================

/**
 * SCP match result with source indication
 */
export interface SCPDetailedMatch {
  /** The matched callsign */
  callsign: string;
  /** Match type: prefix, contains, or suffix */
  matchType: "prefix" | "contains" | "suffix";
  /** Source of the match */
  source: SCPMatchSource;
  /** Number of times this call was worked in the session (0 if from imported DB) */
  timesWorked: number;
  /** Last band this call was worked on (session matches only) */
  lastBand?: string;
  /** Timestamp of last QSO with this call (session matches only) */
  lastWorked?: string;
}

/**
 * Get detailed SCP matches merging session history with imported database
 *
 * Returns matches with source indication, prioritized by:
 * 1. Session history matches (already worked in current contest)
 * 2. Imported MASTER.SCP database matches
 *
 * Session matches always appear before imported matches at the same
 * match type level. Within each source, matches are sorted by relevance
 * (prefix > contains > suffix, then by times worked).
 *
 * @param partial - Partial callsign to match
 * @param session - Current contest session (may be null)
 * @param options - Matching options
 * @returns Promise resolving to array of detailed match objects
 *
 * @example
 * ```ts
 * const matches = await getSCPMatchesMerged("K3", session);
 * // Returns: [
 * //   { callsign: "K3LR", source: "session", timesWorked: 3, ... },
 * //   { callsign: "K3WW", source: "imported", timesWorked: 0, ... },
 * //   ...
 * // ]
 * ```
 */
export async function getSCPMatchesMerged(
  partial: string,
  session: ContestSession | null,
  options: SCPOptions = {},
): Promise<SCPDetailedMatch[]> {
  const {
    maxMatches = 15,
    minPartialLength = 2,
    includeImported = true,
  } = options;

  if (!partial || partial.length < minPartialLength) {
    return [];
  }

  const normalizedPartial = partial.toUpperCase();
  const seen = new Set<string>();
  const results: SCPDetailedMatch[] = [];

  // Phase 1: Session matches (highest priority)
  if (session) {
    const sessionIndex = buildSCPIndex(session);

    for (const entry of sessionIndex.values()) {
      let matchType: SCPMatch["matchType"] | null = null;

      if (entry.callsign.startsWith(normalizedPartial)) {
        matchType = "prefix";
      } else if (entry.callsign.endsWith(normalizedPartial)) {
        matchType = "suffix";
      } else if (entry.callsign.includes(normalizedPartial)) {
        matchType = "contains";
      }

      if (matchType) {
        seen.add(entry.callsign);
        results.push({
          callsign: entry.callsign,
          matchType,
          source: "session",
          timesWorked: entry.timesWorked,
          lastBand: entry.lastBand,
          lastWorked: entry.lastWorked,
        });
      }
    }
  }

  // Phase 2: Imported SCP database matches
  if (includeImported) {
    try {
      const importedMatches = await getSCPDatabaseMatches(
        normalizedPartial,
        maxMatches * 2, // Fetch extra since some may be filtered as dupes
      );

      for (const callsign of importedMatches) {
        if (seen.has(callsign)) continue;

        seen.add(callsign);
        results.push({
          callsign,
          matchType: "prefix", // Database matches are always prefix-based
          source: "imported",
          timesWorked: 0,
        });
      }
    } catch {
      // Silently fail if IndexedDB is unavailable
      // Session matches are still returned
    }
  }

  // Sort: session first, then imported; within each group by match type
  const sourceOrder: Record<SCPMatchSource, number> = {
    session: 0,
    history: 1,
    imported: 2,
  };
  const typeOrder: Record<string, number> = {
    prefix: 0,
    contains: 1,
    suffix: 2,
  };

  results.sort((a, b) => {
    // Primary: source priority
    const sourceDiff = sourceOrder[a.source] - sourceOrder[b.source];
    if (sourceDiff !== 0) return sourceDiff;

    // Secondary: match type
    const typeDiff = typeOrder[a.matchType] - typeOrder[b.matchType];
    if (typeDiff !== 0) return typeDiff;

    // Tertiary: times worked (more = higher priority)
    if (a.timesWorked !== b.timesWorked) {
      return b.timesWorked - a.timesWorked;
    }

    // Finally: alphabetical
    return a.callsign.localeCompare(b.callsign);
  });

  return results.slice(0, maxMatches);
}
