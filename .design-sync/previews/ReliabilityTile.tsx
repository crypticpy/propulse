import { ReliabilityTile } from "propulse";

/**
 * ReliabilityTile takes an optional `title` override; all its data comes
 * from `useWallReliability` (station, DX target, Kp/SFI). With no station or
 * target picked in this harness it renders the designed "no-station" idle
 * copy, which is a real, styled state the wall ships (wall spec §26.3).
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <ReliabilityTile />
    </div>
  );
}

export function CustomTitle() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <ReliabilityTile title="Path reliability" />
    </div>
  );
}
