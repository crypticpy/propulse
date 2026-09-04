import { beforeEach, describe, expect, it } from "vitest";
import { useKioskStore } from "@/stores/kioskStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useRigStore } from "@/stores/rigStore";
import { useShackStore } from "@/stores/shackStore";
import type { RotatorAccessory } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import { turnBeamToBearing } from "./rotorIntent";

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

describe("turnBeamToBearing", () => {
  beforeEach(() => {
    useKioskStore.setState({ active: false });
    useOpsPostureStore.getState().reset();
    useOpsPostureStore.setState({ posture: "contact" });
    useShackStore.setState({
      accessories: [ROTATOR],
      stationChains: [CHAIN],
      activeChainId: "chain-1",
    });
    useRigStore.setState({
      bridgeCapabilities: ["rig", "rotor"],
      rotorStatus: { connected: true, azimuth: 10, elevation: 0 },
      pendingRotorHeading: null,
    });
  });

  it("stages the short-path azimuth", () => {
    expect(turnBeamToBearing(247.4)).toEqual({ status: "ok", azimuth: 247.4 });
    expect(useRigStore.getState().pendingRotorHeading).toEqual({
      azimuth: 247.4,
    });
  });

  it("adds 180 degrees only when long path is requested", () => {
    expect(turnBeamToBearing(60, { longPath: true })).toEqual({
      status: "ok",
      azimuth: 240,
    });
    expect(useRigStore.getState().pendingRotorHeading).toEqual({
      azimuth: 240,
    });
  });

  it("wraps a long path past north back into 0-360", () => {
    expect(turnBeamToBearing(300, { longPath: true })).toEqual({
      status: "ok",
      azimuth: 120,
    });
  });

  it("is ignored in kiosk", () => {
    useKioskStore.setState({ active: true });
    expect(turnBeamToBearing(247)).toEqual({
      status: "ignored",
      reason: "kiosk",
    });
    expect(useRigStore.getState().pendingRotorHeading).toBeNull();
  });

  it("is ignored when the bridge has no rotor capability", () => {
    useRigStore.setState({ bridgeCapabilities: ["rig"] });
    expect(turnBeamToBearing(247)).toEqual({
      status: "ignored",
      reason: "unavailable",
    });
    expect(useRigStore.getState().pendingRotorHeading).toBeNull();
  });

  it("is ignored when no rotator is in the active chain", () => {
    useShackStore.setState({ activeChainId: null });
    expect(turnBeamToBearing(247)).toEqual({
      status: "ignored",
      reason: "unavailable",
    });
    expect(useRigStore.getState().pendingRotorHeading).toBeNull();
  });

  it("is ignored when rotctld is disconnected", () => {
    useRigStore.setState({
      rotorStatus: { connected: false, azimuth: null, elevation: null },
    });
    expect(turnBeamToBearing(247)).toEqual({
      status: "ignored",
      reason: "unavailable",
    });
  });

  it("is ignored for a non-finite bearing", () => {
    expect(turnBeamToBearing(Number.NaN)).toEqual({
      status: "ignored",
      reason: "invalid-bearing",
    });
  });

  it("preserves the known elevation for an az_el rotator", () => {
    useShackStore.setState({
      accessories: [{ ...ROTATOR, rotatorType: "az_el" }],
    });
    useRigStore.setState({
      rotorStatus: { connected: true, azimuth: 10, elevation: 32 },
    });
    expect(turnBeamToBearing(247.4)).toEqual({ status: "ok", azimuth: 247.4 });
    expect(useRigStore.getState().pendingRotorHeading).toEqual({
      azimuth: 247.4,
      elevation: 32,
    });
  });

  it("does not send elevation for an azimuth-only rotator", () => {
    expect(turnBeamToBearing(247.4)).toEqual({ status: "ok", azimuth: 247.4 });
    expect(useRigStore.getState().pendingRotorHeading).toEqual({
      azimuth: 247.4,
    });
  });

  it("is ignored for an elevation-only rotator (cannot turn azimuth)", () => {
    useShackStore.setState({
      accessories: [{ ...ROTATOR, rotatorType: "elevation" }],
    });
    expect(turnBeamToBearing(247)).toEqual({
      status: "ignored",
      reason: "unavailable",
    });
    expect(useRigStore.getState().pendingRotorHeading).toBeNull();
  });
});
