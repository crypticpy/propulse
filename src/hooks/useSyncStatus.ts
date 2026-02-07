/**
 * useSyncStatus — Read-only hook for UI sync indicators.
 *
 * Returns the current sync state for use in header/footer status badges.
 *
 * @example
 * const { state, pendingCount, lastSyncAt, error } = useSyncStatus();
 * if (state === 'syncing') return <Spinner />;
 * if (state === 'offline') return <OfflineIcon />;
 */

import { useSyncStore } from "@/lib/sync";
import type { SyncStatus } from "@/lib/sync";

export function useSyncStatus(): SyncStatus {
  return useSyncStore((s) => s.status);
}
