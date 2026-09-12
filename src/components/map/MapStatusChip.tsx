/**
 * MapStatusChip
 *
 * Compact system-health cluster for the PropSphere map toolbar.
 *
 * Time and operating location already have dedicated surfaces in every map
 * layout. Keeping only exceptional state and system health here avoids
 * repeating those facts while leaving health one click away.
 */

import { useEffect } from "react";
import { HealthStatusIndicator } from "@/components/ui/HealthStatusIndicator";
import { SyncStatusIndicator } from "@/components/ui/SyncStatusIndicator";
import { ConflictBadge } from "@/components/qso/ConflictBadge";
import { ConnectivityBadge } from "@/components/ui/ConnectivityBadge";
import { useMapStore } from "@/stores/mapStore";

/** How long the orbit-track eviction notice stays up before it self-clears. */
const SATELLITE_TRACK_EVICTION_AUTO_DISMISS_MS = 8000;

/**
 * Ephemeral notice for the "Map orbit" track cap (#994 PR B): when a 6th
 * tracked satellite evicts the oldest one, `mapStore.satelliteTrackEviction`
 * is set (see `setSatelliteTrack`) and this badge surfaces it here, the same
 * store-driven-badge pattern `ConflictBadge` / `ConnectivityBadge` use.
 * Auto-dismisses after `SATELLITE_TRACK_EVICTION_AUTO_DISMISS_MS`, or on
 * click. Renders nothing (and starts no timer) while there is no eviction.
 *
 * Exported (not just used inline below) so `PropSphere.tsx` can mount it a
 * second time outside the normal-layout toolbar for the `pro`/`hamclock`
 * fullscreen layouts, which never mount `<MapStatusChip>` itself -- see
 * `PropSphere.tsx`'s standalone eviction-badge wrapper (#994 PR B round 3
 * Codex thread 4).
 */
export function SatelliteTrackEvictionBadge() {
  const eviction = useMapStore((s) => s.satelliteTrackEviction);
  const dismiss = useMapStore((s) => s.dismissSatelliteTrackEviction);

  useEffect(() => {
    if (!eviction) return;
    // Anchor the window on the eviction's own timestamp, not "now" -- a
    // fresh 8s window on every mount would show a stale notice as new after
    // navigating away and back hours later (#994 PR B round 2 Codex thread
    // 3). If the window has already elapsed, dismiss on the next tick
    // (inside the effect, not during render) instead of scheduling a timer.
    const remainingMs =
      SATELLITE_TRACK_EVICTION_AUTO_DISMISS_MS -
      (Date.now() - eviction.timestamp);
    if (remainingMs <= 0) {
      dismiss();
      return;
    }
    const timer = setTimeout(dismiss, remainingMs);
    return () => clearTimeout(timer);
  }, [eviction, dismiss]);

  if (!eviction) return null;

  // The evicted track's own recorded name (set when it was added), not a
  // re-derived POPULAR_SATS lookup -- a NORAD id can map to more than one
  // popular-satellite name, so re-deriving it here could name the wrong
  // bird (#994 PR B round 3 Codex thread 3).
  const name = eviction.name ?? `NORAD ${eviction.noradId}`;
  const fullSentence = `Orbit track limit reached — cleared ${name} to make room. Dismiss.`;

  return (
    <button
      type="button"
      onClick={dismiss}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-caution-amber/30 bg-caution-amber/20 px-2.5 py-0.5 text-xs font-semibold text-su-text transition-colors hover:bg-caution-amber/30"
      aria-label={fullSentence}
      title={fullSentence}
    >
      Orbit limit · dropped {name}
    </button>
  );
}

interface MapStatusChipProps {
  className?: string;
}

export function MapStatusChip({ className = "" }: MapStatusChipProps) {
  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      aria-label="Map system status"
    >
      <SatelliteTrackEvictionBadge />
      <ConflictBadge />
      <ConnectivityBadge />
      <SyncStatusIndicator />
      <HealthStatusIndicator compact />
    </div>
  );
}

export default MapStatusChip;
