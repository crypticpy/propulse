import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapStatusChip } from "./MapStatusChip";

vi.mock("@/components/location/QuickLocationControl", () => ({
  QuickLocationControl: ({ variant }: { variant?: string }) => (
    <span data-testid="location-control">{variant ?? "grid"}</span>
  ),
}));

vi.mock("@/components/ui/HealthStatusIndicator", () => ({
  HealthStatusIndicator: () => <span data-testid="health-status" />,
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

describe("MapStatusChip compact rendering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:34:56Z"));
  });

  it("keeps UTC, location, and health controls while removing secondary text", () => {
    render(<MapStatusChip compact />);

    expect(screen.getByText("12:34")).toBeTruthy();
    expect(screen.queryByText("UTC")).toBeNull();
    expect(screen.getByTestId("location-control").textContent).toBe("icon");
    expect(screen.getByTestId("health-status")).toBeTruthy();
    expect(screen.getByTestId("sync-status")).toBeTruthy();
    expect(screen.getByTestId("conflict-status")).toBeTruthy();
    expect(screen.getByTestId("connectivity-status")).toBeTruthy();
  });

  it("continues updating the compact minute clock", () => {
    render(<MapStatusChip compact />);
    expect(screen.getByText("12:34")).toBeTruthy();

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByText("12:35")).toBeTruthy();
  });
});
