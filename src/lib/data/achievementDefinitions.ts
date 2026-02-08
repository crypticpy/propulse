/**
 * Achievement badge definitions and computation engine
 *
 * 18 achievements across 5 categories with 4 tiers each (bronze → platinum).
 * The computeAchievements() function evaluates an AchievementInput snapshot
 * and returns the highest earned tier for each achievement plus progress
 * toward the next tier.
 */

import type {
  AchievementDefinition,
  AchievementTier,
  AchievementInput,
  EarnedAchievement,
} from "@/types/achievement";

// ─── Definitions ────────────────────────────────────────────────────────────

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // ── Operating (6) ───────────────────────────────────────────────────────
  {
    id: "qso_count",
    name: "QSO Counter",
    description: "Total contacts made",
    icon: "radio",
    category: "operating",
    tiers: [
      { tier: "bronze", threshold: 100, label: "100 QSOs" },
      { tier: "silver", threshold: 500, label: "500 QSOs" },
      { tier: "gold", threshold: 2500, label: "2,500 QSOs" },
      { tier: "platinum", threshold: 10000, label: "10,000 QSOs" },
    ],
  },
  {
    id: "daily_warrior",
    name: "Daily Warrior",
    description: "Active operating days",
    icon: "calendar",
    category: "operating",
    tiers: [
      { tier: "bronze", threshold: 10, label: "10 days" },
      { tier: "silver", threshold: 50, label: "50 days" },
      { tier: "gold", threshold: 200, label: "200 days" },
      { tier: "platinum", threshold: 500, label: "500 days" },
    ],
  },
  {
    id: "band_explorer",
    name: "Band Explorer",
    description: "Unique bands operated",
    icon: "radio-tower",
    category: "operating",
    tiers: [
      { tier: "bronze", threshold: 3, label: "3 bands" },
      { tier: "silver", threshold: 6, label: "6 bands" },
      { tier: "gold", threshold: 9, label: "9 bands" },
      { tier: "platinum", threshold: 12, label: "12 bands" },
    ],
  },
  {
    id: "mode_master",
    name: "Mode Master",
    description: "Unique modes used",
    icon: "settings",
    category: "operating",
    tiers: [
      { tier: "bronze", threshold: 2, label: "2 modes" },
      { tier: "silver", threshold: 4, label: "4 modes" },
      { tier: "gold", threshold: 6, label: "6 modes" },
      { tier: "platinum", threshold: 8, label: "8 modes" },
    ],
  },
  {
    id: "marathon_day",
    name: "Marathon Day",
    description: "Most QSOs in a single day",
    icon: "zap",
    category: "operating",
    tiers: [
      { tier: "bronze", threshold: 25, label: "25 in a day" },
      { tier: "silver", threshold: 100, label: "100 in a day" },
      { tier: "gold", threshold: 250, label: "250 in a day" },
      { tier: "platinum", threshold: 500, label: "500 in a day" },
    ],
  },
  {
    id: "streak_master",
    name: "Streak Master",
    description: "Consecutive days on air",
    icon: "flame",
    category: "operating",
    tiers: [
      { tier: "bronze", threshold: 7, label: "7-day streak" },
      { tier: "silver", threshold: 30, label: "30-day streak" },
      { tier: "gold", threshold: 90, label: "90-day streak" },
      { tier: "platinum", threshold: 365, label: "365-day streak" },
    ],
  },

  // ── DX (3) ──────────────────────────────────────────────────────────────
  {
    id: "dxcc_hunter",
    name: "DXCC Hunter",
    description: "Unique DXCC entities worked",
    icon: "globe",
    category: "dx",
    tiers: [
      { tier: "bronze", threshold: 25, label: "25 entities" },
      { tier: "silver", threshold: 100, label: "100 entities" },
      { tier: "gold", threshold: 200, label: "200 entities" },
      { tier: "platinum", threshold: 300, label: "300 entities" },
    ],
  },
  {
    id: "dxcc_confirmed",
    name: "DXCC Confirmed",
    description: "DXCC entities confirmed",
    icon: "check-circle",
    category: "dx",
    tiers: [
      { tier: "bronze", threshold: 25, label: "25 confirmed" },
      { tier: "silver", threshold: 100, label: "100 confirmed" },
      { tier: "gold", threshold: 200, label: "200 confirmed" },
      { tier: "platinum", threshold: 300, label: "300 confirmed" },
    ],
  },
  {
    id: "unique_calls",
    name: "Call Collector",
    description: "Unique callsigns worked",
    icon: "users",
    category: "dx",
    tiers: [
      { tier: "bronze", threshold: 50, label: "50 callsigns" },
      { tier: "silver", threshold: 500, label: "500 callsigns" },
      { tier: "gold", threshold: 2500, label: "2,500 callsigns" },
      { tier: "platinum", threshold: 10000, label: "10,000 callsigns" },
    ],
  },

  // ── Awards (4) ──────────────────────────────────────────────────────────
  {
    id: "was_progress",
    name: "WAS Hunter",
    description: "US states worked",
    icon: "map",
    category: "awards",
    tiers: [
      { tier: "bronze", threshold: 10, label: "10 states" },
      { tier: "silver", threshold: 25, label: "25 states" },
      { tier: "gold", threshold: 40, label: "40 states" },
      { tier: "platinum", threshold: 50, label: "All 50 states" },
    ],
  },
  {
    id: "was_confirmed",
    name: "WAS Confirmed",
    description: "US states confirmed",
    icon: "map-pin",
    category: "awards",
    tiers: [
      { tier: "bronze", threshold: 10, label: "10 confirmed" },
      { tier: "silver", threshold: 25, label: "25 confirmed" },
      { tier: "gold", threshold: 40, label: "40 confirmed" },
      { tier: "platinum", threshold: 50, label: "All 50 confirmed" },
    ],
  },
  {
    id: "waz_progress",
    name: "Zone Explorer",
    description: "CQ zones worked",
    icon: "compass",
    category: "awards",
    tiers: [
      { tier: "bronze", threshold: 10, label: "10 zones" },
      { tier: "silver", threshold: 20, label: "20 zones" },
      { tier: "gold", threshold: 30, label: "30 zones" },
      { tier: "platinum", threshold: 40, label: "All 40 zones" },
    ],
  },
  {
    id: "waz_confirmed",
    name: "Zone Confirmed",
    description: "CQ zones confirmed",
    icon: "compass",
    category: "awards",
    tiers: [
      { tier: "bronze", threshold: 10, label: "10 confirmed" },
      { tier: "silver", threshold: 20, label: "20 confirmed" },
      { tier: "gold", threshold: 30, label: "30 confirmed" },
      { tier: "platinum", threshold: 40, label: "All 40 confirmed" },
    ],
  },

  // ── Contest (1) ─────────────────────────────────────────────────────────
  {
    id: "contest_operator",
    name: "Contest Operator",
    description: "Contests entered",
    icon: "trophy",
    category: "contest",
    tiers: [
      { tier: "bronze", threshold: 1, label: "1 contest" },
      { tier: "silver", threshold: 5, label: "5 contests" },
      { tier: "gold", threshold: 15, label: "15 contests" },
      { tier: "platinum", threshold: 50, label: "50 contests" },
    ],
  },

  // ── Social (4) ──────────────────────────────────────────────────────────
  {
    id: "ragchewer",
    name: "Ragchewer",
    description: "Unique callsigns contacted multiple times",
    icon: "message-circle",
    category: "social",
    tiers: [
      { tier: "bronze", threshold: 10, label: "10 regulars" },
      { tier: "silver", threshold: 50, label: "50 regulars" },
      { tier: "gold", threshold: 200, label: "200 regulars" },
      { tier: "platinum", threshold: 500, label: "500 regulars" },
    ],
  },
  {
    id: "elmer",
    name: "Elmer",
    description: "Helped new hams (contacts with Novice/Tech)",
    icon: "heart-handshake",
    category: "social",
    tiers: [
      { tier: "bronze", threshold: 5, label: "5 new hams" },
      { tier: "silver", threshold: 25, label: "25 new hams" },
      { tier: "gold", threshold: 100, label: "100 new hams" },
      { tier: "platinum", threshold: 250, label: "250 new hams" },
    ],
  },
  {
    id: "night_owl",
    name: "Night Owl",
    description: "QSOs made between 00:00-06:00 UTC",
    icon: "moon",
    category: "social",
    tiers: [
      { tier: "bronze", threshold: 10, label: "10 night QSOs" },
      { tier: "silver", threshold: 50, label: "50 night QSOs" },
      { tier: "gold", threshold: 200, label: "200 night QSOs" },
      { tier: "platinum", threshold: 500, label: "500 night QSOs" },
    ],
  },
  {
    id: "globe_trotter",
    name: "Globe Trotter",
    description: "CQ zones worked across all continents",
    icon: "plane",
    category: "social",
    tiers: [
      { tier: "bronze", threshold: 5, label: "5 zones" },
      { tier: "silver", threshold: 15, label: "15 zones" },
      { tier: "gold", threshold: 30, label: "30 zones" },
      { tier: "platinum", threshold: 40, label: "All 40 zones" },
    ],
  },
];

