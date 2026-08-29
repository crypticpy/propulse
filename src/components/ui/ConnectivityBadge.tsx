/**
 * ConnectivityBadge - Persistent header pill shown when the app is served by
 * the LAN bridge instead of the cloud.
 *
 * Hidden in normal cloud operation. The offline state already has its own
 * full-width banner (OfflineIndicator), so this badge only announces "LAN".
 *
 * Pattern mirrors HealthStatusIndicator.tsx / SyncStatusIndicator.tsx.
 */

import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";

export function ConnectivityBadge() {
  const connectivity = useDataSourceStatus((s) => s.connectivity);

  if (connectivity !== "lan") {
    return null;
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-nebula-blue/15 border border-nebula-blue/30"
      title="Served by your shack bridge — data comes from the LAN, cloud features are unavailable"
      role="status"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-nebula-blue" />
      <span className="text-[10px] font-mono font-semibold text-nebula-blue tracking-wider">
        LAN
      </span>
    </div>
  );
}
