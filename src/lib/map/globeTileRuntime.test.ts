import { describe, expect, it } from "vitest";
import { resolveDisplayQuality } from "./displayQuality";
import {
  applyGlobeTileRuntimeBudget,
  readGlobeTileRuntimeSnapshot,
  resolveGlobeTileRuntimeBudget,
  type GlobeTileRendererRuntime,
} from "./globeTileRuntime";

function renderer(): GlobeTileRendererRuntime {
  return {
    lruCache: {
      minSize: 6000,
      maxSize: 8000,
      minBytesSize: 0.3 * 1024 ** 3,
      maxBytesSize: 0.4 * 1024 ** 3,
      unloadPercent: 0.05,
    },
    downloadQueue: { maxJobs: 25 },
    parseQueue: { maxJobs: 5 },
    processNodeQueue: { maxJobs: 25 },
    loadSiblings: true,
    optimizedLoadStrategy: false,
    maxTilesProcessed: 250,
  };
}

describe("globe tile runtime budgets", () => {
  it("keeps the transparent label renderer inside a smaller secondary budget", () => {
    const settings = resolveDisplayQuality("uhd");
    const imagery = resolveGlobeTileRuntimeBudget(settings, "imagery");
    const labels = resolveGlobeTileRuntimeBudget(settings, "labels");

    expect(labels.maxCacheTiles).toBe(imagery.maxCacheTiles / 2);
    expect(labels.maxCacheBytes).toBe(imagery.maxCacheBytes / 2);
    expect(labels.downloadJobs).toBeLessThan(imagery.downloadJobs);
    expect(labels.maxTilesProcessed).toBeLessThan(
      imagery.maxTilesProcessed,
    );
  });

  it("replaces library-wide defaults with app-owned visible-surface limits", () => {
    const target = renderer();
    const budget = resolveGlobeTileRuntimeBudget(
      resolveDisplayQuality("auto", {
        cssWidth: 1280,
        cssHeight: 720,
        devicePixelRatio: 1,
        saveData: false,
      }),
      "imagery",
    );

    applyGlobeTileRuntimeBudget(target, budget);

    expect(target.lruCache.maxSize).toBe(700);
    expect(target.lruCache.maxBytesSize).toBe(192 * 1024 * 1024);
    expect(target.downloadQueue.maxJobs).toBe(10);
    expect(target.maxTilesProcessed).toBe(200);
    expect(target.loadSiblings).toBe(false);
    expect(target.optimizedLoadStrategy).toBe(true);
  });

  it("reports imagery and label queue states through one stable contract", () => {
    const target = renderer();
    target.visibleTiles = { size: 12 };
    target.activeTiles = { size: 18 };
    target.stats = {
      inCache: 90,
      queued: 4,
      downloading: 3,
      parsing: 2,
      loaded: 24,
      failed: 1,
    };

    expect(readGlobeTileRuntimeSnapshot(target)).toEqual({
      visible: 12,
      active: 18,
      cached: 90,
      queued: 4,
      downloading: 3,
      parsing: 2,
      decoded: 24,
      failed: 1,
    });
  });
});
