/**
 * Shack Equipment Types
 *
 * Type definitions for user-owned antennas, feedlines, inline components,
 * accessories, and station presets for the Shack Builder feature.
 */

import type { AntennaType } from "@/lib/data/antennas";

// ─── Inventory Limits ────────────────────────────────────────────────────────

export const MAX_ANTENNAS = 20;
export const MAX_FEEDLINES = 20;
export const MAX_INLINE_COMPONENTS = 30;
export const MAX_ACCESSORIES = 30;
export const MAX_PRESETS = 10;

// ─── Antenna Types ───────────────────────────────────────────────────────────

/** Extended antenna types — superset of the gain-pattern AntennaType */
export type UserAntennaType =
  // Existing gain-pattern types
  | "dipole"
  | "vertical"
  | "yagi_3el"
  | "yagi_5el"
  | "hex_beam"
  | "wire_inverted_v"
  | "nvis_dipole"
  | "isotropic"
  // Extended directional
  | "yagi_7el"
  | "yagi_9el"
  | "quad"
  | "log_periodic"
  | "moxon"
  | "steppir"
  | "phased_array"
  | "dish"
  // Extended vertical/omnidirectional
  | "ground_plane"
  | "vertical_with_radials"
  | "trapped_vertical"
  | "j_pole"
  | "slim_jim"
  // Extended wire
  | "efhw"
  | "ocf_dipole"
  | "fan_dipole"
  | "trap_dipole"
  | "wire_random"
  | "wire_zepp"
  | "g5rv"
  // Extended loop
  | "magnetic_loop"
  | "full_loop"
  | "delta_loop"
  // Extended special
  | "beverage"
  | "rhombic"
  | "helical";

export type AntennaPolarization =
  | "horizontal"
  | "vertical"
  | "circular"
  | "mixed";

export type AntennaMounting =
  | "tower"
  | "roof"
  | "mast"
  | "ground"
  | "tree"
  | "portable"
  | "mobile"
  | "attic"
  | "balcony"
  | "other";

/** Maps UserAntennaType to its closest gain-pattern model */
export const ANTENNA_TYPE_TO_PATTERN: Record<UserAntennaType, AntennaType> = {
  // Direct mappings
  dipole: "dipole",
  vertical: "vertical",
  yagi_3el: "yagi_3el",
  yagi_5el: "yagi_5el",
  hex_beam: "hex_beam",
  wire_inverted_v: "wire_inverted_v",
  nvis_dipole: "nvis_dipole",
  isotropic: "isotropic",
  // Extended → nearest pattern
  yagi_7el: "yagi_5el",
  yagi_9el: "yagi_5el",
  quad: "yagi_3el",
  log_periodic: "yagi_3el",
  moxon: "yagi_3el",
  steppir: "yagi_3el",
  phased_array: "yagi_5el",
  dish: "yagi_5el",
  ground_plane: "vertical",
  vertical_with_radials: "vertical",
  trapped_vertical: "vertical",
  j_pole: "vertical",
  slim_jim: "vertical",
  efhw: "dipole",
  ocf_dipole: "dipole",
  fan_dipole: "dipole",
  trap_dipole: "dipole",
  wire_random: "wire_inverted_v",
  wire_zepp: "dipole",
  g5rv: "dipole",
  magnetic_loop: "isotropic",
  full_loop: "dipole",
  delta_loop: "dipole",
  beverage: "wire_inverted_v",
  rhombic: "yagi_3el",
  helical: "yagi_3el",
};

