/**
 * Development Seed Utility
 *
 * Populates the shack store with comprehensive test equipment for
 * testing the Station Builder Lab and other shack-related features.
 *
 * Usage (browser console):
 *   __seedEquipment()   — add all test equipment
 *   __clearEquipment()  — remove all equipment from the store
 */

import { useShackStore } from "@/stores/shackStore";
import type { UserAntenna, UserFeedline } from "@/types/shack";
import type {
  AmplifierAccessory,
  TunerAccessory,
  FilterAccessory,
  SwitchAccessory,
  AudioDspAccessory,
  PowerSupplyAccessory,
  RotatorAccessory,
} from "@/types/shack";
import type {
  AdapterComponent,
  ChokeComponent,
  BalunComponent,
  FerriteComponent,
} from "@/types/shack";

// ─── Antenna Seed Data ──────────────────────────────────────────────────────

type AntennaInput = Omit<UserAntenna, "id" | "addedAt">;

const SEED_ANTENNAS: AntennaInput[] = [
  {
    name: "Hex Beam (20m-10m)",
    antennaType: "hex_beam",
    gainPatternType: "hex_beam",
    bands: ["20m", "17m", "15m", "12m", "10m"],
    heightMeters: 12,
    polarization: "horizontal",
    mounting: "tower",
    manufacturer: "Hex-Beam.com",
    gainDbiOverride: {
      "20m": 4.2,
      "17m": 4.8,
      "15m": 5.2,
      "12m": 5.5,
      "10m": 6.0,
    },
    swrByBand: {
      "20m": 1.3,
      "17m": 1.2,
      "15m": 1.4,
      "12m": 1.3,
      "10m": 1.5,
    },
    isRotatable: true,
    notes: "Seed data — lightweight directional multi-band antenna",
  },
  {
    name: "EFHW 80m-10m",
    antennaType: "efhw",
    gainPatternType: "dipole",
    bands: ["80m", "40m", "20m", "15m", "10m"],
    heightMeters: 10,
    polarization: "horizontal",
    mounting: "tree",
    manufacturer: "MyAntennas",
    modelNumber: "EFHW-8010",
    gainDbiOverride: {
      "80m": 0.5,
      "40m": 2.0,
      "20m": 2.5,
      "15m": 3.0,
      "10m": 3.5,
    },
    notes: "Seed data — end-fed half-wave, sloper from tree",
  },
  {
    name: "2m/70cm Dual-Band Vertical",
    antennaType: "vertical",
    gainPatternType: "vertical",
    bands: ["2m", "70cm"],
    heightMeters: 5,
    polarization: "vertical",
    mounting: "roof",
    manufacturer: "Diamond",
    modelNumber: "X-510N",
    gainDbiOverride: { "2m": 6.0, "70cm": 8.0 },
    swrByBand: { "2m": 1.2, "70cm": 1.3 },
    notes: "Seed data — VHF/UHF base station vertical (N-type connector)",
  },
  {
    name: "40m Dipole",
    antennaType: "dipole",
    gainPatternType: "dipole",
    bands: ["40m"],
    heightMeters: 15,
    polarization: "horizontal",
    mounting: "other",
    gainDbiOverride: { "40m": 2.15 },
    swrByBand: { "40m": 1.1 },
    notes: "Seed data — simple resonant 40m dipole between supports",
  },
  {
    name: "SteppIR 3-Element (20m-6m)",
    antennaType: "steppir",
    gainPatternType: "yagi_3el",
    bands: ["20m", "17m", "15m", "12m", "10m", "6m"],
    heightMeters: 20,
    polarization: "horizontal",
    mounting: "tower",
    manufacturer: "SteppIR",
    modelNumber: "DB18E",
    isRotatable: true,
    gainDbiOverride: {
      "20m": 6.5,
      "17m": 7.0,
      "15m": 7.2,
      "12m": 7.0,
      "10m": 7.5,
      "6m": 7.8,
    },
    swrByBand: {
      "20m": 1.2,
      "17m": 1.1,
      "15m": 1.1,
      "12m": 1.2,
      "10m": 1.1,
      "6m": 1.3,
    },
    notes:
      "Seed data — motorized variable-length elements, continuous frequency coverage",
  },
];

