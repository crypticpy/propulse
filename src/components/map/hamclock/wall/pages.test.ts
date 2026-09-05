import { describe, expect, it } from "vitest";
import {
  HAMCLOCK_WALL_PAGES,
  wallPageIndex,
  wallPageTiles,
} from "./pages";
import { WALL_TILES } from "./tiles";

describe("HAMCLOCK_WALL_PAGES", () => {
  it("ships the five approved pages in order", () => {
    expect(HAMCLOCK_WALL_PAGES.map((p) => p.id)).toEqual([
      "spots",
      "solar",
      "forecast",
      "weather",
      "sdr",
    ]);
    expect(HAMCLOCK_WALL_PAGES.map((p) => p.title)).toEqual([
      "Spots & Activity",
      "Solar & Space Wx",
      "Forecast",
      "Weather & Emergency",
      "SDR",
    ]);
  });

  it("references only registered tiles and fills both rails", () => {
    for (const page of HAMCLOCK_WALL_PAGES) {
      expect(page.left.length).toBeGreaterThan(0);
      expect(page.right.length).toBeGreaterThan(0);
      for (const id of [...page.left, ...page.right]) {
        expect(WALL_TILES[id]).toBeDefined();
        expect(WALL_TILES[id].title.length).toBeGreaterThan(0);
      }
    }
  });

  it("never repeats a tile within one rail", () => {
    for (const page of HAMCLOCK_WALL_PAGES) {
      expect(new Set(page.left).size).toBe(page.left.length);
      expect(new Set(page.right).size).toBe(page.right.length);
    }
  });

  it("never places the same tile on both rails of a page (one tile, one place)", () => {
    for (const page of HAMCLOCK_WALL_PAGES) {
      const combined = [...page.left, ...page.right];
      expect(new Set(combined).size).toBe(combined.length);
    }
  });

  it("changes the right rail's composition from page to page, not just the left", () => {
    // The shipped bug pinned Band activity to the right rail on most pages;
    // the fix means the right rail's tile set actually varies by page.
    const rightSets = HAMCLOCK_WALL_PAGES.map((page) =>
      [...page.right].sort().join(","),
    );
    expect(new Set(rightSets).size).toBeGreaterThan(1);
  });
});

describe("wallPageIndex", () => {
  it("clamps stale or invalid persisted indexes back into range", () => {
    expect(wallPageIndex(0)).toBe(0);
    expect(wallPageIndex(4)).toBe(4);
    expect(wallPageIndex(5)).toBe(0);
    expect(wallPageIndex(-3)).toBe(0);
    expect(wallPageIndex(1.5)).toBe(0);
  });

  it("resolves tiles per side", () => {
    expect(wallPageTiles(0, "left")).toEqual(HAMCLOCK_WALL_PAGES[0].left);
    expect(wallPageTiles(7, "right")).toEqual(HAMCLOCK_WALL_PAGES[2].right);
  });
});
