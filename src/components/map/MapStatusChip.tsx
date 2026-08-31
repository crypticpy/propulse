/**
 * MapStatusChip
 *
 * Compact UTC clock + grid + system-health cluster for the PropSphere map
 * toolbar.
 *
 * This exists so the global masthead can stop carrying those three things on
 * /map. The masthead's job is navigation (menus, tools, help, shack,
 * settings); time, location and health are properties of what you are looking
 * at, so they belong in the visualization. On /map the masthead clock was also
 * a literal duplicate -- TimeControl and the Pro ribbon already render the
 * time -- so it read as two clocks disagreeing about which one mattered.
 *
 * Header keeps rendering all of this on every other route, where no in-page
 * equivalent exists.
 */

import { useEffect, useState } from "react";
import { formatUTC } from "@/lib/utils/time";
import { useUserStore } from "@/stores/userStore";
import { HealthStatusIndicator } from "@/components/ui/HealthStatusIndicator";
import { SyncStatusIndicator } from "@/components/ui/SyncStatusIndicator";
import { ConflictBadge } from "@/components/qso/ConflictBadge";
import { ConnectivityBadge } from "@/components/ui/ConnectivityBadge";

interface MapStatusChipProps {
  className?: string;
}

export function MapStatusChip({ className = "" }: MapStatusChipProps) {
  const { station } = useUserStore();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1.5" title="Current UTC time">
        <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
        <span className="font-mono text-xs text-signal-green font-semibold tabular-nums">
          {formatUTC(now)}
        </span>
        <span className="text-[10px] text-gray-500 font-medium">UTC</span>
      </div>

      <span
        className="font-mono text-[10px] text-gray-400"
        title={station?.grid ? "Your grid square" : "No QTH set"}
      >
        {station?.grid || "Set location"}
      </span>

      <div className="w-px h-3 bg-white/10" />

      <div className="flex items-center gap-1">
        <ConflictBadge />
        <ConnectivityBadge />
        <SyncStatusIndicator />
        <HealthStatusIndicator />
      </div>
    </div>
  );
}

export default MapStatusChip;
