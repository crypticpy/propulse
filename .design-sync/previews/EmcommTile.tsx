import { EmcommTile } from "propulse";

// EmcommTile takes only an optional `title` (WallTileProps); it sources RIM
// readiness from useRIM itself. This sandbox has no space/severe-weather
// data loaded, so it renders the tile's honest "no data to score readiness"
// state. CustomTitle shows the same tile under a page-specific heading.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <EmcommTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <EmcommTile />
    </div>
  );
}

export function CustomTitle() {
  return (
    <div style={{ width: 340 }}>
      <EmcommTile title="EMCOMM readiness" />
    </div>
  );
}
