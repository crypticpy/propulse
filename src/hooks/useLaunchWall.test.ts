import { describe, expect, it } from "vitest";

import { assignScenesToScreens, buildKioskUrl } from "./useLaunchWall";

describe("buildKioskUrl", () => {
  it("builds an auto-start deep link", () => {
    expect(buildKioskUrl("abc-123")).toBe("/kiosk?start=1&scene=abc-123");
  });

  it("encodes scene ids safely", () => {
    expect(buildKioskUrl("a b&c")).toBe("/kiosk?start=1&scene=a%20b%26c");
  });
});

describe("assignScenesToScreens", () => {
  const scenes = ["solar", "map", "dx"];

  it("gives each screen its own scene when counts match", () => {
    expect(assignScenesToScreens(scenes, 3)).toEqual(["solar", "map", "dx"]);
  });

  it("repeats scenes round-robin when screens outnumber scenes", () => {
    expect(assignScenesToScreens(scenes, 5)).toEqual([
      "solar",
      "map",
      "dx",
      "solar",
      "map",
    ]);
  });

  it("uses only the first scenes when screens are scarce", () => {
    expect(assignScenesToScreens(scenes, 2)).toEqual(["solar", "map"]);
  });

  it("returns empty for no scenes or no screens", () => {
    expect(assignScenesToScreens([], 3)).toEqual([]);
    expect(assignScenesToScreens(scenes, 0)).toEqual([]);
  });
});
