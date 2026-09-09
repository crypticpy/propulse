/**
 * Server-verified `sync` entitlement (#698).
 *
 * Cross-device operating state is the paid value — `useOperatingTransport`
 * opens the account transport only when this reads true. Deliberately not
 * derived from `profileStore` / `useSubscription`: that state is a synced
 * *copy* of the server's row, and a security-relevant gate has to ask the
 * server on every read, not trust a client-held value.
 */

import { useQuery } from "@tanstack/react-query";
import { authHeaders } from "@/lib/api/authFetch";
import { selectIsAuthenticated, useAuthStore } from "@/stores/authStore";

export interface SyncEntitlement {
  sync: boolean;
}

async function fetchSyncEntitlement(): Promise<SyncEntitlement> {
  const headers = await authHeaders();
  const response = await fetch("/api/billing/entitlements", { headers });
  if (!response.ok) {
    throw new Error(`sync entitlement request failed: ${response.status}`);
  }
  const data = (await response.json()) as { sync?: unknown };
  return { sync: data.sync === true };
}

export function useSyncEntitlement() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const userId = useAuthStore((state) => state.user?.id ?? null);

  return useQuery({
    // Keyed on the user id (owner review, #698 fix round): without it, an
    // account-A answer cached within staleTime would be served to account B
    // after a sign-out/sign-in — the query key must change with the account,
    // not just the endpoint.
    queryKey: ["sync-entitlement", userId],
    queryFn: fetchSyncEntitlement,
    enabled: isAuthenticated && userId !== null,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
