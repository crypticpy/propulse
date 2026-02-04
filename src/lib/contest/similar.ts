/**
 * Similar Call Detection - Busted Call Warning System
 *
 * Detects potentially busted (miscopied) callsigns by comparing
 * new entries against calls already worked using string distance algorithms.
 *
 * This helps operators catch transcription errors before submitting
 * a QSO that might result in a Not-In-Log (NIL) penalty.
 *
 * @module lib/contest/similar
 */

import type { ContestSession } from "@/stores/contestStore";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of similar call detection
 */
export interface SimilarCall {
  /** The similar callsign found */
  callsign: string;
  /** String distance from input (lower = more similar) */
  distance: number;
  /** Similarity score (0-1, higher = more similar) */
  similarity: number;
  /** Type of potential error detected */
  errorType: SimilarCallErrorType;
  /** Bands this call was worked on */
  workedBands: string[];
  /** Number of times this call was worked */
  timesWorked: number;
}

/**
 * Types of potential callsign errors
 */
export type SimilarCallErrorType =
  | "transposition" // Adjacent characters swapped (W1AW vs W1WA)
  | "substitution" // Single character different (K3LR vs K3UR)
  | "insertion" // Extra character (W1AW vs W1AAW)
  | "deletion" // Missing character (W1AW vs W1W)
  | "phonetic" // Phonetically similar (K3LR vs K3NR)
  | "mixed"; // Multiple error types

/**
 * Options for similar call detection
 */
export interface SimilarCallOptions {
  /** Maximum string distance to consider similar (default: 2) */
  maxDistance?: number;
  /** Minimum similarity threshold 0-1 (default: 0.7) */
  minSimilarity?: number;
  /** Maximum matches to return (default: 5) */
  maxMatches?: number;
  /** Minimum callsign length to check (default: 3) */
  minCallLength?: number;
}

// ============================================================================
// Levenshtein Distance Algorithm
// ============================================================================

/**
 * Calculate Levenshtein (edit) distance between two strings
 *
 * The edit distance is the minimum number of single-character edits
 * (insertions, deletions, substitutions) needed to transform one
 * string into another.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance (0 = identical)
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Early exits for edge cases
  if (m === 0) {
    return n;
  }
  if (n === 0) {
    return m;
  }

  // Create distance matrix
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill in the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // Deletion
        dp[i][j - 1] + 1, // Insertion
        dp[i - 1][j - 1] + cost, // Substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Calculate Damerau-Levenshtein distance (includes transpositions)
 *
 * Extends Levenshtein to also consider transposition of adjacent
 * characters as a single operation, which is common in callsign typos.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Edit distance with transpositions
 */
export function damerauLevenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) {
    return n;
  }
  if (n === 0) {
    return m;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // Deletion
        dp[i][j - 1] + 1, // Insertion
        dp[i - 1][j - 1] + cost, // Substitution
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }

  return dp[m][n];
}

// ============================================================================
// Error Type Detection
// ============================================================================

/**
 * Determine the type of error between two similar callsigns
 *
 * @param input - The new callsign being entered
 * @param existing - The existing callsign it's similar to
 * @returns The likely error type
 */
function detectErrorType(
  input: string,
  existing: string,
): SimilarCallErrorType {
  const a = input.toUpperCase();
  const b = existing.toUpperCase();
  const lenDiff = Math.abs(a.length - b.length);

  // Check for length difference
  if (lenDiff > 0) {
    if (a.length > b.length) {
      return "insertion";
    }
    return "deletion";
  }

  // Same length - check for transposition
  let diffCount = 0;
  const diffPositions: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diffCount++;
      diffPositions.push(i);
    }
  }

  if (diffCount === 2) {
    // Check if it's a transposition
    const [p1, p2] = diffPositions;
    if (p2 - p1 === 1 && a[p1] === b[p2] && a[p2] === b[p1]) {
      return "transposition";
    }
  }

  if (diffCount === 1) {
    // Check for phonetically similar characters
    const pos = diffPositions[0];
    if (arePhoneticallySimilar(a[pos], b[pos])) {
      return "phonetic";
    }
    return "substitution";
  }

  if (diffCount > 2) {
    return "mixed";
  }

  return "substitution";
}

/**
 * Check if two characters are phonetically similar
 *
 * In CW/SSB operation, certain characters sound similar and are
 * commonly confused (N/M, B/D, 5/S, etc.)
 */
