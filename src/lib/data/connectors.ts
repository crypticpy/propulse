/**
 * Connector Compatibility Engine
 *
 * Determines physical connector compatibility between signal chain nodes.
 * Used by the Station Builder Lab to validate that adjacent equipment
 * in a signal chain can physically connect to each other.
 */

import type {
  ConnectorType,
  FeedlineType,
  UserAntenna,
  UserFeedline,
  InlineComponent,
  UserAccessory,
} from "@/types/shack";
import type {
  ChainNode,
  FeedlineRun,
  StationChain,
} from "@/types/stationChain";
import type { RadioEquipment, UserRadio } from "@/types/radio";

// ─── Connector Compatibility Map ────────────────────────────────────────────

/**
 * Physical connector compatibility — which types can mate with each other.
 *
 * Most RF connectors only mate with their own kind (PL-259 ↔ SO-239, etc.).
 * `none` is treated as universally compatible (direct/hardwired connection).
 */
export const CONNECTOR_COMPATIBILITY: Record<ConnectorType, ConnectorType[]> = {
  pl259: ["pl259", "none"],
  n_type: ["n_type", "none"],
  bnc: ["bnc", "none"],
  sma: ["sma", "none"],
  sma_rp: ["sma_rp", "none"],
  tnc: ["tnc", "none"],
  din_7_16: ["din_7_16", "none"],
  f_type: ["f_type", "none"],
  binding_post: ["binding_post", "banana", "none"],
  banana: ["banana", "binding_post", "none"],
  anderson_powerpole: ["anderson_powerpole", "none"],
  hardline_7_8: ["hardline_7_8", "none"],
  hardline_1_5_8: ["hardline_1_5_8", "none"],
  none: [
    "none",
    "pl259",
    "n_type",
    "bnc",
    "sma",
    "sma_rp",
    "tnc",
    "din_7_16",
    "f_type",
    "binding_post",
    "banana",
    "anderson_powerpole",
    "hardline_7_8",
    "hardline_1_5_8",
  ],
};

// ─── Default Connector Types for Feedlines ──────────────────────────────────

/**
 * Typical/default connector type for each feedline cable type.
 * Used when a feedline doesn't have an explicit connector type specified.
 */
export const DEFAULT_FEEDLINE_CONNECTOR: Record<FeedlineType, ConnectorType> = {
  rg58: "pl259",
  rg8x: "pl259",
  rg213: "pl259",
  rg8: "pl259",
  rg11: "n_type",
  rg174: "sma",
  lmr240: "pl259",
  lmr400: "n_type",
  lmr600: "n_type",
  hardline_1_2: "n_type",
  hardline_7_8: "hardline_7_8",
  hardline_1_5_8: "hardline_1_5_8",
  ladder_line_450: "binding_post",
  window_line_300: "binding_post",
  twin_lead_300: "binding_post",
};

// ─── Equipment Data Interface ───────────────────────────────────────────────

/**
 * Equipment data needed for connector resolution.
 * Passed as a parameter so this utility stays free of React hooks.
 */
export interface ChainEquipmentData {
  radios: UserRadio[];
  customRadios: RadioEquipment[];
  antennas: UserAntenna[];
  feedlines: UserFeedline[];
  inlineComponents: InlineComponent[];
  accessories: UserAccessory[];
}

// ─── Equipment Lookup Helpers ───────────────────────────────────────────────

function findFeedlineRun(
  feedlineRunId: string,
  chain: StationChain | { feedlineRuns: FeedlineRun[] },
): FeedlineRun | undefined {
  return chain.feedlineRuns.find((r) => r.id === feedlineRunId);
}

function findFeedline(
  feedlineId: string,
  data: ChainEquipmentData,
): UserFeedline | undefined {
  return data.feedlines.find((f) => f.id === feedlineId);
}

function findAccessory(
  accessoryId: string,
  data: ChainEquipmentData,
): UserAccessory | undefined {
  return data.accessories.find((a) => a.id === accessoryId);
}

function findAntenna(
  antennaId: string,
  data: ChainEquipmentData,
): UserAntenna | undefined {
  return data.antennas.find((a) => a.id === antennaId);
}

// ─── Inline Component Connector Resolution ──────────────────────────────────

/**
 * Get the input connector of an inline component.
 * Adapters and pigtails have explicit connectorFrom; others default to pl259.
 */
function getInlineComponentInputConnector(
  component: InlineComponent,
): ConnectorType {
  if (
    component.componentType === "adapter" ||
    component.componentType === "pigtail"
  ) {
    return component.connectorFrom;
  }
  // Chokes, baluns, ferrites are typically inline with pl259 connectors
  return "pl259";
}

/**
 * Get the output connector of an inline component.
 * Adapters and pigtails have explicit connectorTo; others default to pl259.
 */
function getInlineComponentOutputConnector(
  component: InlineComponent,
): ConnectorType {
  if (
    component.componentType === "adapter" ||
    component.componentType === "pigtail"
  ) {
    return component.connectorTo;
  }
  return "pl259";
}

// ─── Node Connector Resolution ──────────────────────────────────────────────

/**
 * Get the output connector type of a chain node (the connector facing downstream).
 *
 * - Radio: defaults to pl259 (most HF transceivers use SO-239/PL-259)
 * - Accessory: signal-path accessories are in-line; defaults to pl259
 * - FeedlineRun: output = far-end connector (connectorTypeFarEnd ?? connectorType).
 *   If the run has inline components, the output is the last component's output.
 * - Antenna: antennas don't have an output (they're the terminal node), returns null.
 */
