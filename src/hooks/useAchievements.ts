/**
 * useAchievements - Computes achievement badges from logbook + award data
 *
 * Aggregates stats from useLogbookStats and useAwardProgress, derives
 * secondary metrics (streak, active days, etc.), and evaluates all 18
 * achievement definitions to produce a list of earned badges.
 */

import { useMemo } from "react";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useAwardProgress } from "@/hooks/useAwardProgress";
import { computeAchievements } from "@/lib/data/achievementDefinitions";
import type { AchievementInput, EarnedAchievement } from "@/types/achievement";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the longest streak of consecutive days from a "YYYY-MM-DD" → count
 * record. Returns 0 if the record is empty.
 */
function computeLongestStreak(qsosByDate: Record<string, number>): number {
  const dates = Object.keys(qsosByDate).sort();
  if (dates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diffMs = curr.getTime() - prev.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }

  return longest;
}

/**
 * Find the maximum single-day QSO count from a "YYYY-MM-DD" → count record.
 */
function computeMaxQSOsInOneDay(qsosByDate: Record<string, number>): number {
  let max = 0;
  for (const count of Object.values(qsosByDate)) {
    if (count > max) max = count;
  }
  return max;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAchievements(): {
  achievements: EarnedAchievement[];
  isLoading: boolean;
} {
  const stats = useLogbookStats();
  const awards = useAwardProgress();

  const isLoading = stats.isLoading || awards.isLoading;

  const achievements = useMemo(() => {
    if (isLoading) return [];

    // Derive secondary metrics from logbook stats
    const activeDays = Object.keys(stats.qsosByDate).length;
    const uniqueBands = Object.keys(stats.qsosByBand).length;
    const uniqueModes = Object.keys(stats.qsosByMode).length;
    const longestStreak = computeLongestStreak(stats.qsosByDate);
    const qsosInOneDay = computeMaxQSOsInOneDay(stats.qsosByDate);

    const input: AchievementInput = {
      totalQSOs: stats.totalQSOs,
      uniqueCallsigns: stats.uniqueCallsigns,
      uniqueCountries: stats.uniqueCountries,
      uniqueStates: awards.wasWorkedCount,
      uniqueZones: awards.wazWorkedCount,
      uniqueBands,
      uniqueModes,
      activeDays,
      contestsEntered: 0, // Will be wired when contest tracking is added
      longestStreak,
      qsosInOneDay,
      countriesConfirmed: awards.dxccConfirmedCount,
      statesConfirmed: awards.wasConfirmedCount,
      zonesConfirmed: awards.wazConfirmedCount,
    };

    return computeAchievements(input);
  }, [
    isLoading,
    stats.totalQSOs,
    stats.uniqueCallsigns,
    stats.uniqueCountries,
    stats.qsosByDate,
    stats.qsosByBand,
    stats.qsosByMode,
    awards.wasWorkedCount,
    awards.wasConfirmedCount,
    awards.wazWorkedCount,
    awards.wazConfirmedCount,
    awards.dxccConfirmedCount,
  ]);

  return { achievements, isLoading };
}
