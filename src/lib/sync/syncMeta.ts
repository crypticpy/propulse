/**
 * Persistent sync metadata — tracks per-module last-synced timestamps.
 * Stored in localStorage under 'propulse-sync-meta'.
 *
 * Uses an in-memory cache to prevent race conditions when concurrent
 * module pulls call setTimestamp() simultaneously (read-modify-write).
 */

import type { SyncMeta } from "./types";
import { DEFAULT_SYNC_META } from "./types";

const STORAGE_KEY = "propulse-sync-meta";

/** In-memory cache — initialized on first access, flushed on every write */
let cache: SyncMeta | null = null;

export const syncMeta = {
  get(): SyncMeta {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        cache = { ...DEFAULT_SYNC_META, lastSyncedAt: {} };
      } else {
        cache = JSON.parse(raw) as SyncMeta;
      }
    } catch {
      cache = { ...DEFAULT_SYNC_META, lastSyncedAt: {} };
    }
    return cache;
  },

  set(meta: SyncMeta): void {
    cache = meta;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
    } catch {
      // localStorage full — non-fatal, in-memory cache still valid
    }
  },

  getTimestamp(module: string): string | null {
    return this.get().lastSyncedAt[module] ?? null;
  },

  setTimestamp(module: string, timestamp: string): void {
    const meta = this.get();
    meta.lastSyncedAt[module] = timestamp;
    this.set(meta);
  },

  clear(): void {
    cache = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
};
