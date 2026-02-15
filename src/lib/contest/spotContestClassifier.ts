/**
 * Spot Contest Classifier
 *
 * Classifies DX/decode spots as contest-related using multiple heuristics:
 * - Temporal: Is the spot during an active contest window?
 * - Frequency: Is the spot within a known contest sub-band?
 * - Mode: Does the mode match contest modes (CW/SSB in contest segments)?
 *
 * Each heuristic contributes to a confidence score (0-1). A spot is classified
 * as "contest" when confidence >= 0.6.
 *
 * @module lib/contest/spotContestClassifier
 */

import type { ContestCalendarEntry } from "@/lib/contest/contestCalendarTypes";
import { isInContestSubBand } from "@/lib/data/contestSubBands";

// ── Types ────────────────────────────────────────────────────────────────────

/** Minimal spot shape required for classification. */
export interface ClassifiableSpot {
  callsign: string;
  frequency: number;
  mode: string;
  band: string;
  time: Date;
}

/** Context provided by the contest calendar system. */
export interface ContestClassifierContext {
  activeContests: ContestCalendarEntry[];
  isContestWeekend: boolean;
}

/** Result of classifying a single spot. */
export interface SpotClassification {
  /** Whether this spot meets the contest confidence threshold (>= 0.6) */
  isContest: boolean;
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** ID of the matched active contest, if any */
  contestId?: string;
  /** Human-readable reason for the classification */
  reason?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Confidence threshold for classifying a spot as contest-related */
const CONTEST_THRESHOLD = 0.6;

/** Modes commonly used in HF contests */
const CONTEST_MODES = new Set(["CW", "SSB", "LSB", "USB", "RTTY", "FT4"]);

/** Weight for each heuristic in the final score */
const WEIGHT_TIME = 0.45;
const WEIGHT_FREQUENCY = 0.35;
const WEIGHT_MODE = 0.2;

// ── Core Classifier ──────────────────────────────────────────────────────────

/**
 * Classify a single spot against active contest context.
 *
 * Heuristic breakdown:
 * - Time (0.45): +1.0 if during active contest on this band, +0.3 if contest weekend (any band)
 * - Frequency (0.35): +1.0 if within contest sub-band matching the mode
 * - Mode (0.20): +1.0 if mode is a standard contest mode (CW/SSB/RTTY/FT4)
 */
export function classifySpot(
  spot: ClassifiableSpot,
  context: ContestClassifierContext,
): SpotClassification {
  let timeScore = 0;
  let freqScore = 0;
  let modeScore = 0;
  let matchedContestId: string | undefined;
  const reasons: string[] = [];

  // ── Time heuristic ──────────────────────────────────────────────────────
  // Check if any active contest covers this band
  const spotTime = spot.time.getTime();
  for (const contest of context.activeContests) {
    const startMs = new Date(contest.startUtc).getTime();
    const endMs = new Date(contest.endUtc).getTime();
    const isWithinWindow = spotTime >= startMs && spotTime <= endMs;
    const coversBand = contest.bands.includes(spot.band);

    if (isWithinWindow && coversBand) {
      timeScore = 1.0;
      matchedContestId = contest.id;
      reasons.push(`During ${contest.name}`);
      break;
    }
  }

  // Fallback: it's a contest weekend but no specific band match
  if (timeScore === 0 && context.isContestWeekend) {
    timeScore = 0.3;
    reasons.push("Contest weekend");
  }

  // ── Frequency heuristic ─────────────────────────────────────────────────
  const subBandResult = isInContestSubBand(spot.frequency, spot.band);
  if (subBandResult.inSubBand) {
    freqScore = 1.0;
    reasons.push(
      `In ${subBandResult.type?.toUpperCase() ?? ""} contest sub-band`,
    );
  }

  // ── Mode heuristic ──────────────────────────────────────────────────────
  const modeUpper = spot.mode.toUpperCase();
  if (CONTEST_MODES.has(modeUpper)) {
    modeScore = 1.0;
    reasons.push(`Contest mode: ${modeUpper}`);
  }

  // ── Composite score ─────────────────────────────────────────────────────
  const confidence = Math.min(
    1.0,
    timeScore * WEIGHT_TIME +
      freqScore * WEIGHT_FREQUENCY +
      modeScore * WEIGHT_MODE,
  );

  const isContest = confidence >= CONTEST_THRESHOLD;

  return {
    isContest,
    confidence: Math.round(confidence * 100) / 100,
    contestId: matchedContestId,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
  };
}

// ── Convenience Functions ────────────────────────────────────────────────────

/**
 * Quick boolean check: is this spot contest-related?
 */
export function isContestSpot(
  spot: ClassifiableSpot,
  context: ContestClassifierContext,
): boolean {
  return classifySpot(spot, context).isContest;
}

/**
 * Get the contest ID for a spot, or null if not contest-related.
 */
export function getContestForSpot(
  spot: ClassifiableSpot,
  context: ContestClassifierContext,
): string | null {
  const classification = classifySpot(spot, context);
  return classification.isContest ? (classification.contestId ?? null) : null;
}
