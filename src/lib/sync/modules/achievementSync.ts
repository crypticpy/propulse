/**
 * Achievement sync module
 *
 * Syncs computed achievements to/from the Supabase `achievements` table.
 * Not a full SyncModule (no pull/push cycle) — instead provides standalone
 * push/pull functions called after achievement computation or when viewing
 * another user's profile.
 */

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { EarnedAchievement } from "@/types/achievement";
import type { TablesInsert } from "@/types/supabase";

/**
 * Map an EarnedAchievement to a Supabase achievements insert row.
 */
function achievementToRow(
  achievement: EarnedAchievement,
  userId: string,
): TablesInsert<"achievements"> {
  return {
    id: achievement.id,
    user_id: userId,
    badge_id: achievement.definitionId,
    tier: achievement.tier,
    progress: achievement.progress,
    earned_at: achievement.earnedAt,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Map a Supabase achievements row to an EarnedAchievement.
 * Note: `nextThreshold` is not stored server-side — set to null here.
 * The caller should recompute it from the definition if needed.
 */
function rowToAchievement(row: Record<string, unknown>): EarnedAchievement {
  return {
    id: row.id as string,
    definitionId: row.badge_id as string,
    tier: row.tier as EarnedAchievement["tier"],
    progress: (row.progress as number) ?? 0,
    nextThreshold: null,
    earnedAt: row.earned_at as string,
  };
}

/**
 * Upsert computed achievements to the Supabase achievements table.
 * Called after achievement computation completes.
 */
export async function pushAchievements(
  userId: string,
  achievements: EarnedAchievement[],
): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (achievements.length === 0) return;

  const supabase = getSupabase();

  const rows = achievements.map((a) => achievementToRow(a, userId));

  const { error } = await supabase
    .from("achievements")
    .upsert(rows, { onConflict: "user_id,id" });

  if (error) {
    throw new Error(`Achievement push failed: ${error.message}`);
  }
}

/**
 * Pull achievements for a given user (for viewing other profiles).
 */
export async function pullAchievements(
  userId: string,
): Promise<EarnedAchievement[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("achievements")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Achievement pull failed: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  return data.map((row) =>
    rowToAchievement(row as unknown as Record<string, unknown>),
  );
}
