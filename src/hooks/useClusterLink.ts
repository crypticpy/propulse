/**
 * Cluster link controls, built over an existing bridge socket.
 *
 * `useBridge` opens a real WebSocket per call site, so a surface that already
 * holds one (the Settings page holds one for CAT control) must be able to drive
 * the cluster link through it rather than opening a second. This hook is the
 * seam: give it a `send` and the socket's connected flag, get back the
 * connect/disconnect pair `ClusterConnectionForm` needs.
 */

import { useCallback } from "react";
import { useDXStore } from "@/stores/dxStore";
import {
  buildConnectPayload,
  type ClusterPrefs,
} from "@/lib/cluster/clusterPrefs";

/** What the connection form needs in order to drive a cluster link. */
export interface ClusterLinkControls {
  /** Whether the underlying bridge socket is up. */
  bridgeConnected: boolean;
  /** Ask the bridge to attach to the node these prefs describe. */
  clusterConnect: (prefs: ClusterPrefs) => boolean;
  /** Ask the bridge to drop the cluster link. */
  clusterDisconnect: () => boolean;
}

type BridgeSend = (type: string, payload: unknown) => boolean;

export function useClusterLink(
  bridgeSend: BridgeSend,
  bridgeConnected: boolean,
): ClusterLinkControls {
  const setClusterStatus = useDXStore((s) => s.setClusterStatus);

  const clusterConnect = useCallback(
    (prefs: ClusterPrefs): boolean =>
      bridgeSend("cluster.connect", buildConnectPayload(prefs)),
    [bridgeSend],
  );

  const clusterDisconnect = useCallback((): boolean => {
    const sent = bridgeSend("cluster.disconnect", {});
    if (sent) setClusterStatus(null);
    return sent;
  }, [bridgeSend, setClusterStatus]);

  return { bridgeConnected, clusterConnect, clusterDisconnect };
}
