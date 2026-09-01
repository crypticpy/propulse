import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapStatusChip } from "./MapStatusChip";

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
});
