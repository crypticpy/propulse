import { lazy, Suspense, useMemo } from "react";
import { addHours } from "date-fns";
import { useGlobeLayerBridge } from "@/lib/atmos/globeLayerBridge";
import { useMapStore } from "@/stores/mapStore";
import { useAtmosStore } from "@/stores/atmosStore";
import { useNexradAvailable } from "@/hooks/useWeatherRadar";
import { WeatherLegend } from "@/components/atmos/WeatherLegend";
import { MAP_PAGE_CHROME_Z } from "@/lib/map/globeRenderOrder";
import { RadarScrubber3D } from "@/components/atmos/RadarScrubber3D";
import { BoundViewHost } from "@/components/views/BoundViewHost";
import { namedSlotId } from "@/lib/views/runtime";

// Dedicated slot so AtmosPulse's runtime never shares state (or a registry
// key) with PropSphere's "normal" working slot — see PR #603 review N1.
const ATMOS_VIEW_SLOT = namedSlotId("atmos");

const GlobeView = lazy(() =>
  import("@/components/map/GlobeView").then((m) => ({
    default: m.GlobeView,
  })),
);

/**
 * AtmosGlobeView — Renders the PropSphere GlobeView with AtmosPulse
 * layer flags synced via the globe layer bridge, plus weather-specific
 * HTML overlays (legend, radar scrubber).
 *
 * Passes NEXRAD availability to the scrubber so it can display the
 * source badge even when running its own independent timer (the 3D
 * overlay inside GlobeView composites NEXRAD tiles onto the same canvas).
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
  const nexradAvailable = useNexradAvailable(radarOn);

  // The globe owns the bottom-left corner and stacks this row above its size
  // control, so the two never share the spot (#930). Read-only legend, so it
  // stays under the map's overlay portal.
  const weatherCornerSlot = (
    <div
      className="relative pointer-events-auto"
      style={{ zIndex: MAP_PAGE_CHROME_Z.legend }}
    >
      <WeatherLegend />
    </div>
  );

  return (
    <BoundViewHost slot={ATMOS_VIEW_SLOT}>
      {/* `isolate` bounds the map's overlay portal (11000) to this wrapper.
          The weather legend is a `legend`-tier row in the globe's corner
          column, so the portal still paints above it the way #930 requires,
          while nothing on the AtmosPulse page below is outranked. */}
      <div data-map-stack-root className="relative w-full h-full isolate">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center bg-void-black">
              <span className="text-xs font-mono text-su-muted">
                Loading weather globe...
              </span>
            </div>
          }
        >
          <GlobeView
            displayTime={displayTime}
            hideRadarScrubber
            onUseFlatMap={() => useAtmosStore.getState().setViewMode("2d")}
            cornerSlot={weatherCornerSlot}
          />
        </Suspense>

        {radarOn && <RadarScrubber3D showNexradBadge={nexradAvailable} />}
      </div>
    </BoundViewHost>
  );
}
