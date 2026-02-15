/**
 * Contest Congestion Model
 *
 * Pure-function QRM estimation engine for the DX Wizard's contest awareness
 * feature. Estimates band congestion during active contests and suggests
 * quieter alternatives.
 *
 * Heuristics:
 * - Contest bands (160/80/40/20/15/10m) are congested during active contests
 * - WARC bands (30/17/12m) are always clear (most contests exclude them)
 * - CW and SSB contest segments have different congestion patterns
 * - Weekend daylight hours (12:00-22:00 UTC): peak congestion
 * - Night bands (160/80/40m) peak 00:00-06:00 UTC
 *
 * Feature 7.10 from the Contest Awareness & Community PRD.
 *
 * @module lib/contest/contestCongestionModel
 */

import type { ContestCalendarEntry } from "@/lib/contest/contestCalendarTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context needed to estimate congestion */
export interface CongestionContext {
  /** Currently active contests (from useContestContext) */
  activeContests: ContestCalendarEntry[];
  /** Whether a contest weekend is currently active */
  isContestWeekend: boolean;
  /** Current hour in UTC (0-23) */
  currentHourUtc: number;
}

/** Congestion severity levels */
export type CongestionLevel =
  | "clear"
  | "light"
  | "moderate"
  | "heavy"
  | "extreme";

/** Estimated congestion for a band/mode combination */
export interface CongestionEstimate {
  /** Qualitative severity */
  level: CongestionLevel;
  /** Numeric score 0-100 (0 = empty, 100 = wall-to-wall) */
  score: number;
  /** Human-readable description */
  description: string;
  /** UTC hours where congestion peaks for this band */
  peakHours: number[];
}

/** A suggested alternative band with lower congestion */
export interface BandAlternative {
  /** Band designation, e.g. "30m" */
  band: string;
  /** Estimated congestion on this alternative */
  congestion: CongestionEstimate;
  /** Why this band is a good alternative */
  reason: string;
}

