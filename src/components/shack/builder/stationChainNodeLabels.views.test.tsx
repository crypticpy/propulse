import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RadioEquipment } from "@/types/radio";
import type { UserAntenna, UserFeedline, UserAccessory } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import { useShackStore } from "@/stores/shackStore";
import { BuilderCanvas } from "./BuilderCanvas";
import { ShackSchematicView } from "./ShackSchematicView";
import { deriveStationChainNodeLabels } from "./stationChainNodeLabels";

vi.mock("@/hooks/useChainPerformance", () => ({
  useChainPerformance: () => ({ bands: [] }),
}));

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const initial = useShackStore.getState();
const addedAt = "2026-09-06T00:00:00Z";

const equipment: RadioEquipment = {
  id: "eq-1",
  displayName: "IC-7300",
  manufacturer: "Icom",
  model: "IC-7300",
  receiver: {
    rmdr: 90,
    imdr3: 85,
    blockingGain: 120,
    sensitivity: 0.2,
    noiseFloorDbm: -135,
  },
  maxPower: 100,
  minPower: 1,
  modes: ["SSB"],
  bands: ["20m"],
  tier: "midrange",
};

const antenna: UserAntenna = {
  id: "ant-1",
  name: "Yagi One",
  antennaType: "yagi_3el",
  gainPatternType: "yagi_3el",
  bands: ["20m"],
  heightMeters: 10,
  polarization: "horizontal",
  mounting: "tower",
  addedAt,
};

const accessory: UserAccessory = {
  id: "acc-1",
  name: "Amp One",
  category: "amplifier",
  maxPowerWatts: 500,
  gainDb: 10,
  addedAt,
};

const feedline: UserFeedline = {
  id: "fl-1",
  name: "LMR Run",
  feedlineType: "lmr400",
  lengthFeet: 50,
  connectorCount: 2,
  connectorType: "pl259",
  condition: "good",
  addedAt,
};

const chain: StationChain = {
  id: "path",
  name: "Home HF",
  nodes: [
    { type: "radio", radioId: "radio-1" },
    { type: "accessory", accessoryId: "acc-1" },
    { type: "feedline_run", feedlineRunId: "run-1" },
    { type: "antenna", antennaId: "ant-1" },
  ],
  feedlineRuns: [{ id: "run-1", feedlineId: "fl-1", inlineComponentIds: [] }],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: addedAt,
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  useShackStore.setState({
    ...initial,
    radios: [
      {
        id: "radio-1",
        equipmentId: "eq-1",
        nickname: "Desk",
        addedAt,
      },
    ],
    customRadios: [equipment],
    antennas: [antenna],
    accessories: [accessory],
    feedlines: [feedline],
    inlineComponents: [],
    stationChains: [structuredClone(chain)],
    activeChainId: chain.id,
  });
});

afterEach(() => {
  useShackStore.setState(initial);
});

describe("builder and schematic render the same node labels", () => {
  it("shows the shared labels on both surfaces for a nicknamed radio, accessory, feedline and antenna", () => {
    const state = useShackStore.getState();
    const expected = deriveStationChainNodeLabels(chain, {
      radios: [
        {
          userRadio: state.radios[0],
          equipment: state.customRadios[0],
        },
      ],
      accessories: state.accessories,
      antennas: state.antennas,
      feedlines: state.feedlines,
    });
    expect(expected.map((entry) => entry.label)).toEqual([
      "Desk",
      "Amp One",
      "LMR Run",
      "Yagi One",
    ]);

    const builder = render(
      <BuilderCanvas
        chain={chain}
        selectedNodeIndex={null}
        onSelectNode={() => {}}
        onDropEquipment={() => {}}
        selectedBand="20m"
        showGroundBus={false}
      />,
    );
    for (const { label } of expected) {
      expect(builder.getByText(label)).toBeTruthy();
    }
    builder.unmount();

    render(<ShackSchematicView selectedBand="20m" />);
    for (const { label } of expected) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
