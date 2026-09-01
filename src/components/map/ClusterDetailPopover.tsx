import { useMemo } from "react";
import type { SpotCluster } from "@/hooks/useSpotClustering";
import type { LiveSpot } from "@/types/livespot";
import { latLonToGrid } from "@/lib/utils/grid";
import { SpotCollectionPopover } from "./SpotCollectionPopover";

export interface ClusterDetailPopoverProps {
  visible: boolean;
  position: { x: number; y: number };
  cluster: SpotCluster | null;
  onClose: () => void;
  onSpotSelect: (spot: LiveSpot) => void;
}

function formatCoord(value: number, latitude: boolean) {
  const direction = latitude
    ? value >= 0
      ? "N"
      : "S"
    : value >= 0
      ? "E"
      : "W";
  return `${Math.abs(value).toFixed(1)}°${direction}`;
}

/** Compatibility wrapper over the canonical map spot collection. */
export function ClusterDetailPopover({
  visible,
  position,
  cluster,
  onClose,
  onSpotSelect,
}: ClusterDetailPopoverProps) {
  const grid = useMemo(() => {
    if (!cluster) return "";
    try {
      return latLonToGrid(cluster.center.lat, cluster.center.lon, 4);
    } catch {
      return "Grid unavailable";
    }
  }, [cluster]);

  if (!cluster) return null;

  return (
    <SpotCollectionPopover
      visible={visible}
      position={position}
      title={`${cluster.count} active spot${cluster.count === 1 ? "" : "s"}`}
      subtitle={`${grid} · ${formatCoord(cluster.center.lat, true)}, ${formatCoord(cluster.center.lon, false)}`}
      spots={cluster.spots}
      onClose={onClose}
      onSpotSelect={onSpotSelect}
    />
  );
}

ClusterDetailPopover.displayName = "ClusterDetailPopover";

export default ClusterDetailPopover;
