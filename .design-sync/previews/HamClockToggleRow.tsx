import { useState } from "react";
import { HamClockSegmented, HamClockToggleRow } from "propulse";

/** The settings row: icon, name, provenance, an optional caveat, and one big
 * ON/OFF button. A gear expands `options` inline. Real call sites:
 * DisplayTab's Auto-page row, KioskTab's Follow radio row. */
export function Basic() {
  const [checked, setChecked] = useState(true);
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16, width: 480 }}>
      <HamClockToggleRow
        label="Smart scaling"
        detail="Fits panel widths and spacing to the desk text size"
        checked={checked}
        onChange={setChecked}
      />
    </div>
  );
}

export function WithCaveatAndOptions() {
  const [checked, setChecked] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [dwell, setDwell] = useState("30");
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16, width: 480 }}>
      <HamClockToggleRow
        label="Auto-page"
        detail="Rotates both rails through the wall's pages on a timer"
        caveat="Pauses on any touch, click or key and resumes after a minute of quiet"
        checked={checked}
        onChange={setChecked}
        expanded={expanded}
        onExpandedChange={setExpanded}
        options={
          <HamClockSegmented
            label="Dwell"
            value={dwell}
            onChange={setDwell}
            options={[
              { value: "15", label: "15 S" },
              { value: "30", label: "30 S" },
              { value: "60", label: "60 S" },
            ]}
          />
        }
      />
    </div>
  );
}