export function getNodeOutputConnector(
  node: ChainNode,
  data: ChainEquipmentData,
  chain: StationChain | { feedlineRuns: FeedlineRun[] },
): ConnectorType | null {
  switch (node.type) {
    case "radio": {
      // Most HF radios use SO-239 (mated by PL-259)
      // RadioEquipment doesn't carry an explicit connector field,
      // so we default to pl259 which covers the vast majority of rigs.
      return "pl259";
    }

    case "accessory": {
      const accessory = findAccessory(node.accessoryId, data);
      if (!accessory) return null;
      // Signal-path accessories (amp, tuner, filter, switch) are in-line RF devices
      // with SO-239 jacks on both sides in the typical case
      return "pl259";
    }

    case "feedline_run": {
      const run = findFeedlineRun(node.feedlineRunId, chain);
      if (!run) return null;

      // If the run has inline components, the output connector
      // is determined by the last inline component
      if (run.inlineComponentIds.length > 0) {
        const lastComponentId =
          run.inlineComponentIds[run.inlineComponentIds.length - 1];
        const component = data.inlineComponents.find(
          (c) => c.id === lastComponentId,
        );
        if (component) {
          return getInlineComponentOutputConnector(component);
        }
      }

      const feedline = findFeedline(run.feedlineId, data);
      if (!feedline) return null;
      // Far-end connector; falls back to near-end if not explicitly set
      return feedline.connectorTypeFarEnd ?? feedline.connectorType;
    }

    case "antenna": {
      // Antennas are terminal — no output connector
      return null;
    }
  }
}

/**
 * Get the input connector type of a chain node (the connector facing upstream).
 *
 * - Radio: radios don't have an input (they're the source node), returns null.
 * - Accessory: signal-path accessories are in-line; defaults to pl259
 * - FeedlineRun: input = near-end connector (connectorType).
 *   If the run has inline components, the input is the first component's input.
 * - Antenna: defaults to pl259 for most HF antennas, n_type for VHF/UHF.
 */
export function getNodeInputConnector(
  node: ChainNode,
  data: ChainEquipmentData,
  chain: StationChain | { feedlineRuns: FeedlineRun[] },
): ConnectorType | null {
  switch (node.type) {
    case "radio": {
      // Radios are the source — no input connector
      return null;
    }

    case "accessory": {
      const accessory = findAccessory(node.accessoryId, data);
      if (!accessory) return null;
      return "pl259";
    }

    case "feedline_run": {
      const run = findFeedlineRun(node.feedlineRunId, chain);
      if (!run) return null;

      // If the run has inline components, the input connector
      // is determined by the first inline component
      if (run.inlineComponentIds.length > 0) {
        const firstComponentId = run.inlineComponentIds[0];
        const component = data.inlineComponents.find(
          (c) => c.id === firstComponentId,
        );
        if (component) {
          return getInlineComponentInputConnector(component);
        }
      }

      const feedline = findFeedline(run.feedlineId, data);
      if (!feedline) return null;
      return feedline.connectorType;
    }

    case "antenna": {
      const antenna = findAntenna(node.antennaId, data);
      if (!antenna) return null;
      // Most HF antennas use SO-239/PL-259 at the feedpoint.
      // Wire antennas often use binding posts.
      // Default to pl259 for standard antennas.
      const wireTypes = new Set([
        "efhw",
        "wire_random",
        "wire_zepp",
        "wire_inverted_v",
        "g5rv",
        "beverage",
        "rhombic",
      ]);
      const balancedTypes = new Set([
        "magnetic_loop",
        "full_loop",
        "delta_loop",
        "fan_dipole",
      ]);

      if (wireTypes.has(antenna.antennaType)) {
        return "binding_post";
      }
      if (balancedTypes.has(antenna.antennaType)) {
        return "binding_post";
      }
      // Dish and helical often use N-type
      if (antenna.antennaType === "dish" || antenna.antennaType === "helical") {
        return "n_type";
      }
      return "pl259";
    }
  }
}

// ─── Compatibility Checks ───────────────────────────────────────────────────

/**
 * Check whether two connector types are physically compatible.
 */
export function checkConnectorCompatibility(
  connA: ConnectorType,
  connB: ConnectorType,
): { compatible: boolean; connA: ConnectorType; connB: ConnectorType } {
  const compatible = CONNECTOR_COMPATIBILITY[connA].includes(connB);
  return { compatible, connA, connB };
}

/**
 * Result of checking compatibility between two adjacent chain nodes.
 */
export interface CompatibilityResult {
  /** Index of the first node in the pair */
  fromIndex: number;
  /** Index of the second node in the pair */
  toIndex: number;
  /** Output connector of the first node */
  fromConnector: ConnectorType | null;
  /** Input connector of the second node */
  toConnector: ConnectorType | null;
  /** Whether the connectors are compatible */
  compatible: boolean;
}

/**
 * Walk the entire signal chain and check connector compatibility at each junction.
 *
 * Returns one CompatibilityResult for each pair of adjacent nodes.
 * If either connector is null (e.g., missing equipment data), the junction
 * is marked as incompatible so the user is alerted to resolve it.
 */
export function checkChainCompatibility(
  chain: StationChain,
  data: ChainEquipmentData,
): CompatibilityResult[] {
  const results: CompatibilityResult[] = [];

  for (let i = 0; i < chain.nodes.length - 1; i++) {
    const fromNode = chain.nodes[i];
    const toNode = chain.nodes[i + 1];

    const fromConnector = getNodeOutputConnector(fromNode, data, chain);
    const toConnector = getNodeInputConnector(toNode, data, chain);

    let compatible = false;
    if (fromConnector !== null && toConnector !== null) {
      compatible = CONNECTOR_COMPATIBILITY[fromConnector].includes(toConnector);
    }

    results.push({
      fromIndex: i,
      toIndex: i + 1,
      fromConnector,
      toConnector,
      compatible,
    });
  }

  return results;
}
