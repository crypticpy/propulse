/**
 * Maps AtmosPulse layer IDs to mapStore layer keys.
 * Used to sync AtmosPulse layer toggles with the 3D globe.
 */

import { useEffect } from "react";
import { useAtmosStore } from "@/stores/atmosStore";
import { useMapStore } from "@/stores/mapStore";
import type { AtmosLayerId } from "@/types/atmos";

type MapLayerKey = keyof ReturnType<typeof useMapStore.getState>["layers"];

/**
 * Mapping from AtmosPulse layer -> mapStore layer key.
 * Only layers with a direct mapStore counterpart are included.
 * Layers like "repeaters", "riverGauges", "rim", "sst" are AtmosPulse-only
 * and have no 3D globe equivalent.
 */
const ATMOS_TO_MAP_LAYER: Partial<Record<AtmosLayerId, MapLayerKey>> = {
  radar: "radar",
  lightning: "lightning",
  alerts: "weather",
  fires: "fires",
  goesCloud: "goesCloud",
  tec: "tec",
};

/**
 * Hook that syncs atmosStore layerVisibility -> mapStore layers.
 * Only runs when AtmosPulse 3D view is active.
 *
 * When an AtmosPulse layer is toggled, this effect compares the current
 * atmosStore visibility against mapStore and calls toggleLayer to sync.
 */
export function useGlobeLayerBridge() {
  const layerVisibility = useAtmosStore((s) => s.layerVisibility);

  useEffect(() => {
    const mapLayers = useMapStore.getState().layers;
    const { toggleLayer } = useMapStore.getState();

    for (const [atmosKey, mapKey] of Object.entries(ATMOS_TO_MAP_LAYER)) {
      if (!mapKey) continue;
      const atmosEnabled = layerVisibility[atmosKey as AtmosLayerId] ?? false;
      const mapEnabled = mapLayers[mapKey] ?? false;

      // Only toggle if out of sync
      if (atmosEnabled !== mapEnabled) {
        toggleLayer(mapKey);
      }
    }
  }, [layerVisibility]);
}
