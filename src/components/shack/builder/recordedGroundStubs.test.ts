import { describe, expect, it } from "vitest";
import type { StationChain } from "@/types/stationChain";
import {
  buildRecordedGroundStubs,
  recordedBondNodeIndexes,
} from "./recordedGroundStubs";

const layout = { x: 10, y: 20, width: 220, height: 130 };

const chain: StationChain = {
  id: "path",
  name: "Home HF",
  nodes: [
    { type: "radio", radioId: "radio" },
    { type: "antenna", antennaId: "antenna" },
  ],
  feedlineRuns: [],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: "2026-09-06T00:00:00Z",
};

describe("recorded ground stubs (#373)", () => {
  it("does not invent Chassis GND stubs for an unrecorded radio path", () => {
    const recorded = recordedBondNodeIndexes(chain);
    expect(recorded.size).toBe(0);
    expect(
      buildRecordedGroundStubs(chain.nodes, [layout, layout], recorded),
    ).toEqual([]);
  });

  it("emits a stub only for a node with a recorded bond", () => {
    expect(
      buildRecordedGroundStubs(chain.nodes, [layout, layout], new Set([0])),
    ).toEqual([
      {
        nodeX: layout.x + layout.width / 2,
        nodeBottomY: layout.y + layout.height,
        label: "Chassis GND",
      },
    ]);
  });
});
