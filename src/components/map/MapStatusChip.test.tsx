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
    expect(screen.queryByText(/Orbit track limit reached/)).toBeNull();

    act(() => {
      useMapStore.getState().setSatelliteTrack(1, {});
      useMapStore.getState().setSatelliteTrack(2, {});
      useMapStore.getState().setSatelliteTrack(3, {});
      useMapStore.getState().setSatelliteTrack(4, {});
      useMapStore.getState().setSatelliteTrack(5, {});
      useMapStore.getState().setSatelliteTrack(6, {});
    });

    const badge = screen.getByText(/Orbit track limit reached/);
    expect(badge.textContent).toMatch(/NORAD 1/);

    act(() => {
      badge.click();
    });
    expect(screen.queryByText(/Orbit track limit reached/)).toBeNull();
    expect(useMapStore.getState().satelliteTrackEviction).toBeNull();

    // Clean up the module-level store for later tests in this file.
    act(() => {
      useMapStore.getState().clearAllSatelliteTracks();
    });
  });
});
