import { useState } from "react";
import { HamClockProjectionSwitch } from "propulse";
import type { ViewMode } from "propulse";

/** Compact map-projection selector (Flat / AZ / 3D) sized for the HamClock
 * instrument header. Controlled; local state stands in for the map store. */
export function FlatSelected() {
  const [mode, setMode] = useState<ViewMode>("flat");
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockProjectionSwitch value={mode} onChange={setMode} />
    </div>
  );
}

export function GlobeSelected() {
  const [mode, setMode] = useState<ViewMode>("globe");
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockProjectionSwitch value={mode} onChange={setMode} />
    </div>
  );
}
