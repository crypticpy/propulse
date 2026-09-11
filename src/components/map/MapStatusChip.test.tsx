import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapStatusChip } from "./MapStatusChip";
import { useMapStore } from "@/stores/mapStore";

vi.mock("@/components/ui/HealthStatusIndicator", () => ({
  HealthStatusIndicator: ({ compact }: { compact?: boolean }) => (
    <span data-compact={String(compact)} data-testid="health-status" />
  ),
}));

vi.mock("@/components/ui/SyncStatusIndicator", () => ({
  SyncStatusIndicator: () => <span data-testid="sync-status" />,
}));

vi.mock("@/components/qso/ConflictBadge", () => ({
  ConflictBadge: () => <span data-testid="conflict-status" />,
}));

vi.mock("@/components/ui/ConnectivityBadge", () => ({
  ConnectivityBadge: () => <span data-testid="connectivity-status" />,
}));

describe("MapStatusChip", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps system health compact without duplicating time or location", () => {
    vi.useFakeTimers();
    render(<MapStatusChip />);

    expect(screen.getByLabelText("Map system status")).toBeTruthy();
    expect(screen.queryByText("UTC")).toBeNull();
    expect(screen.queryByTitle("Current UTC time")).toBeNull();
    expect(screen.queryByTestId("location-control")).toBeNull();
    expect(screen.getByTestId("health-status").dataset.compact).toBe("true");
    expect(screen.getByTestId("sync-status")).toBeTruthy();
    expect(screen.getByTestId("conflict-status")).toBeTruthy();
    expect(screen.getByTestId("connectivity-status")).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("surfaces the orbit-track eviction notice and lets it be dismissed (#994 PR B)", () => {
    render(<MapStatusChip />);
    expect(screen.queryByText(/Orbit limit/)).toBeNull();

    act(() => {
      useMapStore.getState().setSatelliteTrack(1, {});
      useMapStore.getState().setSatelliteTrack(2, {});
      useMapStore.getState().setSatelliteTrack(3, {});
      useMapStore.getState().setSatelliteTrack(4, {});
      useMapStore.getState().setSatelliteTrack(5, {});
      useMapStore.getState().setSatelliteTrack(6, {});
    });

    const badge = screen.getByText(/Orbit limit/);
    // These tracks were added with no `name` in the patch, so the eviction
    // record has none either and the badge falls back to "NORAD <id>"
    // (#994 PR B round 3 Codex thread 3).
    expect(badge.textContent).toMatch(/NORAD 1/);
    expect(badge.getAttribute("aria-label")).toMatch(/Orbit track limit reached/);

    act(() => {
      badge.click();
    });
    expect(screen.queryByText(/Orbit limit/)).toBeNull();
    expect(useMapStore.getState().satelliteTrackEviction).toBeNull();

    // Clean up the module-level store for later tests in this file.
    act(() => {
      useMapStore.getState().clearAllSatelliteTracks();
    });
  });

  it("renders the evicted track's own recorded name instead of an ambiguous POPULAR_SATS lookup (#994 PR B round 3 Codex thread 3)", () => {
    render(<MapStatusChip />);

    act(() => {
      // 57166 is deliberately ambiguous in POPULAR_SATS (maps to both
      // "IO-117" and "METEOR-M2 3") -- the badge must show the name that
      // was recorded when the track was added, not a name re-derived from
      // the NORAD id at display time.
      useMapStore.getState().setSatelliteTrack(57166, { name: "IO-117" });
      useMapStore.getState().setSatelliteTrack(2, {});
      useMapStore.getState().setSatelliteTrack(3, {});
      useMapStore.getState().setSatelliteTrack(4, {});
      useMapStore.getState().setSatelliteTrack(5, {});
      useMapStore.getState().setSatelliteTrack(6, {});
    });

    const badge = screen.getByText(/Orbit limit/);
    expect(badge.textContent).toMatch(/IO-117/);
    expect(badge.textContent).not.toMatch(/METEOR-M2 3/);

    act(() => {
      useMapStore.getState().clearAllSatelliteTracks();
    });
  });

  it("auto-dismisses the eviction notice after 8 seconds (#994 PR B round 2 item 7)", () => {
    vi.useFakeTimers();
    render(<MapStatusChip />);

    act(() => {
      for (const id of [1, 2, 3, 4, 5, 6]) {
        useMapStore.getState().setSatelliteTrack(id, {});
      }
    });
    expect(screen.getByText(/Orbit limit/)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText(/Orbit limit/)).toBeNull();
    expect(useMapStore.getState().satelliteTrackEviction).toBeNull();

    act(() => {
      useMapStore.getState().clearAllSatelliteTracks();
    });
  });

  it("resets the 8s auto-dismiss window when a second eviction preempts the first (#994 PR B round 2 item 7)", () => {
    vi.useFakeTimers();
    render(<MapStatusChip />);

    act(() => {
      for (const id of [1, 2, 3, 4, 5, 6]) {
        useMapStore.getState().setSatelliteTrack(id, {});
      }
    });
    expect(screen.getByText(/Orbit limit/)).toBeTruthy();

    // t = 5s since the first eviction -- still well within its own window.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText(/Orbit limit/)).toBeTruthy();

    // A second eviction (a 7th tracked satellite) preempts the first and
    // restarts the dismiss window.
    act(() => {
      useMapStore.getState().setSatelliteTrack(7, {});
    });
    expect(screen.getByText(/Orbit limit/)).toBeTruthy();

    // t = 9s since the first eviction (4s since the second) -- the first
    // eviction's original timer would have fired by now; the notice must
    // still be visible because the second eviction reset the window.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText(/Orbit limit/)).toBeTruthy();

    // t = 13s since the first eviction (8s since the second) -- the reset
    // window has now elapsed.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText(/Orbit limit/)).toBeNull();

    act(() => {
      useMapStore.getState().clearAllSatelliteTracks();
    });
  });

  it("dismisses on mount when the eviction timestamp is already stale (#994 PR B round 3 Codex thread 3)", () => {
    vi.useFakeTimers();
    const now = Date.now();
    // Simulates navigating away and returning after the 8s window has
    // already elapsed elsewhere -- a fresh 8s window on mount would show
    // this as a brand-new notice instead of dismissing it right away.
    useMapStore.setState({
      satelliteTrackEviction: { noradId: "1", timestamp: now - 10_000 },
    });

    render(<MapStatusChip />);

    expect(screen.queryByText(/Orbit limit/)).toBeNull();
    expect(useMapStore.getState().satelliteTrackEviction).toBeNull();
  });

  it("schedules only the remaining window when the eviction timestamp is partially elapsed (#994 PR B round 3 Codex thread 3)", () => {
    vi.useFakeTimers();
    const now = Date.now();
    // 5s of the 8s window already elapsed before mount -- only 3s should
    // remain, not a fresh 8s.
    useMapStore.setState({
      satelliteTrackEviction: { noradId: "1", timestamp: now - 5_000 },
    });

    render(<MapStatusChip />);
    expect(screen.getByText(/Orbit limit/)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByText(/Orbit limit/)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText(/Orbit limit/)).toBeNull();
    expect(useMapStore.getState().satelliteTrackEviction).toBeNull();
  });
});
