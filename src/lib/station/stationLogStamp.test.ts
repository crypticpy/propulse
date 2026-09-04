import { describe, expect, it } from "vitest";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type { StationPreset, UserAntenna } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import type { UserStation } from "@/types/user";
import {
  formatStationLine,
  resolveOperatingChain,
  resolveStationLogStamp,
  type StationStampSource,
} from "./stationLogStamp";

const equipment: RadioEquipment = {
  id: "ic-7300",
  manufacturer: "Icom",
  model: "IC-7300",
  receiver: {
    rmdr: 90,
    imdr3: 85,
    blockingGain: 120,
    sensitivity: 0.2,
  },
  maxPower: 100,
  minPower: 5,
  modes: ["CW", "SSB", "FT8"],
  bands: ["40m", "20m"],
  tier: "midrange",
};

const userRadio: UserRadio = {
  id: "owned-radio",
  equipmentId: equipment.id,
  nickname: "Desk 7300",
  customPowerLimit: 80,
  addedAt: "2026-01-01T00:00:00Z",
};

const antenna: UserAntenna = {
  id: "hex",
  name: "Hex Beam",
  antennaType: "hex_beam",
  gainPatternType: "hex_beam",
  bands: ["20m", "15m", "10m"],
  heightMeters: 12,
  polarization: "horizontal",
  mounting: "tower",
  addedAt: "2026-01-01T00:00:00Z",
};

const station: UserStation = {
  callsign: "k1abc",
  homeLocationId: "home",
  activeLocationId: "home",
  savedLocations: [],
  grid: "FN42",
  lat: 42.3,
  lon: -71.1,
};

function emptyShack(overrides: Partial<StationStampSource> = {}): StationStampSource {
  return {
    radios: [],
    customRadios: [],
    activeRadioId: null,
    antennas: [],
    feedlines: [],
    accessories: [],
    inlineComponents: [],
    stationPresets: [],
    activePresetId: null,
    stationChains: [],
    activeChainId: null,
    ...overrides,
  };
}

describe("stationLogStamp", () => {
  it("formats a compact gear line for the logger and Ham Shack", () => {
    expect(
      formatStationLine({
        radioLabel: "Desk 7300",
        antennaLabel: "Hex Beam",
        heightMeters: 12.4,
        powerWatts: 80,
      }),
    ).toBe("Desk 7300 · Hex Beam @ 12 m · 80 W");
  });

  it("prefers the active chain over a leftover radio", () => {
    const chain: StationChain = {
      id: "chain-1",
      name: "HF",
      nodes: [
        { type: "radio", radioId: "owned-radio" },
        { type: "antenna", antennaId: "hex" },
      ],
      feedlineRuns: [],
      operatingPowerWatts: 100,
      shackAccessoryIds: [],
      createdAt: "2026-01-01T00:00:00Z",
    };
    const shack = emptyShack({
      radios: [userRadio],
      customRadios: [equipment],
      activeRadioId: "owned-radio",
      antennas: [antenna],
      stationChains: [chain],
      activeChainId: "chain-1",
    });

    expect(resolveOperatingChain(shack)?.id).toBe("chain-1");
    expect(resolveStationLogStamp(shack, station)).toEqual({
      stationCallsign: "K1ABC",
      myGrid: "FN42",
      myRig: "Desk 7300",
      myAntenna: "Hex Beam",
      txPower: 100,
      stationLine: "Desk 7300 · Hex Beam @ 12 m · 100 W",
      chainId: "chain-1",
      radioId: "owned-radio",
      antennaId: "hex",
    });
  });

  it("falls back to an active preset when no chain is selected", () => {
    const preset: StationPreset = {
      id: "preset-1",
      name: "Home HF",
      radioId: "owned-radio",
      antennaId: "hex",
      accessoryIds: [],
      operatingPowerWatts: 50,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const stamp = resolveStationLogStamp(
      emptyShack({
        radios: [userRadio],
        customRadios: [equipment],
        antennas: [antenna],
        stationPresets: [preset],
        activePresetId: "preset-1",
      }),
      station,
    );
    expect(stamp.txPower).toBe(50);
    expect(stamp.myAntenna).toBe("Hex Beam");
  });

  it("lets a QSO power override win over the chain", () => {
    const chain: StationChain = {
      id: "chain-1",
      name: "HF",
      nodes: [{ type: "radio", radioId: "owned-radio" }],
      feedlineRuns: [],
      operatingPowerWatts: 100,
      shackAccessoryIds: [],
      createdAt: "2026-01-01T00:00:00Z",
    };
    const stamp = resolveStationLogStamp(
      emptyShack({
        radios: [userRadio],
        customRadios: [equipment],
        stationChains: [chain],
        activeChainId: "chain-1",
      }),
      station,
      { powerOverride: 5 },
    );
    expect(stamp.txPower).toBe(5);
    expect(stamp.stationLine).toContain("5 W");
  });

  it("stamps the chain-linked operating location grid", () => {
    const chain: StationChain = {
      id: "chain-1",
      name: "POTA",
      nodes: [{ type: "radio", radioId: "owned-radio" }],
      feedlineRuns: [],
      operatingPowerWatts: 50,
      linkedLocationId: "park",
      shackAccessoryIds: [],
      createdAt: "2026-01-01T00:00:00Z",
    };
    const stamp = resolveStationLogStamp(
      emptyShack({
        radios: [userRadio],
        customRadios: [equipment],
        stationChains: [chain],
        activeChainId: "chain-1",
      }),
      {
        ...station,
        savedLocations: [
          {
            id: "home",
            name: "Home",
            grid: "FN42",
            lat: 42.3,
            lon: -71.1,
            type: "home",
            createdAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "park",
            name: "POTA K-1234",
            grid: "FN32",
            lat: 41.8,
            lon: -72.2,
            type: "pota",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
    );
    expect(stamp.myGrid).toBe("FN32");
  });
});