/** Human-readable antenna type labels */
export const ANTENNA_TYPE_LABELS: Record<UserAntennaType, string> = {
  dipole: "Dipole",
  vertical: "Vertical",
  yagi_3el: "Yagi (3 Element)",
  yagi_5el: "Yagi (5 Element)",
  yagi_7el: "Yagi (7 Element)",
  yagi_9el: "Yagi (9+ Element)",
  hex_beam: "Hex Beam",
  wire_inverted_v: "Inverted V",
  nvis_dipole: "NVIS Dipole",
  isotropic: "Isotropic (Reference)",
  quad: "Cubical Quad",
  log_periodic: "Log Periodic (LPDA)",
  moxon: "Moxon Rectangle",
  steppir: "SteppIR",
  phased_array: "Phased Array",
  dish: "Parabolic Dish",
  ground_plane: "Ground Plane",
  vertical_with_radials: "Vertical with Radials",
  trapped_vertical: "Trapped Vertical",
  j_pole: "J-Pole",
  slim_jim: "Slim Jim",
  efhw: "End-Fed Half-Wave (EFHW)",
  ocf_dipole: "Off-Center Fed Dipole (Windom)",
  fan_dipole: "Fan Dipole (Multi-Band)",
  trap_dipole: "Trapped Dipole",
  wire_random: "Random Wire",
  wire_zepp: "Zepp / End-Fed Zepp",
  g5rv: "G5RV / ZS6BKW",
  magnetic_loop: "Magnetic Loop",
  full_loop: "Full-Wave Loop",
  delta_loop: "Delta Loop",
  beverage: "Beverage (Receiving)",
  rhombic: "Rhombic",
  helical: "Helical",
};

export interface UserAntenna {
  id: string;
  name: string;
  antennaType: UserAntennaType;
  /** Maps to existing gain engine for propagation calculations */
  gainPatternType: AntennaType;
  manufacturer?: string;
  modelNumber?: string;
  bands: string[];
  heightMeters: number;
  azimuthDeg?: number;
  isRotatable?: boolean;
  polarization: AntennaPolarization;
  mounting: AntennaMounting;
  /** Per-band gain overrides in dBi */
  gainDbiOverride?: Record<string, number>;
  /** Per-band SWR measurements */
  swrByBand?: Record<string, number>;
  /** Ferrites installed at feedpoint */
  feedpointFerrites?: FeedpointFerrite;
  notes?: string;
  /** UUID referencing a stored image in IndexedDB */
  imageId?: string;
  /** Additional photo gallery (up to 5 images, stored in IndexedDB) */
  galleryImageIds?: string[];
  addedAt: string;
  retiredAt?: string;
  photos?: string[];
}

/** Ferrite/choke configuration at an antenna feedpoint */
export interface FeedpointFerrite {
  type:
    | "snap_on"
    | "toroid"
    | "bead_string"
    | "balun_1_1"
    | "balun_4_1"
    | "unun_9_1"
    | "current_balun";
  material?: "43" | "31" | "61" | "77" | "unknown";
  turns?: number;
  count?: number;
  insertionLossDb?: number;
  notes?: string;
}

// ─── Feedline Types ──────────────────────────────────────────────────────────

export type FeedlineType =
  | "rg58"
  | "rg8x"
  | "rg213"
  | "rg8"
  | "rg11"
  | "rg174"
  | "lmr240"
  | "lmr400"
  | "lmr600"
  | "hardline_1_2"
  | "hardline_7_8"
  | "hardline_1_5_8"
  | "ladder_line_450"
  | "window_line_300"
  | "twin_lead_300";

export type ConnectorType =
  | "pl259"
  | "n_type"
  | "bnc"
  | "sma"
  | "sma_rp"
  | "tnc"
  | "din_7_16"
  | "f_type"
  | "binding_post"
  | "banana"
  | "anderson_powerpole"
  | "hardline_7_8"
  | "hardline_1_5_8"
  | "none";

export type FeedlineCondition = "new" | "good" | "fair" | "poor";

export interface UserFeedline {
  id: string;
  name: string;
  feedlineType: FeedlineType;
  lengthFeet: number;
  connectorCount: number;
  connectorType: ConnectorType;
  /** Connector type at far end if different from connectorType */
  connectorTypeFarEnd?: ConnectorType;
  condition: FeedlineCondition;
  manufacturer?: string;
  yearInstalled?: number;
  notes?: string;
  /** UUID referencing a stored image in IndexedDB */
  imageId?: string;
  addedAt: string;
  retiredAt?: string;
}

// ─── Inline Feedline Components ─────────────────────────────────────────────

export type InlineComponentType =
  | "adapter"
  | "pigtail"
  | "choke"
  | "balun"
  | "ferrite";