/** Suggested clear frequency range */
export interface ClearFrequencyEstimate {
  /** Suggested center frequency in kHz */
  suggestedKHz: number;
  /** Start of suggested range in kHz */
  rangeStartKHz: number;
  /** End of suggested range in kHz */
  rangeEndKHz: number;
  /** Confidence qualifier */
  confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** WARC bands are always contest-free */
const WARC_BANDS = new Set(["30m", "17m", "12m"]);

/** Night bands tend to peak in darkness hours */
const NIGHT_BANDS = new Set(["160m", "80m", "40m"]);

/** Day bands peak during daylight/grey-line */
const DAY_BANDS = new Set(["20m", "15m", "10m"]);

/** Participant thresholds for scaling congestion */
const PARTICIPANT_THRESHOLDS = {
  mega: 20000, // CQ WW, ARRL FD
  major: 5000, // ARRL DX, CQ WPX, IARU
  medium: 2000, // WAE, SAC, NAQP
  small: 500, // Sprints, single-band
} as const;

/**
 * Typical contest sub-band ranges (kHz) where the heaviest activity occurs.
 * These are approximate and vary by contest, but cover the main contest
 * segments for CW and SSB.
 */
const CONTEST_SEGMENTS: Record<
  string,
  Partial<Record<string, { start: number; end: number }>>
> = {
  "160m": {
    CW: { start: 1800, end: 1850 },
    SSB: { start: 1840, end: 1900 },
  },
  "80m": {
    CW: { start: 3500, end: 3560 },
    SSB: { start: 3700, end: 3800 },
  },
  "40m": {
    CW: { start: 7000, end: 7040 },
    SSB: { start: 7150, end: 7300 },
  },
  "20m": {
    CW: { start: 14000, end: 14060 },
    SSB: { start: 14150, end: 14300 },
  },
  "15m": {
    CW: { start: 21000, end: 21060 },
    SSB: { start: 21200, end: 21350 },
  },
  "10m": {
    CW: { start: 28000, end: 28060 },
    SSB: { start: 28300, end: 28600 },
  },
  // WARC bands: no contest segments
  "30m": {},
  "17m": {},
  "12m": {},
};

/**
 * Non-contest segments where casual operators can find clear spectrum
 * even during major contests.
 */
const CLEAR_SEGMENTS: Record<
  string,
  Partial<Record<string, { start: number; end: number }>>
> = {
  "160m": {
    CW: { start: 1850, end: 1880 },
    SSB: { start: 1900, end: 2000 },
    FT8: { start: 1840, end: 1842 },
  },
  "80m": {
    CW: { start: 3560, end: 3600 },
    SSB: { start: 3800, end: 3900 },
    FT8: { start: 3573, end: 3575 },
  },
  "40m": {
    CW: { start: 7040, end: 7060 },
    SSB: { start: 7100, end: 7150 },
    FT8: { start: 7074, end: 7076 },
  },
  "20m": {
    CW: { start: 14060, end: 14100 },
    SSB: { start: 14100, end: 14150 },
    FT8: { start: 14074, end: 14076 },
  },
  "15m": {
    CW: { start: 21060, end: 21100 },
    SSB: { start: 21350, end: 21400 },
    FT8: { start: 21074, end: 21076 },
  },
  "10m": {
    CW: { start: 28060, end: 28100 },
    SSB: { start: 28600, end: 28700 },
    FT8: { start: 28074, end: 28076 },
  },
  "30m": {
    CW: { start: 10100, end: 10140 },
    FT8: { start: 10136, end: 10138 },
  },
  "17m": {
    CW: { start: 18068, end: 18100 },
    SSB: { start: 18110, end: 18168 },
    FT8: { start: 18100, end: 18102 },
  },
  "12m": {
    CW: { start: 24890, end: 24920 },
    SSB: { start: 24930, end: 24990 },
    FT8: { start: 24915, end: 24917 },
  },
};

/** Peak daylight hours (UTC) for daytime band congestion */
const DAYLIGHT_PEAK_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

/** Peak nighttime hours (UTC) for low-band congestion */
const NIGHTTIME_PEAK_HOURS = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the maximum estimated participant count across active contests */
function getMaxParticipants(contests: ContestCalendarEntry[]): number {
  if (contests.length === 0) return 0;
  return Math.max(...contests.map((c) => c.estimatedParticipants));
}

/** Participant-based multiplier for congestion (0.0 - 1.0) */
function participantMultiplier(maxParticipants: number): number {
  if (maxParticipants >= PARTICIPANT_THRESHOLDS.mega) return 1.0;
  if (maxParticipants >= PARTICIPANT_THRESHOLDS.major) return 0.8;
  if (maxParticipants >= PARTICIPANT_THRESHOLDS.medium) return 0.55;
  if (maxParticipants >= PARTICIPANT_THRESHOLDS.small) return 0.3;
  return 0.15;
}

/** Time-of-day multiplier: higher during peak hours for this band (0.0 - 1.0) */
function timeMultiplier(band: string, hourUtc: number): number {
  if (NIGHT_BANDS.has(band)) {
    if (NIGHTTIME_PEAK_HOURS.includes(hourUtc)) return 1.0;
    // Sunset/sunrise transition
    if (hourUtc >= 22 || hourUtc <= 7) return 0.7;
    return 0.3;
  }
  if (DAY_BANDS.has(band)) {
    if (DAYLIGHT_PEAK_HOURS.includes(hourUtc)) return 1.0;
    // Grey-line overlap
    if (hourUtc >= 10 && hourUtc <= 23) return 0.6;
    return 0.2;
  }
  // Fallback for unknown bands
  return 0.5;
}

/** Mode overlap multiplier: contests in the same mode add more congestion */
function modeOverlap(mode: string, contests: ContestCalendarEntry[]): number {
  const modeUpper = mode.toUpperCase();
  const matchingContests = contests.filter((c) =>
    c.modes.some((m) => {
      const mUp = m.toUpperCase();
      // FT8/FT4/Digital overlap
      if (
        ["FT8", "FT4", "DIGITAL"].includes(modeUpper) &&
        ["FT8", "FT4", "DIGITAL"].includes(mUp)
      ) {
        return true;
      }
      return mUp === modeUpper;
    }),
  );

  if (matchingContests.length === 0) return 0.3; // Different mode, still some QRM
  return 1.0; // Same mode = full congestion
}

/** Map numeric score (0-100) to CongestionLevel */
function scoreToLevel(score: number): CongestionLevel {
  if (score <= 10) return "clear";
  if (score <= 30) return "light";
  if (score <= 55) return "moderate";
  if (score <= 80) return "heavy";
  return "extreme";
}

/** Generate human-readable description for a congestion estimate */
function describeConsgestion(
  level: CongestionLevel,
  band: string,
  mode: string,
  contests: ContestCalendarEntry[],
): string {
  const contestNames = contests
    .slice(0, 2)
    .map((c) => c.name)
    .join(" and ");

  switch (level) {
    case "clear":
      return `${band} is clear on ${mode} right now.`;
    case "light":
      return `${band} has light activity from ${contestNames}. Plenty of room to operate.`;
    case "moderate":
      return `${band} is moderately busy with ${contestNames}. Expect some contest QRM in the ${mode} segment.`;
    case "heavy":
      return `${band} is heavily congested with ${contestNames}. Finding a clear frequency on ${mode} will take patience.`;
    case "extreme":
      return `${band} is wall-to-wall with ${contestNames}. Consider WARC bands (30m, 17m, 12m) or try later.`;
  }
}

/** Get peak hours for a band */
function getPeakHours(band: string): number[] {
  if (NIGHT_BANDS.has(band)) return [...NIGHTTIME_PEAK_HOURS];
  if (DAY_BANDS.has(band)) return [...DAYLIGHT_PEAK_HOURS];
  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Estimate congestion on a given band and mode based on active contests.
 *
 * Returns a qualitative level, numeric score, description, and peak hours.
 * Pure function with no side effects.
 */
export function estimateCongestion(
  band: string,
  mode: string,
  context: CongestionContext,
): CongestionEstimate {
  const { activeContests, isContestWeekend, currentHourUtc } = context;

  // WARC bands are always clear
  if (WARC_BANDS.has(band)) {
    return {
      level: "clear",
      score: 0,
      description: `${band} is a WARC band and is always contest-free.`,
      peakHours: [],
    };
  }

  // No active contests = clear
  if (!isContestWeekend || activeContests.length === 0) {
    return {
      level: "clear",
      score: 5,
      description: `No active contests. ${band} is clear.`,
      peakHours: [],
    };
  }

  // Filter to contests that use this band
  const relevantContests = activeContests.filter((c) => c.bands.includes(band));

  if (relevantContests.length === 0) {
    return {
      level: "clear",
      score: 5,
      description: `Active contests are not using ${band}. Clear to operate.`,
      peakHours: [],
    };
  }

  // Compute score from three factors
  const pMul = participantMultiplier(getMaxParticipants(relevantContests));
  const tMul = timeMultiplier(band, currentHourUtc);
  const mMul = modeOverlap(mode, relevantContests);

  // Base score: product of multipliers scaled to 0-100
  // Multiple concurrent contests on the same band compound slightly
  const concurrentBonus = Math.min(relevantContests.length, 3) / 3;
  const rawScore = pMul * tMul * mMul * (0.7 + 0.3 * concurrentBonus) * 100;
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  const level = scoreToLevel(score);
  const description = describeConsgestion(level, band, mode, relevantContests);
  const peakHours = getPeakHours(band);

  return { level, score, description, peakHours };
}

/**
 * Suggest alternative bands with lower congestion.
 *
 * Always includes WARC bands and any non-contest HF bands. Results are
 * sorted by congestion score ascending (quietest first).
 */
export function getAlternatives(
  band: string,
  context: CongestionContext,
): BandAlternative[] {
  const allBands = [
    "160m",
    "80m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
  ];

  const alternatives: BandAlternative[] = [];

  for (const alt of allBands) {
    if (alt === band) continue;

    // Estimate congestion for a "general" mode — use SSB as baseline
    const congestion = estimateCongestion(alt, "SSB", context);

    // Only suggest bands that are meaningfully less congested
    const currentCongestion = estimateCongestion(alt, "SSB", context);
    if (currentCongestion.score >= 80) continue; // Skip extremely congested alternatives

    let reason: string;
    if (WARC_BANDS.has(alt)) {
      reason = `${alt} is a WARC band — always contest-free by gentleman's agreement.`;
    } else if (congestion.level === "clear") {
      reason = `${alt} is not used by any active contest.`;
    } else if (congestion.level === "light") {
      reason = `${alt} has only light contest activity.`;
    } else {
      reason = `${alt} may have less congestion than ${band}.`;
    }

    alternatives.push({ band: alt, congestion, reason });
  }

  // Sort by congestion score ascending
  alternatives.sort((a, b) => a.congestion.score - b.congestion.score);

  return alternatives;
}

/**
 * Suggest a clear frequency range for a given band and mode during a contest.
 *
 * Uses known non-contest sub-band segments to suggest where casual operators
 * can find clear spectrum. Confidence is based on how far from the contest
 * segment the suggestion is.
 */
export function getClearFrequency(
  band: string,
  mode: string,
  context: CongestionContext,
): ClearFrequencyEstimate {
  // Normalize mode key
  const modeKey = mode.toUpperCase() === "FT8" ? "FT8" : mode.toUpperCase();

  // Try to find a non-contest segment
  const clearSeg = CLEAR_SEGMENTS[band]?.[modeKey];
  if (clearSeg) {
    const center = Math.round((clearSeg.start + clearSeg.end) / 2);
    return {
      suggestedKHz: center,
      rangeStartKHz: clearSeg.start,
      rangeEndKHz: clearSeg.end,
      confidence:
        context.isContestWeekend && !WARC_BANDS.has(band) ? "medium" : "high",
    };
  }

  // Fallback: use the contest segment and offset above it
  const contestSeg = CONTEST_SEGMENTS[band]?.[modeKey];
  if (contestSeg) {
    const offset = 10; // 10 kHz above contest segment
    return {
      suggestedKHz: contestSeg.end + offset,
      rangeStartKHz: contestSeg.end + 5,
      rangeEndKHz: contestSeg.end + offset * 2,
      confidence: "low",
    };
  }

  // Final fallback: return a generic suggestion
  return {
    suggestedKHz: 0,
    rangeStartKHz: 0,
    rangeEndKHz: 0,
    confidence: "low",
  };
}
