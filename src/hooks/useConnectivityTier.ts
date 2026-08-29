/**
 * useConnectivityTier — keeps dataSourceStatusStore.connectivity in sync with
 * how the app is actually being served: "cloud" (hosted), "lan" (served by
 * the shack bridge), or "offline" (no network at all).
 *
 * Detection is passive: a static origin check plus online/offline listeners.
 * No polling, no fetches. Mount once per layout.
 */

import { useEffect } from "react";
import {
  useDataSourceStatus,
  type ConnectivityTier,
} from "@/stores/dataSourceStatusStore";

/** Default port the bridge serves the built SPA on (BRIDGE_STATIC_PORT). */
const BRIDGE_STATIC_PORT = "3173";

/**
 * Pure tier resolution, exported for tests.
 *
 * A `.local` hostname (mDNS, e.g. propulse.local) or the bridge static port
 * means the SPA was served by the LAN bridge rather than the cloud host.
 * No network trumps everything — even a bridge can't reach upstream feeds.
 */
export function resolveConnectivityTier(
  onLine: boolean,
  location: { port: string; hostname: string },
): ConnectivityTier {
  if (!onLine) return "offline";
  const servedByBridge =
    location.port === BRIDGE_STATIC_PORT || location.hostname.endsWith(".local");
  return servedByBridge ? "lan" : "cloud";
}

export function useConnectivityTier(): void {
  const setConnectivity = useDataSourceStatus((s) => s.setConnectivity);

  useEffect(() => {
    const sync = () =>
      setConnectivity(resolveConnectivityTier(navigator.onLine, window.location));
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [setConnectivity]);
}
