import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import { presentActivationSpot } from "@/lib/map/spotPresentation";
import { useMapOperationalStore } from "@/stores/mapOperationalStore";
import { useMapStore } from "@/stores/mapStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useQSOStore } from "@/stores/qsoStore";
import { SelectedSpotCard } from "./SelectedSpotCard";

const { selectMapSpot, navigate } = vi.hoisted(() => ({
  selectMapSpot: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/hooks/useMapSpotSelection", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/hooks/useMapSpotSelection")>();
  return {
    ...actual,
    useMapSpotSelection: () => selectMapSpot,
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

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
  beforeEach(() => {
    selectMapSpot.mockReset();
    selectMapSpot.mockReturnValue({
      spot,
      target: { lat: spot.dxLat, lon: spot.dxLon },
      locationSource: "coordinates",
    });
    navigate.mockReset();
    useMapOperationalStore.setState({
      manualScope: null,
      workspaceOpen: false,
      selectedReport: null,
    });
    useOpsPostureStore.getState().reset();
    useMapStore.setState({
      target: null,
      isDXConsoleExpanded: false,
      isolateTargetPath: false,
      pathMode: "short",
    });
    useQSOStore.setState((state) => ({
      form: {
        ...state.form,
        callsign: "",
        frequency: 0,
        mode: "SSB",
      },
    }));
  });

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
    expect(useMapStore.getState().isolateTargetPath).toBe(true);
    expect(useMapStore.getState().pathMode).toBe("both");
  });

  it("does not isolate or notify onViewPath when the spot can't be resolved to a target", async () => {
    selectMapSpot.mockReturnValue(null);
    const user = userEvent.setup();
    const onViewPath = vi.fn();

    render(
      <SelectedSpotCard
        spot={spot}
        position={{ x: 400, y: 300 }}
        onViewPath={onViewPath}
        onOperator={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View path" }));

    expect(onViewPath).not.toHaveBeenCalled();
    expect(useMapStore.getState().isolateTargetPath).toBe(false);
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

  it("prepares the QSO draft only after Work & log is chosen", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <SelectedSpotCard
        spot={spot}
        position={{ x: 10, y: 10 }}
        onOperator={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(useQSOStore.getState().form.callsign).toBe("");
    await user.click(screen.getByRole("button", { name: "Work & log" }));

    expect(useQSOStore.getState().form).toMatchObject({
      callsign: "PY2ABC",
      frequency: 14074,
      mode: "FT8",
    });
    expect(useMapStore.getState().target).toMatchObject({
      lat: -23.5,
      lon: -46.6,
    });
    expect(useMapOperationalStore.getState().workspaceOpen).toBe(true);
    expect(useOpsPostureStore.getState()).toMatchObject({
      posture: "contact",
      contactCallsign: "PY2ABC",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows activation identity and provider metadata without a modal backdrop", () => {
    const activation = presentActivationSpot({
      id: "pota-1",
      program: "POTA",
      callsign: "K5ABC",
      reference: "US-1234",
      referenceName: "Test Park",
      frequencyKHz: 14074,
      mode: "FT8",
      comments: "QRP",
      spotter: "W1AW",
      spottedAt: "2026-08-31T12:00:00Z",
      latitude: 30.25,
      longitude: -97.75,
      grid: "EM10df",
    });

    render(
      <SelectedSpotCard
        spot={activation}
        position={{ x: 10, y: 10 }}
        onOperator={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const card = screen.getByRole("dialog", {
      name: "Spot details for K5ABC",
    });
    expect(card.getAttribute("aria-modal")).toBe("false");
    expect(screen.getAllByText("POTA").length).toBeGreaterThan(0);
    expect(screen.getByText("POTA US-1234")).toBeTruthy();
    expect(screen.getByText("Test Park")).toBeTruthy();
    expect(screen.getByText("Parks on the Air")).toBeTruthy();
  });
});
