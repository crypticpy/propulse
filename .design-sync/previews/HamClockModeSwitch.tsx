import { useState } from "react";
import { HamClockModeSwitch } from "propulse";
import type { HamClockMode } from "propulse";

/** Compact HamClock product-mode selector (Activity / Sats / Wx) for the
 * instrument header. Controlled; local state stands in for the store the
 * real header keeps it in. */
export function Activity() {
  const [mode, setMode] = useState<HamClockMode>("traffic");
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockModeSwitch value={mode} onChange={setMode} />
    </div>
  );
}

export function Satellites() {
  const [mode, setMode] = useState<HamClockMode>("satellites");
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockModeSwitch value={mode} onChange={setMode} />
    </div>
  );
}
