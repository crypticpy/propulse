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
 * keyboard accessible. Collapsed state shows only the header pill.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMapStore } from "@/stores/mapStore";
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
  const uiPrefs = useUIInteractionPrefs();
  const spotColorMode = uiPrefs.spotColorMode ?? "mode";
  const [collapsed, setCollapsed] = useState(false);

  const specs = useMemo(
    () =>
      buildLayerLegends(layers, {
        spotColorMode,
        viewMode,
        replayEnabled,
        replaySpotCount,
      }),
    [layers, replayEnabled, replaySpotCount, spotColorMode, viewMode],
  );

  if (specs.length === 0) return null;

  return (
    <div className={`text-xs ${className}`}>
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        className="flex items-center gap-1.5 text-gray-500 font-medium"
      >
        <span>LEGEND</span>
        <span className="text-gray-400 text-[10px]">
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
              <span className="text-gray-500 font-medium">{spec.title}:</span>
              {spec.entries.map((entry) => (
                <div key={entry.label} className="flex items-center gap-1">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-[10px] text-gray-400">
                    {entry.label}
                  </span>
                </div>
              ))}
              {spec.note && (
                <span className="text-[10px] italic text-gray-500">
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
