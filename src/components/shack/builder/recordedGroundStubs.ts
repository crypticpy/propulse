import type { StationChain, ChainNode } from "@/types/stationChain";
import type { GroundStub } from "./GroundBusBar";

export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Node indexes with a recorded equipment-to-ground bond.
 *
 * Typed bonding capture is CAN13 (#373). Until that layer exists, no chain
 * node records a bond — radios must not be drawn as earthed.
 */
export function recordedBondNodeIndexes(_chain: StationChain): Set<number> {
  return new Set();
}

/** Stubs for recorded topology only. Unrecorded radios produce none. */
export function buildRecordedGroundStubs(
  nodes: ChainNode[],
  layouts: NodeBox[],
  recordedIndexes: ReadonlySet<number>,
): GroundStub[] {
  const stubs: GroundStub[] = [];
  nodes.forEach((_node, index) => {
    if (!recordedIndexes.has(index)) return;
    const layout = layouts[index];
    if (!layout) return;
    stubs.push({
      nodeX: layout.x + layout.width / 2,
      nodeBottomY: layout.y + layout.height,
      label: "Chassis GND",
    });
  });
  return stubs;
}
