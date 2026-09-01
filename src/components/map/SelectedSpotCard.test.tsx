import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import { SelectedSpotCard } from "./SelectedSpotCard";

const { selectMapSpot } = vi.hoisted(() => ({ selectMapSpot: vi.fn() }));

vi.mock("@/hooks/useMapSpotSelection", () => ({
  useMapSpotSelection: () => selectMapSpot,
}));

vi.mock("./LiveSpotArcs", () => ({
  formatSpotAge: () => "2:15",
  getSpotAgeInfo: () => ({ ageCategory: "recent" }),
  getAgeBadgeColors: () => ({
    bg: "bg-cyan-500/20",
    text: "text-cyan-400",
    border: "border-cyan-500/30",
  }),
}));

vi.mock("./LocationMarker", () => ({
  DIFFICULTY_COLORS: {
    1: "#00FF88",
    2: "#7ACC7A",
    3: "#FFD23F",
    4: "#FF8C42",
    5: "#FF4444",
  },
  DIFFICULTY_LABELS: {
    1: "Easy",
    2: "Moderate",
    3: "Challenging",
    4: "Difficult",
    5: "Extreme",
  },
}));

const spot: LiveSpot = {
  id: "spot-1",
  spotter: "W1AW",
  spotterGrid: "FN31",
  dx: "PY2ABC",
  dxGrid: "GG66",
  frequency: 14074,
  mode: "FT8",
  comment: "CQ POTA",
  time: new Date("2026-08-31T12:00:00Z"),
  band: "20m",
  dxLat: -23.5,
  dxLon: -46.6,
  source: "PSKReporter",
  snr: -8,
};

describe("SelectedSpotCard", () => {
  it("renders a persistent propagation summary and owns its actions", async () => {
    const user = userEvent.setup();
    const onViewPath = vi.fn();
    const onOperator = vi.fn();
    const onClose = vi.fn();
    const onMapClick = vi.fn();

    render(
      <div onClick={onMapClick}>
        <SelectedSpotCard
          spot={spot}
          position={{ x: 400, y: 300 }}
          difficulty={2}
          optimalSignal={{
            band: "20m",
            status: "good",
            sUnit: { value: 7, text: "S7", dBm: -85 },
          }}
          onViewPath={onViewPath}
          onOperator={onOperator}
          onClose={onClose}
        />
      </div>,
    );

    expect(
      screen.getByRole("dialog", { name: "Spot details for PY2ABC" }),
    ).toBeTruthy();
    expect(screen.getByText("14.074 MHz")).toBeTruthy();
    expect(screen.getByText("GG66")).toBeTruthy();
    expect(screen.getByText("2:15")).toBeTruthy();
    expect(screen.getByText("Moderate")).toBeTruthy();
    expect(screen.getByText("S7")).toBeTruthy();
    expect(screen.getByText("-8 dB")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "View path" }));
    await user.click(screen.getByRole("button", { name: "Operator" }));
    await user.click(
      screen.getByRole("button", { name: "Close spot details" }),
    );

    expect(onViewPath).toHaveBeenCalledOnce();
    expect(onOperator).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onMapClick).not.toHaveBeenCalled();
  });

  it("shows an explicit unavailable reason and renders nothing without a spot", () => {
    const callbacks = {
      onViewPath: vi.fn(),
      onOperator: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(
      <SelectedSpotCard
        spot={spot}
        position={{ x: 10, y: 10 }}
        optimalSignal={null}
        signalUnavailableReason="Home grid is required"
        {...callbacks}
      />,
    );

    expect(screen.getByText("Home grid is required")).toBeTruthy();

    rerender(
      <SelectedSpotCard
        spot={null}
        position={{ x: 10, y: 10 }}
        {...callbacks}
      />,
    );

    expect(
      screen.queryByRole("dialog", { name: /Spot details/ }),
    ).toBeNull();
  });
});
