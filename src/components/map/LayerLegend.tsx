/**
 * LayerLegend Component
 *
 * Explains the dot colors used by every currently-enabled marker layer
 * (DX spots, satellites, beacons, WSPR, QSOs, earthquakes, weather alerts,
 * tropical cyclones, river gauges, meteor showers, and the single-color
 * marker layers). Colors come from `buildLayerLegends`, which sources them
 * straight from each layer's own color table so this legend can never
 * drift out of sync with the markers it describes -- the same approach
 * IonosphereLegend uses for the ray-path bounce markers.
 *
 * Collapsible: defaults to expanded, toggled via a real button so it stays
 * keyboard accessible. Collapsed state shows only the header pill, and lives
 * in `mapChromeUiStore` so a projection switch cannot reset it (#930).
 */

import { useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMapStore } from "@/stores/mapStore";
import { useMapChromeUiStore } from "@/stores/mapChromeUiStore";
import { useUIInteractionPrefs } from "@/stores/settingsStore";
import { useReplayStore } from "@/stores/replayStore";
import { buildLayerLegends } from "@/lib/map/layerLegends";

interface LayerLegendProps {
  /** Additional CSS classes */
  className?: string;
}

export function LayerLegend({ className = "" }: LayerLegendProps) {
  const layers = useMapStore((s) => s.layers);
  const viewMode = useMapStore((s) => s.viewMode);
  const replayEnabled = useMapStore((s) => s.replayEnabled);
  const replaySpotCount = useReplayStore((s) => s.replaySpots.length);
  const hasSatelliteTracks = useMapStore(
    (s) => Object.keys(s.satelliteTracks).length > 0,
  );
  const uiPrefs = useUIInteractionPrefs();
  const spotColorMode = uiPrefs.spotColorMode ?? "mode";
  // Session state, not component state: this legend renders inside the map
  // view's corner column, and switching projection unmounts the view (#930).
  const collapsed = useMapChromeUiStore((s) => s.legendCollapsed);
  const setCollapsed = useMapChromeUiStore((s) => s.setLegendCollapsed);

  const specs = useMemo(
    () =>
      buildLayerLegends(layers, {
        spotColorMode,
        viewMode,
        replayEnabled,
        replaySpotCount,
        hasSatelliteTracks,
      }),
    [
      layers,
      replayEnabled,
      replaySpotCount,
      spotColorMode,
      viewMode,
      hasSatelliteTracks,
    ],
  );

  if (specs.length === 0) return null;

  return (
    <div className={`text-xs ${className}`}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        className="flex items-center gap-1.5 text-su-muted font-medium"
      >
        <span>LEGEND</span>
        <span className="text-su-muted text-[10px]">
          {specs.length} layer{specs.length === 1 ? "" : "s"}
        </span>
        {collapsed ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
      {!collapsed && (
        <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto">
          {specs.map((spec) => (
            <div
              key={spec.key}
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <span className="text-su-muted font-medium">{spec.title}:</span>
              {spec.entries.map((entry) => (
                <div key={entry.label} className="flex items-center gap-1">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-[10px] text-su-muted">
                    {entry.label}
                  </span>
                </div>
              ))}
              {spec.note && (
                <span className="text-[10px] italic text-su-muted">
                  {spec.note}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
