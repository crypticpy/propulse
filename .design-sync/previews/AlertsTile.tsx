import { AlertsTile } from "propulse";

// AlertsTile takes only an optional `title` (WallTileProps); it sources NWS
// alerts from useWeatherAlerts itself. This sandbox has no live alert feed,
// so it renders the tile's honest "NO MAPPED NWS ALERTS" state — a real
// composition, not a blank card. CustomTitle shows the same tile embedded
// under a page-specific heading, a real call-site pattern (wall pages pass
// their own `title` per WALL_TILES entry).
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <AlertsTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <AlertsTile />
    </div>
  );
}

export function CustomTitle() {
  return (
    <div style={{ width: 340 }}>
      <AlertsTile title="Storm watch" />
    </div>
  );
}
