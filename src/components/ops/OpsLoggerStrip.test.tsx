import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_QSO_FORM } from "@/types/qso";
import type { DXSpot } from "@/types/dxcluster";
import type { RotatorAccessory } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useProfileStore } from "@/stores/profileStore";
import { useQSOStore } from "@/stores/qsoStore";
import { useRigStore } from "@/stores/rigStore";
import { useShackStore } from "@/stores/shackStore";
import { OpsLoggerStrip } from "./OpsLoggerStrip";

const ROTATOR: RotatorAccessory = {
  id: "rot-1",
  name: "Yaesu G-1000DXA",
  category: "rotator",
  rotatorType: "azimuth",
  addedAt: "2026-01-01T00:00:00.000Z",
};

const CHAIN: StationChain = {
  id: "chain-1",
  name: "Main",
  nodes: [{ type: "radio", radioId: "radio-1" }],
  feedlineRuns: [],
  operatingPowerWatts: 100,
  shackAccessoryIds: ["rot-1"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Station + target so the strip has a bearing to turn to. */
function givePath(): void {
  useProfileStore.setState({
    station: {
      callsign: "W1AW",
      homeLocationId: "home",
      activeLocationId: "home",
      savedLocations: [],
      grid: "FN31",
      lat: 41.7,
      lon: -72.7,
    },
  });
  useMapStore.setState({ target: { lat: -23.5, lon: -46.6, name: "PY2ABC" } });
}

function pendingSpot(): DXSpot {
  return {
    id: "spot-2",
    spotter: "W1AW",
    dx: "FO0AAA",
    frequency: 21074,
    mode: "FT8",
    comment: "CQ",
    time: new Date("2026-09-04T12:00:00Z"),
    band: "15m",
  };
}

describe("OpsLoggerStrip", () => {
  beforeEach(() => {
    useOpsPostureStore.getState().reset();
    useOpsPostureStore.setState({ posture: "contact" });
    useQSOStore.setState({
      form: { ...DEFAULT_QSO_FORM, callsign: "K1ABC", frequency: 14074, mode: "FT8" },
    });
    useKioskStore.setState({ active: false });
    useMapStore.setState({ target: null });
    useProfileStore.setState({ station: null });
    useShackStore.setState({
      accessories: [],
      stationChains: [],
      activeChainId: null,
    });
    useRigStore.setState({
      bridgeCapabilities: [],
      rotorStatus: null,
      pendingRotorHeading: null,
      ptt: false,
    });
  });

  it("asks before replacing a dirty draft", async () => {
    const user = userEvent.setup();
    useOpsPostureStore.getState().setPendingReplace(pendingSpot());

    render(
      <MemoryRouter>
        <OpsLoggerStrip />
      </MemoryRouter>,
    );

    expect(screen.getByText("FO0AAA")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(useOpsPostureStore.getState().pendingReplace).toBeNull();
    expect(useQSOStore.getState().form.callsign).toBe("K1ABC");
  });

  it("exposes callsign, frequency, mode, RST, and Log", () => {
    render(
      <MemoryRouter>
        <OpsLoggerStrip />
      </MemoryRouter>,
    );

    expect(screen.getByRole("textbox", { name: "Callsign" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Frequency in kHz" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Mode" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "RST sent" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log" })).toBeTruthy();
  });

  it("hides Turn beam when no rotator or bridge rotor capability exists", () => {
    givePath();

    const { container } = render(
      <MemoryRouter>
        <OpsLoggerStrip />
      </MemoryRouter>,
    );

    expect(container.querySelector("[data-contact-turn-beam]")).toBeNull();
  });

  it("shows Turn beam and commands the short-path bearing when available", async () => {
    const user = userEvent.setup();
    givePath();
    useShackStore.setState({
      accessories: [ROTATOR],
      stationChains: [CHAIN],
      activeChainId: "chain-1",
    });
    useRigStore.setState({
      bridgeCapabilities: ["rig", "rotor"],
      rotorStatus: { connected: true, azimuth: 90, elevation: 0 },
    });

    const { container } = render(
      <MemoryRouter>
        <OpsLoggerStrip />
      </MemoryRouter>,
    );

    const button = container.querySelector("[data-contact-turn-beam]");
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("beam 90°");

    await user.click(button as HTMLElement);
    const staged = useRigStore.getState().pendingRotorHeading;
    expect(staged).not.toBeNull();
    expect(staged?.azimuth).toBeGreaterThan(0);
    expect(staged?.azimuth).toBeLessThan(360);
  });
});
