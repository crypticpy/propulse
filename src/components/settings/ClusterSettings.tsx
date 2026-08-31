/**
 * ClusterSettings Component
 *
 * Settings-page presentation of the DX cluster connection. The controls
 * themselves live in `ClusterConnectionForm`, which the map toolbar popover
 * renders too, so both surfaces stay in step.
 */

import { memo } from "react";
import { ClusterConnectionForm } from "@/components/cluster/ClusterConnectionForm";
import type { ClusterLinkControls } from "@/hooks/useClusterLink";

interface ClusterSettingsProps {
  /**
   * Cluster controls over the Settings page's existing bridge socket. Passed in
   * rather than opened here so this section does not add a second connection
   * alongside the one CAT control already holds.
   */
  link: ClusterLinkControls;
  className?: string;
}

export const ClusterSettings = memo(function ClusterSettings({
  link,
  className = "",
}: ClusterSettingsProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        DX Cluster Connection
      </h3>

      <ClusterConnectionForm link={link} />

      {/* Info note */}
      <div className="flex items-start gap-2 p-3 bg-white/5 rounded-lg border border-white/5">
        <svg
          className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-xs text-gray-500">
          The DX cluster connection requires the ProPulse Bridge to be running
          locally. When connected, spots stream in real-time via WebSocket.
          Without the bridge, spots are fetched from the REST API. The cluster
          password is kept for this session only and is never written to disk.
        </p>
      </div>
    </div>
  );
});

export default ClusterSettings;
