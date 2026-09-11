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
    // NORAD 1 isn't in POPULAR_SATS, so the name lookup falls back to
    // "NORAD <id>" (#994 PR B round 2 item 4).
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
});