// ─── Input field mapping ────────────────────────────────────────────────────

/**
 * Maps each achievement definition ID to the corresponding AchievementInput
 * field that drives its progress. Achievements not in this map (ragchewer,
 * elmer, night_owl, globe_trotter) use `uniqueZones` as a fallback.
 */
const INPUT_FIELD_MAP: Record<string, keyof AchievementInput> = {
  qso_count: "totalQSOs",
  daily_warrior: "activeDays",
  band_explorer: "uniqueBands",
  mode_master: "uniqueModes",
  marathon_day: "qsosInOneDay",
  streak_master: "longestStreak",
  dxcc_hunter: "uniqueCountries",
  dxcc_confirmed: "countriesConfirmed",
  unique_calls: "uniqueCallsigns",
  was_progress: "uniqueStates",
  was_confirmed: "statesConfirmed",
  waz_progress: "uniqueZones",
  waz_confirmed: "zonesConfirmed",
  contest_operator: "contestsEntered",
  // Social achievements default to uniqueZones (globe_trotter) or
  // use placeholder values that callers provide via the generic fields.
  ragchewer: "uniqueCallsigns",
  elmer: "contestsEntered",
  night_owl: "totalQSOs",
  globe_trotter: "uniqueZones",
};

// ─── Computation ────────────────────────────────────────────────────────────

