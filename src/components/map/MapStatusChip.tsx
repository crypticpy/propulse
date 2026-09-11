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
import { getPopularSatelliteName } from "@/lib/api/satellites";

/** How long the orbit-track eviction notice stays up before it self-clears. */
const SATELLITE_TRACK_EVICTION_AUTO_DISMISS_MS = 8000;

/**
 * Ephemeral notice for the "Map orbit" track cap (#994 PR B): when a 6th
 * tracked satellite evicts the oldest one, `mapStore.satelliteTrackEviction`
 * is set (see `setSatelliteTrack`) and this badge surfaces it here, the same
 * store-driven-badge pattern `ConflictBadge` / `ConnectivityBadge` use.
 * Auto-dismisses after `SATELLITE_TRACK_EVICTION_AUTO_DISMISS_MS`, or on
 * click. Renders nothing (and starts no timer) while there is no eviction.
 */
function SatelliteTrackEvictionBadge() {
  const eviction = useMapStore((s) => s.satelliteTrackEviction);
  const dismiss = useMapStore((s) => s.dismissSatelliteTrackEviction);

  useEffect(() => {
    if (!eviction) return;
    const timer = setTimeout(
      dismiss,
      SATELLITE_TRACK_EVICTION_AUTO_DISMISS_MS,
    );
    return () => clearTimeout(timer);
  }, [eviction, dismiss]);

  if (!eviction) return null;

  const evictedNoradId = Number(eviction.noradId);
  const name =
    getPopularSatelliteName(evictedNoradId) ?? `NORAD ${eviction.noradId}`;
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
