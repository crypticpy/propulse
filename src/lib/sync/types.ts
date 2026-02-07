/**
 * Sync engine types — defines interfaces for the 3-tier sync architecture.
 *
 * Tier 1 (Eager): Profile, preferences, locations, targets — 5s debounce, full blob push
 * Tier 2 (Incremental): Logbook, contests — 30s batch flush, delta sync
 * Tier 3 (Lazy): Watches, pins, skeds, alert rules — immediate on CRUD
 */

/** All Supabase tables that participate in sync */
export type SyncableTable =
  | "profiles"
  | "saved_locations"
  | "user_preferences"
  | "saved_targets"
  | "user_radios"
  | "log_entries"
  | "contest_sessions"
  | "contest_qsos"
  | "watches"
  | "map_pins"
  | "skeds"
  | "alert_rules"
  | "antennas"
  | "feedlines"
  | "accessories"
  | "station_presets";

/** Sync tier determines flush cadence */
export type SyncTier = "eager" | "incremental" | "lazy";

/** Per-module last-synced timestamps, stored in localStorage */
export interface SyncMeta {
  lastSyncedAt: Record<string, string | null>;
}

/** UI-facing sync status */
export interface SyncStatus {
  state: "idle" | "syncing" | "error" | "offline";
  pendingCount: number;
  lastSyncAt: string | null;
  error: string | null;
}

/** Offline write queue entry */
export interface WriteQueueEntry {
  /** Unique queue entry ID */
  queueId: string;
  /** Supabase table name */
  table: SyncableTable;
  /** Operation type */
  operation: "upsert" | "delete";
  /** Row data (for upsert) or identifying data (for delete) */
  data: Record<string, unknown>;
  /** ISO timestamp of when the entry was created */
  timestamp: string;
  /** Number of failed push attempts */
  retryCount: number;
  /** Current status */
  status: "pending" | "failed";
}

/**
 * Sync module interface — each module handles one logical data group.
 * Modules are registered with SyncManager and called at tier-appropriate cadences.
 */
export interface SyncModule {
  /** Human-readable name for logging */
  name: string;
  /** Sync tier (determines flush cadence) */
  tier: SyncTier;
  /** Supabase tables this module owns */
  tables: SyncableTable[];

  /**
   * Pull data from Supabase into local state.
   * @param userId - Authenticated user's UUID
   * @param since - ISO timestamp for delta sync (null = full pull)
   * @returns Newest `updated_at` timestamp seen, or null if no data
   */
  pull(userId: string, since: string | null): Promise<string | null>;

  /**
   * Push current local state to Supabase (full blob push).
   * Primarily used by Tier 1 modules.
   * @param userId - Authenticated user's UUID
   */
  push(userId: string): Promise<void>;

  /**
   * Process write queue entries belonging to this module's tables.
   * Used by Tier 2/3 for incremental pushes.
   * @param userId - Authenticated user's UUID
   * @param entries - Filtered queue entries for this module's tables
   * @returns Queue IDs of successfully processed entries
   */
  processQueue?(userId: string, entries: WriteQueueEntry[]): Promise<string[]>;
}

/** Default empty sync meta */
export const DEFAULT_SYNC_META: SyncMeta = {
  lastSyncedAt: {},
};

/** Default sync status */
export const DEFAULT_SYNC_STATUS: SyncStatus = {
  state: "idle",
  pendingCount: 0,
  lastSyncAt: null,
  error: null,
};
