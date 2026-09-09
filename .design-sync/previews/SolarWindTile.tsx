import { SolarWindTile } from "propulse";

/**
 * SolarWindTile has no props — it reads the ACE/DSCOVR L1 feed through
 * `useSolarResource`. The preview harness has no network access to NOAA
 * SWPC, so it renders the tile's designed "waiting for the feed" gauge
 * state rather than a blank card.
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <SolarWindTile />
    </div>
  );
}

export function RailWidth() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <SolarWindTile />
    </div>
  );
}
