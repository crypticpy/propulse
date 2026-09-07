import { lazy, Suspense, useMemo } from "react";
import { useDXStore } from "@/stores/dxStore";
import { useUTCClock } from "@/hooks/useUTCClock";
import { reportFooter } from "../tokens";
import { WallReport } from "./WallReport";

const DXSpotList = lazy(() => import("@/components/dx/DXSpotList/DXSpotList").then((module) => ({ default: module.DXSpotList })));

/** Chrome for the wall's existing cluster list, distinct from map collections. */
export function ClusterReport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const feedState = useDXStore(state => state.clusterFeed);
  const spots = useDXStore((state) => state.spots);
  const source = useDXStore((state) => state.spotSource);
  useUTCClock(10_000);
  const latest = useMemo(() => {
    const times = spots.map((spot) => new Date(spot.time).getTime()).filter(Number.isFinite);
    return feedState.observedAt ?? (times.length ? Math.max(...times) : null);
  }, [spots, feedState.observedAt]);
  // This timestamp is a spot observation, not an invented polling/sync time.
  const { footer, updated } = reportFooter(
    `${source === "bridge" ? "CLUSTER BRIDGE" : "DX REST"} · ${feedState.state} · LAST SPOT`, latest,
  );
  return (
    <WallReport open={open} onClose={onClose} title="DX cluster report" tone="accent"
      footer={footer} updated={updated} pinId="dx-cluster"
      pinElement={<ClusterReport open onClose={onClose} />}>
      <Suspense fallback={<p className="hcr-note">LOADING CLUSTER LIST</p>}>
        <DXSpotList showFilters wallPaging />
      </Suspense>
    </WallReport>
  );
}
