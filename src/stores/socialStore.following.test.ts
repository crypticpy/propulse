import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  follows: vi.fn(),
  profiles: vi.fn(),
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
      __table: table,
    }),
  }),
}));

import { useAuthStore } from "@/stores/authStore";
import { useSocialStore, viewerFriendship } from "@/stores/socialStore";

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

function signedInAs(id: string) {
  useAuthStore.setState({
    user: { id } as Session["user"],
    session: { user: { id } } as Session,
  });
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
});
