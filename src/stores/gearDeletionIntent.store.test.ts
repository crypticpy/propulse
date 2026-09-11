import { beforeEach, describe, expect, it } from "vitest";
import type { UserAccessory, UserAntenna, StationPreset } from "@/types/shack";
import type { UserRadio } from "@/types/radio";

const { useShackStore } = await import("./shackStore");

function accessory(id: string): UserAccessory {
  return {
    id,
    name: `Accessory ${id}`,
    category: "tuner",
    addedAt: "2026-01-01T00:00:00.000Z",
  } as UserAccessory;
}

function radio(id: string, equipmentId = "ic-7300"): UserRadio {
  return { id, equipmentId, addedAt: "2026-01-01T00:00:00.000Z" };
}

function antenna(id: string): UserAntenna {
  return { id, name: `Antenna ${id}` } as UserAntenna;
}

function preset(id: string, overrides: Partial<StationPreset> = {}): StationPreset {
  return {
    id,
    name: `Preset ${id}`,
    radioId: "",
    antennaId: "",
    accessoryIds: [],
    operatingPowerWatts: 100,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  useShackStore.setState({
    radios: [],
    antennas: [],
    customRadios: [],
    stationPresets: [],
    stationChains: [],
    accessories: [],
    activeRadioId: null,
    activePresetId: null,
    activeChainId: null,
    pendingGearDeletions: [],
  });
});

describe("shackStore gear deletion intents (#326)", () => {
  it("records a pending deletion when gear is removed locally", () => {
    useShackStore.setState({ accessories: [accessory("acc-1")] });

    useShackStore.getState().removeAccessory("acc-1");

    expect(useShackStore.getState().accessories).toEqual([]);
    expect(useShackStore.getState().pendingGearDeletions).toEqual([
      expect.objectContaining({
        table: "accessories",
        recordId: "acc-1",
      }),
    ]);
  });

  it("keeps pending deletions across reload until ack", () => {
    useShackStore.setState({
      accessories: [accessory("acc-1")],
      pendingGearDeletions: [],
    });
    useShackStore.getState().removeAccessory("acc-1");

    useShackStore
      .getState()
      .acknowledgeGearDeletions(["accessories:acc-2"], "");
    expect(useShackStore.getState().pendingGearDeletions).toHaveLength(1);

    useShackStore
      .getState()
      .acknowledgeGearDeletions(["accessories:acc-1"], "");
    expect(useShackStore.getState().pendingGearDeletions).toEqual([]);
  });

  it("removing a radio referenced by two presets enqueues intents for the radio and both orphaned presets (#326)", () => {
    useShackStore.setState({
      radios: [radio("radio-1")],
      stationPresets: [
        preset("preset-1", { radioId: "radio-1" }),
        preset("preset-2", { radioId: "radio-1" }),
        preset("preset-3", { radioId: "other-radio" }),
      ],
    });

    useShackStore.getState().removeRadio("radio-1");

    expect(
      useShackStore.getState().stationPresets.map((p) => p.id),
    ).toEqual(["preset-3"]);
    const keys = useShackStore
      .getState()
      .pendingGearDeletions.map((d) => `${d.table}:${d.recordId}`)
      .sort();
    expect(keys).toEqual(
      [
        "user_radios:radio-1",
        "station_presets:preset-1",
        "station_presets:preset-2",
      ].sort(),
    );
  });

  it("removing an antenna referenced by a preset enqueues intents for the antenna and the orphaned preset (#326)", () => {
    useShackStore.setState({
      antennas: [antenna("ant-1")],
      stationPresets: [
        preset("preset-1", { antennaId: "ant-1" }),
        preset("preset-2", { antennaId: "other-antenna" }),
      ],
    });

    useShackStore.getState().removeAntenna("ant-1");

    expect(
      useShackStore.getState().stationPresets.map((p) => p.id),
    ).toEqual(["preset-2"]);
    const keys = useShackStore
      .getState()
      .pendingGearDeletions.map((d) => `${d.table}:${d.recordId}`)
      .sort();
    expect(keys).toEqual(
      ["antennas:ant-1", "station_presets:preset-1"].sort(),
    );
  });

  it("removing a custom radio cascades through its instances to orphaned presets (#326)", () => {
    useShackStore.setState({
      customRadios: [
        { id: "custom-1", displayName: "Homebrew Rig" } as never,
      ],
      radios: [radio("radio-1", "custom-1")],
      stationPresets: [preset("preset-1", { radioId: "radio-1" })],
    });

    useShackStore.getState().removeCustomRadio("custom-1");

    expect(useShackStore.getState().stationPresets).toEqual([]);
    const keys = useShackStore
      .getState()
      .pendingGearDeletions.map((d) => `${d.table}:${d.recordId}`)
      .sort();
    expect(keys).toEqual(
      [
        "custom_radios:custom-1",
        "user_radios:radio-1",
        "station_presets:preset-1",
      ].sort(),
    );
  });

  it("applyGearRemoval (pulled custom_radios tombstone) removes dependent instances and their preset, and enqueues user_radios + station_presets intents (#326)", () => {
    // Another device tombstoned custom-1 while this device still has two
    // UserRadio instances referencing it and a preset on one of them; the
    // pull-side cascade must clear all of it, not just the definition.
    useShackStore.setState({
      customRadios: [],
      radios: [
        radio("radio-1", "custom-1"),
        radio("radio-2", "custom-1"),
        radio("radio-3", "other-custom"),
      ],
      stationPresets: [
        preset("preset-1", { radioId: "radio-1" }),
        preset("preset-2", { radioId: "radio-3" }),
      ],
      activeRadioId: "radio-1",
    });

    useShackStore
      .getState()
      .applyGearRemoval("custom_radios", ["custom-1"], "user-1");

    expect(useShackStore.getState().radios.map((r) => r.id)).toEqual([
      "radio-3",
    ]);
    expect(
      useShackStore.getState().stationPresets.map((p) => p.id),
    ).toEqual(["preset-2"]);
    expect(useShackStore.getState().activeRadioId).toBe("radio-3");
    const keys = useShackStore
      .getState()
      .pendingGearDeletions.map((d) => `${d.table}:${d.recordId}`)
      .sort();
    expect(keys).toEqual(
      [
        "user_radios:radio-1",
        "user_radios:radio-2",
        "station_presets:preset-1",
      ].sort(),
    );
  });

  it("applyGearRemoval (pulled tombstone) clears activeRadioId and removes presets referencing the removed radio (#326)", () => {
    useShackStore.setState({
      radios: [],
      activeRadioId: "radio-1",
      stationPresets: [
        preset("preset-1", { radioId: "radio-1" }),
        preset("preset-2", { radioId: "other-radio" }),
      ],
    });

    useShackStore.getState().applyGearRemoval("user_radios", ["radio-1"], "user-1");

    expect(useShackStore.getState().activeRadioId).toBeNull();
    expect(
      useShackStore.getState().stationPresets.map((p) => p.id),
    ).toEqual(["preset-2"]);
    expect(useShackStore.getState().pendingGearDeletions).toEqual([
      expect.objectContaining({
        table: "station_presets",
        recordId: "preset-1",
        ownerId: "user-1",
      }),
    ]);
  });
});
