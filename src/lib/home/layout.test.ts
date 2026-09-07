import { expect, it } from "vitest";
import {
  HOME_LAYOUT_DEFAULT,
  addHomeItem,
  groupHomeLayout,
  isHomeItemAvailable,
  migrateHomePins,
  moveHomeItem,
  moveHomeItemTo,
  readHomeLayout,
  removeHomeItem,
  resetHomeLayout,
} from "./layout";

it("ships Moon, DXpeditions and World clocks by default", () => {
  expect(HOME_LAYOUT_DEFAULT).toEqual([
    "activity", "forecast", "solar", "weather", "daylight", "station", "moon", "dxpeditions", "clocks",
  ]);
});

it("migrates v1 pins by appending them after the defaults without duplicates", () => {
  expect(migrateHomePins(["tides"])).toEqual([...HOME_LAYOUT_DEFAULT, "tides"]);
  expect(migrateHomePins(["moon", "tides", "moon", "invented"])).toEqual([...HOME_LAYOUT_DEFAULT, "tides"]);
  expect(migrateHomePins([])).toEqual([...HOME_LAYOUT_DEFAULT]);
});

it("reads v2 per device, migrates v1 only when v2 is absent, and drops unknown ids", () => {
  const v2 = JSON.stringify({ desktop: ["moon", "activity", "moon", "invented"], mobile: [] });
  expect(readHomeLayout(v2)).toEqual({ desktop: ["moon", "activity"], mobile: [] });

  const v1 = JSON.stringify({ desktop: ["tides"] });
  expect(readHomeLayout(null, v1)).toEqual({
    desktop: [...HOME_LAYOUT_DEFAULT, "tides"],
    mobile: [...HOME_LAYOUT_DEFAULT],
  });
  // A stored v2 device list wins over the legacy pins for that device only.
  expect(readHomeLayout(JSON.stringify({ desktop: ["solar"] }), JSON.stringify({ mobile: ["tides"] }))).toEqual({
    desktop: ["solar"],
    mobile: [...HOME_LAYOUT_DEFAULT, "tides"],
  });
});

it("falls back to the default layout for malformed or missing storage", () => {
  expect(readHomeLayout("{broken", "{broken")).toEqual({
    desktop: [...HOME_LAYOUT_DEFAULT],
    mobile: [...HOME_LAYOUT_DEFAULT],
  });
  expect(readHomeLayout(null, null).desktop).toEqual([...HOME_LAYOUT_DEFAULT]);
});

it("adds, removes and resets without mutating the source list", () => {
  const list = ["activity", "solar"];
  expect(addHomeItem(list, "tides")).toEqual(["activity", "solar", "tides"]);
  expect(addHomeItem(list, "solar")).toBe(list);
  expect(addHomeItem(list, "invented")).toBe(list);
  expect(removeHomeItem(list, "solar")).toEqual(["activity"]);
  expect(list).toEqual(["activity", "solar"]);
  expect(resetHomeLayout()).toEqual([...HOME_LAYOUT_DEFAULT]);
});

it("moves an item by delta and to an index, clamping at the ends", () => {
  const list = ["activity", "forecast", "solar", "moon"];
  expect(moveHomeItem(list, "moon", -1)).toEqual(["activity", "forecast", "moon", "solar"]);
  expect(moveHomeItem(list, "activity", -1)).toBe(list);
  expect(moveHomeItem(list, "moon", 1)).toBe(list);
  expect(moveHomeItem(list, "missing", 1)).toBe(list);
  expect(moveHomeItemTo(list, "moon", 0)).toEqual(["moon", "activity", "forecast", "solar"]);
  expect(moveHomeItemTo(list, "activity", 99)).toEqual(["forecast", "solar", "moon", "activity"]);
});

it("groups consecutive tiles into one grid and breaks the run on a wide item", () => {
  expect(groupHomeLayout(["moon", "clocks", "activity", "solar", "station", "invented"])).toEqual([
    { kind: "grid", ids: ["moon", "clocks"] },
    { kind: "wide", id: "activity" },
    { kind: "grid", ids: ["solar"] },
    { kind: "wide", id: "station" },
  ]);
});

it("hides signed-in-only items from guests", () => {
  expect(isHomeItemAvailable("station", true)).toBe(false);
  expect(isHomeItemAvailable("history", true)).toBe(false);
  expect(isHomeItemAvailable("clocks", true)).toBe(true);
  expect(isHomeItemAvailable("station", false)).toBe(true);
  expect(isHomeItemAvailable("invented", false)).toBe(false);
});
