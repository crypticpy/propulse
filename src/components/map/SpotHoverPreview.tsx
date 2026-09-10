import { useMemo } from "react";
import { useSpotPathPresentation } from "@/hooks/useSpotPathPresentation";
import {
  formatSpotPresentationLabel,
  getSpotPresentationSource,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import { resolveMapSpotSelection } from "@/hooks/useMapSpotSelection";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { SpotPreviewInteraction } from "@/hooks/useSpotHoverArbitration";
import { TargetHoverTooltip } from "./TargetHoverTooltip";

interface SpotHoverPreviewProps {
  visible: boolean;
  position: ScreenAnchor;
  spot: PresentableSpot | null;
  displayTime: Date;
  /** Map-owned portal layer that must remain above Drei Html labels. */
  portalTarget?: Element | null;
  /** Keeps the preview alive while pointer or keyboard focus moves into it. */
  onInteractStart?: (interaction: SpotPreviewInteraction) => void;
  /** Requests delayed dismissal after pointer or focus leaves the preview. */
  onInteractEnd?: (interaction: SpotPreviewInteraction) => void;
  /** Opens the canonical persistent details card for this exact report. */
  onActivate?: () => void;
}

/**
 * Canonical compact hover treatment for an individual map spot. It deliberately
 * shares the target tooltip's proven visual language while deriving the path
 * from the hovered report instead of whichever target happened to be active.
 *
 * No focus home wiring (#824 decision): unlike the other three overlays this
 * covers, this one is not something a keyboard user closes — it is the
 * *opener*. When `interactive`, `TargetHoverTooltip` renders it as a real
 * `tabIndex={0}` control, and activating it (click or Enter/Space) calls
 * `onActivate`, which every host wires straight into the same
 * `handleMapSpotSelect` that clears this preview's own state in the same
 * commit that mounts `SelectedSpotCard` — exactly the opener-detaches-in-the-
 * same-handler gap #797 already fixes from the card's side. The other close
 * path (mouse or keyboard moves away without activating) can't reach
 * `document.body` either: `useSpotHoverArbitration` only schedules the
 * dismiss once both `pointer` and `focus` interaction flags are false, and a
 * `blur` from tabbing away always lands on the next focusable element
 * synchronously, before that dismiss timer ever fires. So there is no path
 * where this preview unmounts while it still holds focus.
 */
export function SpotHoverPreview({
  visible,
  position,
  spot,
  displayTime,
  portalTarget,
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
  const sourcePresentation = spot ? getSpotPresentationSource(spot) : null;
  const contextLabel = spot
    ? [
        spot.id.startsWith("replay-") ? "Replay" : undefined,
        sourcePresentation?.label,
        spot.spotter ? `${spot.spotter} → ${spot.dx}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  if (!spot) return null;

  return (
    <TargetHoverTooltip
      visible={visible}
      portalTarget={portalTarget}
      position={position}
      label={formatSpotPresentationLabel(spot.dx, spot.comment)}
      grid={selection?.spot.dxGrid || spot.dxGrid}
      contextLabel={contextLabel}
      difficulty={path.difficulty}
      optimalSignal={path.optimalSignal}
      signalUnavailableReason={path.unavailableReason}
      distanceKm={path.distanceKm}
      bearing={path.bearing}
      interactive={Boolean(onActivate)}
      onPointerEnter={() => onInteractStart?.("pointer")}
      onPointerLeave={() => onInteractEnd?.("pointer")}
      onFocus={() => onInteractStart?.("focus")}
      onBlur={() => onInteractEnd?.("focus")}
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
