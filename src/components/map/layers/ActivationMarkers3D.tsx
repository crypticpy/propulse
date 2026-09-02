/**
 * POTA/SOTA/WWFF activator labels for the globe.
 *
 * Activations are point reports, not paths: drawing a DX-style arc would imply
 * a receiver endpoint the provider does not supply. Each pill therefore marks
 * only the activator coordinate and uses the shared band-color underline.
 */

import { useMemo } from "react";
import { useGlobeOcclusionBatch } from "@/hooks/useGlobeOcclusionBatch";
import { getBandColor } from "@/lib/utils/spotColors";
import {
  formatActivationFrequency,
  type MappableActivationSpot,
} from "@/lib/map/activationMarkers";
import {
  presentActivationSpot,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { SpotHoverInteraction } from "@/hooks/useSpotHoverArbitration";
import type { GlobeSpotLayoutResult } from "@/lib/map/globeSpotLayout";
import {
  spotLayoutCandidateId,
  spotLayoutReportId,
} from "@/lib/map/screenSpaceSpotLayout";
import { useUIInteractionPrefs } from "@/stores/userStore";
import { SpotLabel } from "../SpotLabel";

interface ActivationMarkers3DProps {
  spots: MappableActivationSpot[];
  layout?: GlobeSpotLayoutResult;
  onSpotHover?: (
    spot: PresentableSpot,
    screenPos: ScreenAnchor,
    interaction: SpotHoverInteraction,
  ) => void;
  onSpotHoverEnd?: (
    spot?: PresentableSpot,
    interaction?: SpotHoverInteraction,
  ) => void;
  onSpotSelect?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
}

export function ActivationMarkers3D({
  spots,
  layout,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
}: ActivationMarkers3DProps) {
  const uiPrefs = useUIInteractionPrefs();
  const placementById = useMemo(
    () =>
      layout
        ? new Map(
            layout.placements.map((placement) => [
              placement.candidate.id,
              placement,
            ]),
          )
        : null,
    [layout],
  );
  const placedSpots = useMemo(
    () =>
      spots.flatMap((spot) => {
        const candidateId = spotLayoutCandidateId(
          spotLayoutReportId("activation", spot.id),
          "activation",
        );
        const placement = placementById?.get(candidateId);
        if (placementById && !placement) return [];
        return [{ spot, placement }];
      }),
    [placementById, spots],
  );
  const positions = useMemo(
    () =>
      placedSpots.map(({ spot }) => ({
        lat: spot.latitude,
        lon: spot.longitude,
      })),
    [placedSpots],
  );
  const { getOpacity } = useGlobeOcclusionBatch(positions);

  if (spots.length === 0) return null;

  return (
    <group name="activation-markers">
      {placedSpots.map(({ spot, placement }) => {
        const presentableSpot = presentActivationSpot(spot);
        return (
          <SpotLabel
            key={spot.id}
            lat={spot.latitude}
            lon={spot.longitude}
            // SpotLabel's generic frequency formatter uses fixed three-place
            // MHz labels. Activations retain tenths of a kHz, so compose the
            // visible text with the same precise formatter as the accessible
            // name instead of letting 14.0745 MHz round to 14.075.
            callsign={`${spot.callsign} ${formatActivationFrequency(spot.frequencyKHz)}`}
            mode={spot.mode}
            badge={spot.program}
            screenOffset={{
              x: placement?.offsetX ?? 0,
              y: placement?.offsetY ?? 0,
            }}
            labelScale={uiPrefs.labelScale ?? 1}
            color={getBandColor(spot.frequencyKHz)}
            occlusionOpacity={getOpacity(spot.latitude, spot.longitude)}
            ariaLabel={`${spot.callsign}, ${formatActivationFrequency(spot.frequencyKHz)} ${spot.frequencyKHz >= 1_000 ? "megahertz" : "kilohertz"}, ${spot.mode}, ${spot.program} ${spot.reference}, ${spot.referenceName}. Select as target and open station details`}
            onHover={
              onSpotHover
                ? (screenPos) =>
                    onSpotHover(presentableSpot, screenPos, {
                      surface: "label",
                      interactionId: `activation:${spot.id}:label`,
                    })
                : undefined
            }
            onHoverEnd={() =>
              onSpotHoverEnd?.(presentableSpot, {
                surface: "label",
                interactionId: `activation:${spot.id}:label`,
              })
            }
            onSelect={
              onSpotSelect
                ? (screenPos) => onSpotSelect(presentableSpot, screenPos)
                : undefined
            }
          />
        );
      })}
    </group>
  );
}

export default ActivationMarkers3D;
