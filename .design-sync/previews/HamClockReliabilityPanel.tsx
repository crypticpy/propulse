import { HamClockReliabilityPanel } from "propulse";

/**
 * Zero-prop Band x UTC-hour reliability matrix for the HamClock information
 * stack. Needs both a station QTH and a DX target on the map before it can
 * build the 24-hour matrix; the sandbox has neither, so this renders the
 * component's own first honest gate: "Configure a station QTH to calculate
 * a path."
 */
export function NoStation() {
  return (
    <div style={{ width: 320, background: "var(--hc-bg)", padding: 8 }}>
      <HamClockReliabilityPanel />
    </div>
  );
}
