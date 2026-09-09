import { PskStationTile } from "propulse";

/**
 * PskStationTile has no props — it reads the operator's callsign from
 * `profileStore` and the live PSK Reporter feed. With no callsign configured
 * in this preview harness it renders its honest "SET STATION CALL" idle
 * state, matching the wall spec's rule that an unconfigured feed names the
 * gap rather than claiming a clear result.
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <PskStationTile />
    </div>
  );
}

export function RailWidth() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <PskStationTile />
    </div>
  );
}
