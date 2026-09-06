import { useMemo } from "react";
import { DXSpotList } from "@/components/dx/DXSpotList/DXSpotList";
import { useDXStore } from "@/stores/dxStore";
import { useUTCClock } from "@/hooks/useUTCClock";
import { reportFooter } from "../tokens";
import { WallReport } from "./WallReport";

/** Chrome for the wall's existing cluster list, distinct from map collections. */
export function ClusterReport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const spots = useDXStore((state) => state.spots);
  const source = useDXStore((state) => state.spotSource);
  useUTCClock(10_000);
  const latest = useMemo(() => {
    const times = spots.map((spot) => new Date(spot.time).getTime()).filter(Number.isFinite);
    return times.length ? Math.max(...times) : null;
  }, [spots]);
  // This timestamp is a spot observation, not an invented polling/sync time.
  const { footer, updated } = reportFooter(
    `${source === "bridge" ? "CLUSTER BRIDGE" : "DX CLUSTER REST"} · LAST SPOT`, latest,
  );
  return (
    <WallReport open={open} onClose={onClose} title="DX cluster report" tone="accent"
      footer={footer} updated={updated} pinId="dx-cluster"
      pinElement={<ClusterReport open onClose={onClose} />}>
      <DXSpotList showFilters wallPaging />
    </WallReport>
  );
}
