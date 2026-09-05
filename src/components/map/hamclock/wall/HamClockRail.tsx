import { wallPageTiles, type WallRailSide } from "./pages";
import { WALL_TILES } from "./tiles";

interface HamClockRailProps {
  side: WallRailSide;
  /** Index into HAMCLOCK_WALL_PAGES; out-of-range values clamp to page 0. */
  pageIndex: number;
  label: string;
}

/** One translucent tile column floating over the map stage. */
export function HamClockRail({ side, pageIndex, label }: HamClockRailProps) {
  const tiles = wallPageTiles(pageIndex, side);
  return (
    <aside
      className={`hc-rail hc-rail-${side}`}
      aria-label={label}
      data-rail={side}
    >
      {tiles.map((id) => {
        const { title, Component } = WALL_TILES[id];
        return <Component key={id} title={title} />;
      })}
    </aside>
  );
}