// ─── Feedline Seed Data ─────────────────────────────────────────────────────

type FeedlineInput = Omit<UserFeedline, "id" | "addedAt">;

const SEED_FEEDLINES: FeedlineInput[] = [
  {
    name: "LMR-400 50ft (Tower Run)",
    feedlineType: "lmr400",
    lengthFeet: 50,
    connectorCount: 2,
    connectorType: "pl259",
    connectorTypeFarEnd: "n_type",
    condition: "new",
    manufacturer: "Times Microwave",
    notes: "Seed data — main HF tower run",
  },
  {
    name: "RG-213 100ft (EFHW Run)",
    feedlineType: "rg213",
    lengthFeet: 100,
    connectorCount: 2,
    connectorType: "pl259",
    condition: "good",
    notes: "Seed data — long run to end-fed half-wave",
  },
  {
    name: "LMR-600 75ft (SteppIR Run)",
    feedlineType: "lmr600",
    lengthFeet: 75,
    connectorCount: 2,
    connectorType: "n_type",
    condition: "new",
    manufacturer: "Times Microwave",
    notes: "Seed data — low-loss run to SteppIR yagi",
  },
  {
    name: "RG-8X 25ft (Shack Patch)",
    feedlineType: "rg8x",
    lengthFeet: 25,
    connectorCount: 2,
    connectorType: "pl259",
    condition: "good",
    notes: "Seed data — short patch cable inside the shack",
  },
  {
    name: "RG-58 15ft (VHF Jumper)",
    feedlineType: "rg58",
    lengthFeet: 15,
    connectorCount: 2,
    connectorType: "bnc",
    condition: "new",
    notes: "Seed data — short VHF/UHF jumper cable",
  },
];

// ─── Accessory Seed Data ────────────────────────────────────────────────────

type AccessoryInput =
  | Omit<AmplifierAccessory, "id" | "addedAt">
  | Omit<TunerAccessory, "id" | "addedAt">
  | Omit<FilterAccessory, "id" | "addedAt">
  | Omit<SwitchAccessory, "id" | "addedAt">
  | Omit<AudioDspAccessory, "id" | "addedAt">
  | Omit<PowerSupplyAccessory, "id" | "addedAt">
  | Omit<RotatorAccessory, "id" | "addedAt">;

const SEED_ACCESSORIES: AccessoryInput[] = [
  // Signal-path accessories
  {
    category: "amplifier",
    name: "Ameritron AL-811H",
    manufacturer: "Ameritron",
    gainDb: 10,
    maxPowerWatts: 800,
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    dutyCycle: 0.5,
    warmupTimeSec: 120,
    currentDrawAmps: 3,
    currentDrawTxAmps: 20,
    protectionFeatures: ["grid_protection", "swr_protection"],
    notes: "Seed data — 3x 811A tube amplifier, 800W PEP output",
  } satisfies Omit<AmplifierAccessory, "id" | "addedAt">,
  {
    category: "tuner",
    name: "Palstar AT2K",
    manufacturer: "Palstar",
    type: "manual",
    maxPowerWatts: 2000,
    insertionLossDb: 0.5,
    matchingRangeOhms: { min: 12, max: 800 },
    notes: "Seed data — high-power manual tuner with roller inductor",
  } satisfies Omit<TunerAccessory, "id" | "addedAt">,
  {
    category: "filter",
    name: "DX Engineering BPF-1 (20m)",
    manufacturer: "DX Engineering",
    filterType: "bandpass",
    insertionLossDb: 0.3,
    bands: ["20m"],
    selectivityDb: 40,
    passbandMHz: { low: 14.0, high: 14.35 },
    notes: "Seed data — 20m bandpass filter for multi-op contesting",
  } satisfies Omit<FilterAccessory, "id" | "addedAt">,
  {
    category: "switch",
    name: "MFJ-1700C",
    manufacturer: "MFJ",
    ports: 6,
    insertionLossDb: 0.1,
    isolationDb: 60,
    maxPowerWatts: 2500,
    notes: "Seed data — 6-position antenna switch",
  } satisfies Omit<SwitchAccessory, "id" | "addedAt">,
  {
    category: "audio_dsp",
    name: "Diamond SX-200 SWR/Power Meter",
    manufacturer: "Diamond",
    modelNumber: "SX-200",
    dspType: "external_speaker",
    notes:
      "Seed data — cross-needle SWR/power meter (modeled as audio_dsp for signal path presence; insertion loss ~0.2 dB)",
  } satisfies Omit<AudioDspAccessory, "id" | "addedAt">,
  // Non-signal-path accessories
  {
    category: "power_supply",
    name: "Astron RS-35M",
    manufacturer: "Astron",
    voltageOutput: 13.8,
    maxCurrentAmps: 35,
    rippleMv: 5,
    regulated: true,
    notes: "Seed data — linear regulated power supply",
  } satisfies Omit<PowerSupplyAccessory, "id" | "addedAt">,
  {
    category: "rotator",
    name: "Yaesu G-800DXA",
    manufacturer: "Yaesu",
    rotatorType: "azimuth",
    speedDegPerSec: 1.5,
    rangeDeg: 450,
    brakeType: "magnetic",
    maxWindLoadSqFt: 20,
    notes: "Seed data — medium-duty azimuth rotator for Hex Beam / SteppIR",
  } satisfies Omit<RotatorAccessory, "id" | "addedAt">,
];

