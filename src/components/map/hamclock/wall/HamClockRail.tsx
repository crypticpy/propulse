import {
  clampPageIndex,
  useHamClockDisplayStore,
  wallPages,
} from "@/stores/hamclockDisplayStore";
import type { WallRailSide } from "./pages";
import { WALL_TILES } from "./tiles";
import type { TileId } from "./tiles";

interface HamClockRailProps {
  side: WallRailSide;
  /** Index into the operator's own page list (`wallPages(railLayout)`);
   * out-of-range values clamp into range. */
  pageIndex: number;
  label: string;
}

/**
 * One translucent tile column floating over the map stage.
 *
 * Both the *pages* a layout cycles through and the tile composition on each
 * one are the operator's to edit (`PagesTilesTab`, wall spec §6, B4):
 * `pageIndex` resolves against `wallPages(railLayout)` — the pages the
 * operator's own layout actually names, not a fixed shipped list — so a
 * layout with one page shows one page here, not a fixed five with empty
 * rails. A page the operator's own layout does not define for this side
 * renders empty rather than falling back to the shipped composition: an
 * intentionally emptied page/side is a real choice the picker lets them
 * make, not a corrupt layout (that case is `sanitizeRailLayout`'s job, at
 * read time).
 */
export function HamClockRail({ side, pageIndex, label }: HamClockRailProps) {
  const railLayout = useHamClockDisplayStore((s) => s.railLayout);
  const pinnedTile = useHamClockDisplayStore((s) => s.pinnedTile);
  const pages = wallPages(railLayout);
  const activePage = pages[clampPageIndex(pageIndex, pages.length)];
  const page = railLayout[side].find((p) => p.pageId === activePage?.id);
  const tileIds = (page?.tileIds ?? []) as TileId[];

  // A pinned tile (§6) shows at the top of its rail on every page. If the
  // page's own composition also names it, the second copy is skipped so the
  // tile never renders twice.
  const pinned =
    pinnedTile?.side === side && WALL_TILES[pinnedTile.tileId as TileId]
      ? (pinnedTile.tileId as TileId)
      : null;
  const ids = pinned
    ? [pinned, ...tileIds.filter((id) => id !== pinned)]
    : tileIds;

  return (
    <aside
      className={`hc-rail hc-rail-${side}`}
      aria-label={label}
      data-rail={side}
    >
      {ids.map((id) => {
        const tile = WALL_TILES[id];
        if (!tile) return null;
        const { title, Component } = tile;
        return <Component key={id} title={title} />;
      })}
    </aside>
  );
}
