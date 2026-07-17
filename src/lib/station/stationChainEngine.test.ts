import { describe, expect, it } from "vitest";
import {
  computeStationChainPerformance,
  computeStationPresetPerformance,
  deriveStationFeatureEnvelope,
  stationPresetToChain,
  type StationInventory,
} from "./stationChainEngine";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type {
  StationPreset,
  UserAccessory,
  UserAntenna,
  UserFeedline,
} from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import { SHERWOOD_RECEIVERS } from "@/lib/data/sherwood.generated";

const equipment: RadioEquipment = {
  id: "radio-model",
  manufacturer: "Test",
  model: "HF-100",
  receiver: {
    rmdr: 90,
    imdr3: 85,
    blockingGain: 120,
    sensitivity: 0.2,
    noiseFloorDbm: -135,
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
  customPowerLimit: 75,
  addedAt: "2026-01-01T00:00:00Z",
};

const antenna: UserAntenna = {
  id: "antenna",
  name: "Test Beam",
  antennaType: "yagi_3el",
  gainPatternType: "yagi_3el",
  bands: ["40m", "20m"],
  heightMeters: 15,
  azimuthDeg: 90,
  isRotatable: false,
  polarization: "horizontal",
  mounting: "tower",
  gainDbiOverride: { "20m": 8, "40m": 6 },
  swrByBand: { "20m": 1.2, "40m": 1.4 },
  addedAt: "2026-01-01T00:00:00Z",
};

const feedline: UserFeedline = {
  id: "feedline",
  name: "LMR-400 run",
  feedlineType: "lmr400",
  lengthFeet: 100,
  connectorCount: 2,
  connectorType: "n_type",
  condition: "new",
  addedAt: "2026-01-01T00:00:00Z",
};

const amplifier: UserAccessory = {
  id: "amplifier",
  name: "500 W amplifier",
  category: "amplifier",
  maxPowerWatts: 500,
  gainDb: 20,
  bands: ["20m"],
  addedAt: "2026-01-01T00:00:00Z",
};

const filter: UserAccessory = {
  id: "filter",
  name: "Band-pass filter",
  category: "filter",
  filterType: "bandpass",
  insertionLossDb: 1,
  bands: ["20m"],
  addedAt: "2026-01-01T00:00:00Z",
};

function inventory(accessories: UserAccessory[] = [amplifier, filter]): StationInventory {
  return {
    radios: [{ userRadio, equipment }],
    antennas: [antenna],
    feedlines: [feedline],
    accessories,
    inlineComponents: [
      {
        id: "choke",
        name: "Common-mode choke",
        componentType: "choke",
        chokeType: "common_mode",
        insertionLossDb: 0.25,
        addedAt: "2026-01-01T00:00:00Z",
      },
    ],
  };
}

function chain(overrides: Partial<StationChain> = {}): StationChain {
  return {
    id: "chain",
    name: "Main chain",
    nodes: [
      { type: "radio", radioId: userRadio.id },
      { type: "accessory", accessoryId: amplifier.id },
      { type: "accessory", accessoryId: filter.id },
      { type: "feedline_run", feedlineRunId: "run" },
      { type: "antenna", antennaId: antenna.id },
    ],
    feedlineRuns: [
      {
        id: "run",
        feedlineId: feedline.id,
        inlineComponentIds: ["choke"],
      },
    ],
    operatingPowerWatts: 200,
    shackAccessoryIds: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeStationChainPerformance", () => {
  it("caps radio and amplifier power and keeps EIRP distinct from ERP", () => {
    const result = computeStationChainPerformance(chain(), inventory(), {
      bands: ["20m"],
      targetBearingDeg: 90,
    });
    const band = result.bands[0];

    expect(band.txPowerWatts).toBe(75);
    expect(band.nodes[1].outputPowerWatts).toBe(500);
    expect(band.powerAtAntennaWatts).toBeLessThan(500);
    expect(band.eirpWatts).toBeGreaterThan(band.powerAtAntennaWatts);
    expect(band.erpWatts).toBeCloseTo(
      band.eirpWatts / Math.pow(10, 2.15 / 10),
      8,
    );
    expect(band.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining(["radio_power_capped", "amplifier_output_capped"]),
    );
  });

  it("fails closed when a chain component does not support the band", () => {
    const result = computeStationChainPerformance(chain(), inventory(), {
      bands: ["40m"],
    });
    const band = result.bands[0];

    expect(band.supported).toBe(false);
    expect(band.eirpWatts).toBe(0);
    expect(band.warnings.map((item) => item.code)).toContain(
      "accessory_band_unsupported",
    );
  });

  it("never turns negative passive loss into gain", () => {
    const invalidFilter: UserAccessory = {
      ...filter,
      insertionLossDb: -4,
    };
    const result = computeStationChainPerformance(
      chain({
        nodes: [
          { type: "radio", radioId: userRadio.id },
          { type: "accessory", accessoryId: invalidFilter.id },
          { type: "antenna", antennaId: antenna.id },
        ],
      }),
      inventory([invalidFilter]),
      { bands: ["20m"] },
    );
    const band = result.bands[0];

    expect(band.nodes[1].lossDb).toBe(0);
    expect(band.nodes[1].outputPowerWatts).toBe(band.nodes[1].inputPowerWatts);
    expect(band.warnings.map((item) => item.code)).toContain(
      "negative_passive_loss_rejected",
    );
  });

  it("reduces directional gain away from the recorded antenna azimuth", () => {
    const forward = computeStationChainPerformance(chain(), inventory(), {
      bands: ["20m"],
      targetBearingDeg: 90,
    }).bands[0];
    const offAxis = computeStationChainPerformance(chain(), inventory(), {
      bands: ["20m"],
      targetBearingDeg: 180,
    }).bands[0];

    expect(offAxis.antennaGainDbi).toBeLessThan(forward.antennaGainDbi);
    expect(offAxis.eirpWatts).toBeLessThan(forward.eirpWatts);
  });

  it("does not increase output when additional passive loss is added", () => {
    const losses = [0, 1, 3, 6];
    const outputs = losses.map((insertionLossDb) => {
      const passive: UserAccessory = { ...filter, insertionLossDb };
      return computeStationChainPerformance(
        chain({
          nodes: [
            { type: "radio", radioId: userRadio.id },
            { type: "accessory", accessoryId: passive.id },
            { type: "antenna", antennaId: antenna.id },
          ],
        }),
        inventory([passive]),
        { bands: ["20m"] },
      ).bands[0].eirpWatts;
    });

    expect(outputs).toEqual([...outputs].sort((a, b) => b - a));
  });
});

describe("station presets", () => {
  it("uses the same canonical chain calculation as an equivalent preset", () => {
    const preset: StationPreset = {
      id: "preset",
      name: "Preset",
      radioId: userRadio.id,
      antennaId: antenna.id,
      feedlineId: feedline.id,
      inlineComponentIds: ["choke"],
      accessoryIds: [amplifier.id, filter.id],
      operatingPowerWatts: 200,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const presetResult = computeStationPresetPerformance(preset, inventory(), {
      bands: ["20m"],
      targetBearingDeg: 90,
    });
    const chainResult = computeStationChainPerformance(
      stationPresetToChain(preset),
      inventory(),
      { bands: ["20m"], targetBearingDeg: 90 },
    );

    expect(presetResult.bands[0]).toEqual(chainResult.bands[0]);
  });
});

describe("receiver catalog invariants", () => {
  it("contains only physically bounded noise-floor values", () => {
    const values = SHERWOOD_RECEIVERS.flatMap((entry) =>
      entry.noiseFloorDbm == null ? [] : [entry.noiseFloorDbm],
    );

    expect(values.length).toBeGreaterThan(100);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-180);
    expect(Math.max(...values)).toBeLessThanOrEqual(-70);
  });
});

describe("station feature envelope", () => {
  it("contains derived values without raw inventory identifiers", () => {
    const envelope = deriveStationFeatureEnvelope(chain(), inventory(), "20m", {
      mode: "FT8",
      targetBearingDeg: 90,
      preferTestedSpecs: true,
    });
    const serialized = JSON.stringify(envelope);

    expect(envelope?.featureContract).toBe("station-chain-v1");
    expect(envelope?.modeBandwidthHz).toBe(50);
    expect(envelope?.receiverEvidence).toBe("manufacturer_claim");
    expect(serialized).not.toContain(userRadio.id);
    expect(serialized).not.toContain("500 W amplifier");
    expect(envelope).not.toHaveProperty("radioId");
    expect(envelope).not.toHaveProperty("antennaId");
    expect(envelope).not.toHaveProperty("feedlineId");
    expect(envelope).not.toHaveProperty("inventory");
  });

  it("changes its values-only fingerprint when path gain changes", () => {
    const forward = deriveStationFeatureEnvelope(chain(), inventory(), "20m", {
      targetBearingDeg: 90,
    });
    const offAxis = deriveStationFeatureEnvelope(chain(), inventory(), "20m", {
      targetBearingDeg: 180,
    });

    expect(forward?.chainFingerprint).not.toBe(offAxis?.chainFingerprint);
  });
});
