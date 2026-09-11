import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProfilePage from "./ProfilePage";
import { applyIdentitySave } from "@/stores/applyIdentitySave";
import { gridToLatLon } from "@/lib/utils/grid";
import type { UserStation } from "@/types/user";

const VIEWER_ID = "viewer-1";

const fixture = vi.hoisted(() => ({
  authenticated: true,
  viewerId: "viewer-1",
  followingLoadedForUserId: "viewer-1" as string | null,
  followingLoadError: null as { userId: string; at: number } | null,
  fetchFollowing: vi.fn(),
  mobile: false,
  profile: {} as Record<string, unknown>,
  following: [] as { id: string }[],
  follow: vi.fn(),
  unfollow: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            fixture.query();
            return { data: fixture.profile, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("@/stores/authStore", () => ({
  selectIsAuthenticated: (state: { authenticated: boolean }) =>
    state.authenticated,
  useAuthStore: (
    selector: (state: {
      authenticated: boolean;
      user: { id: string } | null;
    }) => unknown,
  ) =>
    selector({
      authenticated: fixture.authenticated,
      user: fixture.authenticated ? { id: fixture.viewerId } : null,
    }),
}));
vi.mock("@/stores/socialStore", async (importOriginal) => ({
  // The real predicate: the page's follow state is what it computes, so a
  // hand-written stand-in here would test nothing.
  viewerFriendship: (
    await importOriginal<typeof import("@/stores/socialStore")>()
  ).viewerFriendship,
  followLoadFailedForViewer: (
    await importOriginal<typeof import("@/stores/socialStore")>()
  ).followLoadFailedForViewer,
  useSocialStore: (
    selector: (state: {
      following: { id: string }[];
      followingLoadedForUserId: string | null;
      followingLoadError: { userId: string; at: number } | null;
      fetchFollowing: () => void;
      followUser: typeof fixture.follow;
      unfollowUser: typeof fixture.unfollow;
    }) => unknown,
  ) =>
    selector({
      following: fixture.following,
      followingLoadedForUserId: fixture.followingLoadedForUserId,
      followingLoadError: fixture.followingLoadError,
      fetchFollowing: fixture.fetchFollowing,
      followUser: fixture.follow,
      unfollowUser: fixture.unfollow,
    }),
}));
vi.mock("@/hooks/useRequireAuth", () => ({
  useRequireAuth: () => (action: () => void) => {
    if (fixture.authenticated) action();
  },
}));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => fixture.mobile }));
vi.mock("@/hooks/useActiveLocation", () => ({ useActiveLocation: () => null }));
vi.mock("@/hooks/useProfileCompleteness", () => ({
  useProfileCompleteness: () => ({
    score: 0,
    tier: "Getting started",
    tierColor: "text-su-muted",
  }),
}));
vi.mock("@/hooks/useOperatorRank", () => ({
  useOperatorRank: () => ({ rank: "novice", color: "#a0abba" }),
}));
vi.mock("@/hooks/useRankAssets", () => ({ useRankAssets: () => ({}) }));
vi.mock("@/hooks/useLogbookStats", () => ({
  useLogbookStats: () => ({ qsosByDate: {} }),
}));
vi.mock("@/hooks/useLogbook", () => ({ useLogbook: () => ({ entries: [] }) }));
// Keep the real page, station-ui navigation and privacy branches. Substitute
// expensive child features; marker text reveals whether restricted data mounts.
vi.mock("@/components/profile", () => ({
  ...Object.fromEntries(
    [
      "BioSection",
      "SocialLinksSection",
      "AwardsTab",
      "StatsTab",
      "QRCodeModal",
      "LicenseCard",
      "StationIdentityForm",
      "ProfileCardDesktop",
      "ProfileCardMobile",
      "HeroStatsBlock",
      "PersonalRecords",
      "ArchetypeRadar",
      "MyShackTab",
    ].map((name) => [name, () => <div>{name}</div>]),
  ),
  PublicShackPanel: ({ equipment }: { equipment: unknown }) => (
    <div>Shared equipment: {JSON.stringify(equipment)}</div>
  ),
}));
vi.mock("@/components/profile/VisitorProfileCard", () => ({
  VisitorProfileCard: () => <div>Visitor identity</div>,
}));
vi.mock("@/components/profile/ContactThisStation", () => ({
  ContactThisStation: () => <div>Contact analysis</div>,
}));
vi.mock("@/components/profile/WhereToFindMe", () => ({
  WhereToFindMe: () => <div>Published operating schedule</div>,
}));
vi.mock("@/components/nets/MyNetsSection", () => ({
  MyNetsSection: () => <div>Nets</div>,
}));
vi.mock("@/components/profile/FriendList", () => ({
  FriendList: () => <div>Friend list</div>,
}));
vi.mock("@/components/profile/ActivityFeed", () => ({
  ActivityFeed: () => <div>Activity feed</div>,
}));
vi.mock("@/components/profile/VisibilitySettings", () => ({
  VisibilitySettings: () => <div>Owner visibility editor</div>,
}));
vi.mock("@/components/profile/ShareCard", () => ({
  ShareCard: () => <div>Owner share editor</div>,
}));
vi.mock("@/components/profile/EquipmentSummary", () => ({
  EquipmentSummary: () => <div>Equipment summary</div>,
}));
vi.mock("@/components/profile/QSLSummary", () => ({
  QSLSummary: () => <div>QSL summary</div>,
}));
vi.mock("@/components/auth", () => ({
  AuthRequiredPlaceholder: ({ prompt }: { prompt: string }) => (
    <div>{prompt}</div>
  ),
}));

function openProfile(path = "/profile/N0TEST") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile/:callsign/*" element={<ProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  fixture.authenticated = true;
  fixture.viewerId = VIEWER_ID;
  fixture.mobile = false;
  fixture.following = [];
  fixture.followingLoadedForUserId = VIEWER_ID;
  fixture.followingLoadError = null;
  fixture.fetchFollowing.mockClear();
  fixture.follow.mockClear();
  fixture.unfollow.mockClear();
  fixture.query.mockClear();
  fixture.profile = {
    id: "synthetic-operator",
    callsign: "N0TEST",
    operator_name: "Test Operator",
    grid: "DM79",
    bio: "A station built for weekend experiments.",
    stats_cache: {
      totalQSOs: 123,
      equipment: { label: "SHARED_GEAR" },
      awards: ["SHARED_AWARD"],
    },
    visibility_settings: {
      equipment: "public",
      stats: "public",
      awards: "public",
      location: "public",
      activity: "public",
    },
    social_links: [{ type: "Website", url: "https://example.com/station" }],
  };
});

describe("redesigned visitor profile preservation", () => {
  it("retains all five sections, public gear, stats, awards, social and real follow action binding", async () => {
    openProfile();
    await screen.findByRole("heading", { name: "N0TEST · Station & story" });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Station",
      "Stats & records",
      "Awards",
      "Social",
    ]);
    expect(
      screen.getByText("A station built for weekend experiments."),
    ).toBeTruthy();
    expect(screen.getByText("Published operating schedule")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Follow operator" }));
    expect(fixture.follow).toHaveBeenCalledWith("synthetic-operator");
    fireEvent.click(screen.getByRole("tab", { name: "Station" }));
    expect(screen.getByText(/SHARED_GEAR/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Stats & records" }));
    expect(screen.getByText("123")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Awards" }));
    expect(screen.getByText(/SHARED_AWARD/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Social" }));
    expect(screen.getByText("Friend list")).toBeTruthy();
    expect(screen.queryByText("Owner visibility editor")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit identity" })).toBeNull();
  });

  it("keeps private sections hidden on mobile including the grid and direct shack route", async () => {
    fixture.mobile = true;
    fixture.profile.visibility_settings = {
      equipment: "private",
      stats: "private",
      awards: "private",
      location: "private",
      activity: "private",
    };
    openProfile("/profile/N0TEST/shack");
    await screen.findByText("Equipment info is private");
    expect(screen.queryByText(/SHARED_GEAR/)).toBeNull();
    expect(screen.queryByText("DM79")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.queryByText("Published operating schedule")).toBeNull();
    expect(screen.queryByRole("link", { name: /Website/ })).toBeNull();
    expect(screen.queryByText("123")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Stats & records" }));
    expect(screen.getByText("Stats are private")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Awards" }));
    expect(screen.getByText("Awards are private")).toBeTruthy();
    expect(screen.queryByText(/SHARED_AWARD/)).toBeNull();
  });

  it("retains configured-client sign-in gate without rendering visitor data", async () => {
    fixture.authenticated = false;
    openProfile();
    expect(
      await screen.findByText("Sign in to view operator profiles"),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /N0TEST/ })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(fixture.follow).not.toHaveBeenCalled();
  });

  // #995 round 4: socialStore.following is a cache with an owner. A set that
  // has not been confirmed to belong to the signed-in account must not unlock
  // a friends-only location, however "following" it looks.
  it("keeps a friends-only location closed while the follow set is unconfirmed", async () => {
    fixture.mobile = true;
    fixture.following = [{ id: "synthetic-operator" }];
    fixture.followingLoadedForUserId = null;
    (fixture.profile.visibility_settings as Record<string, string>).location =
      "friends";

    openProfile();
    await screen.findAllByRole("heading", { name: /N0TEST/ });
    expect(screen.queryByText("DM79")).toBeNull();
  });

  it("opens a friends-only location once the follow set is confirmed for this account", async () => {
    fixture.mobile = true;
    fixture.following = [{ id: "synthetic-operator" }];
    fixture.followingLoadedForUserId = VIEWER_ID;
    (fixture.profile.visibility_settings as Record<string, string>).location =
      "friends";

    openProfile();
    expect(await screen.findByText("DM79")).toBeTruthy();
  });

  it("requires the existing confirmation before unfollowing an operator", async () => {
    fixture.following = [{ id: "synthetic-operator" }];
    openProfile();
    fireEvent.click(await screen.findByRole("button", { name: "Following" }));
    expect(fixture.unfollow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fixture.unfollow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Following" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfollow" }));
    expect(fixture.unfollow).toHaveBeenCalledWith("synthetic-operator");
  });

  // #995 round 6: a failed initial load left the relation unknown with no way
  // back, so the follow control sat disabled for the life of the mount.
  it("offers a retry instead of a dead Follow button when the follow set failed to load", async () => {
    fixture.followingLoadedForUserId = null;
    fixture.followingLoadError = { userId: VIEWER_ID, at: Date.now() };

    openProfile();
    await screen.findAllByRole("heading", { name: /N0TEST/ });

    expect(
      screen.queryByRole("button", { name: "Follow operator" }),
    ).toBeNull();
    const retry = screen.getByRole("button", { name: "Retry follow status" });
    expect((retry as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(retry);
    expect(fixture.fetchFollowing).toHaveBeenCalled();
    // The relation is still unknown, so nothing was followed by that click.
    expect(fixture.follow).not.toHaveBeenCalled();
  });

  // #995 round 9: a session that goes straight from account A to account B
  // keeps `isAuthenticated` true, so an effect keyed on that boolean never
  // re-ran. authStore drops A's cache at the boundary and nothing refilled
  // it, leaving the relation unknown for the life of the mount: friends-only
  // sections hidden, Follow disabled, and no Retry because a cleared cache
  // is not a load error.
  it("reloads the follow set when the session switches straight to another account", async () => {
    // A fresh element each time: React bails out of re-rendering a subtree
    // whose element is referentially identical to the last one.
    const tree = () => (
      <MemoryRouter initialEntries={["/profile/N0TEST"]}>
        <Routes>
          <Route path="/profile/:callsign/*" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(tree());
    await screen.findAllByRole("heading", { name: /N0TEST/ });
    expect(fixture.fetchFollowing).toHaveBeenCalledTimes(1);

    // A to B: still authenticated, but authStore has cleared A's set.
    fixture.viewerId = "viewer-2";
    fixture.followingLoadedForUserId = null;
    rerender(tree());
    expect(fixture.fetchFollowing).toHaveBeenCalledTimes(2);

    // That reload lands and the relation ends known for B, not stuck.
    fixture.followingLoadedForUserId = "viewer-2";
    rerender(tree());
    expect(
      (
        screen.getByRole("button", {
          name: "Follow operator",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    // B back to A refetches again rather than trusting B's cache.
    fixture.viewerId = VIEWER_ID;
    fixture.followingLoadedForUserId = null;
    rerender(tree());
    expect(fixture.fetchFollowing).toHaveBeenCalledTimes(3);
  });

  it("keeps Follow disabled while the relation is unknown with no recorded failure", async () => {
    fixture.followingLoadedForUserId = null;

    openProfile();
    await screen.findAllByRole("heading", { name: /N0TEST/ });

    expect(
      screen.queryByRole("button", { name: "Retry follow status" }),
    ).toBeNull();
    const follow = screen.getByRole("button", {
      name: "Follow operator",
    }) as HTMLButtonElement;
    expect(follow.disabled).toBe(true);
  });
});

const preciseStation = (): UserStation => ({
  callsign: "W0TEST",
  operatorName: "Old Name",
  homeLocationId: "home-1",
  activeLocationId: null,
  savedLocations: [
    {
      id: "home-1",
      name: "Home",
      grid: "EM38",
      lat: 38.123456,
      lon: -92.654321,
      type: "home",
      timezone: "America/Chicago",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "pota-1",
      name: "POTA K-1234",
      grid: "EM29",
      lat: 39.1,
      lon: -94.2,
      type: "pota",
      createdAt: "2026-02-01T00:00:00.000Z",
    },
  ],
  grid: "EM38",
  lat: 38.123456,
  lon: -92.654321,
  timezone: "America/Chicago",
  name: "Shack nickname",
});

describe("identity save preserves locations (#351)", () => {
  it("keeps precise home coordinates on a name-only save", () => {
    const next = applyIdentitySave(preciseStation(), {
      callsign: "W0TEST",
      operatorName: "New Name",
      grid: "EM38",
    });
    expect(next?.operatorName).toBe("New Name");
    expect(next?.lat).toBe(38.123456);
    expect(next?.lon).toBe(-92.654321);
    expect(next?.savedLocations[0]?.lat).toBe(38.123456);
    expect(next?.savedLocations[0]?.lon).toBe(-92.654321);
    expect(next?.name).toBe("Shack nickname");
    expect(next?.timezone).toBe("America/Chicago");
    expect(gridToLatLon("EM38")).toEqual({ lat: 38.5, lon: -93 });
  });

  it("retains other saved locations and metadata when adding Home", () => {
    const portableOnly: UserStation = {
      callsign: "W0TEST",
      operatorName: "Pat",
      homeLocationId: "",
      activeLocationId: "pota-1",
      savedLocations: [
        {
          id: "pota-1",
          name: "POTA K-1234",
          grid: "EM29",
          lat: 39.1,
          lon: -94.2,
          type: "pota",
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      grid: "",
      lat: 39.1,
      lon: -94.2,
      timezone: "America/Denver",
      name: "Field kit",
    };
    const next = applyIdentitySave(
      portableOnly,
      { callsign: "W0TEST", operatorName: "Pat", grid: "EM38" },
      { createId: () => "home-new", now: () => "2026-09-10T00:00:00.000Z" },
    );
    expect(next?.savedLocations.map((loc) => loc.id)).toEqual([
      "pota-1",
      "home-new",
    ]);
    expect(next?.homeLocationId).toBe("home-new");
    expect(next?.activeLocationId).toBe("pota-1");
    expect(next?.timezone).toBe("America/Denver");
    expect(next?.name).toBe("Field kit");
  });

  it("updates only the home location when the grid field changes", () => {
    const next = applyIdentitySave(preciseStation(), {
      callsign: "W0TEST",
      operatorName: "Old Name",
      grid: "EM29",
    });
    const centroid = gridToLatLon("EM29");
    expect(next?.grid).toBe("EM29");
    expect(next?.lat).toBe(centroid.lat);
    expect(next?.lon).toBe(centroid.lon);
    expect(next?.savedLocations[0]).toMatchObject({
      id: "home-1",
      grid: "EM29",
      lat: centroid.lat,
      lon: centroid.lon,
    });
    expect(next?.savedLocations[1]).toMatchObject({
      id: "pota-1",
      lat: 39.1,
      lon: -94.2,
    });
  });

  it("does not fabricate a 0,0 Home when the grid is cleared or missing", () => {
    const cleared = applyIdentitySave(preciseStation(), {
      callsign: "W0TEST",
      operatorName: "Old Name",
      grid: "",
    });
    expect(cleared?.grid).toBe("");
    expect(cleared?.lat).toBe(38.123456);
    expect(cleared?.lon).toBe(-92.654321);
    expect(cleared?.savedLocations).toHaveLength(2);
    expect(
      cleared?.savedLocations.some((loc) => loc.lat === 0 && loc.lon === 0),
    ).toBe(false);

    const callsignOnly = applyIdentitySave(null, {
      callsign: "W0TEST",
      operatorName: "Pat",
      grid: "",
    });
    expect(callsignOnly?.savedLocations).toEqual([]);
    expect(callsignOnly?.homeLocationId).toBe("");
    expect(callsignOnly?.lat).toBe(0);
    expect(callsignOnly?.lon).toBe(0);
  });
});
