/**
 * Multi-Location Pass Scheduling (SatMatch)
 *
 * Finds satellite passes that are simultaneously visible from two locations,
 * enabling operators to schedule satellite contacts with each other.
 * Uses the existing SGP4 pass prediction engine.
 */

import type { PassPrediction } from "@/types/satellite";
import { getSimplePassPrediction } from "@/lib/api/satellites";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SharedPass {
  satellite: string;
  myPass: PassPrediction;
  theirPass: PassPrediction;
  overlapStartUTC: string;
  overlapEndUTC: string;
  overlapDurationMin: number;
  myMaxEl: number;
  theirMaxEl: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a PassPrediction date field to a timestamp, handling
 * both Date objects and JSON string dates.
 */
function toMs(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

/**
 * Find the overlap window between two time ranges.
 * Returns null if there is no overlap.
 */
function findOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): { start: number; end: number } | null {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  if (start >= end) return null;
  return { start, end };
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Find satellite passes that are simultaneously visible from two locations.
 *
 * 1. Compute passes for myLocation using getSimplePassPrediction
 * 2. Compute passes for theirLocation using getSimplePassPrediction
 * 3. Find overlapping time windows
 * 4. Return sorted by overlap duration descending
 *
 * @param tleLine1 - TLE line 1
 * @param tleLine2 - TLE line 2
 * @param satName - Satellite name for display
 * @param myLocation - Your observer location
 * @param theirLocation - Remote operator's location
 * @param hoursAhead - Prediction window in hours (default 24)
 * @returns Shared passes sorted by overlap duration (longest first)
 */
export function findSharedPasses(
  tleLine1: string,
  tleLine2: string,
  satName: string,
  myLocation: { lat: number; lon: number },
  theirLocation: { lat: number; lon: number },
  hoursAhead: number = 24,
): SharedPass[] {
  const now = new Date();

  // Build a minimal TLE object for the prediction function
  const tle = {
    name: satName,
    line1: tleLine1,
    line2: tleLine2,
    noradId: parseInt(tleLine1.substring(2, 7).trim(), 10) || 0,
  };

  // Compute passes for both locations
  const myPasses = getSimplePassPrediction(
    tle,
    myLocation.lat,
    myLocation.lon,
    now,
    hoursAhead,
  );

  const theirPasses = getSimplePassPrediction(
    tle,
    theirLocation.lat,
    theirLocation.lon,
    now,
    hoursAhead,
  );

  // Find overlapping passes
  const results: SharedPass[] = [];

  for (const myPass of myPasses) {
    const myStart = toMs(myPass.aos);
    const myEnd = toMs(myPass.los);

    for (const theirPass of theirPasses) {
      const theirStart = toMs(theirPass.aos);
      const theirEnd = toMs(theirPass.los);

      const overlap = findOverlap(myStart, myEnd, theirStart, theirEnd);
      if (!overlap) continue;

      const durationMin = (overlap.end - overlap.start) / 60_000;

      // Only include overlaps of at least 1 minute
      if (durationMin < 1) continue;

      results.push({
        satellite: satName,
        myPass,
        theirPass,
        overlapStartUTC: new Date(overlap.start).toISOString(),
        overlapEndUTC: new Date(overlap.end).toISOString(),
        overlapDurationMin: Math.round(durationMin * 10) / 10,
        myMaxEl: myPass.maxEl,
        theirMaxEl: theirPass.maxEl,
      });
    }
  }

  // Sort by overlap duration descending (best first)
  results.sort((a, b) => b.overlapDurationMin - a.overlapDurationMin);

  return results;
}

/**
 * Format a shared pass summary for display.
 *
 * Example: "IO-117 shared pass: 14:32-14:41 UTC, them 35deg me 52deg"
 */
export function formatSharedPassSummary(pass: SharedPass): string {
  const start = new Date(pass.overlapStartUTC);
  const end = new Date(pass.overlapEndUTC);

  const startStr = start.toISOString().slice(11, 16);
  const endStr = end.toISOString().slice(11, 16);

  return (
    `${pass.satellite} shared pass: ${startStr}-${endStr} UTC, ` +
    `them ${Math.round(pass.theirMaxEl)}\u00B0 me ${Math.round(pass.myMaxEl)}\u00B0`
  );
}
