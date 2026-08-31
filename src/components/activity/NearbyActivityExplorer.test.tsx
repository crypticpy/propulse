import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityExplorerStore } from "@/stores/activityExplorerStore";
import type { LiveSpot } from "@/types/livespot";
import { NearbyActivityExplorer } from "./NearbyActivityExplorer";

const SPOT: LiveSpot = {
  id: "spot-1",
  spotter: "W1AW",
  receiverCallsign: "W1AW",
  dx: "K5ABC",
  frequency: 7200,
  mode: "SSB",
  comment: "",
  time: new Date(),
  band: "40m",
  dxLat: 31,
  dxLon: -98,
  source: "Cluster",
};

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: () => ({
    id: "home",
    name: "Home",
    grid: "EM10",
    lat: 30.5,
    lon: -97,
    type: "home",
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
}));

vi.mock("@/hooks/useLiveSpots", () => ({
  useLiveSpots: () => ({
    spots: [SPOT],
    isLoading: false,
    isError: false,
    spotsBySource: {},
    refetch: vi.fn(),
  }),
}));

describe("NearbyActivityExplorer", () => {
  beforeEach(() => {
    useActivityExplorerStore.setState({
      mode: "band",
      band: "40m",
      frequencyInput: "7.200",
      toleranceKHz: 1,
      maxAgeMinutes: 15,
      maxDistanceKm: 5000,
    });
  });

  it("shows recent callsigns and expands their reporting evidence", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <NearbyActivityExplorer onClose={onClose} />
      </MemoryRouter>,
    );

    expect(screen.getByText("K5ABC")).toBeTruthy();
    expect(screen.getByText(/recent reception and cluster reports/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /K5ABC/i }));
    expect(screen.getByText(/heard \/ reported by/i)).toBeTruthy();
    expect(screen.getByText("W1AW")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /close nearby activity/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("switches to exact-frequency mode and accepts future SDR input", () => {
    const { followTunedFrequency } = useActivityExplorerStore.getState();
    followTunedFrequency(14_074_000);

    render(
      <MemoryRouter>
        <NearbyActivityExplorer />
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue("14.074")).toBeTruthy();
    expect(useActivityExplorerStore.getState().mode).toBe("frequency");

    fireEvent.change(screen.getByPlaceholderText("7.200 MHz"), {
      target: { value: "not a frequency" },
    });
    expect(screen.getByText(/enter a frequency such as/i)).toBeTruthy();
  });
});
