/**
 * FriendList — Friend/follow management component for the Social tab.
 *
 * Displays two sections: "Following" (people you follow) and "Followers"
 * (people following you). Each entry shows callsign, name, grid, activity
 * status, and a follow/unfollow toggle.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSocialStore } from "@/stores/socialStore";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { AuthRequiredPlaceholder } from "@/components/auth";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Returns true if lastActiveAt is within the last 5 minutes */
function isOnline(lastActiveAt?: string): boolean {
  if (!lastActiveAt) return false;
  const diff = Date.now() - new Date(lastActiveAt).getTime();
  return diff < 5 * 60 * 1000;
}

// ── Component ───────────────────────────────────────────────────────────

export function FriendList() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  // Auth gate: social features require sign-in
  if (isSupabaseConfigured && !isAuthenticated) {
    return (
      <AuthRequiredPlaceholder prompt="Sign in to follow operators and see your friends" />
    );
  }

  return <FriendListInner />;
}

function FriendListInner() {
  const following = useSocialStore((s) => s.following);
  const followers = useSocialStore((s) => s.followers);
  const isLoading = useSocialStore((s) => s.isLoadingFollowers);
  const fetchFollowing = useSocialStore((s) => s.fetchFollowing);
  const fetchFollowers = useSocialStore((s) => s.fetchFollowers);
  const followUser = useSocialStore((s) => s.followUser);
  const unfollowUser = useSocialStore((s) => s.unfollowUser);

  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [unfollowTarget, setUnfollowTarget] = useState<string | null>(null);

  // Fetch on mount
  useEffect(() => {
    fetchFollowing();
    fetchFollowers();
  }, [fetchFollowing, fetchFollowers]);

  // Set of IDs the current user follows (for toggle logic)
  const followingIds = useMemo(
    () => new Set(following.map((p) => p.id)),
    [following],
  );

  // Filter by callsign search
  const filteredFollowing = useMemo(() => {
    if (!search.trim()) return following;
    const q = search.trim().toUpperCase();
    return following.filter(
      (p) =>
        p.callsign.toUpperCase().includes(q) ||
        p.operatorName?.toUpperCase().includes(q),
    );
  }, [following, search]);

  const filteredFollowers = useMemo(() => {
    if (!search.trim()) return followers;
    const q = search.trim().toUpperCase();
    return followers.filter(
      (p) =>
        p.callsign.toUpperCase().includes(q) ||
        p.operatorName?.toUpperCase().includes(q),
    );
  }, [followers, search]);

  const handleFollow = useCallback(
    async (userId: string) => {
      try {
        setActionError(null);
        await followUser(userId);
      } catch {
        setActionError("Failed to follow user. Please try again.");
      }
    },
    [followUser],
  );

  const handleUnfollow = useCallback((userId: string) => {
    setUnfollowTarget(userId);
  }, []);

  const confirmUnfollow = useCallback(async () => {
    if (!unfollowTarget) return;
    try {
      setActionError(null);
      await unfollowUser(unfollowTarget);
    } catch {
      setActionError("Failed to unfollow user. Please try again.");
    }
    setUnfollowTarget(null);
  }, [unfollowTarget, unfollowUser]);

  const isEmpty = following.length === 0 && followers.length === 0;

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Friends
      </h3>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by callsign or name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 transition-colors"
      />

      {actionError && <p className="text-xs text-alert-red">{actionError}</p>}

      {isLoading && (
        <p className="text-sm text-gray-500 animate-pulse motion-reduce:animate-none">
          Loading...
        </p>
      )}

      {!isLoading && isEmpty && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">
            No friends yet — search for operators to follow
          </p>
        </div>
      )}

      {/* Following section */}
      {filteredFollowing.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Following ({filteredFollowing.length})
          </h4>
          <div className="space-y-2">
            {filteredFollowing.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                isFollowing={true}
                onToggle={() => handleUnfollow(profile.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Followers section */}
      {filteredFollowers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Followers ({filteredFollowers.length})
          </h4>
          <div className="space-y-2">
            {filteredFollowers.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                isFollowing={followingIds.has(profile.id)}
                onToggle={() =>
                  followingIds.has(profile.id)
                    ? handleUnfollow(profile.id)
                    : handleFollow(profile.id)
                }
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={unfollowTarget !== null}
        title="Unfollow Operator"
        message="Are you sure you want to unfollow this operator?"
        confirmLabel="Unfollow"
        variant="warning"
        onConfirm={confirmUnfollow}
        onCancel={() => setUnfollowTarget(null)}
      />
    </div>
  );
}

// ── Profile Card ────────────────────────────────────────────────────────

interface ProfileCardProps {
  profile: {
    id: string;
    callsign: string;
    operatorName?: string;
    grid?: string;
    lastActiveAt?: string;
  };
  isFollowing: boolean;
  onToggle: () => void;
}

function ProfileCard({ profile, isFollowing, onToggle }: ProfileCardProps) {
  const online = isOnline(profile.lastActiveAt);

  return (
    <div className="bg-panel/30 border border-white/5 rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Status dot */}
        <span
          className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${
            online ? "bg-signal-green" : "bg-gray-600"
          }`}
          title={online ? "Active now" : "Offline"}
        />
        <div className="min-w-0">
          <span className="font-mono text-sm font-bold text-gray-100 tracking-wide">
            {profile.callsign || "N0CALL"}
          </span>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {profile.operatorName && (
              <span className="truncate">{profile.operatorName}</span>
            )}
            {profile.grid && <span className="font-mono">{profile.grid}</span>}
          </div>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={
          isFollowing
            ? "bg-white/5 text-gray-400 border border-white/10 rounded-full px-3 py-1 text-xs hover:bg-white/10 transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
            : "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30 rounded-full px-3 py-1 text-xs hover:bg-plasma-orange/25 transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
        }
      >
        {isFollowing ? "Unfollow" : "Follow"}
      </button>
    </div>
  );
}
