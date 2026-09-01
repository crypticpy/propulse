/**
 * Accessible hit targets aligned over activation pills painted by a 2D canvas.
 * The buttons stay visually transparent until keyboard focus so the canvas is
 * still the single visual renderer, while pointer and keyboard users receive
 * the same target-selection behavior as the globe labels.
 */

import { useEffect, useMemo, useRef } from "react";
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
  onSpotHoverEnd?: (spot?: PresentableSpot) => void;
  onSpotSelect?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
}

function ActivationPillButton({
  placement: { spot, left, top, width, height },
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
}: Omit<ActivationPillButtonsProps, "placements"> & {
  placement: ActivationPillScreenPlacement;
}) {
  const getAnchor = (element: HTMLElement): ScreenAnchor => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  };
  const presentableSpot = useMemo(() => presentActivationSpot(spot), [spot]);
  const latestSpotRef = useRef(presentableSpot);
  const latestHoverEndRef = useRef(onSpotHoverEnd);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  latestSpotRef.current = presentableSpot;
  latestHoverEndRef.current = onSpotHoverEnd;

  const releaseHoverIfInactive = () => {
    if (pointerInsideRef.current || focusInsideRef.current) return;
    latestHoverEndRef.current?.(latestSpotRef.current);
  };

  useEffect(() => () => {
    if (!pointerInsideRef.current && !focusInsideRef.current) return;
    pointerInsideRef.current = false;
    focusInsideRef.current = false;
    latestHoverEndRef.current?.(latestSpotRef.current);
  }, []);

  return (
    <button
      type="button"
      className="pointer-events-auto absolute cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cosmic-cyan focus-visible:ring-offset-1 focus-visible:ring-offset-void-black"
      style={{ left, top, width, height }}
      aria-label={`${spot.callsign}, ${formatActivationFrequency(spot.frequencyKHz)} ${spot.frequencyKHz >= 1_000 ? "megahertz" : "kilohertz"}, ${spot.mode}, ${spot.program} ${spot.reference}, ${spot.referenceName}. Select as target and open station details`}
      title={`${spot.callsign} · ${formatActivationFrequency(spot.frequencyKHz)} ${spot.frequencyKHz >= 1_000 ? "MHz" : "kHz"} · ${spot.program} ${spot.reference}`}
      onPointerEnter={(event) => {
        pointerInsideRef.current = true;
        onSpotHover?.(presentableSpot, getAnchor(event.currentTarget));
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
        releaseHoverIfInactive();
      }}
      onFocus={(event) => {
        focusInsideRef.current = true;
        onSpotHover?.(presentableSpot, getAnchor(event.currentTarget));
      }}
      onBlur={() => {
        focusInsideRef.current = false;
        releaseHoverIfInactive();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSpotSelect?.(presentableSpot, getAnchor(event.currentTarget));
      }}
    />
  );
}

export function ActivationPillButtons({
  placements,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
}: ActivationPillButtonsProps) {
  return (
    <>
      {placements.map((placement) => (
        <ActivationPillButton
          key={placement.spot.id}
          placement={placement}
          onSpotHover={onSpotHover}
          onSpotHoverEnd={onSpotHoverEnd}
          onSpotSelect={onSpotSelect}
        />
      ))}
    </>
  );
}

export default ActivationPillButtons;
