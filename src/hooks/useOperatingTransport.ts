/**
 * Attaches this browsing context to the shared operating-state transport
 * (#658) for as long as the app is mounted.
 *
 * It is deliberately separate from `useOperatingScreen`, and mounted at the
 * app boundary rather than on `/workspace`: the workflow cursor is written
 * from every canvas — a contact entered on the map goes through
 * `opsPostureStore`, which writes `cursor.contact` — so a connection that
 * only existed while the operator happened to be on the workspace route
 * would silently drop those writes on the floor.
 *
 * Same-browser screens always converge over `BroadcastChannel`, free. The
 * other-device pipe (`createAccountTransport`, #698) is added to the
 * composite only when every one of these is true — never a client-side
 * guess, since `sync` is asked of the server on every read:
 * - a user is signed in (there is an account id to scope the channel to),
 * - `useSyncEntitlement` reads `sync: true` (cross-device sync is paid), and
 * - `followScreens` (the kill switch also `operatingStateStore` itself gates
 *   posting/applying on) is on.
 *
 * The composite is rebuilt — old transport closed, new one opened — whenever
 * any of those three changes, so signing out, losing the entitlement, or
 * flipping the kill switch closes the account channel immediately rather
 * than on the next unrelated remount.
 */

import { useEffect } from "react";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useSyncEntitlement } from "@/hooks/useSyncEntitlement";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  createAccountTransport,
  createBroadcastTransport,
  createCompositeTransport,
  type OperatingTransport,
} from "@/lib/workspace/operatingChannel";

export function useOperatingTransport(): void {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const followScreens = useOperatingStateStore((state) => state.followScreens);
  const { data: entitlement } = useSyncEntitlement();
  const sync = entitlement?.sync === true;

  useEffect(() => {
    const transports: OperatingTransport[] = [createBroadcastTransport()];
    if (isAuthenticated && userId && sync && followScreens && isSupabaseConfigured) {
      transports.push(createAccountTransport({ accountId: userId, client: getSupabase() }));
    }
    const transport =
      transports.length > 1 ? createCompositeTransport(transports) : transports[0];
    return useOperatingStateStore.getState().connect(transport);
  }, [isAuthenticated, userId, sync, followScreens]);
}
