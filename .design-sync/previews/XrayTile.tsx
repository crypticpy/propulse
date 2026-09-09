import { XrayTile } from "propulse";

/**
 * XrayTile has no props — GOES long-wavelength X-ray flux comes from
 * `useSolarResource`. Without network access in the preview harness it
 * renders the tile's designed "waiting for the GOES feed" idle state.
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <XrayTile />
    </div>
  );
}

export function RailWidth() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <XrayTile />
    </div>
  );
}
