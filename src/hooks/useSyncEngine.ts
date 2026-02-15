/**
 * useSyncEngine — QSO-specific sync lifecycle hook.
 *
 * Provides granular sync status for the logbook:
 * - syncing: whether a sync operation is currently in progress
 * - pendingCount: number of entries waiting to be pushed
 * - lastSyncAt: ISO timestamp of last successful sync
 * - error: last sync error message
 * - deviceId: this device's sync identifier
 * - syncNow: manual sync trigger
 *
 * Handles:
 * - Visibility changes (sync on tab focus)
 * - Online/offline events
 * - Integrates with useAuthStore for auth state
 *
 * Does NOT replace useSync — works alongside it for QSO-specific status.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { QSOSyncEngine } from "@/lib/sync/syncEngine";
import { QSOSyncQueue } from "@/lib/sync/syncQueue";
import { getDeviceId } from "@/lib/sync/deviceId";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QSOSyncStatus {
  /** Whether a sync operation is currently in progress */
  syncing: boolean;
  /** Number of entries waiting to be pushed */
  pendingCount: number;
  /** ISO timestamp of last successful sync */
  lastSyncAt: string | null;
  /** Last sync error message */
  error: string | null;
  /** This device's sync identifier */
  deviceId: string;
  /** Whether the device is online */
  online: boolean;
  /** Trigger a manual sync */
  syncNow: () => Promise<void>;
}

// ─── Module-scoped singletons ───────────────────────────────────────────────

let syncEngine: QSOSyncEngine | null = null;
let syncQueue: QSOSyncQueue | null = null;

/** Get or create the QSO sync engine singleton */
export function getQSOSyncEngine(): QSOSyncEngine {
  if (!syncEngine) {
    syncEngine = new QSOSyncEngine();
  }
  return syncEngine;
}

/** Get or create the QSO sync queue singleton */
export function getQSOSyncQueue(): QSOSyncQueue {
  if (!syncQueue) {
    syncQueue = new QSOSyncQueue();
  }
  return syncQueue;
}

// ─── localStorage key for last sync timestamp ───────────────────────────────

const LAST_SYNC_KEY = "propulse-qso-last-sync";

function getLastSyncAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

function setLastSyncAt(ts: string): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, ts);
  } catch {
    // Non-fatal
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSyncEngine(): QSOSyncStatus {
  const initialized = useAuthStore((s) => s.initialized);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAtState] = useState<string | null>(
    getLastSyncAt,
  );
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  const syncInProgressRef = useRef(false);
  const deviceId = getDeviceId();

  // Initialize queue and track pending count
  useEffect(() => {
    const queue = getQSOSyncQueue();
    setPendingCount(queue.getPendingCount());

    // Poll pending count every 5 seconds (lightweight)
    const interval = setInterval(() => {
      setPendingCount(queue.getPendingCount());
    }, 5_000);

    return () => clearInterval(interval);
  }, []);

  // Core sync function
  const performSync = useCallback(async () => {
    if (!isSupabaseConfigured || !userId || !navigator.onLine) return;
    if (syncInProgressRef.current) return;

    syncInProgressRef.current = true;
    setSyncing(true);
    setError(null);

    try {
      const engine = getQSOSyncEngine();
      const queue = getQSOSyncQueue();

      // Phase 1: Push pending local changes
      const pendingEntries = queue.getEntries();
      if (pendingEntries.length > 0) {
        // Convert queue entries to the format expected by pushChanges
        // For now, queue entries flow through the existing SyncManager writeQueue
        // This is a status-only hook — actual push happens via SyncManager
      }

      // Phase 2: Pull remote changes
      const applied = await engine.pullAndApply(userId);

      // Update state
      const now = new Date().toISOString();
      setLastSyncAt(now);
      setLastSyncAtState(now);
      setPendingCount(queue.getPendingCount());

      if (applied > 0) {
        console.info(`[QSOSync] Applied ${applied} remote changes`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "QSO sync failed";
      setError(message);
      console.error("[QSOSync] Sync error:", message);
    } finally {
      setSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [userId]);

  // Manual sync trigger
  const syncNow = useCallback(async () => {
    await performSync();
  }, [performSync]);

  // Auto-sync on auth + online
  useEffect(() => {
    if (!initialized || !isAuthenticated || !userId) return;
    if (!isSupabaseConfigured) return;

    // Initial sync on mount
    void performSync();
  }, [initialized, isAuthenticated, userId, performSync]);

  // Visibility change handler: sync when tab becomes visible
  useEffect(() => {
    if (!initialized || !isAuthenticated || !userId) return;

    function handleVisibilityChange() {
      if (!document.hidden && navigator.onLine) {
        void performSync();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [initialized, isAuthenticated, userId, performSync]);

  // Online/offline events
  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      // Sync when coming back online
      void performSync();
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [performSync]);

  return {
    syncing,
    pendingCount,
    lastSyncAt,
    error,
    deviceId,
    online,
    syncNow,
  };
}
