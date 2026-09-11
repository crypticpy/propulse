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
});
