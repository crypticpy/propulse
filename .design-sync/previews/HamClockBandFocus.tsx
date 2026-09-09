import { useState } from "react";
import { HamClockBandFocus } from "propulse";

/**
 * Multi-select HF/VHF band chips for the HamClock sidebar (real call site:
 * HamClockSpotsSidebar). `selected` is controlled; local state stands in for
 * the store the real sidebar keeps it in.
 */
export function Selected() {
  const [selected, setSelected] = useState<string[]>(["20m", "40m"]);
  return (
    <div style={{ width: 300, background: "var(--hc-bg)", padding: 8 }}>
      <HamClockBandFocus
        selected={selected}
        onToggle={(band) =>
          setSelected((prev) =>
            prev.includes(band)
              ? prev.filter((b) => b !== band)
              : [...prev, band],
          )
        }
        onClear={() => setSelected([])}
      />
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ width: 300, background: "var(--hc-bg)", padding: 8 }}>
      <HamClockBandFocus selected={[]} onToggle={() => {}} onClear={() => {}} />
    </div>
  );
}
