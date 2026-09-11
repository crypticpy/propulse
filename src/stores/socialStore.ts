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
    // Carry the owner's disclosure settings through: every surface that shows
    // a followed operator's grid runs them past `isSectionVisibleToViewer`.
    visibilitySettings:
      (row.visibility_settings as PublicProfile["visibilitySettings"]) ??
      undefined,
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

/**
 * Whether the viewer counts as a friend of `profileId`: this app's friend
 * relation is "the viewer follows them". Deliberately tri-state — until the
 * following set is known to belong to the signed-in account the answer is
 * `unknown`, and callers keep friends-only content closed on `unknown` the
 * same as on `stranger`.
 */
export type ViewerFriendship = "friend" | "stranger" | "unknown";

/**
 * Whether the cached `following` set describes the signed-in account. A
 * refresh in flight for the same account still counts: the set in hand is that
 * account's last known answer, and dropping it mid-refresh is what made the
 * viewer flash as a stranger on every remount (#995 round 5).
 */
export function followSetBelongsToViewer(
  followingLoadedForUserId: string | null,
  authUserId: string | null,
): boolean {
  return !!authUserId && followingLoadedForUserId === authUserId;
}

/**
 * Whether the follow set could not be loaded for this viewer and the gated
 * controls should offer a retry rather than sit disabled forever.
 */
export function followLoadFailedForViewer(
  followingLoadError: { userId: string } | null,
  authUserId: string | null,
): boolean {
  return !!authUserId && followingLoadError?.userId === authUserId;
}

export function viewerFriendship(
  following: PublicProfile[],
  followingLoadedForUserId: string | null,
  authUserId: string | null,
  profileId: string,
): ViewerFriendship {
  if (!followSetBelongsToViewer(followingLoadedForUserId, authUserId)) {
    return "unknown";
  }
  return following.some((profile) => profile.id === profileId)
    ? "friend"
    : "stranger";
}

// ── Store ───────────────────────────────────────────────────────────────

interface SocialStore {
  // State
  followers: PublicProfile[];
  following: PublicProfile[];
  /**
   * Which auth user the `following` set was loaded for, or null when nothing
   * is loaded. A follow relation is an account-scoped fact: without this tag
   * account B inherits account A's cached relationships and sees their
   * friends-only sections.
   */
  followingLoadedForUserId: string | null;
  /**
   * A refresh is in flight for the account the cache is already tagged to.
   * The set stays readable while it runs; actions that would write a follow
   * row wait for it, so the button never offers "Follow" for a relation that
   * may already exist.
   */
  isRefreshingFollowing: boolean;
  /**
   * The last failed `fetchFollowing`, tagged with the account it was for. A
   * failure with no cached set leaves the relation unknown, which disables
   * every follow control; without this the mount had no way back. The UI
   * turns the gated control into a spelled-out retry.
   */
  followingLoadError: { userId: string; at: number } | null;
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
  /** Drop the following set at an account boundary (called by authStore). */
  clearFollowing: () => void;
  reset: () => void;
}

const initialState = {
  followers: [] as PublicProfile[],
  following: [] as PublicProfile[],
  followingLoadedForUserId: null as string | null,
  isRefreshingFollowing: false,
  followingLoadError: null as { userId: string; at: number } | null,
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

    // The set in hand belongs to whoever it was loaded for. Only a set
    // belonging to someone else (or to nobody) is dropped up front, so the
    // viewer-is-friend question answers "unknown" while another account's
    // answer is in flight. A refresh for the SAME account keeps its set and
    // its tag: clearing there made every remount flash the viewer as a
    // stranger, hiding friends-only content and offering "Follow" for a
    // relation that already exists.
    const cacheBelongsToUser = get().followingLoadedForUserId === userId;
    set(
      cacheBelongsToUser
        ? {
            isRefreshingFollowing: true,
            isLoadingFollowers: true,
            followingLoadError: null,
          }
        : {
            following: [],
            followingLoadedForUserId: null,
            isRefreshingFollowing: true,
            isLoadingFollowers: true,
            followingLoadError: null,
          },
    );

    /** A failure is only recoverable state for the user it was fetched for. */
    const failed = () => ({
      ...(cacheBelongsToUser
        ? {}
        : { following: [], followingLoadedForUserId: null }),
      followingLoadError: { userId, at: Date.now() },
      isRefreshingFollowing: false,
      isLoadingFollowers: false,
    });

    /** A result is only ours if the signed-in user has not changed since. */
    const stillCurrent = () => useAuthStore.getState().user?.id === userId;

    try {
      const supabase = getSupabase();

      const { data: follows, error: followsError } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId);

      if (!stillCurrent()) return;

      if (followsError) {
        // A failed refresh is not an answer. Keep this account's last known
        // set rather than demoting it to "unknown" on a transient error.
        set(failed());
        return;
      }

      if (!follows?.length) {
        set({
          following: [],
          followingLoadedForUserId: userId,
          isRefreshingFollowing: false,
          isLoadingFollowers: false,
          followingLoadError: null,
        });
        return;
      }

      const followingIds = follows.map((f) => f.following_id);

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", followingIds);

      if (!stillCurrent()) return;

      if (profilesError || !profiles) {
        set(failed());
        return;
      }

      set({
        following: profiles.map((p) =>
          toPublicProfile(p as unknown as Record<string, unknown>),
        ),
        followingLoadedForUserId: userId,
        isRefreshingFollowing: false,
        isLoadingFollowers: false,
        followingLoadError: null,
      });
    } catch {
      if (!stillCurrent()) return;
      set(failed());
    }
  },

  // ── Follow a user ─────────────────────────────────────────────────

  followUser: async (targetUserId: string) => {
    if (!isSupabaseConfigured) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId || userId === targetUserId) return;

    try {
      const supabase = getSupabase();

      // (follower_id, following_id) is the primary key, so a second attempt
      // at a follow the viewer already has would fail on it. Following is
      // idempotent by nature: upsert and ignore the duplicate instead.
      const { error } = await supabase.from("follows").upsert(
        {
          follower_id: userId,
          following_id: targetUserId,
        },
        { onConflict: "follower_id,following_id", ignoreDuplicates: true },
      );

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

  clearFollowing: () =>
    set({
      following: [],
      followingLoadedForUserId: null,
      isRefreshingFollowing: false,
      followingLoadError: null,
    }),

  reset: () => set(initialState),
}));
