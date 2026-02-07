/**
 * ConnectionsSection Component
 *
 * Wraps DX Cluster and CAT/Rig Control settings into a single
 * "Connections" section for the Settings page.
 * Initializes the bridge connection and passes bridge state
 * to both sub-components.
 */

import { ClusterSettings } from "@/components/settings/ClusterSettings";
import { CATSettings } from "@/components/settings/CATSettings";
import { useUserStore } from "@/stores/userStore";
import { useBridge } from "@/hooks/useBridge";

export function ConnectionsSection() {
  const bridgeEnabled = useUserStore((s) => s.preferences.bridgeEnabled);
  const updatePreferences = useUserStore((s) => s.updatePreferences);

  const { send: bridgeSend, connected: bridgeConnected } = useBridge({
    enabled: bridgeEnabled,
  });

  return (
    <div className="space-y-6">
      {/* DX Cluster */}
      <div>
        <h3 className="text-lg font-semibold text-gray-200 mb-1">DX Cluster</h3>
        <p className="text-sm text-gray-500 mb-4">
          Connect to a DX cluster node for real-time spot streaming via the
          ProPulse Bridge.
        </p>
        <ClusterSettings
          bridgeSend={bridgeSend}
          bridgeConnected={bridgeConnected}
        />
      </div>

      {/* Separator */}
      <div className="border-t border-white/10 pt-6 mt-6">
        {/* CAT / Rig Control */}
        <h3 className="text-lg font-semibold text-gray-200 mb-1">
          CAT / Rig Control
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Configure computer-aided transceiver control to sync frequency, mode,
          and S-meter data with your rig.
        </p>
        <CATSettings
          bridgeSend={bridgeSend}
          bridgeConnected={bridgeConnected}
          bridgeEnabled={!!bridgeEnabled}
          onBridgeEnabledChange={(enabled) =>
            updatePreferences({ bridgeEnabled: enabled })
          }
        />
      </div>
    </div>
  );
}
