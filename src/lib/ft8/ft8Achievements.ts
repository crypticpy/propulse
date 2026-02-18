/**
 * ft8Achievements.ts — Achievement / gamification system for FT8 operations.
 *
 * Provides ~25-30 achievement definitions across five categories (decoding,
 * operating, dx, contesting, milestones), each with a tier, condition check,
 * and progress function.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Achievement categories */
export type AchievementCategory =
  | "decoding"
  | "operating"
  | "dx"
  | "contesting"
  | "milestones";

/** Achievement difficulty levels */
export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";

/** Achievement definition */
export interface Ft8Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  /** Icon name (for UI rendering) */
  icon: string;
  /** Condition checker: returns true if achievement is earned */
  check: (stats: Ft8AchievementStats) => boolean;
  /** Progress function: returns 0-1 for partial progress */
  progress: (stats: Ft8AchievementStats) => number;
}

/** Stats input for achievement checking */
export interface Ft8AchievementStats {
  totalDecodes: number;
  uniqueCallsigns: number;
  uniqueCountries: number;
  uniqueGrids: number;
  uniqueContinents: number;
  qsosCompleted: number;
  cqQsos: number;
  bestDxKm: number;
  totalSessionMinutes: number;
  contestQsos: number;
  foxHoundQsos: number;
  /** Countries worked per band */
  countriesPerBand: Record<string, number>;
  /** Bands with at least 1 QSO */
  bandsWorked: string[];
  /** Longest continuous session in minutes */
  longestSession: number;
  /** QSOs in a single contest */
  bestContestQsos: number;
  /** Maximum decode count in a single cycle */
  maxDecodesInCycle: number;
}

