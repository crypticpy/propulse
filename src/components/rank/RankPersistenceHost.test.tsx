import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useProfileStore as useProfile } from "@/stores/profileStore";
import { DEFAULT_OPERATOR_RANK } from "@/types/rank";
import { useVisualEffectsStore, DEFAULT_VISUAL_EFFECTS } from "@/stores/visualEffectsStore";
import type { RankTier } from "@/types/rank";

const { persistRank } = vi.hoisted(() => ({ persistRank: vi.fn() }));
vi.mock("@/hooks/useOperatorRank", () => ({ useOperatorRank: persistRank }));
vi.mock("@/stores/kioskStore", () => ({ useKioskStore: (selector: (s: { active: boolean }) => unknown) => selector({ active: false }) }));
import { RankPersistenceHost } from "./RankPersistenceHost";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  useVisualEffectsStore.setState({ ...DEFAULT_VISUAL_EFFECTS, level: "off" });
  useProfile.setState({ operatorRank: { ...DEFAULT_OPERATOR_RANK, rankHistory: [] }, rankCelebrationSeen: null });
  persistRank.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function advanceRank(to: RankTier) {
  const previous = useProfile.getState().operatorRank;
  act(() => useProfile.setState({ operatorRank: { ...previous, currentRank: to, rankHistory: [...previous.rankHistory, { from: previous.currentRank, to, pointsAtTransition: previous.rankPoints, timestamp: new Date().toISOString() }] } }));
}

it("keeps rank persistence mounted while Off and consumes earned transitions without later replay, including remount", () => {
  const view = render(<RankPersistenceHost />);
  advanceRank("apprentice");
  expect(persistRank.mock.calls.every(([options]) => options.persist === true)).toBe(true);
  expect(persistRank).toHaveBeenCalled();
  expect(useProfile.getState().operatorRank.currentRank).toBe("apprentice");
  expect(useProfile.getState().operatorRank.rankHistory).toHaveLength(1);
  expect(useProfile.getState().rankCelebrationSeen).toBe("2026-09-06T12:00:00.000Z");
  expect(screen.queryByLabelText("Rank achievement")).toBeNull();
  act(() => useVisualEffectsStore.setState({ level: "subtle" }));
  expect(screen.queryByLabelText("Rank achievement")).toBeNull();
  view.unmount();
  render(<RankPersistenceHost />);
  expect(screen.queryByLabelText("Rank achievement")).toBeNull();
  vi.setSystemTime(new Date("2026-09-06T12:01:00Z"));
  advanceRank("journeyman");
  expect(screen.getByRole("status").textContent).toContain("Journeyman");
});

it("dismisses an active notice on opt-out and never replays it on re-enable; manual dismissal preserves progress", () => {
  useVisualEffectsStore.setState({ level: "subtle" });
  render(<RankPersistenceHost />);
  advanceRank("expert");
  expect(screen.getByRole("status")).toBeTruthy();
  act(() => useVisualEffectsStore.setState({ celebrations: false }));
  expect(screen.queryByRole("status")).toBeNull();
  act(() => useVisualEffectsStore.setState({ celebrations: true }));
  expect(screen.queryByRole("status")).toBeNull();
  vi.setSystemTime(new Date("2026-09-06T12:02:00Z"));
  advanceRank("master");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(useProfile.getState().operatorRank.currentRank).toBe("master");
  expect(useProfile.getState().operatorRank.rankHistory).toHaveLength(2);
  act(() => useVisualEffectsStore.setState({ level: "off" }));
  act(() => useVisualEffectsStore.setState({ level: "subtle" }));
  expect(screen.queryByRole("status")).toBeNull();
});

it("consumes a future-dated synced transition durably without lowering an existing seen watermark", () => {
  const view = render(<RankPersistenceHost />);
  act(() => useProfile.setState({ operatorRank: {
    ...DEFAULT_OPERATOR_RANK, currentRank: "expert", rankHistory: [{
      from: "journeyman", to: "expert", pointsAtTransition: 1000, timestamp: "2026-09-08T12:00:00.000Z",
    }],
  } }));
  expect(useProfile.getState().rankCelebrationSeen).toBe("2026-09-08T12:00:00.000Z");
  act(() => useVisualEffectsStore.setState({ level: "subtle" }));
  view.unmount();
  render(<RankPersistenceHost />);
  expect(screen.queryByRole("status")).toBeNull();
  act(() => useProfile.setState({ rankCelebrationSeen: "2026-09-09T12:00:00.000Z" }));
  act(() => useProfile.getState().markCelebrationSeen());
  expect(useProfile.getState().rankCelebrationSeen).toBe("2026-09-09T12:00:00.000Z");
  expect(useProfile.getState().operatorRank.rankHistory).toHaveLength(1);
});
