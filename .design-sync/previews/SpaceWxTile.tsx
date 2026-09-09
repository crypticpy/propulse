import { SpaceWxTile } from "propulse";

/**
 * SpaceWxTile has no props — Kp, NOAA scales and solar flux all come from
 * `useSolarResource`. Without network access in the preview harness it
 * renders the tile's designed "waiting for the NOAA Kp feed" idle state.
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <SpaceWxTile />
    </div>
  );
}

export function RailWidth() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <SpaceWxTile />
    </div>
  );
}
