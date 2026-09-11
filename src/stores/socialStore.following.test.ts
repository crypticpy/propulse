import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  follows: vi.fn(),
  profiles: vi.fn(),
  upsert: vi.fn(),
  insert: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    auth: {
      getSession: supabaseMocks.getSession,
      onAuthStateChange: supabaseMocks.onAuthStateChange,
    },
    realtime: { setAuth: () => Promise.resolve() },
    from: (table: string) => ({
      select: () => ({
        eq: () => supabaseMocks.follows(),
        in: () => supabaseMocks.profiles(),
      }),
      upsert: (...args: unknown[]) => supabaseMocks.upsert(...args),
      delete: () => ({ eq: () => ({ eq: () => supabaseMocks.del() }) }),
      insert: (...args: unknown[]) => supabaseMocks.insert(...args),
      __table: table,
    }),
  }),
}));

import { useAuthStore } from "@/stores/authStore";
import {
  followLoadFailedForViewer,
  useSocialStore,
  viewerFriendship,
} from "@/stores/socialStore";

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

function signedInAs(id: string) {
  useAuthStore.setState({
    user: { id } as Session["user"],
    session: { user: { id } } as Session,
  });
}

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function profileRow(id: string) {
  return { id, callsign: id.toUpperCase(), grid: "DM79" };
}

afterEach(() => {
  useSocialStore.getState().reset();
  useAuthStore.setState({ user: null, session: null });
  vi.clearAllMocks();
});

