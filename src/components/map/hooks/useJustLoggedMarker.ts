import { useEffect } from "react";
import { useMapStore, type LoggedMarker } from "@/stores/mapStore";

/** How long the globe pulse / "Logged CALL" chip stays visible. */
export const JUST_LOGGED_PULSE_DURATION_MS = 2000;

/**
 * Shared expiry logic for the "just logged" globe pulse marker.
 *
 * The lifetime is anchored to `marker.at`, not to when this hook happens to
 * mount -- a QSO can be logged (WSJT-X auto-log, or manual Enter) while the
 * globe is unmounted (flat/azimuthal view, another route). Starting a fresh
 * 2s timer on mount would leave a stale marker/chip visible whenever the
 * operator returns to the globe after that window has already passed.
 *
 * Returns the marker only while it is still within its lifetime, so render
 * paths (the DOM chip, the R3F ring) never show an already-expired marker
 * even before the scheduled clear fires. Any mounted consumer -- including
 * one that only needs the expiry side effect, like the app-root WSJT-X host
 * -- can call this to keep `justLogged` from lingering.
 */
export function useJustLoggedMarker(): LoggedMarker | null {
  const justLogged = useMapStore((s) => s.justLogged);
  const setJustLogged = useMapStore((s) => s.setJustLogged);

  useEffect(() => {
    if (!justLogged) return undefined;
    const markerAt = justLogged.at;
    const clearIfStillCurrent = () => {
      // Only clear if a newer marker hasn't already replaced this one.
      if (useMapStore.getState().justLogged?.at === markerAt) {
        setJustLogged(null);
      }
    };

    const remaining = markerAt + JUST_LOGGED_PULSE_DURATION_MS - Date.now();
    if (remaining <= 0) {
      clearIfStillCurrent();
      return undefined;
    }
    const timer = window.setTimeout(clearIfStillCurrent, remaining);
    return () => window.clearTimeout(timer);
  }, [justLogged, setJustLogged]);

  if (!justLogged) return null;
  return Date.now() - justLogged.at < JUST_LOGGED_PULSE_DURATION_MS
    ? justLogged
    : null;
}
