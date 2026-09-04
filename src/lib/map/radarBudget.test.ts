import { describe, expect, it } from "vitest";
import {
  radarRawTextureBytes,
  radarRequestBudget,
  RADAR_TEXTURE_BUDGET,
  selectInitialRadarFrameIndex,
  selectRadarFramesToLoad,
} from "@/lib/map/radarBudget";

describe("PropSphere radar resource budget", () => {
  it("stays within the global overlay request and texture limits", () => {
    expect(RADAR_TEXTURE_BUDGET).toEqual({
      zoom: 3,
      tilesPerAxis: 8,
      tileSize: 256,
      maxFrames: 3,
    });
    expect(radarRequestBudget()).toBe(192);
    expect(radarRawTextureBytes()).toBe(48 * 1024 * 1024);
  });

  it("selects a bounded observation and handles an empty manifest", () => {
    expect(selectInitialRadarFrameIndex([], 0)).toBeUndefined();
    expect(selectInitialRadarFrameIndex([7, 8, 9, 10, 11], 10)).toBe(9);
    expect(selectInitialRadarFrameIndex([10, 11], 0)).toBe(11);
  });

  it("reserves the latest observation when nowcast would crowd the budget", () => {
    // 10 past + 3 nowcast, maxFrames 3: must include index 9 (latest past)
    expect(selectRadarFramesToLoad(13, 10, 3)).toEqual([9, 11, 12]);
    expect(selectRadarFramesToLoad(10, 10, 3)).toEqual([7, 8, 9]);
    expect(selectRadarFramesToLoad(5, 0, 3)).toEqual([2, 3, 4]);
    expect(selectRadarFramesToLoad(2, 2, 3)).toEqual([0, 1]);
  });
});
