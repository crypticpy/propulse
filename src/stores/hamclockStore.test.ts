import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HAMCLOCK_RELIABILITY,
  migrateHamClockState,
  useHamClockStore,
} from "./hamclockStore";

const originalState = useHamClockStore.getState();

describe("hamclockStore panel defaults", () => {
  beforeEach(() => {
    localStorage.clear();
    useHamClockStore.setState(originalState, true);
  });

  it("opens an absent panel that renders collapsed by default on first toggle", () => {
    useHamClockStore.getState().togglePanel("contests", true);

    expect(useHamClockStore.getState().panelCollapsed.contests).toBe(false);
  });

  it("preserves the expanded-by-default behavior of existing panels", () => {
    useHamClockStore.getState().togglePanel("bands");

    expect(useHamClockStore.getState().panelCollapsed.bands).toBe(true);
  });

  it("updates enhanced reliability inputs without replacing other fields", () => {
    useHamClockStore.getState().setReliability({ mode: "CW", powerWatts: 25 });

    expect(useHamClockStore.getState().reliability).toEqual({
      ...DEFAULT_HAMCLOCK_RELIABILITY,
      mode: "CW",
      powerWatts: 25,
    });
  });

  it("adds enhanced reliability defaults while migrating v1 state", () => {
    const migrated = migrateHamClockState(
      {
        spotsSide: "left",
        panelCollapsed: { bands: true },
        spotsSidebarCollapsed: true,
        infoSidebarCollapsed: false,
      },
      1,
    );

    expect(migrated.spotsSide).toBe("left");
    expect(migrated.panelCollapsed).toEqual({ bands: true });
    expect(migrated.reliability).toEqual(DEFAULT_HAMCLOCK_RELIABILITY);
  });

  it("repairs corrupt same-version wall preferences", () => {
    const migrated = migrateHamClockState(
      {
        spotsSide: "middle",
        panelCollapsed: { bands: true, contests: "yes" },
        spotsSidebarCollapsed: "yes",
        infoSidebarCollapsed: null,
        reliability: {
          mode: "AM",
          powerWatts: 999,
          antennaType: "random-wire",
        },
      },
      2,
    );

    expect(migrated).toEqual({
      spotsSide: "right",
      panelCollapsed: { bands: true },
      spotsSidebarCollapsed: false,
      infoSidebarCollapsed: false,
      reliability: DEFAULT_HAMCLOCK_RELIABILITY,
    });
  });
});
