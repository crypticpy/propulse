/**
 * QSO-specific sync engine with version vector delta sync.
 *
 * Enhances the existing logbookSync module with:
 * - Version vector tracking: each device has a monotonically increasing version
 * - Delta sync: pull only entries with version > lastKnownVersion
 * - Version-based conflict resolution extending existing conflict.ts patterns
 * - Batch push/pull operations (100 entries per batch)
 *
 * Integrates with the existing SyncManager via module registration pattern.
 * Does NOT replace logbookSync — works alongside it for version-aware operations.
 */

import { getSupabase } from "@/lib/supabase";
import { getDB } from "@/lib/db";
import type { LogEntry } from "@/lib/db/types";
import { getDeviceId } from "./deviceId";
import { detectFieldConflicts, autoMerge } from "./conflict";
import { syncMeta } from "./syncMeta";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Max entries per batch for push/pull operations */
const BATCH_SIZE = 100;

/** localStorage key for the local version cursor */
const VERSION_KEY = "propulse-qso-sync-version";

// ─── Types ──────────────────────────────────────────────────────────────────

/** A QSO delta entry for sync transport */
export interface QSODelta {
  id: string;
  version: number;
  deviceId: string;
  operation: "upsert" | "delete";
  /** Full entry data for upsert, partial for delete */
  data: Record<string, unknown>;
  updatedAt: string;
}

/** Conflict entry returned from the sync API */
export interface ConflictEntry {
  entryId: string;
  localVersion: number;
  remoteVersion: number;
  conflictFields: string[];
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
}

/** Result of a sync pull operation */
export interface SyncPullResult {
  entries: QSODelta[];
  latestVersion: number;
  hasMore: boolean;
}

/** Result of a sync push operation */
export interface SyncPushResult {
  processedIds: string[];
  conflicts: ConflictEntry[];
  latestVersion: number;
}

// ─── QSOSyncEngine ─────────────────────────────────────────────────────────

export class QSOSyncEngine {
  private deviceId: string;

  constructor() {
    this.deviceId = getDeviceId();
  }

  /** Get the device ID for this engine instance */
  getDeviceIdValue(): string {
    return this.deviceId;
  }

  // ─── Version Management ─────────────────────────────────────────────

  /** Get the local version cursor (highest version seen from server) */
  getLocalVersion(): number {
    try {
      const raw = localStorage.getItem(VERSION_KEY);
      return raw ? parseInt(raw, 10) : 0;
    } catch {
      return 0;
    }
  }

  /** Update the local version cursor */
  private setLocalVersion(version: number): void {
    try {
      localStorage.setItem(VERSION_KEY, String(version));
    } catch {
      // localStorage full — non-fatal
    }
  }

  // ─── Pull (Server → Local) ─────────────────────────────────────────

