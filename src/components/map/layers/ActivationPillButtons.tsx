/**
 * Accessible hit targets aligned over activation pills painted by a 2D canvas.
 * The buttons stay visually transparent until keyboard focus so the canvas is
 * still the single visual renderer, while pointer and keyboard users receive
 * the same target-selection behavior as the globe labels.
 */

import type { ActivationPillScreenPlacement } from "@/lib/map/activationMarkers";
import { useMapStore } from "@/stores/mapStore";

interface ActivationPillButtonsProps {
  placements: ActivationPillScreenPlacement[];
}

export function ActivationPillButtons({
  placements,
}: ActivationPillButtonsProps) {
  const setTarget = useMapStore((state) => state.setTarget);

  return (
    <>
      {placements.map(({ spot, left, top, width, height }) => (
        <button
          key={spot.id}
          type="button"
          className="pointer-events-auto absolute cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cosmic-cyan focus-visible:ring-offset-1 focus-visible:ring-offset-void-black"
          style={{ left, top, width, height }}
          aria-label={`${spot.callsign}, ${spot.program} ${spot.reference}, ${spot.referenceName}. Select as target`}
          title={`${spot.callsign} · ${spot.program} ${spot.reference}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setTarget({
              lat: spot.latitude,
              lon: spot.longitude,
              grid: spot.grid,
              name: `${spot.callsign} · ${spot.program} ${spot.reference}`,
            });
          }}
        />
      ))}
    </>
  );
}

export default ActivationPillButtons;
