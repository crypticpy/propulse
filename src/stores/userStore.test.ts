import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});
import { useProfileStore } from "./profileStore";
import { useShackStore } from "./shackStore";
import { useUserStore } from "./userStore";

const originalProfileState = useProfileStore.getState();

describe("userStore bridge subscriptions", () => {
  beforeEach(() => {
    useProfileStore.setState(originalProfileState, true);
  });

  afterEach(() => {
    useProfileStore.setState(originalProfileState, true);
  });

  it("ignores unrelated profile updates but publishes station changes", () => {
    let notifications = 0;
    const unsubscribe = useUserStore.subscribe(() => {
      notifications += 1;
    });

    const currentProfile = useProfileStore.getState();
    useProfileStore.setState({
      operatorRank: {
        ...currentProfile.operatorRank,
        rankPoints: currentProfile.operatorRank.rankPoints + 1,
      },
    });
    expect(notifications).toBe(0);

    useProfileStore.setState({
      station: {
        callsign: "N0QA",
        operatorName: "Propagation QA",
        homeLocationId: "qa-home",
        activeLocationId: null,
        savedLocations: [{
          id: "qa-home",
          name: "Austin Test Station",
          grid: "EM10",
          lat: 30.2672,
          lon: -97.7431,
          timezone: "America/Chicago",
          type: "home",
          createdAt: "2026-07-17T00:00:00Z",
        }],
        grid: "EM10",
        lat: 30.2672,
        lon: -97.7431,
        timezone: "America/Chicago",
      },
    });
    expect(notifications).toBe(1);

    unsubscribe();
  });

  it("does not publish an identical rank update", () => {
    let notifications = 0;
    const unsubscribe = useProfileStore.subscribe(() => {
      notifications += 1;
    });
    const { operatorRank, updateRankData } = useProfileStore.getState();

    updateRankData({ rankPoints: operatorRank.rankPoints });

    expect(notifications).toBe(0);
    unsubscribe();
  });
});

describe("userStore.resetPreferences gear tombstones (#326)", () => {
  const originalShackState = useShackStore.getState();

  afterEach(() => {
    useShackStore.setState(originalShackState, true);
  });

  it("tombstones existing radios and custom radios instead of silently dropping them", () => {
    useShackStore.setState({
      radios: [
        {
          id: "radio-1",
          equipmentId: "ic-7300",
          addedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      customRadios: [{ id: "custom-1", displayName: "Homebrew" } as never],
      pendingGearDeletions: [],
    });

    useUserStore.getState().resetPreferences();

    expect(useShackStore.getState().radios).toEqual([]);
    expect(useShackStore.getState().customRadios).toEqual([]);
    const keys = useShackStore
      .getState()
      .pendingGearDeletions.map((d) => `${d.table}:${d.recordId}`)
      .sort();
    expect(keys).toEqual(["custom_radios:custom-1", "user_radios:radio-1"]);
  });

  it("cascades a reset radio through referencing presets and chain nodes, tombstoning both (#326)", () => {
    useShackStore.setState({
      radios: [
        {
          id: "radio-1",
          equipmentId: "ic-7300",
          addedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      customRadios: [],
      activeRadioId: "radio-1",
      stationPresets: [
        {
          id: "preset-1",
          name: "Preset 1",
          radioId: "radio-1",
          antennaId: "",
          accessoryIds: [],
          operatingPowerWatts: 100,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activePresetId: "preset-1",
      stationChains: [
        {
          id: "chain-1",
          name: "Chain 1",
          nodes: [{ type: "radio", radioId: "radio-1" }],
          feedlineRuns: [],
          operatingPowerWatts: 100,
          shackAccessoryIds: [],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      pendingGearDeletions: [],
    });

    useUserStore.getState().resetPreferences();

    expect(useShackStore.getState().stationPresets).toEqual([]);
    expect(useShackStore.getState().activePresetId).toBeNull();
    expect(useShackStore.getState().stationChains[0].nodes).toEqual([]);
    const keys = useShackStore
      .getState()
      .pendingGearDeletions.map((d) => `${d.table}:${d.recordId}`)
      .sort();
    expect(keys).toEqual(
      ["user_radios:radio-1", "station_presets:preset-1"].sort(),
    );
  });
});
