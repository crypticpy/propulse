/**
 * Chain Ordering Engine
 *
 * Pure TypeScript utility for smart auto-ordering of Station Builder Lab
 * signal chain nodes. Provides canonical rank computation, insertion position
 * calculation, and chain structure validation.
 */

import type { ChainNode } from "@/types/stationChain";
import type { AccessoryCategory } from "@/types/shack";

// ─── Canonical Rank System ──────────────────────────────────────────────────
// Radio: 0, Amp: 10, Tuner: 20, Filter: 30, Switch: 40, FeedlineRun: 50, Antenna: 60

const ACCESSORY_CATEGORY_RANK: Partial<Record<AccessoryCategory, number>> = {
  amplifier: 10,
  tuner: 20,
  filter: 30,
  switch: 40,
};

const BASE_RANK: Record<ChainNode["type"], number> = {
  radio: 0,
  accessory: 25, // refined by category
  feedline_run: 50,
  antenna: 60,
};

/** Get the canonical rank for a chain node */
export function getNodeRank(
  node: ChainNode,
  getAccessoryCategory: (accessoryId: string) => AccessoryCategory | null,
): number {
  if (node.type === "accessory") {
    const cat = getAccessoryCategory(node.accessoryId);
    if (cat && ACCESSORY_CATEGORY_RANK[cat] != null) {
      return ACCESSORY_CATEGORY_RANK[cat]!;
    }
    return BASE_RANK.accessory; // fallback for unknown category
  }
  return BASE_RANK[node.type];
}

/**
 * Compute the ideal insertion position for a new node.
 * Finds the first existing node with a higher rank and inserts before it.
 * Same-rank nodes cluster together (new one goes after existing same-rank nodes).
 */
export function computeInsertPosition(
  nodes: ChainNode[],
  newNode: ChainNode,
  getAccessoryCategory: (accessoryId: string) => AccessoryCategory | null,
): number {
  const newRank = getNodeRank(newNode, getAccessoryCategory);

  for (let i = 0; i < nodes.length; i++) {
    const existingRank = getNodeRank(nodes[i], getAccessoryCategory);
    if (existingRank > newRank) {
      return i;
    }
  }

  return nodes.length; // append at end
}

// ─── Valid Equipment Types (for radial picker) ──────────────────────────────

export interface EquipmentTypeOption {
  /** The ChainNode type to create */
  nodeType: "radio" | "accessory" | "feedline_run" | "antenna";
  /** For accessories, which category */
  accessoryCategory?: AccessoryCategory;
  /** Human-readable label */
  label: string;
  /** Canonical rank in the signal chain */
  rank: number;
  /** Key for looking up inventory and resolving symbols */
  inventoryKey: string;
  /** Hex color for the radial menu option */
  color: string;
}

export const ALL_EQUIPMENT_OPTIONS: EquipmentTypeOption[] = [
  {
    nodeType: "radio",
    label: "Radio",
    rank: 0,
    inventoryKey: "radio",
    color: "#F97316",
  },
  {
    nodeType: "accessory",
    accessoryCategory: "amplifier",
    label: "Amplifier",
    rank: 10,
    inventoryKey: "amplifier",
    color: "#3B82F6",
  },
  {
    nodeType: "accessory",
    accessoryCategory: "tuner",
    label: "Tuner",
    rank: 20,
    inventoryKey: "tuner",
    color: "#3B82F6",
  },
  {
    nodeType: "accessory",
    accessoryCategory: "filter",
    label: "Filter",
    rank: 30,
    inventoryKey: "filter",
    color: "#3B82F6",
  },
  {
    nodeType: "accessory",
    accessoryCategory: "switch",
    label: "Switch",
    rank: 40,
    inventoryKey: "switch",
    color: "#6366F1",
  },
  {
    nodeType: "feedline_run",
    label: "Feedline",
    rank: 50,
    inventoryKey: "feedline",
    color: "#F59E0B",
  },
  {
    nodeType: "antenna",
    label: "Antenna",
    rank: 60,
    inventoryKey: "antenna",
    color: "#22C55E",
  },
];

/**
 * Get equipment types valid for insertion at a given position.
 * leftRank = rank of the node to the left (null if inserting at position 0)
 * rightRank = rank of the node to the right (null if inserting at end)
 */
export function getValidEquipmentTypes(
  leftRank: number | null,
  rightRank: number | null,
): EquipmentTypeOption[] {
  return ALL_EQUIPMENT_OPTIONS.filter((opt) => {
    if (leftRank !== null && opt.rank < leftRank) return false;
    if (rightRank !== null && opt.rank > rightRank) return false;
    return true;
  });
}

// ─── Chain Validation ──────────────────────────────────────────────────────

export type ChainWarningCode =
  | "no_radio"
  | "multiple_radios"
  | "no_antenna"
  | "radio_not_first"
  | "antenna_not_last";

export interface ChainWarning {
  code: ChainWarningCode;
  message: string;
  severity: "info" | "warning";
  nodeIndex?: number;
}

/** Validate chain structure. Returns warnings (non-blocking). */
export function validateChain(
  nodes: ChainNode[],
  _getAccessoryCategory: (accessoryId: string) => AccessoryCategory | null,
): ChainWarning[] {
  const warnings: ChainWarning[] = [];

  const radioIndices = nodes
    .map((n, i) => (n.type === "radio" ? i : -1))
    .filter((i) => i >= 0);
  const antennaIndices = nodes
    .map((n, i) => (n.type === "antenna" ? i : -1))
    .filter((i) => i >= 0);

  if (radioIndices.length === 0) {
    warnings.push({
      code: "no_radio",
      message: "No radio \u2014 signal has no source",
      severity: "info",
    });
  }
  if (radioIndices.length > 1) {
    warnings.push({
      code: "multiple_radios",
      message: "Multiple radios in chain",
      severity: "warning",
      nodeIndex: radioIndices[1],
    });
  }
  if (antennaIndices.length === 0 && nodes.length > 0) {
    warnings.push({
      code: "no_antenna",
      message: "No antenna \u2014 signal path incomplete",
      severity: "info",
    });
  }
  if (radioIndices.length > 0 && radioIndices[0] !== 0) {
    warnings.push({
      code: "radio_not_first",
      message: "Radio should be at the start",
      severity: "warning",
      nodeIndex: radioIndices[0],
    });
  }
  if (
    antennaIndices.length > 0 &&
    antennaIndices[antennaIndices.length - 1] !== nodes.length - 1
  ) {
    warnings.push({
      code: "antenna_not_last",
      message: "Antenna should be at the end",
      severity: "warning",
      nodeIndex: antennaIndices[antennaIndices.length - 1],
    });
  }

  return warnings;
}
