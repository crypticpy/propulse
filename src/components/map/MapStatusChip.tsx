/**
 * MapStatusChip
 *
 * Compact system-health cluster for the PropSphere map toolbar.
 *
 * Time and operating location already have dedicated surfaces in every map
 * layout. Keeping only exceptional state and system health here avoids
 * repeating those facts while leaving health one click away.
 */

import { HealthStatusIndicator } from "@/components/ui/HealthStatusIndicator";
import { SyncStatusIndicator } from "@/components/ui/SyncStatusIndicator";
import { ConflictBadge } from "@/components/qso/ConflictBadge";
import { ConnectivityBadge } from "@/components/ui/ConnectivityBadge";

interface MapStatusChipProps {
  className?: string;
}

export function MapStatusChip({ className = "" }: MapStatusChipProps) {
  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      aria-label="Map system status"
    >
      <ConflictBadge />
      <ConnectivityBadge />
      <SyncStatusIndicator />
      <HealthStatusIndicator compact />
    </div>
  );
}

export default MapStatusChip;
