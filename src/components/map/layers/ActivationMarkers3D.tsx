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
import { useActivationSpotStore } from "@/stores/activationSpotStore";
import { useMapStore } from "@/stores/mapStore";
import { SpotLabel } from "../SpotLabel";

interface ActivationMarkers3DProps {
  spots: MappableActivationSpot[];
}

export function ActivationMarkers3D({ spots }: ActivationMarkers3DProps) {
  const setTarget = useMapStore((state) => state.setTarget);
  const selectSpot = useActivationSpotStore((state) => state.selectSpot);
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
      {stackedSpots.map(({ spot, stackIndex }) => (
        <SpotLabel
          key={spot.id}
          lat={spot.latitude}
          lon={spot.longitude}
          callsign={spot.callsign}
          mode={spot.mode}
          frequency={spot.frequencyKHz}
          badge={spot.program}
          stackIndex={stackIndex}
          color={getBandColor(spot.frequencyKHz)}
          occlusionOpacity={getOpacity(spot.latitude, spot.longitude)}
          ariaLabel={`${spot.callsign}, ${formatActivationFrequency(spot.frequencyKHz)} ${spot.frequencyKHz >= 1_000 ? "megahertz" : "kilohertz"}, ${spot.mode}, ${spot.program} ${spot.reference}, ${spot.referenceName}. Select as target and open station details`}
          onClick={() => {
            setTarget({
              lat: spot.latitude,
              lon: spot.longitude,
              grid: spot.grid,
              name: `${spot.callsign} · ${spot.program} ${spot.reference}`,
            });
            selectSpot(spot);
          }}
        />
      ))}
    </group>
  );
}

export default ActivationMarkers3D;
