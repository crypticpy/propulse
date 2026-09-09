import { HamClockWallControls } from "propulse";

/**
 * HamClockWallControls' only prop is `onOpenSettings`; it renders the
 * density switch, the SETTINGS button and the exit control — all real,
 * store-driven controls with no fabricated data involved.
 */
export function Default() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockWallControls onOpenSettings={() => {}} />
    </div>
  );
}

export function Compact() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 12, width: 260 }}>
      <HamClockWallControls onOpenSettings={() => {}} />
    </div>
  );
}
