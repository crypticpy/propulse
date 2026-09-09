import { MufTile } from "propulse";

// MufTile takes only an optional `title` (WallTileProps); it sources MUF
// from useActiveLocation + useCurrentSFI. This sandbox has no station
// configured, so it renders the tile's honest "SET HOME IN SETTINGS" state.
// CustomTitle shows the same tile under a page-specific heading.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <MufTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <MufTile />
    </div>
  );
}

export function CustomTitle() {
  return (
    <div style={{ width: 340 }}>
      <MufTile title="MUF now" />
    </div>
  );
}
