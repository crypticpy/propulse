/**
 * Social sync module
 *
 * Provides standalone push/pull functions for activity feed events.
 * Not a full SyncModule — the socialStore handles follow relationships
 * directly. These functions complement it with activity event sync.
 */

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Json } from "@/types/supabase";

/** Default page size for feed queries */
const FEED_PAGE_SIZE = 20;

/**
 * Push a new activity event to the feed.
 */
export async function pushActivityEvent(
  userId: string,
  eventType: string,
  eventData: Record<string, unknown>,
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const supabase = getSupabase();

  const { error } = await supabase.from("activity_feed").insert({
    user_id: userId,
    event_type: eventType,
    event_data: eventData as Json,
  });

  if (error) {
    throw new Error(`Activity event push failed: ${error.message}`);
  }
}

/**
 * Pull the activity feed for a user (their own + following).
 * Returns paginated events with a cursor for the next page.
 */
export async function pullActivityFeed(
  userId: string,
  cursor?: string | null,
  limit: number = FEED_PAGE_SIZE,
): Promise<{
  events: Array<Record<string, unknown>>;
  nextCursor: string | null;
}> {
  if (!isSupabaseConfigured) return { events: [], nextCursor: null };

  const supabase = getSupabase();

  // Get IDs of people the user follows
  const { data: follows } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  const followingIds = follows?.map((f) => f.following_id) ?? [];
  const userIds = [userId, ...followingIds];

  let query = supabase
    .from("activity_feed")
    .select("*")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Activity feed pull failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { events: [], nextCursor: null };
  }

  const events = data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.event_type,
    data: row.event_data as Record<string, unknown>,
    createdAt: row.created_at,
  }));

  const nextCursor =
    events.length === limit
      ? (events[events.length - 1].createdAt as string)
      : null;

  return { events, nextCursor };
}
