import { useEffect } from "react";
import { useMapStore, type FlashPoint } from "@/stores/mapStore";

/** How long a flashed point (e.g. a report's hop reflection point) stays
 * visible on the map. */
export const FLASH_POINT_DURATION_MS = 3000;

/**
 * Shared expiry logic for the momentary "flash point" marker, mirroring
 * `useJustLoggedMarker`'s anchor-to-timestamp pattern: the lifetime is
 * anchored to `flashPoint.at`, not to when this hook happens to mount, so a
 * point flashed while a view is unmounted (e.g. flat vs. globe) never lingers
 * past its window once the operator switches views.
 */
export function useFlashPoint(): FlashPoint | null {
  const flashPoint = useMapStore((s) => s.flashPoint);
  const clearFlashPoint = useMapStore((s) => s.clearFlashPoint);

  useEffect(() => {
    if (!flashPoint) return undefined;
    const markerAt = flashPoint.at;
    const clearIfStillCurrent = () => {
      // Only clear if a newer flash hasn't already replaced this one.
      if (useMapStore.getState().flashPoint?.at === markerAt) {
        clearFlashPoint();
      }
    };

    const remaining = markerAt + FLASH_POINT_DURATION_MS - Date.now();
    if (remaining <= 0) {
      clearIfStillCurrent();
      return undefined;
    }
    const timer = window.setTimeout(clearIfStillCurrent, remaining);
    return () => window.clearTimeout(timer);
  }, [flashPoint, clearFlashPoint]);

  if (!flashPoint) return null;
  return Date.now() - flashPoint.at < FLASH_POINT_DURATION_MS
    ? flashPoint
    : null;
}