describe("socialStore following is account-scoped (#995)", () => {
  it("tags the loaded set with the account it was loaded for", async () => {
    signedInAs("user-a");
    supabaseMocks.follows.mockResolvedValue({
      data: [{ following_id: "operator-1" }],
      error: null,
    });
    supabaseMocks.profiles.mockResolvedValue({
      data: [profileRow("operator-1")],
      error: null,
    });

    await useSocialStore.getState().fetchFollowing();

    const state = useSocialStore.getState();
    expect(state.following.map((p) => p.id)).toEqual(["operator-1"]);
    expect(state.followingLoadedForUserId).toBe("user-a");
    expect(
      viewerFriendship(
        state.following,
        state.followingLoadedForUserId,
        "user-a",
        "operator-1",
      ),
    ).toBe("friend");
  });

  it("reports unknown, not friend, for another account's cached set", () => {
    useSocialStore.setState({
      following: [{ id: "operator-1", callsign: "OPERATOR-1" }],
      followingLoadedForUserId: "user-a",
    });
    const state = useSocialStore.getState();
    expect(
      viewerFriendship(
        state.following,
        state.followingLoadedForUserId,
        "user-b",
        "operator-1",
      ),
    ).toBe("unknown");
  });

  it("clears the set at the auth boundary, so friends-only content closes until the next fetch", async () => {
    let listener: AuthListener | undefined;
    supabaseMocks.onAuthStateChange.mockImplementation((cb: AuthListener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe: () => {} } } };
    });
    supabaseMocks.getSession.mockResolvedValue({ data: { session: null } });

    await useAuthStore.getState().initialize();
    useSocialStore.setState({
      following: [{ id: "operator-1", callsign: "OPERATOR-1" }],
      followingLoadedForUserId: "user-a",
    });

    listener?.("SIGNED_IN", {
      user: { id: "user-b" },
      access_token: "token",
    } as Session);

    const state = useSocialStore.getState();
    expect(state.following).toEqual([]);
    expect(state.followingLoadedForUserId).toBeNull();
    expect(
      viewerFriendship(
        state.following,
        state.followingLoadedForUserId,
        "user-b",
        "operator-1",
      ),
    ).toBe("unknown");

    useAuthStore.getState().cleanup();
  });

  it("drops a fetch that resolves after the account changed", async () => {
    signedInAs("user-a");
    let releaseFollows!: (value: unknown) => void;
    supabaseMocks.follows.mockReturnValue(
      new Promise((resolve) => {
        releaseFollows = resolve;
      }),
    );
    supabaseMocks.profiles.mockResolvedValue({
      data: [profileRow("operator-1")],
      error: null,
    });

    const inFlight = useSocialStore.getState().fetchFollowing();
    // The set is dropped the moment the request starts: nothing may read the
    // previous answer while a new one is on the way.
    expect(useSocialStore.getState().followingLoadedForUserId).toBeNull();

    signedInAs("user-b");
    releaseFollows({ data: [{ following_id: "operator-1" }], error: null });
    await inFlight;

    const state = useSocialStore.getState();
    expect(state.following).toEqual([]);
    expect(state.followingLoadedForUserId).toBeNull();
  });

  it("keeps the same account's set through a refresh, so a remount does not flash the viewer as a stranger", async () => {
    signedInAs("user-a");
    useSocialStore.setState({
      following: [{ id: "operator-1", callsign: "OPERATOR-1" }],
      followingLoadedForUserId: "user-a",
    });

    let releaseFollows!: (value: unknown) => void;
    supabaseMocks.follows.mockReturnValue(
      new Promise((resolve) => {
        releaseFollows = resolve;
      }),
    );
    supabaseMocks.profiles.mockResolvedValue({
      data: [profileRow("operator-1")],
      error: null,
    });

    const inFlight = useSocialStore.getState().fetchFollowing();

    const refreshing = useSocialStore.getState();
    expect(refreshing.following.map((p) => p.id)).toEqual(["operator-1"]);
    expect(refreshing.followingLoadedForUserId).toBe("user-a");
    expect(refreshing.isRefreshingFollowing).toBe(true);
    // Friends-only content stays open and the follow button stays on its last
    // known state: the relation is still known, just being re-read.
    expect(
      viewerFriendship(
        refreshing.following,
        refreshing.followingLoadedForUserId,
        "user-a",
        "operator-1",
      ),
    ).toBe("friend");

    releaseFollows({ data: [{ following_id: "operator-1" }], error: null });
    await inFlight;

    const settled = useSocialStore.getState();
    expect(settled.following.map((p) => p.id)).toEqual(["operator-1"]);
    expect(settled.followingLoadedForUserId).toBe("user-a");
    expect(settled.isRefreshingFollowing).toBe(false);
  });

  it("still clears the set when the cache belongs to another account", async () => {
    signedInAs("user-b");
    useSocialStore.setState({
      following: [{ id: "operator-1", callsign: "OPERATOR-1" }],
      followingLoadedForUserId: "user-a",
    });

    let releaseFollows!: (value: unknown) => void;
    supabaseMocks.follows.mockReturnValue(
      new Promise((resolve) => {
        releaseFollows = resolve;
      }),
    );
    supabaseMocks.profiles.mockResolvedValue({ data: [], error: null });

    const inFlight = useSocialStore.getState().fetchFollowing();

    const during = useSocialStore.getState();
    expect(during.following).toEqual([]);
    expect(during.followingLoadedForUserId).toBeNull();
    expect(
      viewerFriendship(
        during.following,
        during.followingLoadedForUserId,
        "user-b",
        "operator-1",
      ),
    ).toBe("unknown");

    releaseFollows({ data: [], error: null });
    await inFlight;
    expect(useSocialStore.getState().followingLoadedForUserId).toBe("user-b");
  });

  it("keeps this account's last known set when a refresh fails", async () => {
    signedInAs("user-a");
    useSocialStore.setState({
      following: [{ id: "operator-1", callsign: "OPERATOR-1" }],
      followingLoadedForUserId: "user-a",
    });
    supabaseMocks.follows.mockResolvedValue({
      data: null,
      error: { message: "network" },
    });

    await useSocialStore.getState().fetchFollowing();

    const state = useSocialStore.getState();
    // A failed refresh is not an answer; demoting to "unknown" here would
    // close friends-only content and disable the button on a transient error.
    expect(state.following.map((p) => p.id)).toEqual(["operator-1"]);
    expect(state.followingLoadedForUserId).toBe("user-a");
    expect(state.isRefreshingFollowing).toBe(false);
  });

  it("writes a follow idempotently, so a click during a refresh cannot collide with the primary key", async () => {
    signedInAs("user-a");
    supabaseMocks.upsert.mockResolvedValue({ error: null });
    supabaseMocks.follows.mockResolvedValue({ data: [], error: null });

    await useSocialStore.getState().followUser("operator-1");

    expect(supabaseMocks.insert).not.toHaveBeenCalled();
    expect(supabaseMocks.upsert).toHaveBeenCalledWith(
      { follower_id: "user-a", following_id: "operator-1" },
      { onConflict: "follower_id,following_id", ignoreDuplicates: true },
    );
  });

  it("records a recoverable failure so the gated controls can offer a retry", async () => {
    signedInAs("user-a");
    supabaseMocks.follows.mockResolvedValue({
      data: null,
      error: { message: "network" },
    });

    await useSocialStore.getState().fetchFollowing();

    const failedState = useSocialStore.getState();
    // Nothing is known, which is what keeps friends-only content closed, but
    // the failure is now visible so the mount is not stuck there.
    expect(failedState.followingLoadedForUserId).toBeNull();
    expect(failedState.followingLoadError?.userId).toBe("user-a");
    expect(failedState.isRefreshingFollowing).toBe(false);
    expect(
      followLoadFailedForViewer(failedState.followingLoadError, "user-a"),
    ).toBe(true);

    supabaseMocks.follows.mockResolvedValue({
      data: [{ following_id: "operator-1" }],
      error: null,
    });
    supabaseMocks.profiles.mockResolvedValue({
      data: [profileRow("operator-1")],
      error: null,
    });

    await useSocialStore.getState().fetchFollowing();

    const retried = useSocialStore.getState();
    expect(retried.followingLoadedForUserId).toBe("user-a");
    expect(retried.followingLoadError).toBeNull();
    expect(
      viewerFriendship(
        retried.following,
        retried.followingLoadedForUserId,
        "user-a",
        "operator-1",
      ),
    ).toBe("friend");
  });

  it("ignores a failure recorded for a different user than the current one", async () => {
    signedInAs("user-a");
    let releaseFollows!: (value: unknown) => void;
    supabaseMocks.follows.mockReturnValue(
      new Promise((resolve) => {
        releaseFollows = resolve;
      }),
    );

    const inFlight = useSocialStore.getState().fetchFollowing();
    signedInAs("user-b");
    releaseFollows({ data: null, error: { message: "network" } });
    await inFlight;

    const state = useSocialStore.getState();
    // The failure belonged to user-a's fetch; user-b must not be shown a
    // retry for it, and must not have one recorded at all.
    expect(state.followingLoadError).toBeNull();
    expect(followLoadFailedForViewer(state.followingLoadError, "user-b")).toBe(
      false,
    );
  });

  it("clears a recorded failure at the account boundary", () => {
    useSocialStore.setState({
      followingLoadError: { userId: "user-a", at: Date.now() },
    });
    useSocialStore.getState().clearFollowing();
    expect(useSocialStore.getState().followingLoadError).toBeNull();
  });

  it("lets the latest load win when an older overlapping one fails after it", async () => {
    signedInAs("user-a");
    const older = deferred();
    const newer = deferred();
    supabaseMocks.follows
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    supabaseMocks.profiles.mockResolvedValue({
      data: [profileRow("operator-1")],
      error: null,
    });

    const olderCall = useSocialStore.getState().fetchFollowing();
    const newerCall = useSocialStore.getState().fetchFollowing();

    newer.resolve({ data: [{ following_id: "operator-1" }], error: null });
    await newerCall;
    older.resolve({ data: null, error: { message: "network" } });
    await olderCall;

    const state = useSocialStore.getState();
    // The older call's view of the cache is stale; committing its failure
    // would wipe the good set and put a retry error on a healthy state.
    expect(state.following.map((p) => p.id)).toEqual(["operator-1"]);
    expect(state.followingLoadedForUserId).toBe("user-a");
    expect(state.followingLoadError).toBeNull();
    expect(state.isRefreshingFollowing).toBe(false);
  });

  it("records the error when the newest load fails after an older one succeeded", async () => {
    signedInAs("user-a");
    const older = deferred();
    const newer = deferred();
    supabaseMocks.follows
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    supabaseMocks.profiles.mockResolvedValue({
      data: [profileRow("operator-1")],
      error: null,
    });

    const olderCall = useSocialStore.getState().fetchFollowing();
    const newerCall = useSocialStore.getState().fetchFollowing();

    older.resolve({ data: [{ following_id: "operator-1" }], error: null });
    await olderCall;
    newer.resolve({ data: null, error: { message: "network" } });
    await newerCall;

    const state = useSocialStore.getState();
    // The latest answer wins even when it is the worse one.
    expect(state.followingLoadedForUserId).toBeNull();
    expect(state.followingLoadError?.userId).toBe("user-a");
    expect(state.isRefreshingFollowing).toBe(false);
  });

  it("does not let a refresh that read the old row resurrect an unfollow", async () => {
    signedInAs("user-a");
    useSocialStore.setState({
      following: [{ id: "operator-1", callsign: "OPERATOR-1" }],
      followingLoadedForUserId: "user-a",
    });

    const stale = deferred();
    const afterUnfollow = deferred();
    supabaseMocks.follows
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(afterUnfollow.promise);
    supabaseMocks.profiles.mockResolvedValue({
      data: [profileRow("operator-1")],
      error: null,
    });
    supabaseMocks.del.mockResolvedValue({ error: null });

    // A refresh is in flight and has already read the follow row.
    const refresh = useSocialStore.getState().fetchFollowing();

    const unfollow = useSocialStore.getState().unfollowUser("operator-1");
    afterUnfollow.resolve({ data: [], error: null });
    await unfollow;

    stale.resolve({ data: [{ following_id: "operator-1" }], error: null });
    await refresh;

    const state = useSocialStore.getState();
    expect(state.following).toEqual([]);
    expect(state.followingLoadedForUserId).toBe("user-a");
    expect(state.followingLoadError).toBeNull();
  });

  it("keeps the unfollow when a superseded refresh fails afterwards", async () => {
    signedInAs("user-a");
    useSocialStore.setState({
      following: [{ id: "operator-1", callsign: "OPERATOR-1" }],
      followingLoadedForUserId: "user-a",
    });

    const stale = deferred();
    const afterUnfollow = deferred();
    supabaseMocks.follows
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(afterUnfollow.promise);
    supabaseMocks.del.mockResolvedValue({ error: null });

    const refresh = useSocialStore.getState().fetchFollowing();
    const unfollow = useSocialStore.getState().unfollowUser("operator-1");
    afterUnfollow.resolve({ data: [], error: null });
    await unfollow;

    stale.resolve({ data: null, error: { message: "network" } });
    await refresh;

    const state = useSocialStore.getState();
    // A superseded request may not clear the write that superseded it, and
    // may not put the viewer into the retry state either.
    expect(state.following).toEqual([]);
    expect(state.followingLoadedForUserId).toBe("user-a");
    expect(state.followingLoadError).toBeNull();
  });

  it("ends on the server's answer through an unfollow / re-follow interleave", async () => {
    signedInAs("user-a");
    useSocialStore.setState({
      following: [{ id: "operator-1", callsign: "OPERATOR-1" }],
      followingLoadedForUserId: "user-a",
    });

    const stale = deferred();
    supabaseMocks.follows
      .mockReturnValueOnce(stale.promise)
      // after the unfollow
      .mockResolvedValueOnce({ data: [], error: null })
      // after the re-follow
      .mockResolvedValueOnce({
        data: [{ following_id: "operator-1" }],
        error: null,
      });
    supabaseMocks.profiles.mockResolvedValue({
      data: [profileRow("operator-1")],
      error: null,
    });
    supabaseMocks.del.mockResolvedValue({ error: null });
    supabaseMocks.upsert.mockResolvedValue({ error: null });

    const refresh = useSocialStore.getState().fetchFollowing();
    await useSocialStore.getState().unfollowUser("operator-1");
    expect(useSocialStore.getState().following).toEqual([]);

    await useSocialStore.getState().followUser("operator-1");

    // The very first refresh, older than both writes, lands last.
    stale.resolve({ data: [{ following_id: "operator-1" }], error: null });
    await refresh;

    const state = useSocialStore.getState();
    expect(state.following.map((p) => p.id)).toEqual(["operator-1"]);
    expect(state.followingLoadedForUserId).toBe("user-a");
    expect(state.followingLoadError).toBeNull();
  });
});
