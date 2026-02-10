/**
 * useOperatorRank — Single source of truth for operator rank and visual feature gates
 *
 * Aggregates data from achievements, logbook stats, profile, and shack stores
 * to compute rank points, determine the current rank tier, and derive boolean
 * feature gates that control card visual effects.
 */

import { useMemo, useEffect, useRef } from "react";
import { useAchievements } from "@/hooks/useAchievements";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useProfileCompleteness } from "@/hooks/useProfileCompleteness";
import { useProfileStore } from "@/stores/profileStore";
import { useShackStore } from "@/stores/shackStore";

import type {
  RankTier,
  CardBackground,
  RankPointBreakdown,
  RankPointInput,
  RankPreferences,
} from "@/types/rank";

import {
  computeRankPoints,
  getRankForPoints,
  getRankProgress,
  getUnlockedBackgrounds,
} from "@/lib/data/rankEngine";

import {
  RANK_COLORS,
  RANK_LABELS,
  RANK_ICONS,
  RANK_TITLES,
  isRankAtLeast,
} from "@/lib/data/rankConstants";

// ─── Public Interface ─────────────────────────────────────────────────────────

export interface OperatorRankState {
  rank: RankTier;
  rankPoints: number;
  breakdown: RankPointBreakdown;
  progress: {
    current: RankTier;
    next: RankTier | null;
    progressPercent: number;
    pointsToNext: number | null;
  };
  color: string;
  label: string;
  icon: string;
  title: string;
  unlockedBackgrounds: CardBackground[];
  preferences: RankPreferences;
  cardSignature?: string;
  isLoading: boolean;

  // Feature gates (boolean convenience flags)
  hasCardFlip: boolean; // apprentice+
  hasMouseTilt: boolean; // journeyman+
  hasParticles: boolean; // expert+
  hasStatCountUp: boolean; // expert+
  hasEquipmentWear: boolean; // master+
  hasCardSignature: boolean; // legendary+
  hasEnergyBorders: boolean; // legendary+
  hasFiligreeCorners: boolean; // legendary+
  hasChromaticEffects: boolean; // ethereal
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOperatorRank(): OperatorRankState {
  // 1. Gather data from dependent hooks and stores
  const { achievements, isLoading: achievementsLoading } = useAchievements();
  const stats = useLogbookStats();
  const completeness = useProfileCompleteness();

  const operatorRank = useProfileStore((s) => s.operatorRank);
  const loginStreakDays = useProfileStore((s) => s.loginStreakDays);
  const updateRankData = useProfileStore((s) => s.updateRankData);

  const radios = useShackStore((s) => s.radios);
  const antennas = useShackStore((s) => s.antennas);
  const feedlines = useShackStore((s) => s.feedlines);
  const accessories = useShackStore((s) => s.accessories);
  const inlineComponents = useShackStore((s) => s.inlineComponents);
  const stationChains = useShackStore((s) => s.stationChains);

  const isLoading = achievementsLoading || stats.isLoading;

  // 2. Compute rank state
  const computed = useMemo(() => {
    // Equipment total: radios + antennas + feedlines + accessories + inline components
    const equipmentCount =
      radios.length +
      antennas.length +
      feedlines.length +
      accessories.length +
      inlineComponents.length;

    // Signal path count from station chains
    const signalPathCount = stationChains.length;

    // Unique band-mode slots: count unique bands from logbook stats as a proxy.
    // A proper band-mode cross-reference would require per-entry iteration;
    // the band count provides a reasonable lower-bound approximation.
    const uniqueBandModeSlots = Object.keys(stats.qsosByBand).length;

    // Build RankPointInput from all sources
    const input: RankPointInput = {
      achievements: achievements.map((a) => ({ tier: a.tier })),
      totalQSOs: stats.totalQSOs,
      uniqueDxccEntities: stats.uniqueCountries,
      uniqueBandModeSlots,
      contestsEntered: 0, // Not yet tracked in stores
      contestTop10Finishes: 0, // Not yet tracked in stores
      loginStreakDays,
      equipmentCount,
      signalPathCount,
      profileComplete: completeness.score >= 100,
      shareCount: 0, // Not yet tracked in stores
      elmerSessionCount: 0, // Not yet tracked in stores
    };

    // Compute breakdown and total points
    const breakdown = computeRankPoints(input);
    const rank = getRankForPoints(breakdown.total);
    const progress = getRankProgress(breakdown.total);
    const unlockedBackgrounds = getUnlockedBackgrounds(rank);

    // Resolve visual constants
    const color = RANK_COLORS[rank];
    const label = RANK_LABELS[rank];
    const icon = RANK_ICONS[rank];
    const title = RANK_TITLES[rank];

    // Feature gates
    const hasCardFlip = isRankAtLeast(rank, "apprentice");
    const hasMouseTilt = isRankAtLeast(rank, "journeyman");
    const hasParticles = isRankAtLeast(rank, "expert");
    const hasStatCountUp = isRankAtLeast(rank, "expert");
    const hasEquipmentWear = isRankAtLeast(rank, "master");
    const hasCardSignature = isRankAtLeast(rank, "legendary");
    const hasEnergyBorders = isRankAtLeast(rank, "legendary");
    const hasFiligreeCorners = isRankAtLeast(rank, "legendary");
    const hasChromaticEffects = rank === "ethereal";

    return {
      rank,
      rankPoints: breakdown.total,
      breakdown,
      progress,
      color,
      label,
      icon,
      title,
      unlockedBackgrounds,
      hasCardFlip,
      hasMouseTilt,
      hasParticles,
      hasStatCountUp,
      hasEquipmentWear,
      hasCardSignature,
      hasEnergyBorders,
      hasFiligreeCorners,
      hasChromaticEffects,
    };
  }, [
    achievements,
    stats.totalQSOs,
    stats.uniqueCountries,
    stats.qsosByBand,
    loginStreakDays,
    radios.length,
    antennas.length,
    feedlines.length,
    accessories.length,
    inlineComponents.length,
    stationChains.length,
    completeness.score,
  ]);

  // 3. Side effect: persist rank if it changed
  const prevRankRef = useRef<RankTier>(operatorRank.currentRank);

  useEffect(() => {
    if (isLoading) return;

    const { rank, rankPoints, unlockedBackgrounds } = computed;

    // Only update when the computed rank differs from the stored rank
    if (rank !== operatorRank.currentRank) {
      const transition = {
        from: operatorRank.currentRank,
        to: rank,
        timestamp: new Date().toISOString(),
        pointsAtTransition: rankPoints,
      };

      updateRankData({
        currentRank: rank,
        rankPoints,
        rankHistory: [...operatorRank.rankHistory, transition],
        unlockedBackgrounds,
      });

      prevRankRef.current = rank;
    } else if (rankPoints !== operatorRank.rankPoints) {
      // Points changed but rank didn't -- still persist the latest total
      updateRankData({ rankPoints });
    }
  }, [
    isLoading,
    computed.rank,
    computed.rankPoints,
    computed.unlockedBackgrounds,
    operatorRank.currentRank,
    operatorRank.rankPoints,
    operatorRank.rankHistory,
    updateRankData,
  ]);

  // 4. Return memoized state
  return useMemo<OperatorRankState>(
    () => ({
      ...computed,
      preferences: operatorRank.preferences,
      cardSignature: operatorRank.cardSignature,
      isLoading,
    }),
    [computed, operatorRank.preferences, operatorRank.cardSignature, isLoading],
  );
}
