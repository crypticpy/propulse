import { describe, expect, it } from "vitest";
import {
  radarRawTextureBytes,
  radarRequestBudget,
  RADAR_TEXTURE_BUDGET,
} from "./radarBudget";

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
});
