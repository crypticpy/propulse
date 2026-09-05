import { describe, expect, it } from "vitest";
import { findDuplicateTile } from "@/lib/hamclock/wallPages";
import { railLayoutPageSlots } from "@/stores/hamclockDisplayStore";
import { HAMCLOCK_WALL_PAGES } from "./pages";
import {
  LIVING_ROOM_PRESET_ID,
  STATION_DEPENDENT_TILE_IDS,
  WALL_PRESETS,
} from "./presets";
import { WALL_TILES } from "./tiles";

const KNOWN_PAGE_IDS = new Set(HAMCLOCK_WALL_PAGES.map((p) => p.id));

describe("WALL_PRESETS (wall spec §7)", () => {
  it("ships exactly the five named presets, in table order", () => {
    expect(WALL_PRESETS.map((p) => p.name)).toEqual([
      "Radio",
      "Weather wall",
      "News & Earth",
      "Space weather",
      "Living room",
    ]);
  });

  it("has a unique, stable id for every preset", () => {
    const ids = WALL_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only tile ids registered in WALL_TILES", () => {
    for (const preset of WALL_PRESETS) {
      for (const side of ["left", "right"] as const) {
        for (const page of preset.layout[side]) {
          for (const tileId of page.tileIds) {
            expect(WALL_TILES[tileId as keyof typeof WALL_TILES]).toBeDefined();
          }
        }
      }
    }
  });

  it("uses only page ids that exist in HAMCLOCK_WALL_PAGES (so a chosen preset survives sanitizeRailLayout)", () => {
    for (const preset of WALL_PRESETS) {
      for (const side of ["left", "right"] as const) {
        for (const page of preset.layout[side]) {
          expect(KNOWN_PAGE_IDS.has(page.pageId)).toBe(true);
        }
      }
    }
  });

  it("never places the same tile twice on one page, on either rail", () => {
    for (const preset of WALL_PRESETS) {
      expect(findDuplicateTile(railLayoutPageSlots(preset.layout))).toBeNull();
    }
  });

  it("gives every preset at least one page on each rail", () => {
    for (const preset of WALL_PRESETS) {
      expect(preset.layout.left.length).toBeGreaterThan(0);
      expect(preset.layout.right.length).toBeGreaterThan(0);
    }
  });

  it("Living room places no station-dependent tile (HW-53)", () => {
    const livingRoom = WALL_PRESETS.find((p) => p.id === LIVING_ROOM_PRESET_ID);
    expect(livingRoom).toBeDefined();
    const placed = [
      ...livingRoom!.layout.left.flatMap((page) => page.tileIds),
      ...livingRoom!.layout.right.flatMap((page) => page.tileIds),
    ];
    for (const stationTileId of STATION_DEPENDENT_TILE_IDS) {
      expect(placed).not.toContain(stationTileId);
    }
  });

  it("disables auto-page only for Living room", () => {
    for (const preset of WALL_PRESETS) {
      expect(preset.autoPage.enabled).toBe(preset.id !== LIVING_ROOM_PRESET_ID);
      expect(preset.autoPage.dwellSeconds).toBeGreaterThan(0);
    }
  });
});
