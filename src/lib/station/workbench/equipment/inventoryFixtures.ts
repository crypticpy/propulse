/** Declared legacy shack fixtures for typed inventory / Used in tests. */
import type { UserRadio } from "@/types/radio";
import type {
  InlineComponent,
  UserAccessory,
  UserAntenna,
  UserFeedline,
} from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import type { LegacyInventorySnapshot } from "@/lib/station/workbench/equipment/inventoryQuery";

const date = "2026-09-05T12:00:00Z";

export const INVENTORY_FIXTURE_OWNER = "fixture-owner";

const radio: UserRadio = {
  id: "shared-radio",
  equipmentId: "ic-7300",
  nickname: "Shared HF radio",
  addedAt: date,
};

const antennaA = {
  id: "antenna-a",
  name: "Dipole A",
  antennaType: "dipole",
  gainPatternType: "dipole",
  bands: ["20m"],
  heightMeters: 10,
  polarization: "horizontal",
  mounting: "mast",
  addedAt: date,
} satisfies UserAntenna;

const antennaB = {
  id: "antenna-b",
  name: "Vertical B",
  antennaType: "vertical",
  gainPatternType: "vertical",
  bands: ["20m"],
  heightMeters: 8,
  polarization: "vertical",
  mounting: "ground",
  addedAt: date,
} satisfies UserAntenna;

const sharedFeedline: UserFeedline = {
  id: "shared-coax",
  name: "Shared coax",
  feedlineType: "lmr400",
  lengthFeet: 40,
  connectorCount: 2,
  connectorType: "pl259",
  condition: "good",
  addedAt: date,
};

const inlineChoke = {
  id: "inline-choke",
  name: "Feed choke",
  componentType: "choke",
  chokeType: "common_mode",
  insertionLossDb: 0.1,
  addedAt: date,
} satisfies InlineComponent;

const unwiredAccessory: UserAccessory = {
  id: "unwired-psu",
  name: "Bench supply",
  category: "power_supply",
  voltageOutput: 13.8,
  maxCurrentAmps: 30,
  addedAt: date,
};

const homeChain: StationChain = {
  id: "home-hf",
  name: "Home HF",
  nodes: [
    { type: "radio", radioId: "shared-radio" },
    { type: "feedline_run", feedlineRunId: "home-run" },
    { type: "antenna", antennaId: "antenna-a" },
  ],
  feedlineRuns: [{
    id: "home-run",
    feedlineId: "shared-coax",
    inlineComponentIds: ["inline-choke"],
  }],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: date,
};

const portableChain: StationChain = {
  id: "portable",
  name: "Portable kit",
  nodes: [
    { type: "radio", radioId: "shared-radio" },
    { type: "feedline_run", feedlineRunId: "portable-run" },
    { type: "antenna", antennaId: "antenna-b" },
  ],
  feedlineRuns: [{
    id: "portable-run",
    feedlineId: "shared-coax",
    inlineComponentIds: [],
  }],
  operatingPowerWatts: 5,
  shackAccessoryIds: [],
  createdAt: date,
};

/** Shared gear across two setups plus an unwired accessory retained in inventory. */
export function createLegacyInventoryFixture(): LegacyInventorySnapshot {
  return {
    radios: [radio],
    antennas: [antennaA, antennaB],
    feedlines: [sharedFeedline],
    accessories: [unwiredAccessory],
    inlineComponents: [inlineChoke],
    stationChains: [homeChain, portableChain],
    activeChainId: "portable",
  };
}
