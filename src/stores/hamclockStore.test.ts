import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAMCLOCK_RELIABILITY,
  migrateHamClockState,
} from "@/stores/hamclockStore";
import {
  HAMCLOCK_ENTER_LAYERS,
  HAMCLOCK_MODE_LAYERS,
} from "@/lib/hamclock/modePresets";

describe("hamclockStore migrations", () => {
  it("adds mode preferences on v3 migrate and crawl flags on v4", () => {
    const migrated = migrateHamClockState(
      {
        spotsSide: "left",
        panelCollapsed: { de: true },
        spotsSidebarCollapsed: false,
        infoSidebarCollapsed: true,
        reliability: { ...DEFAULT_HAMCLOCK_RELIABILITY },
      },
      2,
    );

    expect(migrated.hamclockMode).toBe("traffic");
    expect(migrated.preferredViewMode).toBe("flat");
    expect(migrated.bandFocus).toEqual([]);
    expect(migrated.crawlHamNews).toBe(true);
    expect(migrated.crawlWorldNews).toBe(true);
    expect(migrated.spotsSide).toBe("left");
  });
});

describe("HamClock mode layer presets", () => {
  it("enables footprints for satellites mode", () => {
    expect(HAMCLOCK_MODE_LAYERS.satellites.satellites).toBe(true);
    expect(HAMCLOCK_MODE_LAYERS.satellites.satelliteFootprints).toBe(true);
    expect(HAMCLOCK_MODE_LAYERS.satellites.spots).toBe(false);
  });

  it("keeps traffic map-first with MUF and spots", () => {
    expect(HAMCLOCK_ENTER_LAYERS.spots).toBe(true);
    expect(HAMCLOCK_ENTER_LAYERS.muf).toBe(true);
    expect(HAMCLOCK_ENTER_LAYERS.terminator).toBe(true);
  });

  it("turns on weather alerts for weather mode", () => {
    expect(HAMCLOCK_MODE_LAYERS.weather.weather).toBe(true);
    expect(HAMCLOCK_MODE_LAYERS.weather.lightning).toBe(true);
  });
});

it("migrates Bands into Activity while retaining the selected bands", () => {
  expect(
    migrateHamClockState({ hamclockMode: "bands", bandFocus: ["20m"] }, 4),
  ).toMatchObject({ hamclockMode: "traffic", bandFocus: ["20m"] });
});
