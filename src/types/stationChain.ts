/**
 * Station Chain Types
 *
 * Data model for the visual signal chain builder.
 * A StationChain is an ordered pipeline: Radio → Accessories → FeedlineRun → Antenna
 */

import type { AccessoryCategory } from "./shack";

// ─── Chain Node Types ───────────────────────────────────────────────────────

/** A node in the signal chain pipeline */
export type ChainNode =
  | RadioNode
  | AccessoryNode
  | FeedlineRunNode
  | AntennaNode;

export interface RadioNode {
  type: "radio";
  radioId: string;
}

export interface AccessoryNode {
  type: "accessory";
  accessoryId: string;
}

export interface FeedlineRunNode {
  type: "feedline_run";
  feedlineRunId: string;
}

export interface AntennaNode {
  type: "antenna";
  antennaId: string;
}

// ─── Feedline Run ───────────────────────────────────────────────────────────

/** A feedline run = the complete cable path including inline components */
export interface FeedlineRun {
  id: string;
  /** Base feedline cable ID (from shackStore.feedlines) */
  feedlineId: string;
  /** Ordered inline component IDs in signal path order */
  inlineComponentIds: string[];
}

// ─── Station Chain ──────────────────────────────────────────────────────────

export const MAX_CHAINS = 10;
export const MAX_CHAIN_NODES = 20;

/** The full station chain — an ordered pipeline */
export interface StationChain {
  id: string;
  name: string;
  /** Ordered signal-path nodes: Radio → Accessories → FeedlineRun → Antenna */
  nodes: ChainNode[];
  /** Feedline run definitions (referenced by feedline_run nodes) */
  feedlineRuns: FeedlineRun[];
  operatingPowerWatts: number;
  /** Non-signal-path accessories (power supply, grounding, keyer, etc.) */
  shackAccessoryIds: string[];
  notes?: string;
  createdAt: string;
}

// ─── Signal-Path Classification ─────────────────────────────────────────────

/** Accessory categories that are in the RF signal path */
export const SIGNAL_PATH_CATEGORIES: ReadonlySet<AccessoryCategory> = new Set([
  "amplifier",
  "tuner",
  "filter",
  "switch",
]);

/** Accessory categories that are NOT in the RF signal path */
export const SHACK_CATEGORIES: ReadonlySet<AccessoryCategory> = new Set([
  "power_supply",
  "grounding",
  "rotator",
  "keyer",
  "audio_dsp",
]);

/** Check if an accessory category is in the signal path */
export function isSignalPathCategory(category: AccessoryCategory): boolean {
  return SIGNAL_PATH_CATEGORIES.has(category);
}
