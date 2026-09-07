/**
 * The wall's page catalogue as plain data (wall spec §4/§6). No React import
 * and no store import: this is the one place both `wall/pages.ts` (the wall
 * component tree, which types the tile ids as `TileId`) and
 * `hamclockDisplayStore.ts` (which must not import the wall tree, to avoid a
 * circular module dependency) read the shipped five pages from, instead of
 * each keeping its own copy that can silently drift apart. Review pass after
 * B4: `KNOWN_PAGE_IDS`/`KNOWN_TILE_IDS`/`SHIPPED_RAIL_LAYOUT` were previously
 * hand-copied into the store and cross-checked against the wall tree by a
 * dedicated test; this module removes the second copy instead of testing
 * for drift between two copies.
 */

/** One page's tile assignment, in the plain-string shape both the shipped
 * catalogue below and a user's own `railLayout` (in `hamclockDisplayStore`)
 * conform to. */
export interface PageTileSlots {
  left: readonly string[];
  right: readonly string[];
}

/** One shipped page: an id, a display title, a shorter label for
 * constrained space, and the tile ids each rail shows for it. */
export interface WallPageData extends PageTileSlots {
  id: string;
  title: string;
  shortLabel: string;
}

/**
 * Finds a page composition where a tile id appears twice — on both rails, or
 * twice within one rail. "One tile, one place" (wall spec §2) means a
 * duplicate is a bug in the page data, never a valid layout. Non-throwing so
 * a runtime write (`hamclockDisplayStore#setRailLayout`) can reject the
 * change and keep the previous layout instead of crashing;
 * `assertUniqueTilesPerPage` below is the throwing wrapper build-time
 * callers still want.
 */
export function findDuplicateTile(
  pages: readonly PageTileSlots[],
): { pageIndex: number; tileId: string } | null {
  for (let index = 0; index < pages.length; index += 1) {
    const seen = new Set<string>();
    for (const id of [...pages[index].left, ...pages[index].right]) {
      if (seen.has(id)) return { pageIndex: index, tileId: id };
      seen.add(id);
    }
  }
  return null;
}

/**
 * Rejects a page composition where a tile id appears twice — on both rails,
 * or twice within one rail. Throws rather than silently dropping the
 * repeat: callers validate shipped or built-in data with this at module load
 * so a regression fails at import/test time instead of shipping a wall that
 * shows the same widget twice.
 */
export function assertUniqueTilesPerPage(
  pages: readonly PageTileSlots[],
): void {
  const duplicate = findDuplicateTile(pages);
  if (duplicate) {
    throw new Error(
      `wallPages: page ${duplicate.pageIndex} places tile "${duplicate.tileId}" more than once`,
    );
  }
}

/**
 * The five pages the wall ships (wall spec §4 taxonomy table), using only
 * tiles that ship today. `wall/pages.ts` derives its typed
 * `HAMCLOCK_WALL_PAGES` from this array; `hamclockDisplayStore.ts` reads it
 * directly for the shipped seed `railLayout` and the known-id sets
 * `sanitizeRailLayout` validates a persisted layout against.
 */
export const WALL_PAGES: readonly WallPageData[] = [
  {
    id: "spots",
    title: "Spots & Activity",
    shortLabel: "Spots",
    left: ["cluster", "bandActivity", "recentContacts", "dxTarget"],
    right: ["bestBand", "greyLine", "pskStation", "reliability", "activations"],
  },
  {
    id: "solar",
    title: "Solar & Space Wx",
    shortLabel: "Solar",
    left: ["xray", "solarWind", "spaceWx", "sun"],
    right: ["moon", "greyLine", "muf", "reliability"],
  },
  {
    id: "forecast",
    title: "Forecast",
    shortLabel: "Forecast",
    left: ["bestBand", "muf", "forecastMatrix", "reliability"],
    right: ["bandActivity", "cluster", "greyLine", "sun", "xray"],
  },
  {
    id: "weather",
    title: "Weather & Emergency",
    shortLabel: "Weather",
    left: ["weather", "alerts"],
    right: ["emcomm", "moon"],
  },
  {
    id: "sdr",
    title: "SDR",
    shortLabel: "SDR",
    left: ["sdrScope", "sdrDecodes", "wsjtx"],
    right: ["bandActivity", "cluster", "bestBand", "pskStation"],
  },
];

// Fails at import time (and therefore in tests) if a future edit to the
// table above reintroduces a duplicate, rather than shipping it silently.
assertUniqueTilesPerPage(WALL_PAGES);

/**
 * Every tile id the shipped pages above reference, deduplicated in
 * first-appearance order. `WALL_TILES` (`wall/tiles/index.ts`) is the
 * runtime source of truth for what a tile id *is* (its title and
 * component); this is the plain-data view a dependency-free consumer (the
 * store) can check a persisted id against without importing the tile
 * component registry. This is a derivation from `WALL_PAGES`, not a second
 * hand-copied list, so it cannot drift from the catalogue above by
 * construction — `tiles.test.tsx` still asserts it covers every id
 * `WALL_TILES` registers, which is a registry-completeness check, not a
 * mirror-drift check.
 */
export const WALL_TILE_IDS: readonly string[] = Array.from(
  new Set(WALL_PAGES.flatMap((page) => [...page.left, ...page.right])),
);

/** A page id's shipped title, or the id itself if it names no shipped page
 * (a retired page, or one only a hand-edited persisted value could name). */
export function pageTitle(pageId: string): string {
  return WALL_PAGES.find((page) => page.id === pageId)?.title ?? pageId;
}
