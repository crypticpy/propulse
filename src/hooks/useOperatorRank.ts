/**
 * useOperatorRank — Single source of truth for operator rank and visual feature gates
 *
 * Aggregates data from achievements, logbook stats, profile, and shack stores
 * to compute rank points, determine the current rank tier, and derive boolean
 * feature gates that control card visual effects.
 */

import { useMemo, useEffect } from "react";
import { useAchievements } from "@/hooks/useAchievements";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useProfileCompleteness } from "@/hooks/useProfileCompleteness";
import { useStationQsoIndex } from "@/hooks/useStationQsoIndex";
import { useProfileStore } from "@/stores/profileStore";
import { useShackStore } from "@/stores/shackStore";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { stationRankCredit } from "@/lib/station/stationRank";

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

// ─── Anonymous fallback ──────────────────────────────────────────────────────

const ANONYMOUS_RANK_STATE: OperatorRankState = {
  rank: "novice",
  rankPoints: 0,
  breakdown: {
    achievements: 0,
    qsos: 0,
    dxcc: 0,
    bandModeSlots: 0,
    contests: 0,
    loginStreaks: 0,
    equipment: 0,
    signalPaths: 0,
    profileComplete: 0,
    shares: 0,
    elmerSessions: 0,
    total: 0,
  },
  progress: {
    current: "novice",
    next: "apprentice",
    progressPercent: 0,
    pointsToNext: 400,
  },
  color: "#9CA3AF",
  label: "Novice",
  icon: "",
  title: "Welcome to the Bands",
  unlockedBackgrounds: ["schematic"],
  preferences: {
    selectedBackground: "schematic",
    enableParticles: true,
    enableSound: false,
    enableMouseTilt: true,
  },
  isLoading: false,
  hasCardFlip: false,
  hasMouseTilt: false,
  hasParticles: false,
  hasStatCountUp: false,
  hasEquipmentWear: false,
  hasCardSignature: false,
  hasEnergyBorders: false,
  hasFiligreeCorners: false,
  hasChromaticEffects: false,
};

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

export interface UseOperatorRankOptions {
  persist?: boolean;
}

export function useOperatorRank(
  { persist = false }: UseOperatorRankOptions = {},
): OperatorRankState {
  // 0. Auth gate — gamification requires a signed-in account
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

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
  const { qsoCountById, stampedQsoCount, isLoading: indexLoading } =
    useStationQsoIndex();

  const isLoading = achievementsLoading || stats.isLoading || indexLoading;
  const rankOverride = operatorRank.rankOverride ?? null;

  // 2. Compute rank state
  const computed = useMemo(() => {
    const { equipmentCount, signalPathCount } = stationRankCredit(
      {
        radioIds: radios.map((radio) => radio.id),
        antennaIds: antennas.map((antenna) => antenna.id),
        feedlineIds: feedlines.map((feedline) => feedline.id),
        accessoryIds: accessories.map((accessory) => accessory.id),
        inlineIds: inlineComponents.map((item) => item.id),
        chainIds: stationChains.map((chain) => chain.id),
      },
      { qsoCountById, stampedQsoCount },
    );

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
    const computedRank = getRankForPoints(breakdown.total);

    // Apply rank override if set — bypass RP computation for demo/test accounts
    const rank = rankOverride ?? computedRank;
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
    radios,
    antennas,
    feedlines,
    accessories,
    inlineComponents,
    stationChains,
    qsoCountById,
    stampedQsoCount,
    completeness.score,
    rankOverride,
  ]);

  // 3. Side effect: persist rank if it changed (skip when override is active)
  useEffect(() => {
    if (!persist || !isAuthenticated || isLoading || rankOverride) return;

    const { rank, rankPoints, unlockedBackgrounds } = computed;
    const storedRank = useProfileStore.getState().operatorRank;

    // Only update when the computed rank differs from the stored rank
    if (rank !== storedRank.currentRank) {
      const transition = {
        from: storedRank.currentRank,
        to: rank,
        timestamp: new Date().toISOString(),
        pointsAtTransition: rankPoints,
      };

      updateRankData({
        currentRank: rank,
        rankPoints,
        rankHistory: [...storedRank.rankHistory, transition],
        unlockedBackgrounds,
      });
    } else if (rankPoints !== storedRank.rankPoints) {
      // Points changed but rank didn't -- still persist the latest total
      updateRankData({ rankPoints });
    }
  }, [
    isAuthenticated,
    isLoading,
    persist,
    rankOverride,
    computed,
    operatorRank.currentRank,
    operatorRank.rankPoints,
    operatorRank.rankHistory,
    updateRankData,
  ]);

  // 4. Return memoized state (anonymous users get locked novice state)
  return useMemo<OperatorRankState>(
    () =>
      isAuthenticated
        ? {
            ...computed,
            preferences: operatorRank.preferences,
            cardSignature: operatorRank.cardSignature,
            isLoading,
          }
        : ANONYMOUS_RANK_STATE,
    [
      isAuthenticated,
      computed,
      operatorRank.preferences,
      operatorRank.cardSignature,
      isLoading,
    ],
  );
}
