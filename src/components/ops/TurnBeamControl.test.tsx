import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKioskStore } from "@/stores/kioskStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useRigStore } from "@/stores/rigStore";
import { useShackStore } from "@/stores/shackStore";
import type { RotatorAccessory } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import { TurnBeamControl } from "./TurnBeamControl";

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

function makeAvailable(): void {
  useOpsPostureStore.getState().reset();
  useOpsPostureStore.setState({ posture: "contact" });
  useKioskStore.setState({ active: false });
  useShackStore.setState({
    accessories: [ROTATOR],
    stationChains: [CHAIN],
    activeChainId: "chain-1",
  });
  useRigStore.setState({
    bridgeCapabilities: ["rig", "rotor"],
    rotorStatus: { connected: true, azimuth: 90, elevation: 0 },
    pendingRotorHeading: null,
    ptt: false,
  });
}

describe("TurnBeamControl", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    useOpsPostureStore.getState().reset();
    useKioskStore.setState({ active: false });
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

  it("renders nothing when the Turn beam gate is closed", () => {
    const { container } = render(<TurnBeamControl bearing={247} />);
    expect(container.querySelector("[data-contact-turn-beam]")).toBeNull();
  });

  it("arms on first click without commanding, then confirms on the second", () => {
    vi.useFakeTimers();
    makeAvailable();

    render(<TurnBeamControl bearing={247.4} />);
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(button.getAttribute("data-armed")).toBe("true");
    expect(button.textContent).toContain("Turn to 247°?");
    expect(useRigStore.getState().pendingRotorHeading).toBeNull();

    fireEvent.click(button);
    expect(useRigStore.getState().pendingRotorHeading).toEqual({
      azimuth: 247.4,
    });
    expect(button.getAttribute("data-armed")).toBeNull();
  });

  it("auto-disarms after the confirm window elapses", () => {
    vi.useFakeTimers();
    makeAvailable();

    render(<TurnBeamControl bearing={247} />);
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(button.getAttribute("data-armed")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(button.getAttribute("data-armed")).toBeNull();

    fireEvent.click(button);
    expect(useRigStore.getState().pendingRotorHeading).toBeNull();
    expect(button.getAttribute("data-armed")).toBe("true");
  });

  it("disarms on Escape", async () => {
    const user = userEvent.setup();
    makeAvailable();

    render(<TurnBeamControl bearing={247} />);
    const button = screen.getByRole("button");

    await user.click(button);
    expect(button.getAttribute("data-armed")).toBe("true");

    button.focus();
    await user.keyboard("{Escape}");
    expect(button.getAttribute("data-armed")).toBeNull();
  });

  it("is disabled while PTT is keyed", () => {
    makeAvailable();
    useRigStore.setState({ ptt: true });

    render(<TurnBeamControl bearing={247} />);
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
