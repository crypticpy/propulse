import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HamClockSpotsSidebar } from "./HamClockSpotsSidebar";
import type { ActivationSpotsResponse } from "@/types/activationSpots";

const mocks = vi.hoisted(() => ({
  activationSpots: vi.fn(),
  dxCluster: vi.fn(),
  setTarget: vi.fn(),
  target: null as { lat: number; lon: number; name?: string } | null,
}));

vi.mock("@/components/dx/DXSpotList/DXSpotList", () => ({
  DXSpotList: () => <div>DX list</div>,
}));
vi.mock("@/hooks/useActivationSpots", () => ({
  useActivationSpots: mocks.activationSpots,
}));
vi.mock("@/hooks/useDXCluster", () => ({
  useDXCluster: mocks.dxCluster,
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: unknown) => unknown) =>
    selector({
      target: mocks.target,
      setTarget: mocks.setTarget,
      spotFilters: { bands: [], modes: [] },
      setSpotFilters: vi.fn(),
    }),
}));

vi.mock("./HamClockRecentContacts", () => ({
  HamClockRecentContacts: () => <div>Recent contacts</div>,
}));

const response: ActivationSpotsResponse = {
  fetchedAt: "2026-08-31T14:00:00.000Z",
  spots: [
    {
      id: "pota-1",
      program: "POTA",
      callsign: "K5ABC",
      reference: "US-1234",
      referenceName: "Test Park",
      frequencyKHz: 14074,
      mode: "FT8",
      comments: "CQ from the overlook",
      spotter: "W1AW",
      spottedAt: new Date(Date.now() - 120_000).toISOString(),
      latitude: 30.2,
      longitude: -97.7,
      grid: "EM10AA",
    },
  ],
  sources: [
    {
      program: "POTA",
      status: "ok",
      source: "Parks on the Air",
      sourceUrl: "https://pota.app/",
      count: 1,
    },
    {
      program: "SOTA",
      status: "unavailable",
      source: "ParksnPeaks syndication",
      sourceUrl: "https://www.parksnpeaks.org/",
      count: 0,
    },
    {
      program: "WWFF",
      status: "ok",
      source: "WWFF Spotline",
      sourceUrl: "https://spots.wwff.co/",
      count: 0,
    },
  ],
};

beforeEach(() => {
  mocks.setTarget.mockReset();
  mocks.target = null;
  mocks.dxCluster.mockReturnValue({ allSpots: [{ id: 1 }, { id: 2 }] });
  mocks.activationSpots.mockReturnValue({
    spots: response.spots,
    spotsByProgram: {
      POTA: response.spots,
      SOTA: [],
      WWFF: [],
    },
    sources: response.sources,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe("HamClockSpotsSidebar", () => {
  it("keeps the DX list and exposes activation feed counts as tabs", () => {
    render(<HamClockSpotsSidebar />);

    expect(screen.getByText("DX list")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "DX 2" }).tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: "POTA 1" }).tabIndex).toBe(-1);
  });

  it("supports roving focus and automatic activation with tab keys", () => {
    render(<HamClockSpotsSidebar />);
    const dxTab = screen.getByRole("tab", { name: "DX 2" });
    dxTab.focus();

    fireEvent.keyDown(dxTab, { key: "ArrowRight" });
    const potaTab = screen.getByRole("tab", { name: "POTA 1" });
    expect(document.activeElement).toBe(potaTab);
    expect(potaTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("K5ABC")).toBeTruthy();

    fireEvent.keyDown(potaTab, { key: "End" });
    const wwffTab = screen.getByRole("tab", { name: "WWFF 0" });
    expect(document.activeElement).toBe(wwffTab);
    expect(wwffTab.getAttribute("aria-selected")).toBe("true");
  });

  it("renders a POTA activation and targets coordinate-bearing rows", () => {
    render(<HamClockSpotsSidebar />);
    fireEvent.click(screen.getByRole("tab", { name: "POTA 1" }));

    expect(screen.getByText("K5ABC")).toBeTruthy();
    expect(screen.getByText("US-1234")).toBeTruthy();
    expect(screen.getByText("CQ from the overlook")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Parks on the Air/i }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Target K5ABC at US-1234" }),
    );
    expect(mocks.setTarget).toHaveBeenCalledWith({
      lat: 30.2,
      lon: -97.7,
      grid: "EM10AA",
      name: "K5ABC · US-1234",
    });
  });

  it("distinguishes an unavailable provider from a healthy empty feed", () => {
    render(<HamClockSpotsSidebar />);
    fireEvent.click(screen.getByRole("tab", { name: "SOTA 0" }));
    expect(screen.getByText("SOTA feed unavailable")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "WWFF 0" }));
    expect(screen.getByText("No live WWFF activations")).toBeTruthy();
  });

  it("keeps cached activations visible during a background refetch error", () => {
    mocks.activationSpots.mockReturnValue({
      spots: response.spots,
      spotsByProgram: { POTA: response.spots, SOTA: [], WWFF: [] },
      sources: response.sources,
      isLoading: false,
      error: new Error("background refetch failed"),
      refetch: vi.fn(),
    });

    render(<HamClockSpotsSidebar />);
    fireEvent.click(screen.getByRole("tab", { name: "POTA 1" }));

    expect(screen.getByText("K5ABC")).toBeTruthy();
    expect(screen.queryByText("POTA feed unavailable")).toBeNull();
  });
});
