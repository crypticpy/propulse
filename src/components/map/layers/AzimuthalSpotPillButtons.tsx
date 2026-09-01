/**
 * Accessible hit targets aligned over live-DX callsign pills painted by the
 * azimuthal canvas. The canvas remains the visual renderer while these real
 * controls give every band the same hover, keyboard, and selection contract.
 */

import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { PresentableSpot } from "@/lib/map/spotPresentation";
import type { AzimuthalSpotPillScreenPlacement } from "@/lib/map/azimuthalSpotPillPlacement";

interface AzimuthalSpotPillButtonsProps {
  placements: AzimuthalSpotPillScreenPlacement[];
  onSpotHover?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
  onSpotHoverEnd?: () => void;
  onSpotSelect?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
}

function getAnchor(element: HTMLElement): ScreenAnchor {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function AzimuthalSpotPillButtons({
  placements,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
}: AzimuthalSpotPillButtonsProps) {
  return (
    <>
      {placements.map(({ spot, left, top, width, height }, index) => (
        <button
          key={`${spot.source}:${spot.id}:${index}`}
          type="button"
          className="pointer-events-auto absolute cursor-pointer rounded-full bg-transparent transition duration-100 hover:scale-105 hover:bg-white/[0.06] hover:ring-1 hover:ring-white/30 focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cosmic-cyan focus-visible:ring-offset-1 focus-visible:ring-offset-void-black"
          style={{ left, top, width, height }}
          aria-label={`${spot.dx}, ${(spot.frequency / 1000).toFixed(3)} megahertz, ${spot.mode || spot.band || "live spot"}. Select as target and open station details`}
          title={`${spot.dx} · ${(spot.frequency / 1000).toFixed(3)} MHz · ${spot.mode || spot.band || spot.source}`}
          onPointerEnter={(event) =>
            onSpotHover?.(spot, getAnchor(event.currentTarget))
          }
          onPointerLeave={onSpotHoverEnd}
          onFocus={(event) =>
            onSpotHover?.(spot, getAnchor(event.currentTarget))
          }
          onBlur={onSpotHoverEnd}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSpotSelect?.(spot, getAnchor(event.currentTarget));
          }}
        />
      ))}
    </>
  );
}

export default AzimuthalSpotPillButtons;
