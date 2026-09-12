import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StationChain } from "@/types/stationChain";
import {
  deriveFeedlineRunInlineLabels,
  deriveStationChainNodeLabels,
  type StationChainLabelCatalogs,
} from "./stationChainNodeLabels";

const dir = dirname(fileURLToPath(import.meta.url));

const chain: StationChain = {
  id: "path",
  name: "Home HF",
  nodes: [
    { type: "radio", radioId: "radio-1" },
    { type: "accessory", accessoryId: "acc-1" },
    { type: "feedline_run", feedlineRunId: "run-1" },
    { type: "antenna", antennaId: "ant-1" },
  ],
  feedlineRuns: [
    {
      id: "run-1",
      feedlineId: "fl-1",
      inlineComponentIds: ["inline-1", "missing-inline"],
    },
  ],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: "2026-09-06T00:00:00Z",
};

const catalogs: StationChainLabelCatalogs = {
  radios: [
    {
      userRadio: { id: "radio-1" },
      equipment: {
        displayName: "IC-7300",
        manufacturer: "Icom",
        model: "IC-7300",
      },
    },
  ],
  accessories: [
    {
      id: "acc-1",
      name: "Amp One",
      category: "amplifier",
    },
  ],
  antennas: [
    {
      id: "ant-1",
      name: "Yagi One",
      antennaType: "yagi_3el",
    },
  ],
  feedlines: [
    {
      id: "fl-1",
      name: "LMR Run",
      feedlineType: "lmr400",
      lengthFeet: 50,
    },
  ],
};

describe("deriveStationChainNodeLabels", () => {
  it("uses equipment display name for a radio with no nickname", () => {
    expect(deriveStationChainNodeLabels(chain, catalogs)[0]).toEqual({
      label: "IC-7300",
      subLabel: "100W",
    });
  });

  it("falls back to manufacturer and model when a radio has no display name", () => {
    const noDisplay: StationChainLabelCatalogs = {
      ...catalogs,
      radios: [
        {
          userRadio: { id: "radio-1" },
          equipment: { manufacturer: "Icom", model: "IC-7300" },
        },
      ],
    };
    expect(deriveStationChainNodeLabels(chain, noDisplay)[0]).toEqual({
      label: "Icom IC-7300",
      subLabel: "100W",
    });
  });

  it("lets a radio nickname override the equipment display name", () => {
    const nicknamed: StationChainLabelCatalogs = {
      ...catalogs,
      radios: [
        {
          userRadio: { id: "radio-1", nickname: "Desk" },
          equipment: {
            displayName: "IC-7300",
            manufacturer: "Icom",
            model: "IC-7300",
          },
        },
      ],
    };
    expect(deriveStationChainNodeLabels(chain, nicknamed)[0]).toEqual({
      label: "Desk",
      subLabel: "100W",
    });
  });

  it("lets a radio nickname override manufacturer and model when display name is absent", () => {
    const nicknamed: StationChainLabelCatalogs = {
      ...catalogs,
      radios: [
        {
          userRadio: { id: "radio-1", nickname: "Desk" },
          equipment: { manufacturer: "Icom", model: "IC-7300" },
        },
      ],
    };
    expect(deriveStationChainNodeLabels(chain, nicknamed)[0].label).toBe(
      "Desk",
    );
  });

  it("does not treat an empty radio nickname as an override", () => {
    const emptyNick: StationChainLabelCatalogs = {
      ...catalogs,
      radios: [
        {
          userRadio: { id: "radio-1", nickname: "" },
          equipment: {
            displayName: "IC-7300",
            manufacturer: "Icom",
            model: "IC-7300",
          },
        },
      ],
    };
    expect(deriveStationChainNodeLabels(chain, emptyNick)[0].label).toBe(
      "IC-7300",
    );
  });

  it("uses the accessory name even when manufacturer and model are set", () => {
    expect(deriveStationChainNodeLabels(chain, catalogs)[1]).toEqual({
      label: "Amp One",
      subLabel: "Amplifier",
    });
  });

  it("uses the antenna name, not manufacturer or type, as the primary label", () => {
    expect(deriveStationChainNodeLabels(chain, catalogs)[3]).toEqual({
      label: "Yagi One",
      subLabel: "Yagi (3 Element)",
    });
  });

  it("uses the feedline name and type plus length as the sub-label", () => {
    expect(deriveStationChainNodeLabels(chain, catalogs)[2]).toEqual({
      label: "LMR Run",
      subLabel: "LMR-400, 50 ft",
    });
  });

  it("keeps Unknown when a node has no matching equipment", () => {
    const empty: StationChainLabelCatalogs = {
      radios: [],
      accessories: [],
      antennas: [],
      feedlines: [],
    };
    expect(deriveStationChainNodeLabels(chain, empty)).toEqual([
      { label: "Unknown", subLabel: "100W" },
      { label: "Unknown", subLabel: undefined },
      { label: "Unknown", subLabel: undefined },
      { label: "Unknown", subLabel: undefined },
    ]);
  });
});

describe("deriveFeedlineRunInlineLabels", () => {
  it("skips missing inline ids and sums insertion loss", () => {
    const data = deriveFeedlineRunInlineLabels(chain.feedlineRuns, [
      {
        id: "inline-1",
        name: "Choke",
        insertionLossDb: 0.3,
      },
    ]);
    expect(data.get("run-1")).toEqual({
      inlineLabels: [{ id: "inline-1", name: "Choke", lossDb: 0.3 }],
      totalLossDb: 0.3,
    });
  });
});

describe("builder and schematic share one derivation", () => {
  it("both components import the shared label function and no longer inline nickname lookup", () => {
    const builder = readFileSync(join(dir, "BuilderCanvas.tsx"), "utf8");
    const schematic = readFileSync(join(dir, "ShackSchematicView.tsx"), "utf8");
    expect(builder).toContain("deriveStationChainNodeLabels");
    expect(schematic).toContain("deriveStationChainNodeLabels");
    expect(builder).not.toContain("userRadio.nickname");
    expect(schematic).not.toContain("userRadio.nickname");
  });
});
