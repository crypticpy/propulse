/**
 * Zustand store for social features — friends, following, activity feed.
 *
 * NOT persisted — all data is Supabase-backed. When Supabase is not configured,
 * every action is a graceful no-op that returns empty state.
 */

import { create } from "zustand";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import type { ActivityEvent, PublicProfile } from "@/types/social";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Number of feed items per page */
const FEED_PAGE_SIZE = 20;

/** Map a Supabase profiles row to our PublicProfile shape */
function toPublicProfile(row: Record<string, unknown>): PublicProfile {
  return {
    id: row.id as string,
    callsign: (row.callsign as string) ?? "",
    operatorName: (row.operator_name as string) ?? undefined,
    bio: (row.bio as string) ?? undefined,
    avatarUrl: (row.avatar_url as string) ?? undefined,
    grid: (row.grid as string) ?? undefined,
    licenseClass:
      ((row.license as Record<string, unknown> | null)?.class as string) ??
      undefined,
    country: undefined, // not stored in profiles table
    socialLinks: row.social_links
      ? (row.social_links as { type: string; url: string }[])
      : undefined,
    statsCache: (row.stats_cache as Record<string, unknown>) ?? undefined,
    visibilitySettings: undefined,
    lastActiveAt: (row.last_active_at as string) ?? undefined,
  };
}

/** Map a Supabase activity_feed row to our ActivityEvent shape */
function toActivityEvent(row: Record<string, unknown>): ActivityEvent {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.event_type as ActivityEvent["type"],
    data: (row.event_data as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}

// ── Store ───────────────────────────────────────────────────────────────

interface SocialStore {
  // State
  followers: PublicProfile[];
  following: PublicProfile[];
  feed: ActivityEvent[];
  isLoadingFollowers: boolean;
  isLoadingFeed: boolean;
  feedCursor: string | null; // for pagination (ISO timestamp)

  // Actions
  fetchFollowers: () => Promise<void>;
  fetchFollowing: () => Promise<void>;
  followUser: (userId: string) => Promise<void>;
  unfollowUser: (userId: string) => Promise<void>;
  fetchFeed: (append?: boolean) => Promise<void>;
  reset: () => void;
}

const initialState = {
  followers: [] as PublicProfile[],
  following: [] as PublicProfile[],
  feed: [] as ActivityEvent[],
  isLoadingFollowers: false,
  isLoadingFeed: false,
  feedCursor: null as string | null,
};

export const useSocialStore = create<SocialStore>()((set, get) => ({
  ...initialState,

  // ── Fetch people who follow the current user ──────────────────────

  fetchFollowers: async () => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    set({ isLoadingFollowers: true });

    try {
      const supabase = getSupabase();

      // Get follower IDs
      const { data: follows, error: followsError } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", userId);

      if (followsError || !follows?.length) {
        set({ followers: [], isLoadingFollowers: false });
        return;
      }

      const followerIds = follows.map((f) => f.follower_id);

      // Fetch profiles for those followers
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", followerIds);

      if (profilesError || !profiles) {
        set({ followers: [], isLoadingFollowers: false });
        return;
      }

      set({
        followers: profiles.map((p) =>
          toPublicProfile(p as unknown as Record<string, unknown>),
        ),
        isLoadingFollowers: false,
      });
    } catch {
      set({ isLoadingFollowers: false });
    }
  },

  // ── Fetch people the current user follows ─────────────────────────

  fetchFollowing: async () => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    set({ isLoadingFollowers: true });

    try {
      const supabase = getSupabase();

      const { data: follows, error: followsError } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId);

      if (followsError || !follows?.length) {
        set({ following: [], isLoadingFollowers: false });
        return;
      }

      const followingIds = follows.map((f) => f.following_id);

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", followingIds);

      if (profilesError || !profiles) {
        set({ following: [], isLoadingFollowers: false });
        return;
      }

      set({
        following: profiles.map((p) =>
          toPublicProfile(p as unknown as Record<string, unknown>),
        ),
        isLoadingFollowers: false,
      });
    } catch {
      set({ isLoadingFollowers: false });
    }
  },

  // ── Follow a user ─────────────────────────────────────────────────

  followUser: async (targetUserId: string) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId || userId === targetUserId) return;

    try {
      const supabase = getSupabase();

      const { error } = await supabase.from("follows").insert({
        follower_id: userId,
        following_id: targetUserId,
      });

      if (error) {
        console.error("[socialStore] followUser error:", error.message);
        return;
      }

      // Refresh following list
      await get().fetchFollowing();
    } catch (err) {
      console.error("[socialStore] followUser exception:", err);
    }
  },

  // ── Unfollow a user ───────────────────────────────────────────────

  unfollowUser: async (targetUserId: string) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    try {
      const supabase = getSupabase();

      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", userId)
        .eq("following_id", targetUserId);

      if (error) {
        console.error("[socialStore] unfollowUser error:", error.message);
        return;
      }

      // Optimistically remove from following list
      set((state) => ({
        following: state.following.filter((p) => p.id !== targetUserId),
      }));
    } catch (err) {
      console.error("[socialStore] unfollowUser exception:", err);
    }
  },

  // ── Fetch activity feed (paginated) ───────────────────────────────

  fetchFeed: async (append = false) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    set({ isLoadingFeed: true });

    try {
      const supabase = getSupabase();
      const cursor = append ? get().feedCursor : null;

      // Get IDs of people the user follows
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId);

      const followingIds = follows?.map((f) => f.following_id) ?? [];
      // Include the user's own activity
      const userIds = [userId, ...followingIds];

      let query = supabase
        .from("activity_feed")
        .select("*")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(FEED_PAGE_SIZE);

      if (cursor) {
        query = query.lt("created_at", cursor);
      }

      const { data, error } = await query;

      if (error || !data) {
        set({ isLoadingFeed: false });
        return;
      }

      const events = data.map((row) =>
        toActivityEvent(row as unknown as Record<string, unknown>),
      );
      const newCursor =
        events.length === FEED_PAGE_SIZE
          ? events[events.length - 1].createdAt
          : null;

      set((state) => ({
        feed: append ? [...state.feed, ...events] : events,
        feedCursor: newCursor,
        isLoadingFeed: false,
      }));
    } catch {
      set({ isLoadingFeed: false });
    }
  },

  // ── Reset ─────────────────────────────────────────────────────────

  reset: () => set(initialState),
}));
