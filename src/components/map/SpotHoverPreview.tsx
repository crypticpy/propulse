import { useMemo } from "react";
import { useSpotPathPresentation } from "@/hooks/useSpotPathPresentation";
import {
  formatSpotPresentationLabel,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import { resolveMapSpotSelection } from "@/hooks/useMapSpotSelection";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import { TargetHoverTooltip } from "./TargetHoverTooltip";

interface SpotHoverPreviewProps {
  visible: boolean;
  position: ScreenAnchor;
  spot: PresentableSpot | null;
  displayTime: Date;
  /** Keeps the preview alive while pointer or keyboard focus moves into it. */
  onInteractStart?: () => void;
  /** Requests delayed dismissal after pointer or focus leaves the preview. */
  onInteractEnd?: () => void;
  /** Opens the canonical persistent details card for this exact report. */
  onActivate?: () => void;
}

/**
 * Canonical compact hover treatment for an individual map spot. It deliberately
 * shares the target tooltip's proven visual language while deriving the path
 * from the hovered report instead of whichever target happened to be active.
 */
export function SpotHoverPreview({
  visible,
  position,
  spot,
  displayTime,
  onInteractStart,
  onInteractEnd,
  onActivate,
}: SpotHoverPreviewProps) {
  const selection = useMemo(
    () => (spot ? resolveMapSpotSelection(spot) : null),
    [spot],
  );
  const endpoint = selection?.target
    ? { lat: selection.target.lat, lon: selection.target.lon }
    : null;
  const path = useSpotPathPresentation(endpoint, displayTime);

  if (!spot) return null;

  return (
    <TargetHoverTooltip
      visible={visible}
      position={position}
      label={formatSpotPresentationLabel(spot.dx, spot.comment)}
      grid={selection?.spot.dxGrid || spot.dxGrid}
      difficulty={path.difficulty}
      optimalSignal={path.optimalSignal}
      signalUnavailableReason={path.unavailableReason}
      distanceKm={path.distanceKm}
      bearing={path.bearing}
      interactive={Boolean(onActivate)}
      onPointerEnter={() => onInteractStart?.()}
      onPointerLeave={() => onInteractEnd?.()}
      onFocus={() => onInteractStart?.()}
      onBlur={() => onInteractEnd?.()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate?.();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate?.();
        }
      }}
    />
  );
}

SpotHoverPreview.displayName = "SpotHoverPreview";

export default SpotHoverPreview;
