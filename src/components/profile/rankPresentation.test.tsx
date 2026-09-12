import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_OPERATOR_RANK } from "@/types/rank";
import { useProfileStore } from "@/stores/profileStore";
import {
  DEFAULT_VISUAL_EFFECTS,
  useVisualEffectsStore,
} from "@/stores/visualEffectsStore";
import { ProfileCardMobile } from "./ProfileCard";
import { HeaderRankBadge } from "@/components/layout/HeaderRankBadge";
import { AwardsTab } from "./AwardsTab";

vi.mock("@/hooks/useOperatorRank", () => ({
  useOperatorRank: () => ({
    rank: "expert",
    color: "#38bdf8",
    label: "Expert",
    icon: "",
    title: "Expert title",
    rankPoints: 1200,
    breakdown: {
      achievements: 100,
      qsos: 200,
      dxcc: 50,
      bandModeSlots: 0,
      contests: 0,
      loginStreaks: 0,
      equipment: 0,
      signalPaths: 0,
      profileComplete: 0,
      shares: 0,
      elmerSessions: 0,
      total: 350,
    },
    progress: {
      current: "expert",
      next: "master",
      progressPercent: 40,
      pointsToNext: 300,
    },
    unlockedBackgrounds: ["schematic"],
    preferences: DEFAULT_OPERATOR_RANK.preferences,
    isLoading: false,
    hasCardFlip: false,
    hasMouseTilt: false,
    hasParticles: false,
    hasSound: false,
    hasSignature: false,
    persist: true,
  }),
}));

vi.mock("@/hooks/useRankAssets", () => ({
  useRankAssets: () => ({}),
}));

vi.mock("@/hooks/useImageUrl", () => ({
  useImageUrl: () => ({ url: null }),
}));

vi.mock("@/hooks/useAwardProgress", () => ({
  useAwardProgress: () => ({
    dxccWorkedCount: 1,
    dxccConfirmedCount: 0,
    wasWorkedCount: 1,
    wasConfirmedCount: 0,
    wazWorkedCount: 1,
    wazConfirmedCount: 0,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useAchievements", () => ({
  useAchievements: () => ({
    achievements: [{ definitionId: "first-qso", tier: "bronze", progress: 1, nextThreshold: null }],
    isLoading: false,
  }),
}));

describe("local rank presentation", () => {
  beforeEach(() => {
    useVisualEffectsStore.setState({ ...DEFAULT_VISUAL_EFFECTS });
    useProfileStore.setState({
      operatorRank: {
        ...DEFAULT_OPERATOR_RANK,
        currentRank: "expert",
        rankPoints: 1200,
        rankHistory: [{
          from: "journeyman",
          to: "expert",
          pointsAtTransition: 900,
          timestamp: "2026-01-01T00:00:00.000Z",
        }],
      },
    });
  });
  afterEach(cleanup);

  it("hides owner rank badges immediately without mutating stored rank data", () => {
    const before = useProfileStore.getState().operatorRank;
    const { rerender } = render(
      <MemoryRouter>
        <ProfileCardMobile
          displayCallsign="K1TEST"
          displayGrid="FN42"
          completeness={{ score: 80, tier: "solid", tierColor: "#00ff88" }}
        />
        <HeaderRankBadge />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Expert")).toHaveLength(2);
    act(() => useVisualEffectsStore.getState().setPresentation("showRankBadge", false));
    rerender(
      <MemoryRouter>
        <ProfileCardMobile
          displayCallsign="K1TEST"
          displayGrid="FN42"
          completeness={{ score: 80, tier: "solid", tierColor: "#00ff88" }}
        />
        <HeaderRankBadge />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Expert")).toBeNull();
    expect(screen.getByText("K1TEST")).toBeTruthy();
    const after = useProfileStore.getState().operatorRank;
    expect(after.currentRank).toBe(before.currentRank);
    expect(after.rankPoints).toBe(before.rankPoints);
    expect(after.rankHistory).toEqual(before.rankHistory);
  });

  it("hides the achievement module without leaving an empty awards section shell", () => {
    const { rerender } = render(
      <MemoryRouter>
        <AwardsTab />
      </MemoryRouter>,
    );
    expect(screen.getByText("Achievement Badges")).toBeTruthy();
    expect(screen.getByText(/achievements unlocked/)).toBeTruthy();
    act(() => useVisualEffectsStore.getState().setPresentation("showAchievements", false));
    rerender(
      <MemoryRouter>
        <AwardsTab />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Achievement Badges")).toBeNull();
    expect(screen.queryByText(/achievements unlocked/)).toBeNull();
    expect(screen.getAllByText("DXCC").length).toBeGreaterThan(0);
  });
});
