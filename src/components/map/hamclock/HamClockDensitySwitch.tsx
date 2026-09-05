import {
  useHamClockDisplayStore,
  type HamClockDensity,
} from "@/stores/hamclockDisplayStore";

const DENSITIES: Array<{
  value: HamClockDensity;
  label: string;
  title: string;
}> = [
  {
    value: "wall",
    label: "WALL",
    title: "Wall — full-bleed map with tile rails, read from across the room",
  },
  {
    value: "desk",
    label: "DESK",
    title: "Desk — panel layout",
  },
];

/**
 * WALL | DESK density toggle for the instrument header. Always visible at
 * both densities (B1/HW-22) so switching density never requires opening a
 * menu — previously the only way back to wall from desk was a `<select>`
 * buried in the Display settings popout, and the only wall-side control was
 * a second copy of this switch in the footer. Reuses `.hc-mode`, the same
 * `--hc-*`-token segmented-control style already used for the wall footer's
 * pager and the header overflow controls, so there is exactly one styled
 * density control shared by both densities.
 */
export function HamClockDensitySwitch() {
  const density = useHamClockDisplayStore((s) => s.density);
  const setDensity = useHamClockDisplayStore((s) => s.setDensity);
  return (
    <div className="hc-mode" role="group" aria-label="HamClock density">
      {DENSITIES.map(({ value, label, title }) => (
        <button
          key={value}
          type="button"
          aria-pressed={density === value}
          title={title}
          onClick={() => setDensity(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
