import { HamClockDensitySwitch } from "propulse";

/**
 * WALL | DESK density toggle for the HamClock instrument header. Zero props;
 * reads/writes `useHamClockDisplayStore`'s `density`. Real call site:
 * HamClockWallControls.
 */
export function Default() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockDensitySwitch />
    </div>
  );
}
