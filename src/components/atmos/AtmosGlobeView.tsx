import { lazy, Suspense, useMemo } from "react";
import { addHours } from "date-fns";
import { useGlobeLayerBridge } from "@/lib/atmos/globeLayerBridge";
import { useMapStore } from "@/stores/mapStore";

const GlobeView = lazy(() =>
  import("@/components/map/GlobeView").then((m) => ({
    default: m.GlobeView,
  })),
);

/**
 * Proxy component that renders the existing PropSphere GlobeView
 * with AtmosPulse layer flags synced via the globe layer bridge.
 */
export function AtmosGlobeView() {
  // Sync atmosStore layers -> mapStore layers
  useGlobeLayerBridge();

  const timeOffset = useMapStore((s) => s.timeOffset);
  const displayTime = useMemo(
    () => addHours(new Date(), timeOffset),
    [timeOffset],
  );

  return (
    <Suspense
      fallback={
        <div className="absolute inset-0 flex items-center justify-center bg-void-black">
          <span className="text-xs font-mono text-gray-600">
            Loading globe...
          </span>
        </div>
      }
    >
      <GlobeView displayTime={displayTime} />
    </Suspense>
  );
}
