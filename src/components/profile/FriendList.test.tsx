import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/authStore";
import { useSocialStore } from "@/stores/socialStore";
import { FriendList } from "./FriendList";

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => {
    throw new Error("FriendList must not fetch in this test");
  },
}));

const follower = {
  id: "operator-1",
  callsign: "N0TEST",
  lastActiveAt: undefined,
};

const friendsOnlyFollower = {
  id: "operator-2",
  callsign: "N0FRND",
  grid: "DM79",
  visibilitySettings: {
    stats: "public",
    awards: "public",
    equipment: "public",
    activity: "public",
    location: "friends",
  },
  lastActiveAt: undefined,
} as const;

function signedInAs(id: string | null) {
  useAuthStore.setState({
    user: id ? ({ id } as never) : null,
    session: id ? ({ user: { id } } as never) : null,
  });
}

function toggleButton() {
  return screen.getByRole("button", {
    name: /^(Follow|Unfollow)$/,
  }) as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
  useSocialStore.getState().reset();
  signedInAs(null);
});

describe("FriendList follow toggle gating (#995)", () => {
  it("does not offer Follow while the viewer's follow set is unknown", () => {
    signedInAs("user-a");
    // Tagged to another account: this viewer's relationships are unknown, so
    // "Follow" here could be a duplicate write on the follows primary key.
    useSocialStore.setState({
      followers: [follower],
      following: [],
      followingLoadedForUserId: "user-b",
    });

    render(<FriendList />);

    expect(toggleButton().textContent).toBe("Follow");
    expect(toggleButton().disabled).toBe(true);
  });

  it("offers the toggle once the set is this account's, including mid-refresh", () => {
    signedInAs("user-a");
    useSocialStore.setState({
      followers: [follower],
      following: [],
      followingLoadedForUserId: "user-a",
      isRefreshingFollowing: true,
    });

    render(<FriendList />);

    expect(toggleButton().disabled).toBe(false);
  });

  it("offers one retry for the whole list when the follow set failed to load", () => {
    signedInAs("user-a");
    const fetchFollowing = vi.fn();
    useSocialStore.setState({
      followers: [follower],
      following: [],
      followingLoadedForUserId: null,
      followingLoadError: { userId: "user-a", at: Date.now() },
      fetchFollowing,
    });

    render(<FriendList />);

    const callsOnMount = fetchFollowing.mock.calls.length;
    const retry = screen.getByRole("button", {
      name: "Retry",
    }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    // One way out for the list, not a retry on every row.
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    expect(toggleButton().disabled).toBe(true);

    retry.click();
    expect(fetchFollowing.mock.calls.length).toBe(callsOnMount + 1);
  });

  // #995 round 7: the row passed a literal `true` for "the viewer is a
  // friend", so a one-way follower disclosed a friends-only grid.
  it("hides a friends-only grid from a follower the viewer does not follow back", () => {
    signedInAs("user-a");
    useSocialStore.setState({
      followers: [friendsOnlyFollower],
      following: [],
      followingLoadedForUserId: "user-a",
    });

    render(<FriendList />);

    expect(screen.getByText("N0FRND")).toBeTruthy();
    expect(screen.queryByText("DM79")).toBeNull();
  });

  it("shows the friends-only grid once the follow is mutual", () => {
    signedInAs("user-a");
    useSocialStore.setState({
      followers: [friendsOnlyFollower],
      following: [friendsOnlyFollower],
      followingLoadedForUserId: "user-a",
    });

    render(<FriendList />);

    expect(screen.getAllByText("DM79").length).toBeGreaterThan(0);
  });

  it("hides a friends-only grid while the follow set is unknown", () => {
    signedInAs("user-a");
    useSocialStore.setState({
      followers: [friendsOnlyFollower],
      following: [friendsOnlyFollower],
      followingLoadedForUserId: "user-b",
    });

    render(<FriendList />);

    expect(screen.queryByText("DM79")).toBeNull();
  });
});
