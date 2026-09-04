import { describe, expect, it } from "vitest";
import { computeStationChainPerformance } from "./stationChainEngine";
import {
  buildPublicEquipmentSummary,
  buildQsoStationStamp,
  resolveChainKit,
} from "./stationIdentity";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type { UserAntenna, UserFeedline } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import type { StationInventory } from "./stationChainEngine";

const equipment: RadioEquipment = {
  id: "radio-model",
  manufacturer: "Icom",
  model: "IC-7300",
  displayName: "IC-7300",
  receiver: {
    rmdr: 90,
    imdr3: 85,
    blockingGain: 120,
    sensitivity: 0.2,
    noiseFloorDbm: -135,
  },
  maxPower: 100,
  minPower: 1,
  modes: ["SSB", "CW", "FT8"],
  bands: ["40m", "20m", "10m"],
  tier: "midrange",
};

const userRadio: UserRadio = {
  id: "radio-1",
  equipmentId: "radio-model",
  addedAt: "2026-01-01T00:00:00.000Z",
};

const antenna: UserAntenna = {
  id: "ant-1",
  name: "EFHW",
  antennaType: "efhw",
  gainPatternType: "dipole",
  bands: ["40m", "20m", "10m"],
  heightMeters: 10,
  polarization: "horizontal",
  mounting: "mast",
  addedAt: "2026-01-01T00:00:00.000Z",
};

const chain: StationChain = {
  id: "chain-home",
  name: "Home",
  nodes: [
    { type: "radio", radioId: "radio-1" },
    { type: "feedline_run", feedlineRunId: "run-1" },
    { type: "antenna", antennaId: "ant-1" },
  ],
  feedlineRuns: [{ id: "run-1", feedlineId: "feed-1", inlineComponentIds: [] }],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

function feedline(type: UserFeedline["feedlineType"]): UserFeedline {
  return {
    id: "feed-1",
    name: type === "rg58" ? "RG-58 run" : "LMR-400 run",
    feedlineType: type,
    lengthFeet: 100,
    connectorType: "pl259",
    connectorCount: 2,
    condition: "good",
    addedAt: "2026-01-01T00:00:00.000Z",
  };
}

function inventoryFor(type: UserFeedline["feedlineType"]): StationInventory {
  return {
    radios: [{ userRadio, equipment }],
    antennas: [antenna],
    feedlines: [feedline(type)],
    accessories: [],
    inlineComponents: [],
  };
}

describe("station success bar", () => {
  it("raises 10m ERP when the active chain swaps RG-58 for LMR-400", () => {
    const lossy = computeStationChainPerformance(chain, inventoryFor("rg58"), {
      bands: ["10m"],
    });
    const upgraded = computeStationChainPerformance(
      chain,
      inventoryFor("lmr400"),
      { bands: ["10m"] },
    );
    const lossy10 = lossy.bands.find((band) => band.band === "10m");
    const upgraded10 = upgraded.bands.find((band) => band.band === "10m");
    expect(lossy10).toBeDefined();
    expect(upgraded10).toBeDefined();
    expect(upgraded10!.erpWatts).toBeGreaterThan(lossy10!.erpWatts);
  });

  it("stamps chain FKs and ADIF labels from the live kit", () => {
    const kit = resolveChainKit(chain, inventoryFor("rg58"));
    const stamp = buildQsoStationStamp(kit, "EM48");
    expect(stamp).toMatchObject({
      chainId: "chain-home",
      radioId: "radio-1",
      antennaId: "ant-1",
      txPower: 100,
      myRig: "IC-7300",
      myAntenna: "EFHW",
      myGrid: "EM48",
    });
  });

  it("publishes a visitor station line plus 20m/40m ERP", () => {
    const inventory = inventoryFor("lmr400");
    const kit = resolveChainKit(chain, inventory);
    const perf = computeStationChainPerformance(chain, inventory, {
      bands: ["20m", "40m"],
    });
    const summary = buildPublicEquipmentSummary(kit, perf.bands);
    expect(summary.stationLine).toContain("IC-7300");
    expect(summary.stationLine).toContain("EFHW");
    expect(summary.erp20m).toBeGreaterThan(0);
    expect(summary.erp40m).toBeGreaterThan(0);
  });
});
