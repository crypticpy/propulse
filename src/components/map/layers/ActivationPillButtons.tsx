/**
 * Accessible hit targets aligned over activation pills painted by a 2D canvas.
 * The buttons stay visually transparent until keyboard focus so the canvas is
 * still the single visual renderer, while pointer and keyboard users receive
 * the same target-selection behavior as the globe labels.
 */

import {
  formatActivationFrequency,
  type ActivationPillScreenPlacement,
} from "@/lib/map/activationMarkers";
import {
  presentActivationSpot,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";

interface ActivationPillButtonsProps {
  placements: ActivationPillScreenPlacement[];
  onSpotHover?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
  onSpotHoverEnd?: () => void;
  onSpotSelect?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
}

export function ActivationPillButtons({
  placements,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
}: ActivationPillButtonsProps) {
  const getAnchor = (element: HTMLElement): ScreenAnchor => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  };

  return (
    <>
      {placements.map(({ spot, left, top, width, height }) => {
        const presentableSpot = presentActivationSpot(spot);
        return (
          <button
            key={spot.id}
            type="button"
            className="pointer-events-auto absolute cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cosmic-cyan focus-visible:ring-offset-1 focus-visible:ring-offset-void-black"
            style={{ left, top, width, height }}
            aria-label={`${spot.callsign}, ${formatActivationFrequency(spot.frequencyKHz)} ${spot.frequencyKHz >= 1_000 ? "megahertz" : "kilohertz"}, ${spot.mode}, ${spot.program} ${spot.reference}, ${spot.referenceName}. Select as target and open station details`}
            title={`${spot.callsign} · ${formatActivationFrequency(spot.frequencyKHz)} ${spot.frequencyKHz >= 1_000 ? "MHz" : "kHz"} · ${spot.program} ${spot.reference}`}
            onPointerEnter={(event) =>
              onSpotHover?.(presentableSpot, getAnchor(event.currentTarget))
            }
            onPointerLeave={onSpotHoverEnd}
            onFocus={(event) =>
              onSpotHover?.(presentableSpot, getAnchor(event.currentTarget))
            }
            onBlur={onSpotHoverEnd}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSpotSelect?.(presentableSpot, getAnchor(event.currentTarget));
            }}
          />
        );
      })}
    </>
  );
}

export default ActivationPillButtons;
