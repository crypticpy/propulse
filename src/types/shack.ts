/**
 * Shack Equipment Types
 *
 * Type definitions for user-owned antennas, feedlines, accessories,
 * and station presets for the Shack Builder feature.
 */

import type { AntennaType } from "@/lib/data/antennas";

// ─── Inventory Limits ────────────────────────────────────────────────────────

export const MAX_ANTENNAS = 20;
export const MAX_FEEDLINES = 20;
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
  // Extended types
  | "ground_plane"
  | "quad"
  | "magnetic_loop"
  | "full_loop"
  | "efhw"
  | "ocf_dipole"
  | "beverage"
  | "rhombic"
  | "fan_dipole"
  | "trap_dipole"
  | "steppir"
  | "moxon"
  | "wire_random"
  | "log_periodic"
  | "dish";

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
  | "other";

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
  notes?: string;
  addedAt: string;
}

// ─── Feedline Types ──────────────────────────────────────────────────────────

export type FeedlineType =
  | "rg58"
  | "rg8x"
  | "rg213"
  | "lmr400"
  | "lmr600"
  | "hardline_7_8"
  | "ladder_line_450"
  | "window_line_300";

export type ConnectorType =
  | "pl259"
  | "n_type"
  | "bnc"
  | "sma"
  | "f_type"
  | "binding_post"
  | "none";
export type FeedlineCondition = "new" | "good" | "fair" | "poor";

export interface UserFeedline {
  id: string;
  name: string;
  feedlineType: FeedlineType;
  lengthFeet: number;
  connectorCount: number;
  connectorType: ConnectorType;
  condition: FeedlineCondition;
  manufacturer?: string;
  yearInstalled?: number;
  notes?: string;
  addedAt: string;
}

// ─── Accessory Types ─────────────────────────────────────────────────────────

export type AccessoryCategory =
  | "amplifier"
  | "tuner"
  | "filter"
  | "switch"
  | "power_supply"
  | "grounding";

export interface AccessoryBase {
  id: string;
  name: string;
  category: AccessoryCategory;
  manufacturer?: string;
  modelNumber?: string;
  notes?: string;
  addedAt: string;
}

export interface AmplifierAccessory extends AccessoryBase {
  category: "amplifier";
  maxPowerWatts: number;
  gainDb: number;
  bands?: string[];
}

export interface TunerAccessory extends AccessoryBase {
  category: "tuner";
  type: "manual" | "automatic";
  maxPowerWatts: number;
  insertionLossDb?: number;
}

export interface FilterAccessory extends AccessoryBase {
  category: "filter";
  filterType: "bandpass" | "lowpass" | "highpass" | "notch";
  insertionLossDb: number;
  bands?: string[];
}

export interface SwitchAccessory extends AccessoryBase {
  category: "switch";
  ports: number;
  insertionLossDb: number;
}

export interface PowerSupplyAccessory extends AccessoryBase {
  category: "power_supply";
  voltageOutput: number;
  maxCurrentAmps: number;
}

export interface GroundingAccessory extends AccessoryBase {
  category: "grounding";
  groundType: "rod" | "radial_system" | "counterpoise" | "water_pipe" | "other";
  radialCount?: number;
}

export type UserAccessory =
  | AmplifierAccessory
  | TunerAccessory
  | FilterAccessory
  | SwitchAccessory
  | PowerSupplyAccessory
  | GroundingAccessory;

// ─── Station Preset ──────────────────────────────────────────────────────────

export interface StationPreset {
  id: string;
  name: string;
  radioId: string;
  antennaId: string;
  feedlineId?: string;
  accessoryIds: string[];
  operatingPowerWatts: number;
  notes?: string;
  createdAt: string;
}
