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
import { SpotLabel } from "../SpotLabel";

interface ActivationMarkers3DProps {
  spots: MappableActivationSpot[];
  onSpotHover?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
  onSpotHoverEnd?: () => void;
  onSpotSelect?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
}

export function ActivationMarkers3D({
  spots,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
}: ActivationMarkers3DProps) {
  const positions = useMemo(
    () => spots.map((spot) => ({ lat: spot.latitude, lon: spot.longitude })),
    [spots],
  );
  const { getOpacity } = useGlobeOcclusionBatch(positions);

  const stackedSpots = useMemo(() => {
    const stackCounts = new Map<string, number>();
    return spots.map((spot) => {
      // A tenth-degree bucket keeps co-located references navigable without
      // unnecessarily stacking activators that merely share a region.
      const key = `${spot.latitude.toFixed(1)},${spot.longitude.toFixed(1)}`;
      const stackIndex = stackCounts.get(key) ?? 0;
      stackCounts.set(key, stackIndex + 1);
      return { spot, stackIndex };
    });
  }, [spots]);

  if (spots.length === 0) return null;

  return (
    <group name="activation-markers">
      {stackedSpots.map(({ spot, stackIndex }) => {
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
            stackIndex={stackIndex}
            color={getBandColor(spot.frequencyKHz)}
            occlusionOpacity={getOpacity(spot.latitude, spot.longitude)}
            ariaLabel={`${spot.callsign}, ${formatActivationFrequency(spot.frequencyKHz)} ${spot.frequencyKHz >= 1_000 ? "megahertz" : "kilohertz"}, ${spot.mode}, ${spot.program} ${spot.reference}, ${spot.referenceName}. Select as target and open station details`}
            onHover={
              onSpotHover
                ? (screenPos) => onSpotHover(presentableSpot, screenPos)
                : undefined
            }
            onHoverEnd={onSpotHoverEnd}
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