export interface InlineComponentBase {
  id: string;
  name: string;
  componentType: InlineComponentType;
  insertionLossDb: number;
  manufacturer?: string;
  notes?: string;
  /** UUID referencing a stored image in IndexedDB */
  imageId?: string;
  addedAt: string;
}

export interface AdapterComponent extends InlineComponentBase {
  componentType: "adapter";
  connectorFrom: ConnectorType;
  connectorTo: ConnectorType;
}

export interface PigtailComponent extends InlineComponentBase {
  componentType: "pigtail";
  connectorFrom: ConnectorType;
  connectorTo: ConnectorType;
  lengthInches: number;
  cableType?: FeedlineType;
}

export interface ChokeComponent extends InlineComponentBase {
  componentType: "choke";
  chokeType: "common_mode" | "line_isolator" | "feed_through";
  impedance?: number;
  turns?: number;
  bands?: string[];
}

export interface BalunComponent extends InlineComponentBase {
  componentType: "balun";
  ratio: "1:1" | "4:1" | "6:1" | "9:1" | "1:1_current" | "4:1_current";
  maxPowerWatts?: number;
  bands?: string[];
}

export interface FerriteComponent extends InlineComponentBase {
  componentType: "ferrite";
  ferriteType: "snap_on" | "toroid" | "bead";
  material?: "43" | "31" | "61" | "77" | "unknown";
  count: number;
  turns?: number;
  impedanceOhms?: number;
}

export type InlineComponent =
  | AdapterComponent
  | PigtailComponent
  | ChokeComponent
  | BalunComponent
  | FerriteComponent;

/** Human-readable inline component type labels */
export const INLINE_COMPONENT_LABELS: Record<InlineComponentType, string> = {
  adapter: "Adapter",
  pigtail: "Pigtail Cable",
  choke: "Choke / Line Isolator",
  balun: "Balun / Unun",
  ferrite: "Ferrite",
};

// ─── Accessory Types ─────────────────────────────────────────────────────────

export type AccessoryCategory =
  | "amplifier"
  | "tuner"
  | "filter"
  | "switch"
  | "power_supply"
  | "grounding"
  | "rotator"
  | "keyer"
  | "audio_dsp";

export interface AccessoryBase {
  id: string;
  name: string;
  category: AccessoryCategory;
  manufacturer?: string;
  modelNumber?: string;
  currentDrawAmps?: number;
  notes?: string;
  /** UUID referencing a stored image in IndexedDB */
  imageId?: string;
  /** Additional photo gallery (up to 5 images, stored in IndexedDB) */
  galleryImageIds?: string[];
  addedAt: string;
  retiredAt?: string;
}

export interface AmplifierAccessory extends AccessoryBase {
  category: "amplifier";
  maxPowerWatts: number;
  gainDb: number;
  bands?: string[];
  dutyCycle?: number;
  warmupTimeSec?: number;
  currentDrawTxAmps?: number;
  protectionFeatures?: string[];
}

export interface TunerAccessory extends AccessoryBase {
  category: "tuner";
  type: "manual" | "automatic";
  maxPowerWatts: number;
  insertionLossDb?: number;
  matchingRangeOhms?: { min: number; max: number };
  lossAtSwr?: Record<string, number>;
}

export interface FilterAccessory extends AccessoryBase {
  category: "filter";
  filterType: "bandpass" | "lowpass" | "highpass" | "notch";
  insertionLossDb: number;
  bands?: string[];
  selectivityDb?: number;
  passbandMHz?: { low: number; high: number };
}

export interface SwitchAccessory extends AccessoryBase {
  category: "switch";
  ports: number;
  insertionLossDb: number;
  isolationDb?: number;
  maxPowerWatts?: number;
}

export interface PowerSupplyAccessory extends AccessoryBase {
  category: "power_supply";
  voltageOutput: number;
  maxCurrentAmps: number;
  rippleMv?: number;
  regulated?: boolean;
}

export interface GroundingAccessory extends AccessoryBase {
  category: "grounding";
  groundType: "rod" | "radial_system" | "counterpoise" | "water_pipe" | "other";
  radialCount?: number;
  groundResistanceOhms?: number;
}

