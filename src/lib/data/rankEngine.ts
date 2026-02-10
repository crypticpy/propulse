/**
 * Operator Rank Engine — Pure function module
 *
 * Computes rank points from various activity inputs and determines the
 * current rank tier. All functions are pure (no side effects, no store access).
 */

import type {
  RankTier,
  CardBackground,
  RankPointInput,
  RankPointBreakdown,
} from "../../types/rank";

import {
  RANK_THRESHOLDS,
  RANK_ORDER,
  RANK_RP_SCORING,
  BACKGROUNDS_BY_RANK,
} from "./rankConstants";

// ─── Achievement Tier Points ────────────────────────────────────────────────

const ACHIEVEMENT_TIER_POINTS: Record<
  RankPointInput["achievements"][number]["tier"],
  number
> = {
  bronze: RANK_RP_SCORING.achievementBronze,
  silver: RANK_RP_SCORING.achievementSilver,
  gold: RANK_RP_SCORING.achievementGold,
  platinum: RANK_RP_SCORING.achievementPlatinum,
};

// ─── computeRankPoints ──────────────────────────────────────────────────────

/**
 * Sum RP from all scoring sources and return a full breakdown.
 *
 * Each category is scored independently per RANK_RP_SCORING constants.
 * Login streak bonuses are additive — a 365-day streak earns all three
 * streak bonuses (7 + 30 + 365).
 */
export function computeRankPoints(input: RankPointInput): RankPointBreakdown {
  // Achievements: sum per-tier points
  const achievements = input.achievements.reduce(
    (sum, a) => sum + (ACHIEVEMENT_TIER_POINTS[a.tier] ?? 0),
    0,
  );

  // QSOs
  const qsos = input.totalQSOs * RANK_RP_SCORING.qsoLogged;

  // DXCC entities
  const dxcc = input.uniqueDxccEntities * RANK_RP_SCORING.uniqueDxccEntity;

  // Band-mode slots
  const bandModeSlots =
    input.uniqueBandModeSlots * RANK_RP_SCORING.uniqueBandModeSlot;

  // Contests
  const contests =
    input.contestsEntered * RANK_RP_SCORING.contestParticipated +
    input.contestTop10Finishes * RANK_RP_SCORING.contestTop10;

  // Login streaks (additive — longer streaks earn all lower bonuses too)
  let loginStreaks = 0;
  if (input.loginStreakDays >= 7) {
    loginStreaks += RANK_RP_SCORING.loginStreak7;
  }
  if (input.loginStreakDays >= 30) {
    loginStreaks += RANK_RP_SCORING.loginStreak30;
  }
  if (input.loginStreakDays >= 365) {
    loginStreaks += RANK_RP_SCORING.loginStreak365;
  }

  // Equipment
  const equipment = input.equipmentCount * RANK_RP_SCORING.equipmentRegistered;

  // Signal paths
  const signalPaths =
    input.signalPathCount * RANK_RP_SCORING.signalPathCompleted;

  // Profile completeness
  const profileComplete = input.profileComplete
    ? RANK_RP_SCORING.profileComplete100
    : 0;

  // Shares
  const shares = input.shareCount * RANK_RP_SCORING.sharedProfileCard;

  // Elmer sessions
  const elmerSessions = input.elmerSessionCount * RANK_RP_SCORING.elmerSession;

  const total =
    achievements +
    qsos +
    dxcc +
    bandModeSlots +
    contests +
    loginStreaks +
    equipment +
    signalPaths +
    profileComplete +
    shares +
    elmerSessions;

  return {
    achievements,
    qsos,
    dxcc,
    bandModeSlots,
    contests,
    loginStreaks,
    equipment,
    signalPaths,
    profileComplete,
    shares,
    elmerSessions,
    total,
  };
}

// ─── getRankForPoints ───────────────────────────────────────────────────────

/**
 * Determine the rank tier for a given total RP value.
 *
 * Iterates RANK_ORDER in reverse and returns the first tier whose
 * threshold the points meet or exceed. Falls back to 'novice'.
 */
export function getRankForPoints(totalPoints: number): RankTier {
  for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
    const tier = RANK_ORDER[i];
    if (totalPoints >= RANK_THRESHOLDS[tier]) {
      return tier;
    }
  }
  return "novice";
}

// ─── getNextRankThreshold ───────────────────────────────────────────────────

/**
 * Returns the RP threshold for the rank immediately above `currentRank`,
 * or null if the operator is already at the highest rank (ethereal).
 */
export function getNextRankThreshold(currentRank: RankTier): number | null {
  const idx = RANK_ORDER.indexOf(currentRank);
  if (idx < 0 || idx >= RANK_ORDER.length - 1) return null;
  return RANK_THRESHOLDS[RANK_ORDER[idx + 1]];
}

// ─── getRankProgress ────────────────────────────────────────────────────────

/**
 * Compute full progress info: current rank, next rank, percentage toward
 * next rank (0–100), and absolute points remaining.
 *
 * If the operator is already ethereal, next is null, progressPercent is 100,
 * and pointsToNext is null.
 */
export function getRankProgress(totalPoints: number): {
  current: RankTier;
  next: RankTier | null;
  progressPercent: number;
  pointsToNext: number | null;
} {
  const current = getRankForPoints(totalPoints);
  const currentIdx = RANK_ORDER.indexOf(current);

  // Already at max rank
  if (currentIdx >= RANK_ORDER.length - 1) {
    return {
      current,
      next: null,
      progressPercent: 100,
      pointsToNext: null,
    };
  }

  const next = RANK_ORDER[currentIdx + 1];
  const currentThreshold = RANK_THRESHOLDS[current];
  const nextThreshold = RANK_THRESHOLDS[next];
  const range = nextThreshold - currentThreshold;
  const progress = totalPoints - currentThreshold;

  const progressPercent =
    range > 0 ? Math.min(100, Math.max(0, (progress / range) * 100)) : 0;

  const pointsToNext = nextThreshold - totalPoints;

  return {
    current,
    next,
    progressPercent,
    pointsToNext,
  };
}

// ─── getUnlockedBackgrounds ─────────────────────────────────────────────────

/**
 * Returns the array of card backgrounds unlocked at the given rank tier.
 */
export function getUnlockedBackgrounds(rank: RankTier): CardBackground[] {
  return BACKGROUNDS_BY_RANK[rank] ?? BACKGROUNDS_BY_RANK.novice;
}