// ─── Inline Component Seed Data ─────────────────────────────────────────────

type InlineInput =
  | Omit<AdapterComponent, "id" | "addedAt">
  | Omit<ChokeComponent, "id" | "addedAt">
  | Omit<BalunComponent, "id" | "addedAt">
  | Omit<FerriteComponent, "id" | "addedAt">;

const SEED_INLINE_COMPONENTS: InlineInput[] = [
  {
    componentType: "adapter",
    name: "PL-259 to N Adapter",
    insertionLossDb: 0.05,
    connectorFrom: "pl259",
    connectorTo: "n_type",
    manufacturer: "Amphenol",
    notes: "Seed data — barrel adapter for connector transition",
  } satisfies Omit<AdapterComponent, "id" | "addedAt">,
  {
    componentType: "choke",
    name: "Polyphaser IS-50NX-C2 Lightning Arrestor",
    insertionLossDb: 0.1,
    chokeType: "feed_through",
    impedance: 50,
    bands: ["160m", "80m", "40m", "20m", "17m", "15m", "12m", "10m", "6m"],
    manufacturer: "Polyphaser",
    notes: "Seed data — bulkhead-mount gas-discharge lightning arrestor",
  } satisfies Omit<ChokeComponent, "id" | "addedAt">,
  {
    componentType: "balun",
    name: "1:1 Current Balun",
    insertionLossDb: 0.3,
    ratio: "1:1_current",
    maxPowerWatts: 3000,
    bands: ["160m", "80m", "40m", "20m", "17m", "15m", "12m", "10m"],
    manufacturer: "Balun Designs",
    notes:
      "Seed data — feedpoint common-mode choke / current balun (model 1171)",
  } satisfies Omit<BalunComponent, "id" | "addedAt">,
  {
    componentType: "ferrite",
    name: "Fair-Rite Snap-On Choke (x4)",
    insertionLossDb: 0.2,
    ferriteType: "snap_on",
    material: "31",
    count: 4,
    turns: 1,
    manufacturer: "Fair-Rite",
    notes: "Seed data — 4 snap-on ferrites on feedline for RFI suppression",
  } satisfies Omit<FerriteComponent, "id" | "addedAt">,
];

// ─── Radio Equipment IDs (from built-in database) ──────────────────────────

const SEED_RADIOS: Array<{ equipmentId: string; nickname?: string }> = [
  { equipmentId: "icom-ic7300", nickname: "HF Workhorse" },
  { equipmentId: "yaesu-ft991a", nickname: "All-Band Base" },
  { equipmentId: "elecraft-kx3", nickname: "Portable QRP" },
  { equipmentId: "kenwood-ts590sg", nickname: "Contest Backup" },
];