export interface RotatorAccessory extends AccessoryBase {
  category: "rotator";
  rotatorType: "azimuth" | "elevation" | "az_el";
  speedDegPerSec?: number;
  rangeDeg?: number;
  brakeType?: "friction" | "magnetic" | "worm_gear" | "none";
  maxWindLoadSqFt?: number;
}

export interface KeyerAccessory extends AccessoryBase {
  category: "keyer";
  keyerType:
    | "paddle"
    | "straight_key"
    | "bug"
    | "electronic_keyer"
    | "keyboard";
  speedRangeWpm?: { min: number; max: number };
  memorySlots?: number;
}

export interface AudioDspAccessory extends AccessoryBase {
  category: "audio_dsp";
  dspType:
    | "external_speaker"
    | "headphones"
    | "dsp_filter"
    | "audio_processor"
    | "voice_keyer";
  noiseReduction?: boolean;
  notchFilter?: boolean;
  bandwidthHz?: { min: number; max: number };
}

export type UserAccessory =
  | AmplifierAccessory
  | TunerAccessory
  | FilterAccessory
  | SwitchAccessory
  | PowerSupplyAccessory
  | GroundingAccessory
  | RotatorAccessory
  | KeyerAccessory
  | AudioDspAccessory;

/** Human-readable accessory category labels */
export const ACCESSORY_CATEGORY_LABELS: Record<AccessoryCategory, string> = {
  amplifier: "Amplifier",
  tuner: "Antenna Tuner",
  filter: "Filter",
  switch: "Antenna Switch",
  power_supply: "Power Supply",
  grounding: "Grounding System",
  rotator: "Rotator",
  keyer: "Keyer / Paddle",
  audio_dsp: "Audio / DSP",
};

// ─── Station Preset ──────────────────────────────────────────────────────────

export interface StationPreset {
  id: string;
  name: string;
  radioId: string;
  antennaId: string;
  feedlineId?: string;
  /** Inline components in signal path order */
  inlineComponentIds?: string[];
  accessoryIds: string[];
  operatingPowerWatts: number;
  linkedLocationId?: string;
  notes?: string;
  createdAt: string;
}

// ─── Equipment History ───────────────────────────────────────────────────────

export type EquipmentHistoryAction =
  | "added"
  | "modified"
  | "retired"
  | "removed"
  | "activated"
  | "duplicated";

export interface EquipmentHistoryEntry {
  id: string;
  timestamp: string;
  action: EquipmentHistoryAction;
  equipmentType:
    | "radio"
    | "antenna"
    | "feedline"
    | "inline_component"
    | "accessory"
    | "preset"
    | "chain";
  equipmentId: string;
  equipmentName: string;
  details?: string;
}

// ─── Connector & Feedline Display Names ──────────────────────────────────────

export const CONNECTOR_TYPE_LABELS: Record<ConnectorType, string> = {
  pl259: "PL-259 / SO-239 (UHF)",
  n_type: "N-Type",
  bnc: "BNC",
  sma: "SMA",
  sma_rp: "SMA-RP (Reverse Polarity)",
  tnc: "TNC",
  din_7_16: "7/16 DIN",
  f_type: "F-Type",
  binding_post: "Binding Post",
  banana: "Banana Plug",
  anderson_powerpole: "Anderson Powerpole",
  hardline_7_8: 'Hardline 7/8"',
  hardline_1_5_8: 'Hardline 1-5/8"',
  none: "None / Direct",
};

export const FEEDLINE_TYPE_LABELS: Record<FeedlineType, string> = {
  rg58: "RG-58",
  rg8x: "RG-8X",
  rg213: "RG-213",
  rg8: "RG-8",
  rg11: "RG-11",
  rg174: "RG-174",
  lmr240: "LMR-240",
  lmr400: "LMR-400",
  lmr600: "LMR-600",
  hardline_1_2: 'Hardline 1/2"',
  hardline_7_8: 'Hardline 7/8"',
  hardline_1_5_8: 'Hardline 1-5/8"',
  ladder_line_450: "Ladder Line (450\u03A9)",
  window_line_300: "Window Line (300\u03A9)",
  twin_lead_300: "Twin Lead (300\u03A9)",
};
