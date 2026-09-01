/**
 * Accessible hit targets aligned over live-DX callsign pills painted by the
 * azimuthal canvas. The canvas remains the visual renderer while these real
 * controls give every band the same hover, keyboard, and selection contract.
 */

import { useEffect, useRef } from "react";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { PresentableSpot } from "@/lib/map/spotPresentation";
import type {
  AzimuthalSpotEndpointScreenPlacement,
  AzimuthalSpotPillScreenPlacement,
} from "@/lib/map/azimuthalSpotPillPlacement";

interface AzimuthalSpotButtonsProps {
  placements: AzimuthalSpotPillScreenPlacement[];
  onSpotHover?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
  onSpotHoverEnd?: (spot?: PresentableSpot) => void;
  onSpotSelect?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
}

function getAnchor(element: HTMLElement): ScreenAnchor {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function AzimuthalSpotButton({
  spot,
  left,
  top,
  width,
  height,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
  kind,
}: Omit<AzimuthalSpotButtonsProps, "placements"> &
  AzimuthalSpotPillScreenPlacement & { kind: "endpoint" | "pill" }) {
  const isEndpoint = kind === "endpoint";
  const latestSpotRef = useRef(spot);
  const latestHoverEndRef = useRef(onSpotHoverEnd);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  latestSpotRef.current = spot;
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
      className={`pointer-events-auto absolute cursor-pointer rounded-full transition duration-100 hover:scale-105 hover:ring-1 hover:ring-white/50 focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cosmic-cyan focus-visible:ring-offset-1 focus-visible:ring-offset-void-black ${
        isEndpoint
          ? "bg-transparent hover:bg-cosmic-cyan/10"
          : "bg-transparent hover:bg-white/[0.06]"
      }`}
      style={{ left, top, width, height }}
      aria-label={`${spot.dx} ${isEndpoint ? "destination" : "tag"}, ${(spot.frequency / 1000).toFixed(3)} megahertz, ${spot.mode || spot.band || "live spot"}. Select as target and open station details`}
      title={`${spot.dx} · ${(spot.frequency / 1000).toFixed(3)} MHz · ${spot.mode || spot.band || spot.source}`}
      onPointerEnter={(event) => {
        pointerInsideRef.current = true;
        onSpotHover?.(spot, getAnchor(event.currentTarget));
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
        releaseHoverIfInactive();
      }}
      onFocus={(event) => {
        focusInsideRef.current = true;
        onSpotHover?.(spot, getAnchor(event.currentTarget));
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
        onSpotSelect?.(spot, getAnchor(event.currentTarget));
      }}
    >
      {isEndpoint && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-cosmic-cyan/80 shadow-[0_0_7px_rgba(34,211,238,0.65)]"
        />
      )}
    </button>
  );
}

function AzimuthalSpotButtons({
  placements,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
  kind,
}: AzimuthalSpotButtonsProps & { kind: "endpoint" | "pill" }) {
  return (
    <>
      {placements.map((placement, index) => (
        <AzimuthalSpotButton
          key={`${kind}:${placement.spot.source}:${placement.spot.id}:${index}`}
          {...placement}
          kind={kind}
          onSpotHover={onSpotHover}
          onSpotHoverEnd={onSpotHoverEnd}
          onSpotSelect={onSpotSelect}
        />
      ))}
    </>
  );
}

export function AzimuthalSpotPillButtons(props: AzimuthalSpotButtonsProps) {
  return <AzimuthalSpotButtons {...props} kind="pill" />;
}

export function AzimuthalSpotEndpointButtons(
  props: Omit<AzimuthalSpotButtonsProps, "placements"> & {
    placements: AzimuthalSpotEndpointScreenPlacement[];
  },
) {
  return <AzimuthalSpotButtons {...props} kind="endpoint" />;
}

export default AzimuthalSpotPillButtons;
