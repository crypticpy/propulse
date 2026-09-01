import { useEffect, useState } from "react";
import type { MapStyle } from "@/stores/mapStore";
import type { EffectiveDisplayQuality } from "@/lib/map/displayQuality";
import { getSeasonalTextureCandidates } from "./useSeasonalDayTexture";

/** Loads only imagery that can contribute to the active flat-map style. */
export function useFlatMapBaseImage(
  mapStyle: MapStyle,
  hiResTexturesEnabled: boolean,
  effectiveQuality: EffectiveDisplayQuality,
): HTMLImageElement | null {
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let upgraded = false;
    let hiResImage: HTMLImageElement | null = null;
    const probeController = new AbortController();

    if (mapStyle !== "satellite") {
      setMapImage(null);
      return () => probeController.abort();
    }

    const fallback = new Image();
    fallback.onload = () => {
      if (!cancelled && !upgraded) setMapImage(fallback);
    };
    fallback.src = "/textures/earth-flat.jpg";

    const cleanup = () => {
      cancelled = true;
      fallback.onload = null;
      if (!fallback.complete) fallback.src = "";
      probeController.abort();
      if (hiResImage) {
        hiResImage.onload = null;
        if (!hiResImage.complete) hiResImage.src = "";
      }
    };

    const highDetailQuality =
      effectiveQuality === "uhd" || effectiveQuality === "extreme";
    if (!hiResTexturesEnabled && !highDetailQuality) {
      return cleanup;
    }

    const hiResUrl = getSeasonalTextureCandidates(true)[0];
    void fetch(hiResUrl, {
      method: "HEAD",
      signal: probeController.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        if (cancelled) return;
        const hiRes = new Image();
        hiResImage = hiRes;
        hiRes.crossOrigin = "anonymous";
        hiRes.onload = () => {
          if (!cancelled) {
            upgraded = true;
            setMapImage(hiRes);
          }
        };
        hiRes.src = hiResUrl;
      })
      .catch(() => {
        // The bundled 4K fallback remains visible offline or when probing fails.
      });

    return cleanup;
  }, [effectiveQuality, hiResTexturesEnabled, mapStyle]);

  return mapImage;
}
