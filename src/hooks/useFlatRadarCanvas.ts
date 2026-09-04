/**
 * Loads the latest RainViewer (+ NEXRAD when available) radar frame as an
 * equirectangular canvas for FlatMapView overlays.
 */

import { useEffect, useState } from "react";
import { useWeatherRadar } from "@/hooks/useWeatherRadar";
import { compositeRadarTilesForFrame } from "@/lib/map/radarComposite";

export function useFlatRadarCanvas(enabled: boolean): HTMLCanvasElement | null {
  const { manifest } = useWeatherRadar(enabled);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled || !manifest) {
      setCanvas(null);
      return;
    }

    let cancelled = false;
    const frames = manifest.radar.past;
    const latest = frames[frames.length - 1];
    if (!latest) {
      setCanvas(null);
      return;
    }

    void compositeRadarTilesForFrame(manifest, latest, true)
      .then(({ canvas: next }) => {
        if (!cancelled) setCanvas(next);
      })
      .catch((err) => {
        console.warn("[useFlatRadarCanvas] Failed to load radar frame:", err);
        if (!cancelled) setCanvas(null);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, manifest]);

  return canvas;
}
