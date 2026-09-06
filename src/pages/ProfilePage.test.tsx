import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProfilePage from "./ProfilePage";

const fixture = vi.hoisted(() => ({
  authenticated: true,
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
  useAuthStore: (selector: (state: { authenticated: boolean }) => unknown) =>
    selector({ authenticated: fixture.authenticated }),
}));
vi.mock("@/stores/socialStore", () => ({
  useSocialStore: (
    selector: (state: {
      following: { id: string }[];
      fetchFollowing: () => void;
      followUser: typeof fixture.follow;
      unfollowUser: typeof fixture.unfollow;
    }) => unknown,
  ) =>
    selector({
      following: fixture.following,
      fetchFollowing: () => {},
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
    tierColor: "text-gray-400",
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
  fixture.mobile = false;
  fixture.following = [];
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
});
