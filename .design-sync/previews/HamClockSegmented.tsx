import { useState } from "react";
import { HamClockSegmented } from "propulse";

/** A fixed choice as a row of big buttons (guide §9), readable and clickable
 * from the couch. Real call sites: DisplayTab's Density/Units/Map content,
 * ThemeTab's theme picker with live-painted swatch previews. */
export function Density() {
  const [value, setValue] = useState<"wall" | "desk">("wall");
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16, width: 260 }}>
      <HamClockSegmented
        label="Density"
        value={value}
        onChange={setValue}
        options={[
          { value: "wall", label: "WALL" },
          { value: "desk", label: "DESK" },
        ]}
      />
    </div>
  );
}

export function ThemeSwatches() {
  const [value, setValue] = useState<"pulse" | "classic" | "brass">("pulse");
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16, width: 420 }}>
      <HamClockSegmented
        label="Theme"
        value={value}
        onChange={setValue}
        options={[
          {
            value: "pulse",
            label: "PULSE",
            detail: "Bright neon on deep blue, with glow.",
            preview: (
              <span data-hamclock-theme="pulse" className="hc-swatch">
                <span className="hc-swatch-title">Best band</span>
                <span className="hc-swatch-hero">20M</span>
                <span className="hc-swatch-sub">GOOD · SFI 148</span>
              </span>
            ),
          },
          {
            value: "classic",
            label: "CLASSIC",
            detail: "Serif type, warm white on black.",
            preview: (
              <span data-hamclock-theme="classic" className="hc-swatch">
                <span className="hc-swatch-title">Best band</span>
                <span className="hc-swatch-hero">20M</span>
                <span className="hc-swatch-sub">GOOD · SFI 148</span>
              </span>
            ),
          },
          {
            value: "brass",
            label: "BRASS",
            detail: "Navy and brass, engraved plates.",
            preview: (
              <span data-hamclock-theme="brass" className="hc-swatch">
                <span className="hc-swatch-title">Best band</span>
                <span className="hc-swatch-hero">20M</span>
                <span className="hc-swatch-sub">GOOD · SFI 148</span>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
