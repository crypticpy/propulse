/**
 * Sync engine barrel export.
 *
 * Usage:
 *   import { SyncManager, useSyncStore } from '@/lib/sync';
 */

export { SyncManager } from "./SyncManager";
export { useSyncStore } from "./syncStore";
export { syncMeta } from "./syncMeta";
export { WriteQueue } from "./writeQueue";
export type {
  SyncModule,
  SyncMeta,
  SyncStatus,
  SyncTier,
  SyncableTable,
  WriteQueueEntry,
} from "./types";
export { DEFAULT_SYNC_META, DEFAULT_SYNC_STATUS } from "./types";
