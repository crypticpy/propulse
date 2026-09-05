import { HamClockTile, type WallTileProps } from "../HamClockTile";

/**
 * Reserved slot for a tile that lands in a later phase. It has to read as a
 * deliberate placeholder on a wall display, never as a broken panel, so it
 * keeps the full tile chrome and states plainly what it is waiting for.
 */
export function PlaceholderTile({ title = "Tile" }: WallTileProps) {
  return (
    <HamClockTile title={title}>
      <p className="hc-placeholder">Coming in the next update</p>
    </HamClockTile>
  );
}
