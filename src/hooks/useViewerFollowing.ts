/**
 * Keep the viewer's follow set loaded for whoever is signed in *now*.
 *
 * #995 round 9: both consumers used to key this fetch on the boolean
 * `isAuthenticated`. A session that goes straight from account A to account B
 * (no signed-out state in between) leaves that boolean true, so no mounted
 * view reloaded: authStore drops A's cache at the boundary and nothing
 * refills it. The relation then reads "unknown" for the life of the mount —
 * friends-only sections hidden, Follow disabled, and no Retry either, because
 * a cleared cache is not a load error.
 *
 * The rule lives here once: the fetch is keyed on the viewer identity, so it
 * re-runs on every account boundary (A to B, and B back to A) and does
 * nothing while signed out. The store's generation counter supersedes any
 * request the previous account left in flight, and `fetchFollowing` refuses
 * to commit a result whose user is no longer the signed-in one, so a
 * sign-out mid-fetch writes nothing.
 */

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSocialStore } from "@/stores/socialStore";

export function useViewerFollowing(): void {
  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const fetchFollowing = useSocialStore((s) => s.fetchFollowing);

  useEffect(() => {
    if (!authUserId) return;
    void fetchFollowing();
  }, [authUserId, fetchFollowing]);
}
