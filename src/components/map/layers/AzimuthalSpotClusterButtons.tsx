import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { AzimuthalSpotCluster } from "@/lib/map/azimuthalSpotAggregation";

interface AzimuthalSpotClusterButtonsProps {
  clusters: readonly AzimuthalSpotCluster[];
  onOpen: (cluster: AzimuthalSpotCluster, position: ScreenAnchor) => void;
}

function getAnchor(element: HTMLElement): ScreenAnchor {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/** Visible, keyboard-accessible controls for dense Azimuthal destinations. */
export function AzimuthalSpotClusterButtons({
  clusters,
  onOpen,
}: AzimuthalSpotClusterButtonsProps) {
  return (
    <>
      {clusters
        .filter((cluster) => cluster.members.length > 1)
        .map((cluster) => (
          <button
            key={cluster.key}
            type="button"
            className="pointer-events-auto absolute flex items-center justify-center rounded-full border border-cosmic-cyan/80 bg-deep-space/90 font-mono text-[10px] font-bold text-cosmic-cyan shadow-[0_0_12px_rgba(34,211,238,0.35)] transition hover:scale-110 hover:bg-cosmic-cyan/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{
              left: cluster.left,
              top: cluster.top,
              width: cluster.width,
              height: cluster.height,
            }}
            aria-label={`${cluster.members.length} live spots at this destination cluster. Open station list`}
            title={`${cluster.members.length} live spots · open station list`}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpen(cluster, getAnchor(event.currentTarget));
            }}
          >
            {cluster.members.length}
          </button>
        ))}
    </>
  );
}

export default AzimuthalSpotClusterButtons;