function arePhoneticallySimilar(a: string, b: string): boolean {
  const similarPairs: Set<string> = new Set([
    "B-D",
    "D-B",
    "B-P",
    "P-B",
    "D-T",
    "T-D",
    "M-N",
    "N-M",
    "S-5",
    "5-S",
    "O-0",
    "0-O",
    "I-1",
    "1-I",
    "L-1",
    "1-L",
    "E-3",
    "3-E",
    "F-S",
    "S-F",
    "U-V",
    "V-U",
    "G-J",
    "J-G",
    "Z-2",
    "2-Z",
  ]);

  return similarPairs.has(`${a.toUpperCase()}-${b.toUpperCase()}`);
}

// ============================================================================
// Similar Call Detection
// ============================================================================

/**
 * Find similar callsigns in session history
 *
 * Searches for callsigns that are similar to the input, which might
 * indicate a busted call. Returns matches sorted by similarity.
 *
 * @param callsign - The callsign to check for similar calls
 * @param session - Contest session with QSO history
 * @param options - Detection options
 * @returns Array of similar calls, most similar first
 *
 * @example
 * ```ts
 * // Check if "K3LU" might be a busted copy of a worked call
 * const similar = findSimilarCalls("K3LU", session);
 * // Returns: [{ callsign: "K3LR", distance: 1, similarity: 0.75, ... }]
 * ```
 */
export function findSimilarCalls(
  callsign: string,
  session: ContestSession | null,
  options: SimilarCallOptions = {},
): SimilarCall[] {
  const {
    maxDistance = 2,
    minSimilarity = 0.7,
    maxMatches = 5,
    minCallLength = 3,
  } = options;

  if (!callsign || callsign.length < minCallLength || !session) {
    return [];
  }

  const normalizedInput = callsign.toUpperCase();

  // Build map of worked calls with metadata
  const workedCalls = new Map<string, { bands: Set<string>; count: number }>();

  for (const qso of session.qsos) {
    const normalized = qso.callsign.toUpperCase();
    const existing = workedCalls.get(normalized);

    if (existing) {
      existing.bands.add(qso.band);
      existing.count++;
    } else {
      workedCalls.set(normalized, {
        bands: new Set([qso.band]),
        count: 1,
      });
    }
  }

  const matches: SimilarCall[] = [];

  for (const [workedCall, metadata] of workedCalls) {
    // Skip exact matches (not "similar", it's the same)
    if (workedCall === normalizedInput) {
      continue;
    }

    // Calculate distance using Damerau-Levenshtein (handles transpositions)
    const distance = damerauLevenshteinDistance(normalizedInput, workedCall);

    // Skip if too different
    if (distance > maxDistance) {
      continue;
    }

    // Calculate similarity score
    const maxLen = Math.max(normalizedInput.length, workedCall.length);
    const similarity = 1 - distance / maxLen;

    // Skip if below similarity threshold
    if (similarity < minSimilarity) {
      continue;
    }

    matches.push({
      callsign: workedCall,
      distance,
      similarity,
      errorType: detectErrorType(normalizedInput, workedCall),
      workedBands: Array.from(metadata.bands),
      timesWorked: metadata.count,
    });
  }

  // Sort by similarity (descending), then by distance (ascending)
  matches.sort((a, b) => {
    if (a.similarity !== b.similarity) {
      return b.similarity - a.similarity;
    }
    return a.distance - b.distance;
  });

  return matches.slice(0, maxMatches);
}

/**
 * Check if a callsign has any close matches that suggest it might be busted
 *
 * Quick check that returns true if there are any concerning similar calls.
 *
 * @param callsign - The callsign to check
 * @param session - Contest session with QSO history
 * @param threshold - Maximum distance to consider a match (default: 1)
 * @returns True if potentially busted call detected
 */
export function hasSimilarCall(
  callsign: string,
  session: ContestSession | null,
  threshold: number = 1,
): boolean {
  const matches = findSimilarCalls(callsign, session, {
    maxDistance: threshold,
    maxMatches: 1,
  });
  return matches.length > 0;
}

/**
 * Get the single most likely busted call match
 *
 * Convenience function that returns the best match or null.
 *
 * @param callsign - The callsign to check
 * @param session - Contest session with QSO history
 * @returns Most similar call or null if none found
 */
export function getMostSimilarCall(
  callsign: string,
  session: ContestSession | null,
): SimilarCall | null {
  const matches = findSimilarCalls(callsign, session, { maxMatches: 1 });
  return matches[0] || null;
}

/**
 * Calculate similarity score between two callsigns
 *
 * Returns a normalized similarity score (0-1) where 1 is identical.
 *
 * @param a - First callsign
 * @param b - Second callsign
 * @returns Similarity score (0-1)
 */
export function callsignSimilarity(a: string, b: string): number {
  const distance = damerauLevenshteinDistance(a.toUpperCase(), b.toUpperCase());
  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 ? 1 - distance / maxLen : 1;
}
