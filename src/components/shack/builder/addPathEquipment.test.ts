import { beforeEach, describe, expect, it } from "vitest";
import { useShackStore } from "@/stores/shackStore";
import { MAX_CHAIN_NODES, type StationChain } from "@/types/stationChain";
import { addPathEquipment } from "./addPathEquipment";

const initial = useShackStore.getState();
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
beforeEach(() =>
  useShackStore.setState({
    ...initial,
    stationChains: [structuredClone(chain)],
  }),
);
describe("equipment placement UI commands", () => {
  it("honors the selected gap instead of silently applying category ordering", () => {
    expect(addPathEquipment("path", "radio", "second-radio", 0)).toEqual({
      ok: true,
    });
    expect(useShackStore.getState().stationChains[0].nodes).toEqual([
      { type: "radio", radioId: "second-radio" },
      ...chain.nodes,
    ]);
  });
  it("places a cable run at the requested gap with its matching run record", () => {
    expect(addPathEquipment("path", "feedline", "cable", 0)).toEqual({
      ok: true,
    });
    const saved = useShackStore.getState().stationChains[0];
    expect(saved.feedlineRuns).toHaveLength(1);
    expect(saved.feedlineRuns[0]).toMatchObject({
      feedlineId: "cable",
      inlineComponentIds: [],
    });
    expect(saved.nodes).toEqual([
      { type: "feedline_run", feedlineRunId: saved.feedlineRuns[0].id },
      ...chain.nodes,
    ]);
  });
  it("retains automatic radio and cable placement when no gap is requested", () => {
    expect(addPathEquipment("path", "feedline", "cable")).toEqual({ ok: true });
    expect(
      useShackStore.getState().stationChains[0].nodes.map((node) => node.type),
    ).toEqual(["radio", "feedline_run", "antenna"]);
  });
  it.each(["radio", "feedline"])(
    "reports the node limit for %s without a partial insertion",
    (type) => {
      useShackStore.setState({
        stationChains: [
          {
            ...chain,
            nodes: Array.from(
              { length: MAX_CHAIN_NODES },
              () => chain.nodes[0],
            ),
          },
        ],
      });
      const before = useShackStore.getState().stationChains;
      expect(addPathEquipment("path", type, "extra", 0)).toMatchObject({
        ok: false,
      });
      expect(useShackStore.getState().stationChains).toBe(before);
    },
  );
  it("rejects a disappeared gap rather than moving the equipment elsewhere", () => {
    expect(addPathEquipment("path", "feedline", "cable", 9)).toMatchObject({
      ok: false,
    });
    expect(useShackStore.getState().stationChains[0]).toEqual(chain);
  });
});
