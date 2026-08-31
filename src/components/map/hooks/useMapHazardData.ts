import { useEarthquakes } from "@/hooks/useEarthquakes";
import { useFires } from "@/hooks/useFires";
import { useLightning } from "@/hooks/useLightning";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import type { MapState } from "@/stores/mapStore";

type HazardLayerVisibility = Pick<
  MapState["layers"],
  "earthquakes" | "weather" | "lightning" | "fires"
>;

/**
 * Fetch the four hazard collections shared by every map projection.
 *
 * Keeping the visibility-to-hook wiring here prevents Flat, Globe, and
 * Azimuthal from drifting on which toggle owns a request. Each underlying
 * hook still owns its cache and will only fetch while its layer is enabled.
 */
export function useMapHazardData(layers: HazardLayerVisibility) {
  const { earthquakes: earthquakeData } = useEarthquakes(layers.earthquakes);
  const { alerts: weatherAlerts } = useWeatherAlerts(layers.weather);
  const { strikes: lightningStrikes } = useLightning(layers.lightning);
  const { hotspots: fireHotspots } = useFires(layers.fires);

  return {
    earthquakeData,
    weatherAlerts,
    lightningStrikes,
    fireHotspots,
  };
}
