import { HamClockDxpeditionsPanel } from "propulse";

/**
 * Zero-prop NG3K DXpedition panel; fetches the live schedule via
 * `useDxpeditions`. No network access in the capture sandbox, so this shows
 * the panel's own "DXpedition schedule unavailable" state — a real state
 * the component draws itself, not a fabrication.
 */
export function Unavailable() {
  return (
    <div style={{ width: 320, background: "var(--hc-bg)", padding: 8 }}>
      <HamClockDxpeditionsPanel />
    </div>
  );
}
