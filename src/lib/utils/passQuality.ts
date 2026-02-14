/**
 * Pass Quality Scoring
 *
 * Evaluates a satellite pass and produces a 1-5 star quality score
 * based on elevation, duration, and time of day. Used by the satellite
 * tracking UI to highlight the best upcoming passes.
 */

import type { PassPrediction } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PassQualityResult {
  score: 1 | 2 | 3 | 4 | 5;
  factors: string[];
  label: "Excellent" | "Good" | "Fair" | "Marginal" | "Poor";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Local hour range considered daytime (inclusive) */
const DAYTIME_START = 6; // 6 AM
const DAYTIME_END = 22; // 10 PM

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a number between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Map a raw numeric score to a 1-5 star rating.
 */
function mapToStars(raw: number): 1 | 2 | 3 | 4 | 5 {
  if (raw >= 6) return 5;
  if (raw >= 4.5) return 4;
  if (raw >= 3) return 3;
  if (raw >= 1.5) return 2;
  return 1;
}

/**
 * Map a star rating to a human-readable label.
 */
function starToLabel(stars: 1 | 2 | 3 | 4 | 5): PassQualityResult["label"] {
  switch (stars) {
    case 5:
      return "Excellent";
    case 4:
      return "Good";
    case 3:
      return "Fair";
    case 2:
      return "Marginal";
    case 1:
      return "Poor";
  }
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Compute a quality score for a satellite pass.
 *
 * Scoring factors:
 * - Max elevation: >60deg = 5pts, >45deg = 4pts, >30deg = 3pts, >15deg = 2pts, else 1pt
 * - Duration: >10min = +1, >7min = +0.5, <3min = -1
 * - Time of day: 6am-10pm local = +0.5, otherwise -0.5
 *
 * Total is mapped to a 1-5 star rating.
 */
export function computePassQuality(pass: PassPrediction): PassQualityResult {
  const factors: string[] = [];
  let total = 0;

  // --- Elevation scoring ---
  const maxEl = pass.maxEl;
  let elPts: number;

  if (maxEl > 60) {
    elPts = 5;
    factors.push(`High overhead pass (${Math.round(maxEl)}\u00B0)`);
  } else if (maxEl > 45) {
    elPts = 4;
    factors.push(`Good elevation (${Math.round(maxEl)}\u00B0)`);
  } else if (maxEl > 30) {
    elPts = 3;
    factors.push(`Moderate elevation (${Math.round(maxEl)}\u00B0)`);
  } else if (maxEl > 15) {
    elPts = 2;
    factors.push(`Low pass (${Math.round(maxEl)}\u00B0)`);
  } else {
    elPts = 1;
    factors.push(`Horizon-skimming (${Math.round(maxEl)}\u00B0)`);
  }
  total += elPts;

  // --- Duration scoring ---
  const aosMs =
    pass.aos instanceof Date
      ? pass.aos.getTime()
      : new Date(pass.aos).getTime();
  const losMs =
    pass.los instanceof Date
      ? pass.los.getTime()
      : new Date(pass.los).getTime();
  const durationMin = (losMs - aosMs) / 60_000;

  if (durationMin > 10) {
    total += 1;
    factors.push(`Long pass (${Math.round(durationMin)} min)`);
  } else if (durationMin > 7) {
    total += 0.5;
    factors.push(`Moderate duration (${Math.round(durationMin)} min)`);
  } else if (durationMin < 3) {
    total -= 1;
    factors.push(`Very short pass (${Math.round(durationMin)} min)`);
  } else {
    factors.push(`${Math.round(durationMin)} min duration`);
  }

  // --- Time of day scoring ---
  const aosDate = pass.aos instanceof Date ? pass.aos : new Date(pass.aos);
  const localHour = aosDate.getHours();

  if (localHour >= DAYTIME_START && localHour < DAYTIME_END) {
    total += 0.5;
    factors.push("Daytime pass");
  } else {
    total -= 0.5;
    factors.push("Nighttime pass");
  }

  // Map to star rating
  const clamped = clamp(total, 0, 7);
  const score = mapToStars(clamped);
  const label = starToLabel(score);

  return { score, factors, label };
}