/**
 * Evaluate all achievement definitions against the provided input snapshot.
 * Returns one EarnedAchievement per definition where at least the bronze
 * tier threshold has been met.
 */
export function computeAchievements(
  input: AchievementInput,
): EarnedAchievement[] {
  const now = new Date().toISOString();
  const earned: EarnedAchievement[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const field = INPUT_FIELD_MAP[def.id];
    const value = field ? input[field] : 0;

    // Find the highest tier met
    let highestTierIndex = -1;
    for (let i = def.tiers.length - 1; i >= 0; i--) {
      if (value >= def.tiers[i].threshold) {
        highestTierIndex = i;
        break;
      }
    }

    // Skip if no tier met
    if (highestTierIndex < 0) continue;

    const highestTier = def.tiers[highestTierIndex];
    const nextTier =
      highestTierIndex < def.tiers.length - 1
        ? def.tiers[highestTierIndex + 1]
        : null;

    earned.push({
      id: `${def.id}:${highestTier.tier}`,
      definitionId: def.id,
      tier: highestTier.tier,
      progress: value,
      nextThreshold: nextTier ? nextTier.threshold : null,
      earnedAt: now,
    });
  }

  return earned;
}

/**
 * Get all tier labels for an achievement, useful for rendering tier badges.
 */
export function getTierLabels(
  definitionId: string,
): { tier: AchievementTier; label: string }[] {
  const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === definitionId);
  if (!def) return [];
  return def.tiers.map((t) => ({ tier: t.tier, label: t.label }));
}

/**
 * Get the definition for a specific achievement by ID.
 */
export function getAchievementDefinition(
  id: string,
): AchievementDefinition | undefined {
  return ACHIEVEMENT_DEFINITIONS.find((d) => d.id === id);
}

/**
 * Get all achievements within a specific category.
 */
export function getAchievementsByCategory(
  category: AchievementDefinition["category"],
): AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter((d) => d.category === category);
}
