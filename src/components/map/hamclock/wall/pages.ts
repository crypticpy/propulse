import { WALL_PAGES } from "@/lib/hamclock/wallPages";
import type { TileId } from "./tiles";

export interface WallPage {
  id: string;
  /** Shown in the footer pager, all caps. */
  title: string;
  /** A shorter form of `title` for constrained space. */
  shortLabel: string;
  /** Tiles the left rail shows on this page. */
  left: TileId[];
  /** Tiles the right rail shows on this page. */
  right: TileId[];
}

/**
 * Both rails follow the active page (wall spec §4): each page defines its
 * own left set and right set, no rail is fixed to one widget across pages,
 * and no tile appears twice on the same page. The catalogue itself — data,
 * plus the uniqueness check — lives in `@/lib/hamclock/wallPages` (a leaf
 * module with no React or store import) so `hamclockDisplayStore.ts` can
 * read the same shipped pages without a compile-time dependency on this
 * component tree; this module only adds the `TileId` typing (a type-only
 * import, so it does not create a runtime cycle) that a dependency-free leaf
 * module cannot carry itself.
 */
export const HAMCLOCK_WALL_PAGES: readonly WallPage[] = WALL_PAGES.map(
  (page) => ({
    id: page.id,
    title: page.title,
    shortLabel: page.shortLabel,
    left: [...page.left] as TileId[],
    right: [...page.right] as TileId[],
  }),
);

export type WallRailSide = "left" | "right";

/** Tiles for one rail, clamping a stale persisted index back into range. */
export function wallPageTiles(index: number, side: WallRailSide): TileId[] {
  const page = HAMCLOCK_WALL_PAGES[wallPageIndex(index)];
  return page[side];
}

export function wallPageIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0) return 0;
  return index % HAMCLOCK_WALL_PAGES.length;
}
