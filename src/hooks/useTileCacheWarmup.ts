import { useEffect } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import { useThemeStore } from "@/stores/themeStore";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { resolveDisplayQuality } from "@/lib/map/displayQuality";
import { selectTileProvider } from "@/lib/tiles/providers";
import { cartoTileUrl } from "@/lib/tiles/carto";
import { warmTileCache } from "@/lib/tiles/warmTileCache";

/**
 * Warms the service worker's tile caches for the currently active basemap
 * and label overlay once per session (see `warmTileCache.ts`), so a
 * returning visit paints a fully skinned globe without re-downloading
 * already-seen z0-z2 (or z0-z3 on UHD/Extreme) tiles. Runs once on mount,
 * during browser idle time, so it never competes with the globe's own
 * first-frame tile requests.
 */
export function useTileCacheWarmup(): void {
  useEffect(() => {
    const { mapStyle, tileProviderId } = useMapStore.getState();
    const { subscriptionTier } = useProfileStore.getState();
    const { themeId } = useThemeStore.getState();
    const { displayQuality } = useDisplayQualityStore.getState();

    const provider = selectTileProvider(
      mapStyle,
      subscriptionTier,
      tileProviderId,
    );
    const labelTileUrl = cartoTileUrl(
      themeId === "light" ? "light_only_labels" : "dark_only_labels",
    );
    const quality = resolveDisplayQuality(displayQuality);
    const includeZoom3 =
      quality.effective === "uhd" || quality.effective === "extreme";

    const run = () => {
      void warmTileCache({
        sources: [
          {
            id: provider.id,
            urlTemplate: provider.url,
            requiresAuth: provider.requiresAuth,
          },
          { id: "labels", urlTemplate: labelTileUrl },
        ],
        includeZoom3,
        sessionKey: `${provider.id}:${themeId}`,
      });
    };

    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(run);
    } else {
      timeoutHandle = setTimeout(run, 1500);
    }

    return () => {
      if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    };
  }, []);
}
