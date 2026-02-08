/**
 * Achievement badge system types for Operator Profile
 *
 * Defines tiered achievement badges earned through operating milestones,
 * DX contacts, award progress, contest participation, and social activity.
 */

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";

export interface AchievementDefinition {
  /** Unique identifier, e.g., "qso_count", "dxcc_hunter" */
  id: string;
  /** Display name, e.g., "QSO Counter", "DXCC Hunter" */
  name: string;
  /** Short description of the achievement */
  description: string;
  /** Lucide icon name or emoji */
  icon: string;
  /** Tier thresholds in ascending order */
  tiers: {
    tier: AchievementTier;
    threshold: number;
    label: string;
  }[];
  /** Achievement category for grouping in UI */
  category: "operating" | "dx" | "awards" | "social" | "contest";
}

export interface EarnedAchievement {
  /** Unique instance ID */
  id: string;
  /** References AchievementDefinition.id */
  definitionId: string;
  /** Highest tier earned */
  tier: AchievementTier;
  /** Current progress value */
  progress: number;
  /** Next tier threshold, null if at platinum */
  nextThreshold: number | null;
  /** ISO-8601 timestamp when this tier was earned */
  earnedAt: string;
}

export interface AchievementInput {
  totalQSOs: number;
  uniqueCallsigns: number;
  uniqueCountries: number;
  uniqueStates: number;
  uniqueZones: number;
  uniqueBands: number;
  uniqueModes: number;
  activeDays: number;
  contestsEntered: number;
  longestStreak: number;
  qsosInOneDay: number;
  countriesConfirmed: number;
  statesConfirmed: number;
  zonesConfirmed: number;
}
