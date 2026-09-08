import { ForecastMatrixTile } from "propulse";

// ForecastMatrixTile takes only an optional `title` (WallTileProps); it
// sources the band x horizon matrix from useWallReliability. This sandbox
// has no station/target and no Kp/SFI loaded, so it renders the tile's own
// idle copy for that state ("Set an operating location to forecast your
// paths."). CustomTitle shows the same tile under a page-specific heading.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <ForecastMatrixTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <ForecastMatrixTile />
    </div>
  );
}

export function CustomTitle() {
  return (
    <div style={{ width: 340 }}>
      <ForecastMatrixTile title="Band outlook" />
    </div>
  );
}
