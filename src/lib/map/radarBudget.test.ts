import { describe, expect, it } from "vitest";
import {
  radarRawTextureBytes,
  radarRequestBudget,
  RADAR_TEXTURE_BUDGET,
  selectInitialRadarFrameIndex,
} from "@/lib/map/radarBudget";

describe("PropSphere radar resource budget", () => {
  it("stays within the global overlay request and texture limits", () => {
    expect(RADAR_TEXTURE_BUDGET).toEqual({
      zoom: 2,
      tilesPerAxis: 4,
      tileSize: 256,
      maxFrames: 5,
    });
    expect(radarRequestBudget()).toBe(80);
    expect(radarRawTextureBytes()).toBe(20 * 1024 * 1024);
  });

  it("selects a bounded observation and handles an empty manifest", () => {
    expect(selectInitialRadarFrameIndex([], 0)).toBeUndefined();
    expect(selectInitialRadarFrameIndex([7, 8, 9, 10, 11], 10)).toBe(9);
    expect(selectInitialRadarFrameIndex([10, 11], 0)).toBe(11);
  });
});
