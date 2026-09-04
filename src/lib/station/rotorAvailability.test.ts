import { describe, expect, it } from "vitest";
import type { RotorStatusPayload } from "@/types/bridge";
import type { RotatorAccessory, UserAccessory } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import { canTurnBeam, resolveActiveRotator } from "./rotorAvailability";
import type { StationStampSource } from "./stationLogStamp";

const ROTATOR: RotatorAccessory = {
  id: "rot-1",
  name: "Yaesu G-1000DXA",
  category: "rotator",
  rotatorType: "azimuth",
  addedAt: "2026-01-01T00:00:00.000Z",
};

const AMPLIFIER: UserAccessory = {
  id: "amp-1",
  name: "AL-80B",
  category: "amplifier",
  maxPowerWatts: 800,
  gainDb: 12,
  addedAt: "2026-01-01T00:00:00.000Z",
};

function chain(overrides: Partial<StationChain> = {}): StationChain {
  return {
    id: "chain-1",
    name: "Main",
    nodes: [{ type: "radio", radioId: "radio-1" }],
    feedlineRuns: [],
    operatingPowerWatts: 100,
    shackAccessoryIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function shack(overrides: Partial<StationStampSource> = {}): StationStampSource {
  return {
    radios: [],
    customRadios: [],
    activeRadioId: null,
    antennas: [],
    feedlines: [],
    accessories: [ROTATOR, AMPLIFIER],
    inlineComponents: [],
    stationPresets: [],
    activePresetId: null,
    stationChains: [],
    activeChainId: null,
    ...overrides,
  };
}

function status(
  overrides: Partial<RotorStatusPayload> = {},
): RotorStatusPayload {
  return { connected: true, azimuth: 247, elevation: 0, ...overrides };
}

describe("resolveActiveRotator", () => {
  it("returns null when no chain is active", () => {
    expect(resolveActiveRotator(shack())).toBeNull();
  });

  it("returns null when the active chain references no rotator", () => {
    expect(
      resolveActiveRotator(
        shack({
          stationChains: [chain({ shackAccessoryIds: ["amp-1"] })],
          activeChainId: "chain-1",
        }),
      ),
    ).toBeNull();
  });

  it("never falls back to a rotator that is only in inventory", () => {
    expect(
      resolveActiveRotator(
        shack({ stationChains: [chain()], activeChainId: "chain-1" }),
      ),
    ).toBeNull();
  });

  it("resolves a rotator listed as a shack accessory of the chain", () => {
    expect(
      resolveActiveRotator(
        shack({
          stationChains: [chain({ shackAccessoryIds: ["rot-1"] })],
          activeChainId: "chain-1",
        }),
      ),
    ).toBe(ROTATOR);
  });

  it("resolves a rotator wired in as a chain accessory node", () => {
    expect(
      resolveActiveRotator(
        shack({
          stationChains: [
            chain({
              nodes: [
                { type: "radio", radioId: "radio-1" },
                { type: "accessory", accessoryId: "rot-1" },
              ],
            }),
          ],
          activeChainId: "chain-1",
        }),
      ),
    ).toBe(ROTATOR);
  });

  it("never resolves an elevation-only rotator", () => {
    const elevationOnly: RotatorAccessory = {
      ...ROTATOR,
      id: "rot-el",
      rotatorType: "elevation",
    };
    expect(
      resolveActiveRotator(
        shack({
          accessories: [elevationOnly, AMPLIFIER],
          stationChains: [chain({ shackAccessoryIds: ["rot-el"] })],
          activeChainId: "chain-1",
        }),
      ),
    ).toBeNull();
  });

  it("resolves an az_el rotator", () => {
    const azEl: RotatorAccessory = {
      ...ROTATOR,
      id: "rot-azel",
      rotatorType: "az_el",
    };
    expect(
      resolveActiveRotator(
        shack({
          accessories: [azEl, AMPLIFIER],
          stationChains: [chain({ shackAccessoryIds: ["rot-azel"] })],
          activeChainId: "chain-1",
        }),
      ),
    ).toBe(azEl);
  });
});

describe("canTurnBeam", () => {
  const base = {
    rotator: ROTATOR,
    bridgeCapabilities: ["rig", "rotor"],
    rotorStatus: status(),
    kioskActive: false,
    posture: "contact" as const,
  };

  it("allows the control in Contact and Desk", () => {
    expect(canTurnBeam(base)).toBe(true);
    expect(canTurnBeam({ ...base, posture: "desk" })).toBe(true);
  });

  it("hides the control in Observe", () => {
    expect(canTurnBeam({ ...base, posture: "observe" })).toBe(false);
  });

  it("hides the control in kiosk", () => {
    expect(canTurnBeam({ ...base, kioskActive: true })).toBe(false);
  });

  it("hides the control without a chained rotator", () => {
    expect(canTurnBeam({ ...base, rotator: null })).toBe(false);
  });

  it("hides the control when the bridge lacks the rotor capability", () => {
    expect(canTurnBeam({ ...base, bridgeCapabilities: ["rig"] })).toBe(false);
  });

  it("hides the control when rotctld is not connected", () => {
    expect(canTurnBeam({ ...base, rotorStatus: null })).toBe(false);
    expect(
      canTurnBeam({ ...base, rotorStatus: status({ connected: false }) }),
    ).toBe(false);
  });
});
