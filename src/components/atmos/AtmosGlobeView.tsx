import { lazy, Suspense, useMemo } from "react";
import { addHours } from "date-fns";
import { useGlobeLayerBridge } from "@/lib/atmos/globeLayerBridge";
import { useMapStore } from "@/stores/mapStore";
import { useAtmosStore } from "@/stores/atmosStore";
import { WeatherLegend } from "@/components/atmos/WeatherLegend";
import { RadarScrubber3D } from "@/components/atmos/RadarScrubber3D";

const GlobeView = lazy(() =>
  import("@/components/map/GlobeView").then((m) => ({
    default: m.GlobeView,
  })),
);

/**
 * AtmosGlobeView — Renders the PropSphere GlobeView with AtmosPulse
 * layer flags synced via the globe layer bridge, plus weather-specific
 * HTML overlays (legend, radar scrubber).
 */
export function AtmosGlobeView() {
  // Sync atmosStore layers -> mapStore layers
  useGlobeLayerBridge();

  const timeOffset = useMapStore((s) => s.timeOffset);
  const displayTime = useMemo(
    () => addHours(new Date(), timeOffset),
    [timeOffset],
  );

  const radarOn = useAtmosStore((s) => s.layerVisibility.radar);

  return (
    <div className="relative w-full h-full">
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-void-black">
            <span className="text-xs font-mono text-gray-600">
              Loading weather globe...
            </span>
          </div>
        }
      >
        <GlobeView displayTime={displayTime} />
      </Suspense>

      {/* Weather-specific overlays */}
      <WeatherLegend />
      {radarOn && <RadarScrubber3D />}
    </div>
  );
}
