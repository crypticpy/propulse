import { WsjtxTile } from "propulse";

/**
 * WsjtxTile has no props — decodes come from the bridge's WSJT-X UDP relay
 * (`wsjtxStore`), which is off by default. The preview harness has no
 * bridge connection, so it renders the tile's real "BRIDGE OFF" state.
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <WsjtxTile />
    </div>
  );
}

export function RailWidth() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <WsjtxTile />
    </div>
  );
}
