import { describe, expect, it } from "vitest";
import {
  nearestHamClockPower,
  physicsAntennaGainDbi,
  toPhysicsMode,
} from "./stationPhysics";
import {
  buildPublicEquipmentSummary,
  buildQsoStationStamp,
  chainsWithQsOs,
  countQsOsForEquipment,
  dualEnvelopeCopy,
  formatStationLine,
  isFieldActivationSig,
  parsePublicEquipmentSummary,
  pickChainForActivation,
  resolveChainKit,
} from "./stationIdentity";
import { openingTiedChallenge, suggestFeedlineUpgrade } from "./stationUpgrade";
import type { StationInventory } from "./stationChainEngine";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type { UserAntenna, UserFeedline } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import type { BandChainPerformance } from "./stationChainEngine";

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

const feedline: UserFeedline = {
  id: "feed-1",
  name: "RG-58 run",
  feedlineType: "rg58",
  lengthFeet: 80,
  connectorType: "pl259",
  connectorCount: 2,
  condition: "good",
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
  feedlineRuns: [
    { id: "run-1", feedlineId: "feed-1", inlineComponentIds: [] },
  ],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const inventory: StationInventory = {
  radios: [{ userRadio, equipment }],
  antennas: [antenna],
  feedlines: [feedline],
  accessories: [],
  inlineComponents: [],
};

const band: BandChainPerformance = {
  band: "10m",
  freqMHz: 28.4,
  requestedPowerWatts: 100,
  txPowerWatts: 100,
  nodes: [],
  totalSystemGainDb: -3.4,
  totalPassiveLossDb: 3.4,
  totalAmplifierGainDb: 0,
  feedlineLossDb: 3.4,
  inlineLossDb: 0,
  accessoryGainDb: 0,
  antennaGainDbi: 2.15,
  powerAtAntennaWatts: 45,
  eirpWatts: 70,
  erpWatts: 42,
  supported: true,
  warnings: [],
};

describe("stationPhysics", () => {
  it("maps live modes onto the physics trio", () => {
    expect(toPhysicsMode("USB")).toBe("SSB");
    expect(toPhysicsMode("CW-R")).toBe("CW");
    expect(toPhysicsMode("FT4")).toBe("FT8");
  });

  it("folds system loss into path gain", () => {
    expect(physicsAntennaGainDbi(6, 2.5)).toBe(3.5);
  });

  it("snaps chain power onto HamClock steps", () => {
    expect(nearestHamClockPower(90)).toBe(100);
    expect(nearestHamClockPower(8)).toBe(5);
  });
});

describe("stationIdentity", () => {
  it("resolves kit labels from the active chain", () => {
    const kit = resolveChainKit(chain, inventory);
    expect(kit?.radioLabel).toBe("IC-7300");
    expect(kit?.antennaLabel).toBe("EFHW");
    expect(formatStationLine({
      radioLabel: kit?.radioLabel,
      antennaLabel: kit?.antennaLabel,
      heightMeters: kit?.antennaHeightMeters,
      powerWatts: kit?.powerWatts,
    })).toBe("IC-7300 · EFHW @ 10 m · 100 W");
  });

  it("stamps QSOs with chain FKs and ADIF labels", () => {
    const stamp = buildQsoStationStamp(
      resolveChainKit(chain, inventory),
      "EM48",
    );
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

  it("round-trips a public equipment summary", () => {
    const summary = buildPublicEquipmentSummary(
      resolveChainKit(chain, inventory),
      [{ ...band, band: "20m", erpWatts: 55 }],
    );
    expect(parsePublicEquipmentSummary(summary)?.erp20m).toBe(55);
    expect(summary.stationLine).toContain("IC-7300");
  });

  it("counts only chains that have logged QSOs", () => {
    expect(
      chainsWithQsOs(
        [{ chainId: "chain-home" }, { chainId: "chain-home" }],
        ["chain-home", "chain-pota"],
      ),
    ).toBe(1);
    expect(
      countQsOsForEquipment([{ radioId: "radio-1" }, { radioId: "other" }], {
        radioId: "radio-1",
      }),
    ).toBe(1);
  });

  it("picks a field-kit chain for POTA stamps", () => {
    const pota: StationChain = { ...chain, id: "chain-pota", name: "POTA pack" };
    expect(pickChainForActivation([chain, pota], "chain-home", "POTA")).toBe(
      "chain-pota",
    );
    expect(isFieldActivationSig("SOTA")).toBe(true);
  });

  it("formats a dual-envelope overlap line", () => {
    expect(
      dualEnvelopeCopy(37, {
        stationLine: "yagi",
        antennaName: "yagi",
        erp20m: 400,
      }, "20m"),
    ).toContain("your 37 W ERP vs their 400 W yagi");
  });
});

describe("stationUpgrade", () => {
  it("suggests LMR-400 when RG-58 is costing real dB", () => {
    const suggestion = suggestFeedlineUpgrade(chain, inventory, [band]);
    expect(suggestion?.band).toBe("10m");
    expect(suggestion?.savingDb).toBeGreaterThan(0.4);
    expect(openingTiedChallenge(suggestion, true)).toContain("10m is open");
    expect(openingTiedChallenge(suggestion, false)).toBeNull();
  });
});