// ─── Seed & Clear Functions ─────────────────────────────────────────────────

/**
 * Populate the shack store with a comprehensive set of test equipment.
 * Skips items whose names already exist in the store to prevent duplicates.
 * Returns a summary of what was added.
 */
export function seedTestEquipment(): {
  radios: number;
  antennas: number;
  feedlines: number;
  accessories: number;
  inlineComponents: number;
} {
  const store = useShackStore.getState();
  const counts = {
    radios: 0,
    antennas: 0,
    feedlines: 0,
    accessories: 0,
    inlineComponents: 0,
  };

  // --- Radios ---
  const existingEquipmentIds = new Set(store.radios.map((r) => r.equipmentId));
  for (const radio of SEED_RADIOS) {
    if (existingEquipmentIds.has(radio.equipmentId)) continue;
    const id = useShackStore
      .getState()
      .addRadio(radio.equipmentId, radio.nickname);
    if (id) counts.radios++;
  }

  // --- Antennas ---
  const existingAntennaNames = new Set(store.antennas.map((a) => a.name));
  for (const antenna of SEED_ANTENNAS) {
    if (existingAntennaNames.has(antenna.name)) continue;
    const id = useShackStore.getState().addAntenna(antenna);
    if (id) counts.antennas++;
  }

  // --- Feedlines ---
  const existingFeedlineNames = new Set(store.feedlines.map((f) => f.name));
  for (const feedline of SEED_FEEDLINES) {
    if (existingFeedlineNames.has(feedline.name)) continue;
    const id = useShackStore.getState().addFeedline(feedline);
    if (id) counts.feedlines++;
  }

  // --- Accessories ---
  const existingAccessoryNames = new Set(store.accessories.map((a) => a.name));
  for (const accessory of SEED_ACCESSORIES) {
    if (existingAccessoryNames.has(accessory.name)) continue;
    const id = useShackStore.getState().addAccessory(accessory);
    if (id) counts.accessories++;
  }

  // --- Inline Components ---
  const existingInlineNames = new Set(
    store.inlineComponents.map((c) => c.name),
  );
  for (const component of SEED_INLINE_COMPONENTS) {
    if (existingInlineNames.has(component.name)) continue;
    const id = useShackStore.getState().addInlineComponent(component);
    if (id) counts.inlineComponents++;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seedTestEquipment] Added: ${counts.radios} radios, ` +
      `${counts.antennas} antennas, ${counts.feedlines} feedlines, ` +
      `${counts.accessories} accessories, ${counts.inlineComponents} inline components`,
  );

  return counts;
}

/**
 * Remove ALL equipment from the shack store.
 * This clears radios, antennas, feedlines, accessories, inline components,
 * presets, chains, and history. Use with caution.
 */
export function clearTestEquipment(): void {
  const store = useShackStore.getState();

  // Remove chains first (they reference other equipment)
  for (const chain of [...store.stationChains]) {
    useShackStore.getState().removeChain(chain.id);
  }

  // Remove presets
  for (const preset of [...store.stationPresets]) {
    useShackStore.getState().removePreset(preset.id);
  }

  // Remove radios
  for (const radio of [...store.radios]) {
    useShackStore.getState().removeRadio(radio.id);
  }

  // Remove custom radios
  for (const radio of [...(store.customRadios || [])]) {
    useShackStore.getState().removeCustomRadio(radio.id);
  }

  // Remove antennas
  for (const antenna of [...store.antennas]) {
    useShackStore.getState().removeAntenna(antenna.id);
  }

  // Remove feedlines
  for (const feedline of [...store.feedlines]) {
    useShackStore.getState().removeFeedline(feedline.id);
  }

  // Remove accessories
  for (const accessory of [...store.accessories]) {
    useShackStore.getState().removeAccessory(accessory.id);
  }

  // Remove inline components
  for (const component of [...store.inlineComponents]) {
    useShackStore.getState().removeInlineComponent(component.id);
  }

  // eslint-disable-next-line no-console
  console.log("[clearTestEquipment] All equipment removed from shack store.");
}
