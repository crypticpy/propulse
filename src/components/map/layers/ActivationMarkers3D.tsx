/**
 * POTA/SOTA/WWFF activator labels for the globe.
 *
 * Activations are point reports, not paths: drawing a DX-style arc would imply
 * a receiver endpoint the provider does not supply. Each pill therefore marks
 * only the activator coordinate and uses the shared band-color underline.
 */

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGlobeOcclusionBatch } from "@/hooks/useGlobeOcclusionBatch";
import { getBandColor } from "@/lib/utils/spotColors";
import {
  aggregateProjectedActivationMarkers,
  formatActivationFrequency,
  type ActivationMarkerAggregation,
  type MappableActivationSpot,
} from "@/lib/map/activationMarkers";
import {
  normalizePresentableSpot,
  presentActivationSpot,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import {
  createGlobeOcclusionFrame,
  getGlobeOcclusionOpacity,
} from "@/lib/map/globeOcclusion";
import { useMapStore } from "@/stores/mapStore";
import type { SpotCluster as SpotClusterData } from "@/hooks/useSpotClustering";
import { SpotCluster } from "../SpotCluster";
import { SpotLabel } from "../SpotLabel";

interface ActivationMarkers3DProps {
  spots: MappableActivationSpot[];
  onSpotHover?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
  onSpotHoverEnd?: (spot?: PresentableSpot) => void;
  onSpotSelect?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
  onClusterClick?: (
    cluster: SpotClusterData,
    screenPos: { x: number; y: number },
  ) => void;
}

const AGGREGATION_INTERVAL_SECONDS = 0.12;
const AGGREGATION_RADIUS_PX = 112;
const AGGREGATION_VIEWPORT_MARGIN_PX = 80;

function latLonTo3D(lat: number, lon: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ];
}

function activationRenderKey(spot: MappableActivationSpot): string {
  return [
    spot.id,
    spot.spottedAt,
    spot.frequencyKHz,
    spot.mode,
    spot.latitude,
    spot.longitude,
    spot.reference,
    spot.comments,
  ].join(":");
}

function aggregationRenderKey(aggregation: ActivationMarkerAggregation) {
  const clusterKey = aggregation.clusters
    .map(
      (cluster) =>
        `${cluster.id}[${cluster.spots.map(activationRenderKey).join(",")}]`,
    )
    .join("|");
  const singlesKey = aggregation.singles.map(activationRenderKey).join("|");
  return `${clusterKey}::${singlesKey}`;
}

export function ActivationMarkers3D({
  spots,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
  onClusterClick,
}: ActivationMarkers3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const spotsRef = useRef(spots);
  spotsRef.current = spots;
  const lastAggregationTimeRef = useRef(Number.NEGATIVE_INFINITY);
  const aggregationKeyRef = useRef("");
  const localPosition = useMemo(() => new THREE.Vector3(), []);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const [aggregation, setAggregation] = useState<ActivationMarkerAggregation>(
    () => ({ clusters: [], singles: spots }),
  );

  // Cluster in projected screen space instead of fixed geographic buckets.
  // That makes aggregation match the thing the operator actually experiences:
  // labels that collide become one beacon, and zooming in separates them.
  useFrame(({ camera, clock, size }) => {
    const elapsed = clock.getElapsedTime();
    if (
      elapsed - lastAggregationTimeRef.current <
      AGGREGATION_INTERVAL_SECONDS
    ) {
      return;
    }
    lastAggregationTimeRef.current = elapsed;

    const occlusionFrame = createGlobeOcclusionFrame(
      camera.position,
      useMapStore.getState().rotation.x,
    );
    const group = groupRef.current;
    if (!occlusionFrame || !group) return;
    group.updateWorldMatrix(true, false);

    const projected = spotsRef.current.flatMap((spot) => {
      if (
        getGlobeOcclusionOpacity(
          spot.latitude,
          spot.longitude,
          occlusionFrame,
        ) < 0.05
      ) {
        return [];
      }

      localPosition.set(...latLonTo3D(spot.latitude, spot.longitude));
      worldPosition.copy(localPosition).applyMatrix4(group.matrixWorld);
      projectedPosition.copy(worldPosition).project(camera);
      const x = ((projectedPosition.x + 1) / 2) * size.width;
      const y = ((1 - projectedPosition.y) / 2) * size.height;
      if (
        projectedPosition.z < -1 ||
        projectedPosition.z > 1 ||
        x < -AGGREGATION_VIEWPORT_MARGIN_PX ||
        x > size.width + AGGREGATION_VIEWPORT_MARGIN_PX ||
        y < -AGGREGATION_VIEWPORT_MARGIN_PX ||
        y > size.height + AGGREGATION_VIEWPORT_MARGIN_PX
      ) {
        return [];
      }
      return [{ spot, x, y }];
    });

    const nextAggregation = aggregateProjectedActivationMarkers(projected, {
      radiusPx: AGGREGATION_RADIUS_PX,
      minClusterSize: 3,
    });
    const nextKey = aggregationRenderKey(nextAggregation);
    if (nextKey === aggregationKeyRef.current) return;
    aggregationKeyRef.current = nextKey;
    setAggregation(nextAggregation);
  });

  const positions = useMemo(
    () =>
      aggregation.singles.map((spot) => ({
        lat: spot.latitude,
        lon: spot.longitude,
      })),
    [aggregation.singles],
  );
  const { getOpacity } = useGlobeOcclusionBatch(positions);

  const stackedSpots = useMemo(() => {
    const stackCounts = new Map<string, number>();
    return aggregation.singles.map((spot) => {
      // A tenth-degree bucket keeps co-located references navigable without
      // unnecessarily stacking activators that merely share a region.
      const key = `${spot.latitude.toFixed(1)},${spot.longitude.toFixed(1)}`;
      const stackIndex = stackCounts.get(key) ?? 0;
      stackCounts.set(key, stackIndex + 1);
      return { spot, stackIndex };
    });
  }, [aggregation.singles]);

  const renderClusters = useMemo<SpotClusterData[]>(
    () =>
      aggregation.clusters.map((cluster) => {
        const presentedSpots = cluster.spots.map((spot) =>
          normalizePresentableSpot(presentActivationSpot(spot)),
        );
        return {
          id: cluster.id,
          center: cluster.center,
          spots: presentedSpots,
          count: cluster.count,
          primarySpot: presentedSpots[0],
        };
      }),
    [aggregation.clusters],
  );

  if (spots.length === 0) return null;

  return (
    <group ref={groupRef} name="activation-markers">
      {renderClusters.map((cluster) => (
        <SpotCluster
          key={cluster.id}
          cluster={cluster}
          onClick={onClusterClick}
        />
      ))}
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
            onHoverEnd={() => onSpotHoverEnd?.(presentableSpot)}
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