  /**
   * Pull changes from Supabase since the given version.
   * Uses version-based delta sync for efficient incremental pulls.
   *
   * @param sinceVersion - Pull entries with version > this value (0 for full pull)
   * @param userId - Authenticated user's UUID
   * @returns Pull result with entries and latest version
   */
  async pullChanges(
    userId: string,
    sinceVersion?: number,
  ): Promise<SyncPullResult> {
    const supabase = getSupabase();
    const version = sinceVersion ?? this.getLocalVersion();

    const { data, error } = await supabase
      .from("log_entries")
      .select("*")
      .eq("user_id", userId)
      .gt("version", version)
      .order("version", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      throw new Error(`QSO pull failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return { entries: [], latestVersion: version, hasMore: false };
    }

    const entries: QSODelta[] = data.map((row) => ({
      id: row.id,
      version: ((row as Record<string, unknown>).version as number) ?? 1,
      deviceId: ((row as Record<string, unknown>).device_id as string) ?? "",
      operation: row.deleted_at ? "delete" : "upsert",
      data: row as unknown as Record<string, unknown>,
      updatedAt: row.updated_at,
    }));

    const latestVersion = Math.max(version, ...entries.map((e) => e.version));

    return {
      entries,
      latestVersion,
      hasMore: data.length === BATCH_SIZE,
    };
  }

  /**
   * Pull all changes since last sync and apply to local IndexedDB.
   * Loops until all pages are fetched.
   *
   * @param userId - Authenticated user's UUID
   * @returns Total number of entries applied
   */
  async pullAndApply(userId: string): Promise<number> {
    const db = await getDB();
    let totalApplied = 0;
    let currentVersion = this.getLocalVersion();
    let hasMore = true;

    while (hasMore) {
      const result = await this.pullChanges(userId, currentVersion);

      if (result.entries.length === 0) {
        hasMore = false;
        break;
      }

      // Apply entries to IndexedDB
      const tx = db.transaction("logEntries", "readwrite");

      for (const delta of result.entries) {
        if (delta.operation === "delete") {
          try {
            await tx.store.delete(delta.id);
          } catch {
            // Entry may not exist locally
          }
        } else {
          // For upserts, check for conflicts with local data
          const localEntry = await tx.store
            .get(delta.id)
            .catch(() => undefined);
          const remoteEntry = this.deltaToLogEntry(delta);

          if (remoteEntry) {
            if (localEntry && this.shouldResolveConflict(localEntry, delta)) {
              // Resolve conflict using existing auto-merge
              const merged = autoMerge(localEntry, remoteEntry);
              merged.version = Math.max(localEntry.version ?? 0, delta.version);
              merged.lastDeviceId = delta.deviceId;
              await tx.store.put(merged);
            } else {
              // No conflict or no local entry — apply remote directly
              remoteEntry.version = delta.version;
              remoteEntry.lastDeviceId = delta.deviceId;
              await tx.store.put(remoteEntry);
            }
          }
        }

        totalApplied++;
      }

      await tx.done;

      currentVersion = result.latestVersion;
      this.setLocalVersion(currentVersion);

      // Update sync meta for the logbook module
      const newestTimestamp =
        result.entries[result.entries.length - 1]?.updatedAt;
      if (newestTimestamp) {
        syncMeta.setTimestamp("logbook-version", newestTimestamp);
      }

      hasMore = result.hasMore;
    }

    return totalApplied;
  }

  // ─── Push (Local → Server) ─────────────────────────────────────────

  /**
   * Push local changes to Supabase.
   * Converts LogEntry objects to Supabase rows and batch upserts.
   *
   * @param entries - Local entries to push
   * @param userId - Authenticated user's UUID
   * @returns Push result with processed IDs and any conflicts
   */
  async pushChanges(
    entries: LogEntry[],
    userId: string,
  ): Promise<SyncPushResult> {
    const supabase = getSupabase();
    const processedIds: string[] = [];
    const conflicts: ConflictEntry[] = [];
    let latestVersion = this.getLocalVersion();

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);

      const rows = batch.map((entry) => this.logEntryToRow(entry, userId));

      // Cast needed: version/device_id columns are added by migration 20260220000000
      // and not yet in generated Supabase types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("log_entries")
        .upsert(rows, { onConflict: "id" })
        .select("id, version");

      if (error) {
        // Check if it's a conflict error
        if (error.code === "23505" || error.message.includes("conflict")) {
          // Fetch current server versions for conflict detection
          const ids = batch.map((e) => e.id);
          const { data: serverEntries } = await supabase
            .from("log_entries")
            .select("*")
            .in("id", ids)
            .eq("user_id", userId);

          if (serverEntries) {
            for (const serverRow of serverEntries) {
              const localEntry = batch.find((e) => e.id === serverRow.id);
              if (!localEntry) continue;

              const serverRowAny = serverRow as unknown as Record<
                string,
                unknown
              >;
              const serverVersion = (serverRowAny.version as number) ?? 1;
              if (serverVersion > (localEntry.version ?? 0)) {
                const conflictFields = detectFieldConflicts(
                  localEntry,
                  this.rowToLogEntry(serverRowAny)!,
                );

                if (conflictFields.length > 0) {
                  conflicts.push({
                    entryId: serverRow.id,
                    localVersion: localEntry.version ?? 0,
                    remoteVersion: serverVersion,
                    conflictFields,
                    localData: localEntry as unknown as Record<string, unknown>,
                    remoteData: serverRowAny,
                  });
                }
              }
            }
          }
        } else {
          throw new Error(`QSO push batch failed: ${error.message}`);
        }
      } else {
        // Success — record processed IDs and update version
        for (const entry of batch) {
          processedIds.push(entry.id);
        }

        if (data) {
          for (const row of data) {
            const rowVersion = (row as Record<string, unknown>).version;
            if (typeof rowVersion === "number" && rowVersion > latestVersion) {
              latestVersion = rowVersion;
            }
          }
        }
      }
    }

    this.setLocalVersion(latestVersion);

    return { processedIds, conflicts, latestVersion };
  }

  // ─── Conflict Resolution ────────────────────────────────────────────

  /**
   * Resolve conflicts between local and remote entries.
   * Extends the existing conflict.ts auto-merge with version awareness.
   *
   * @param local - Local version of the entry
   * @param remote - Remote version of the entry
   * @returns Resolved entry with highest version
   */
  resolveConflicts(local: LogEntry, remote: LogEntry): LogEntry {
    const conflicts = detectFieldConflicts(local, remote);

    if (conflicts.length === 0) {
      // No actual field conflicts — auto-merge metadata
      return autoMerge(local, remote);
    }

    // Real conflicts exist — use version-based resolution
    // Higher version wins for contested fields, auto-merge for the rest
    const localVersion = local.version ?? 0;
    const remoteVersion = remote.version ?? 0;

    if (remoteVersion > localVersion) {
      // Remote wins for conflict fields, auto-merge for others
      const merged = autoMerge(local, remote);
      const mergedRecord = merged as unknown as Record<string, unknown>;
      const remoteRecord = remote as unknown as Record<string, unknown>;
      for (const field of conflicts) {
        mergedRecord[field] = remoteRecord[field];
      }
      merged.version = remoteVersion;
      merged.lastDeviceId = remote.lastDeviceId;
      return merged;
    }

    // Local wins (same version or higher)
    const merged = autoMerge(local, remote);
    merged.version = localVersion;
    return merged;
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /** Check if a local entry conflicts with a remote delta */
  private shouldResolveConflict(local: LogEntry, delta: QSODelta): boolean {
    // Different device edited the same entry
    if (delta.deviceId && delta.deviceId !== this.deviceId) {
      const localVersion = local.version ?? 0;
      return delta.version !== localVersion;
    }
    return false;
  }

  /** Convert a QSODelta to a LogEntry */
  private deltaToLogEntry(delta: QSODelta): LogEntry | null {
    const row = delta.data;
    if (!row) return null;

    // Handle Supabase row shape → LogEntry
    return {
      id: (row.id as string) ?? delta.id,
      callsign: (row.callsign as string) ?? "",
      frequency: (row.frequency as number) ?? 0,
      mode: (row.mode as string) ?? "",
      band: (row.band as string) ?? "",
      date: (row.date as string) ?? "",
      timeOn: (row.time_on as string) ?? "",
      timeOff: (row.time_off as string) ?? undefined,
      rstSent: (row.rst_sent as string) ?? undefined,
      rstRcvd: (row.rst_rcvd as string) ?? undefined,
      grid: (row.grid as string) ?? undefined,
      name: (row.name as string) ?? undefined,
      qth: (row.qth as string) ?? undefined,
      notes: (row.notes as string) ?? undefined,
      qslSent: (row.qsl_sent as LogEntry["qslSent"]) ?? undefined,
      qslRcvd: (row.qsl_rcvd as LogEntry["qslRcvd"]) ?? undefined,
      lotw: (row.lotw_status as boolean) ?? undefined,
      eqsl: (row.eqsl_status as boolean) ?? undefined,
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
      updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
      stationCallsign: (row.station_callsign as string) ?? undefined,
      operatorCallsign: (row.operator_callsign as string) ?? undefined,
      isGuestEntry: (row.is_guest_entry as boolean) || undefined,
      guestSessionId: (row.guest_session_id as string) ?? undefined,
      version: (row.version as number) ?? delta.version,
      lastDeviceId: (row.device_id as string) ?? delta.deviceId,
    };
  }

  /** Convert a Supabase row to a LogEntry (same as in logbookSync) */
  private rowToLogEntry(row: Record<string, unknown>): LogEntry | null {
    if (row.deleted_at) return null;

    return {
      id: row.id as string,
      callsign: (row.callsign as string) ?? "",
      frequency: (row.frequency as number) ?? 0,
      mode: (row.mode as string) ?? "",
      band: (row.band as string) ?? "",
      date: (row.date as string) ?? "",
      timeOn: (row.time_on as string) ?? "",
      timeOff: (row.time_off as string) ?? undefined,
      rstSent: (row.rst_sent as string) ?? undefined,
      rstRcvd: (row.rst_rcvd as string) ?? undefined,
      grid: (row.grid as string) ?? undefined,
      name: (row.name as string) ?? undefined,
      qth: (row.qth as string) ?? undefined,
      notes: (row.notes as string) ?? undefined,
      qslSent: (row.qsl_sent as LogEntry["qslSent"]) ?? undefined,
      qslRcvd: (row.qsl_rcvd as LogEntry["qslRcvd"]) ?? undefined,
      lotw: (row.lotw_status as boolean) ?? undefined,
      eqsl: (row.eqsl_status as boolean) ?? undefined,
      createdAt: (row.created_at as string) ?? "",
      updatedAt: (row.updated_at as string) ?? "",
      stationCallsign: (row.station_callsign as string) ?? undefined,
      operatorCallsign: (row.operator_callsign as string) ?? undefined,
      isGuestEntry: (row.is_guest_entry as boolean) || undefined,
      guestSessionId: (row.guest_session_id as string) ?? undefined,
      version: (row.version as number) ?? 1,
      lastDeviceId: (row.device_id as string) ?? undefined,
    };
  }

  /** Convert a LogEntry to a Supabase upsert row */
  private logEntryToRow(
    entry: LogEntry,
    userId: string,
  ): Record<string, unknown> {
    return {
      id: entry.id,
      user_id: userId,
      callsign: entry.callsign,
      frequency: entry.frequency || null,
      mode: entry.mode || null,
      band: entry.band || null,
      date: entry.date,
      time_on: entry.timeOn,
      time_off: entry.timeOff ?? null,
      rst_sent: entry.rstSent ?? null,
      rst_rcvd: entry.rstRcvd ?? null,
      grid: entry.grid ?? null,
      name: entry.name ?? null,
      qth: entry.qth ?? null,
      notes: entry.notes ?? null,
      qsl_sent: entry.qslSent ?? null,
      qsl_rcvd: entry.qslRcvd ?? null,
      lotw_status: entry.lotw ?? null,
      eqsl_status: entry.eqsl ?? null,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      station_callsign: entry.stationCallsign ?? null,
      operator_callsign: entry.operatorCallsign ?? null,
      is_guest_entry: entry.isGuestEntry ?? false,
      guest_session_id: entry.guestSessionId ?? null,
      device_id: this.deviceId,
      version: entry.version ?? 1,
    };
  }

  /** Reset the local version cursor (for testing or re-sync) */
  resetVersion(): void {
    this.setLocalVersion(0);
  }
}