/** An earned achievement instance */
export interface EarnedAchievement {
  achievementId: string;
  earnedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a value to 0-1 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Build an achievement object with sensible defaults */
function def(
  id: string,
  name: string,
  description: string,
  category: AchievementCategory,
  tier: AchievementTier,
  icon: string,
  check: (s: Ft8AchievementStats) => boolean,
  progress: (s: Ft8AchievementStats) => number,
): Ft8Achievement {
  return { id, name, description, category, tier, icon, check, progress };
}

/** Return the maximum value across a Record<string, number> */
function maxRecordValue(rec: Record<string, number>): number {
  let max = 0;
  for (const v of Object.values(rec)) {
    if (v > max) max = v;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Achievement definitions (~28 total)
// ---------------------------------------------------------------------------

const ACHIEVEMENTS: Ft8Achievement[] = [
  // ---- Decoding ----------------------------------------------------------
  def(
    "first_light",
    "First Light",
    "Decode your first FT8 signal",
    "decoding",
    "bronze",
    "signal",
    (s) => s.totalDecodes >= 1,
    (s) => clamp01(s.totalDecodes / 1),
  ),
  def(
    "signal_hunter",
    "Signal Hunter",
    "Decode 100 unique callsigns",
    "decoding",
    "silver",
    "search",
    (s) => s.uniqueCallsigns >= 100,
    (s) => clamp01(s.uniqueCallsigns / 100),
  ),
  def(
    "globe_trotter",
    "Globe Trotter",
    "Decode stations from all 6 continents",
    "decoding",
    "gold",
    "globe",
    (s) => s.uniqueContinents >= 6,
    (s) => clamp01(s.uniqueContinents / 6),
  ),
  def(
    "grid_explorer",
    "Grid Explorer",
    "Decode 100 unique grid squares",
    "decoding",
    "silver",
    "grid",
    (s) => s.uniqueGrids >= 100,
    (s) => clamp01(s.uniqueGrids / 100),
  ),
  def(
    "sharp_ears",
    "Sharp Ears",
    "Decode 50 signals in a single cycle",
    "decoding",
    "gold",
    "headphones",
    (s) => s.maxDecodesInCycle >= 50,
    (s) => clamp01(s.maxDecodesInCycle / 50),
  ),
  def(
    "frequency_addict",
    "Frequency Addict",
    "Decode 500 unique callsigns",
    "decoding",
    "gold",
    "radio",
    (s) => s.uniqueCallsigns >= 500,
    (s) => clamp01(s.uniqueCallsigns / 500),
  ),

  // ---- Operating ---------------------------------------------------------
  def(
    "first_contact",
    "First Contact",
    "Complete your first FT8 QSO",
    "operating",
    "bronze",
    "handshake",
    (s) => s.qsosCompleted >= 1,
    (s) => clamp01(s.qsosCompleted / 1),
  ),
  def(
    "chatterbox",
    "Chatterbox",
    "Complete 10 QSOs in a session",
    "operating",
    "silver",
    "chat",
    (s) => s.qsosCompleted >= 10,
    (s) => clamp01(s.qsosCompleted / 10),
  ),
  def(
    "marathon_operator",
    "Marathon Operator",
    "Operate for 4+ continuous hours",
    "operating",
    "gold",
    "clock",
    (s) => s.longestSession >= 240,
    (s) => clamp01(s.longestSession / 240),
  ),
  def(
    "speed_demon",
    "Speed Demon",
    "Complete a QSO in under 2 minutes",
    "operating",
    "silver",
    "zap",
    // This is a flag-style achievement; we rely on the stat being >=1 when
    // the backend logs a fast QSO.  For progress we treat any completed QSO
    // as partial evidence (the fast-QSO tracker lives outside stats).
    (s) => s.qsosCompleted >= 1, // simplification — real check in backend
    (s) => clamp01(s.qsosCompleted >= 1 ? 1 : 0),
  ),
  def(
    "cq_machine",
    "CQ Machine",
    "Complete 5 CQ QSOs in a row",
    "operating",
    "silver",
    "megaphone",
    (s) => s.cqQsos >= 5,
    (s) => clamp01(s.cqQsos / 5),
  ),
  def(
    "night_owl",
    "Night Owl",
    "Operate for 8+ continuous hours",
    "operating",
    "platinum",
    "moon",
    (s) => s.longestSession >= 480,
    (s) => clamp01(s.longestSession / 480),
  ),

  // ---- DX ----------------------------------------------------------------
  def(
    "dx_opener",
    "DX Opener",
    "Work a station over 5,000 km",
    "dx",
    "bronze",
    "map-pin",
    (s) => s.bestDxKm >= 5_000,
    (s) => clamp01(s.bestDxKm / 5_000),
  ),
  def(
    "antipodal",
    "Antipodal",
    "Work a station over 15,000 km",
    "dx",
    "platinum",
    "compass",
    (s) => s.bestDxKm >= 15_000,
    (s) => clamp01(s.bestDxKm / 15_000),
  ),
  def(
    "country_collector",
    "Country Collector",
    "Work 50 countries",
    "dx",
    "gold",
    "flag",
    (s) => s.uniqueCountries >= 50,
    (s) => clamp01(s.uniqueCountries / 50),
  ),
  def(
    "century_club",
    "Century Club",
    "Work 100 countries (DXCC)",
    "dx",
    "platinum",
    "trophy",
    (s) => s.uniqueCountries >= 100,
    (s) => clamp01(s.uniqueCountries / 100),
  ),
  def(
    "band_master",
    "Band Master",
    "Work the same country on 5+ bands",
    "dx",
    "gold",
    "layers",
    (s) => maxRecordValue(s.countriesPerBand) >= 5,
    (s) => clamp01(maxRecordValue(s.countriesPerBand) / 5),
  ),
  def(
    "long_path",
    "Long Path",
    "Work a station over 10,000 km",
    "dx",
    "gold",
    "route",
    (s) => s.bestDxKm >= 10_000,
    (s) => clamp01(s.bestDxKm / 10_000),
  ),

  // ---- Contesting --------------------------------------------------------
  def(
    "contest_rookie",
    "Contest Rookie",
    "Complete your first contest QSO",
    "contesting",
    "bronze",
    "award",
    (s) => s.contestQsos >= 1,
    (s) => clamp01(s.contestQsos / 1),
  ),
  def(
    "pile_up_buster",
    "Pile-Up Buster",
    "Complete 50 contest QSOs",
    "contesting",
    "silver",
    "trending-up",
    (s) => s.contestQsos >= 50,
    (s) => clamp01(s.contestQsos / 50),
  ),
  def(
    "fox_hunter",
    "Fox Hunter",
    "Complete a Fox/Hound QSO",
    "contesting",
    "silver",
    "target",
    (s) => s.foxHoundQsos >= 1,
    (s) => clamp01(s.foxHoundQsos >= 1 ? 1 : 0),
  ),
  def(
    "rate_machine",
    "Rate Machine",
    "Log 30+ QSOs per hour in a contest",
    "contesting",
    "gold",
    "activity",
    (s) => s.bestContestQsos >= 30,
    (s) => clamp01(s.bestContestQsos / 30),
  ),
  def(
    "contest_veteran",
    "Contest Veteran",
    "Complete 200 contest QSOs",
    "contesting",
    "gold",
    "star",
    (s) => s.contestQsos >= 200,
    (s) => clamp01(s.contestQsos / 200),
  ),

  // ---- Milestones --------------------------------------------------------
  def(
    "first_step",
    "First Step",
    "Complete your first session",
    "milestones",
    "bronze",
    "play",
    (s) => s.totalSessionMinutes > 0,
    (s) => clamp01(s.totalSessionMinutes > 0 ? 1 : 0),
  ),
  def(
    "dedicated",
    "Dedicated",
    "Complete 10 separate sessions",
    "milestones",
    "silver",
    "calendar",
    // We approximate "separate sessions" via total minutes / average session.
    // In practice the backend should track session count directly. For now
    // we count 10+ minutes as evidence of at least 1 session.
    (s) => s.totalSessionMinutes >= 300, // ~10 sessions of 30 min
    (s) => clamp01(s.totalSessionMinutes / 300),
  ),
  def(
    "one_k_club",
    "1K Club",
    "Reach 1,000 total decodes",
    "milestones",
    "silver",
    "hash",
    (s) => s.totalDecodes >= 1_000,
    (s) => clamp01(s.totalDecodes / 1_000),
  ),
  def(
    "ten_k_club",
    "10K Club",
    "Reach 10,000 total decodes",
    "milestones",
    "gold",
    "bar-chart",
    (s) => s.totalDecodes >= 10_000,
    (s) => clamp01(s.totalDecodes / 10_000),
  ),
  def(
    "all_bander",
    "All Bander",
    "Work on 6+ bands",
    "milestones",
    "gold",
    "sliders",
    (s) => s.bandsWorked.length >= 6,
    (s) => clamp01(s.bandsWorked.length / 6),
  ),
  def(
    "hundred_qsos",
    "Century Mark",
    "Complete 100 QSOs",
    "milestones",
    "gold",
    "check-circle",
    (s) => s.qsosCompleted >= 100,
    (s) => clamp01(s.qsosCompleted / 100),
  ),
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get all achievement definitions */
export function getAllAchievements(): Ft8Achievement[] {
  return [...ACHIEVEMENTS];
}

/** Get achievements by category */
export function getAchievementsByCategory(
  category: AchievementCategory,
): Ft8Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.category === category);
}

/**
 * Check all achievements against current stats, return newly earned ones.
 *
 * @param stats     Current cumulative stats
 * @param alreadyEarned  Set of achievement IDs the user has already earned
 * @returns Array of newly earned achievements (empty if none)
 */
export function checkAchievements(
  stats: Ft8AchievementStats,
  alreadyEarned: Set<string>,
): EarnedAchievement[] {
  const now = new Date().toISOString();
  const earned: EarnedAchievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (alreadyEarned.has(achievement.id)) continue;
    if (achievement.check(stats)) {
      earned.push({ achievementId: achievement.id, earnedAt: now });
    }
  }

  return earned;
}

/**
 * Get achievement progress for display.
 *
 * Returns every achievement with its earned status and current progress (0-1).
 */
export function getAchievementProgress(
  stats: Ft8AchievementStats,
  alreadyEarned: Set<string>,
): Array<{ achievement: Ft8Achievement; earned: boolean; progress: number }> {
  return ACHIEVEMENTS.map((achievement) => {
    const earned = alreadyEarned.has(achievement.id);
    const progress = earned ? 1 : achievement.progress(stats);
    return { achievement, earned, progress };
  });
}
