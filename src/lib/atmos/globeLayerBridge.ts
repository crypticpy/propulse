/**
 * Maps AtmosPulse layer IDs to mapStore layer keys and suppresses
 * radio-specific layers when the AtmosPulse 3D view is active.
 */

import { useEffect, useRef } from "react";
import { useAtmosStore } from "@/stores/atmosStore";
import { useMapStore } from "@/stores/mapStore";
import type { AtmosLayerId } from "@/types/atmos";

type MapLayerKey = keyof ReturnType<typeof useMapStore.getState>["layers"];

/**
 * Mapping from AtmosPulse layer → mapStore layer key.
 * Only layers with a direct mapStore counterpart are included.
 */
const ATMOS_TO_MAP_LAYER: Partial<Record<AtmosLayerId, MapLayerKey>> = {
  radar: "radar",
  lightning: "lightning",
  alerts: "weather",
  fires: "fires",
  goesCloud: "goesCloud",
  tec: "tec",
  aurora: "aurora",
  earthquakes: "earthquakes",
  repeaters: "repeaters",
  riverGauges: "riverGauges",
  aprs: "aprs",
};

/**
 * Radio-centric layers that should be suppressed in the AtmosPulse 3D view.
 * These will be forced OFF on mount and restored on unmount.
 */
const RADIO_LAYERS_TO_SUPPRESS: MapLayerKey[] = [
  "spots",
  "spotTraces",
  "beacons",
  "spectrumRing",
  "contestQsos",
  "loggedQsos",
  "ft8Spotter",
  "wspr",
  "gridActivity",
  "ionosphere",
  "rayPath",
  "drap",
  "geomagField",
  "noiseFloor",
  "meteorShowers",
  "ducting",
  "sporadicE",
  "nvis",
];

/**
 * Hook that syncs atmosStore layerVisibility → mapStore layers,
 * suppresses radio layers, and restores them on unmount.
 */
export function useGlobeLayerBridge() {
  const layerVisibility = useAtmosStore((s) => s.layerVisibility);
  const savedRadioStateRef = useRef<Partial<Record<MapLayerKey, boolean>>>({});

  // On mount: snapshot radio layer states and suppress them
  useEffect(() => {
    const mapLayers = useMapStore.getState().layers;
    const { toggleLayer } = useMapStore.getState();
    const snapshot: Partial<Record<MapLayerKey, boolean>> = {};

    for (const key of RADIO_LAYERS_TO_SUPPRESS) {
      snapshot[key] = mapLayers[key];
      if (mapLayers[key]) {
        toggleLayer(key);
      }
    }
    savedRadioStateRef.current = snapshot;

    // Cleanup: restore radio layers on unmount
    return () => {
      const currentLayers = useMapStore.getState().layers;
      const toggle = useMapStore.getState().toggleLayer;
      const saved = savedRadioStateRef.current;

      for (const key of RADIO_LAYERS_TO_SUPPRESS) {
        const wasOn = saved[key] ?? false;
        const isOn = currentLayers[key];
        if (wasOn && !isOn) {
          toggle(key);
        }
      }
    };
  }, []);

  // Sync AtmosPulse layer toggles → mapStore
  useEffect(() => {
    const mapLayers = useMapStore.getState().layers;
    const { toggleLayer } = useMapStore.getState();

    for (const [atmosKey, mapKey] of Object.entries(ATMOS_TO_MAP_LAYER)) {
      if (!mapKey) continue;
      const atmosEnabled = layerVisibility[atmosKey as AtmosLayerId] ?? false;
      const mapEnabled = mapLayers[mapKey] ?? false;

      if (atmosEnabled !== mapEnabled) {
        toggleLayer(mapKey);
      }
    }
  }, [layerVisibility]);
}
