/**
 * useOfflineSessionCache -- IndexedDB cache for active NCS session state.
 *
 * Enables NCS operators to continue managing check-ins during connectivity
 * drops (critical for Field Day and ARES deployments). Pending mutations
 * are queued locally and flushed when the connection returns.
 *
 * IDB database: "propulse-net-session-cache"
 * Object store: "sessions" (keyPath: "sessionId")
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { openDB, type IDBPDatabase } from "idb";
import type { NetSession, NetCheckin } from "@/types/net";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PendingMutation {
  id: string;
  type: "add_checkin" | "update_checkin" | "remove_checkin" | "reorder";
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CachedSessionState {
  sessionId: string;
  netId: string;
  session: NetSession;
  checkins: NetCheckin[];
  lastSyncedAt: string;
  pendingMutations: PendingMutation[];
}

export interface OfflineSessionCache {
  /** Whether operating in offline mode */
  isOffline: boolean;
  /** Cache the current session state */
  cacheSessionState: (
    session: NetSession,
    checkins: NetCheckin[],
  ) => Promise<void>;
  /** Load cached state (for offline recovery) */
  loadCachedState: (sessionId: string) => Promise<CachedSessionState | null>;
  /** Queue a mutation for sync when back online */
  queueMutation: (
    mutation: Omit<PendingMutation, "id" | "createdAt">,
  ) => Promise<void>;
  /** Flush pending mutations (on reconnect) */
  flushMutations: () => Promise<PendingMutation[]>;
  /** Clear cache for a session */
  clearCache: (sessionId: string) => Promise<void>;
}

// ── IDB setup ──────────────────────────────────────────────────────────────

interface SessionCacheDBSchema {
  sessions: {
    key: string;
    value: CachedSessionState;
  };
}

const DB_NAME = "propulse-net-session-cache";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

let dbInstance: IDBPDatabase<SessionCacheDBSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<SessionCacheDBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SessionCacheDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
      }
    },
    blocked() {
      console.warn(
        "Net session cache upgrade blocked — please close other tabs",
      );
    },
    blocking() {
      dbInstance?.close();
      dbInstance = null;
    },
    terminated() {
      dbInstance = null;
    },
  });

  return dbInstance;
}

// ── Debounce helper ────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;

// ── Hook ───────────────────────────────────────────────────────────────────

export function useOfflineSessionCache(
  sessionId: string | null,
): OfflineSessionCache {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Online / offline listeners ──
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // ── Cache session state (debounced) ──
  const cacheSessionState = useCallback(
    async (session: NetSession, checkins: NetCheckin[]): Promise<void> => {
      if (!sessionId || session.status !== "live") return;

      if (debounceRef.current) clearTimeout(debounceRef.current);

      return new Promise((resolve) => {
        debounceRef.current = setTimeout(async () => {
          try {
            const db = await getDB();
            const existing = await db.get(STORE_NAME, sessionId);
            const entry: CachedSessionState = {
              sessionId,
              netId: session.netId,
              session,
              checkins,
              lastSyncedAt: new Date().toISOString(),
              pendingMutations: existing?.pendingMutations ?? [],
            };
            await db.put(STORE_NAME, entry);
          } catch (err) {
            console.error("Failed to cache session state:", err);
          }
          resolve();
        }, DEBOUNCE_MS);
      });
    },
    [sessionId],
  );

  // ── Load cached state ──
  const loadCachedState = useCallback(
    async (sid: string): Promise<CachedSessionState | null> => {
      try {
        const db = await getDB();
        return (await db.get(STORE_NAME, sid)) ?? null;
      } catch (err) {
        console.error("Failed to load cached session:", err);
        return null;
      }
    },
    [],
  );

  // ── Queue a mutation ──
  const queueMutation = useCallback(
    async (
      mutation: Omit<PendingMutation, "id" | "createdAt">,
    ): Promise<void> => {
      if (!sessionId) return;

      try {
        const db = await getDB();
        const existing = await db.get(STORE_NAME, sessionId);
        if (!existing) return;

        const pending: PendingMutation = {
          ...mutation,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };

        existing.pendingMutations.push(pending);
        await db.put(STORE_NAME, existing);
      } catch (err) {
        console.error("Failed to queue mutation:", err);
      }
    },
    [sessionId],
  );

  // ── Flush mutations ──
  const flushMutations = useCallback(async (): Promise<PendingMutation[]> => {
    if (!sessionId) return [];

    try {
      const db = await getDB();
      const existing = await db.get(STORE_NAME, sessionId);
      if (!existing || existing.pendingMutations.length === 0) return [];

      const flushed = [...existing.pendingMutations];
      existing.pendingMutations = [];
      await db.put(STORE_NAME, existing);
      return flushed;
    } catch (err) {
      console.error("Failed to flush mutations:", err);
      return [];
    }
  }, [sessionId]);

  // ── Clear cache ──
  const clearCache = useCallback(async (sid: string): Promise<void> => {
    try {
      const db = await getDB();
      await db.delete(STORE_NAME, sid);
    } catch (err) {
      console.error("Failed to clear session cache:", err);
    }
  }, []);

  // ── Cleanup debounce on unmount ──
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    isOffline,
    cacheSessionState,
    loadCachedState,
    queueMutation,
    flushMutations,
    clearCache,
  };
}
