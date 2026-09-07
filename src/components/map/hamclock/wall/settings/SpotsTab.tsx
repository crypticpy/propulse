import { useMapStore } from "@/stores/mapStore";
import { HamClockSegmented } from "../controls";

const DENSITIES = [10, 50, 100, 150, 200];

/** Shared map cap; choosing fewer points does not reduce activity evidence. */
export function SpotsTab() {
  const density = useMapStore((s) => s.displayDensity);
  const setDensity = useMapStore((s) => s.setDisplayDensity);
  // Preserve an intermediate value chosen with the existing desktop slider.
  const choices = DENSITIES.includes(density)
    ? DENSITIES
    : [...DENSITIES, density].sort((a, b) => a - b);
  return (
    <div className="hcc-tabgrid">
      <HamClockSegmented
        label="Map spot limit"
        value={String(density)}
        onChange={(value) => setDensity(Number(value))}
        options={choices.map((value) => ({ value: String(value), label: String(value) }))}
      />
      <p className="hcc-row-detail">
        Draw up to {density} eligible spots. Fewer spots reduce clutter; activity
        summaries keep their available evidence. The feed may contain fewer spots.
      </p>
      <p className="hcc-row-detail">Flat map: circle = transmitter · square = receiver.</p>
    </div>
  );
}
