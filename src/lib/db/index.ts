/**
 * IndexedDB initialization and management for PropUlse
 * Provides database access, cleanup, and utility functions
 */

import { openDB, IDBPDatabase } from "idb";
import { DB_CONFIG, StoreName } from "./config";
import type { LogEntry, AlertRule, AlertHistoryEntry, DBSchema } from "./types";

// Re-export types for convenience
export type { LogEntry, AlertRule, AlertHistoryEntry, DBSchema };
export { DB_CONFIG };

/** Database instance (lazy initialized) */
let dbInstance: IDBPDatabase<DBSchema> | null = null;

/**
 * Check if IndexedDB is supported in the current environment
 * @returns true if IndexedDB is available
 */
export function isIndexedDBSupported(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Get or create the database instance
 * Uses lazy initialization to defer database creation until first use
 * @returns Promise resolving to the database instance
 * @throws Error if IndexedDB is not supported
 */
export async function getDB(): Promise<IDBPDatabase<DBSchema>> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!isIndexedDBSupported()) {
    throw new Error("IndexedDB is not supported in this browser");
  }

  dbInstance = await openDB<DBSchema>(DB_CONFIG.name, DB_CONFIG.version, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      // Log upgrade for debugging
      console.log(`Upgrading database from version ${oldVersion}`);

      // Create logEntries store
      if (!db.objectStoreNames.contains(DB_CONFIG.stores.logEntries)) {
        const logStore = db.createObjectStore(DB_CONFIG.stores.logEntries, {
          keyPath: "id",
        });
        logStore.createIndex("by-callsign", "callsign");
        logStore.createIndex("by-date", "date");
        logStore.createIndex("by-band", "band");
      }

      // Create alertRules store
      if (!db.objectStoreNames.contains(DB_CONFIG.stores.alertRules)) {
        const ruleStore = db.createObjectStore(DB_CONFIG.stores.alertRules, {
          keyPath: "id",
        });
        ruleStore.createIndex("by-enabled", "enabled");
      }

      // Create alertHistory store
      if (!db.objectStoreNames.contains(DB_CONFIG.stores.alertHistory)) {
        const historyStore = db.createObjectStore(
          DB_CONFIG.stores.alertHistory,
          { keyPath: "id" },
        );
        historyStore.createIndex("by-triggeredAt", "triggeredAt");
        historyStore.createIndex("by-ruleId", "ruleId");
      }

      // Version 2: Add compound index for efficient wasRecentlyAlerted queries
      if (oldVersion < 2) {
        if (db.objectStoreNames.contains(DB_CONFIG.stores.alertHistory)) {
          const historyStore = transaction.objectStore(
            DB_CONFIG.stores.alertHistory,
          );
          if (!historyStore.indexNames.contains("by-ruleId-spotId")) {
            historyStore.createIndex("by-ruleId-spotId", ["ruleId", "spotId"]);
          }
        }
      }

      // Version 3: Add indexes for guest logging feature
      if (oldVersion < 3) {
        if (db.objectStoreNames.contains(DB_CONFIG.stores.logEntries)) {
          const logStore = transaction.objectStore(DB_CONFIG.stores.logEntries);
          if (!logStore.indexNames.contains("by-operatorCallsign")) {
            logStore.createIndex("by-operatorCallsign", "operatorCallsign");
          }
          if (!logStore.indexNames.contains("by-guestSessionId")) {
            logStore.createIndex("by-guestSessionId", "guestSessionId");
          }
        }
      }
    },
    blocked() {
      console.warn(
        "Database upgrade blocked - please close other tabs using this application",
      );
    },
    blocking() {
      // Close this connection to allow upgrade in other tab
      console.warn("Closing database connection to allow upgrade in other tab");
      dbInstance?.close();
      dbInstance = null;
    },
    terminated() {
      console.warn("Database connection terminated unexpectedly");
      dbInstance = null;
    },
  });

  return dbInstance;
}

/**
 * Close the database connection
 * Call this when the application is shutting down or needs to release resources
 */
export async function closeDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Get the count of entries in a store
 * @param storeName - Name of the object store
 * @returns Promise resolving to the entry count
 */
export async function getStoreCount(storeName: StoreName): Promise<number> {
  const db = await getDB();
  return db.count(storeName);
}

/**
 * Check if a store is approaching its configured limit
 * @param storeName - Name of the object store
 * @returns Promise resolving to true if count >= threshold
 */
export async function isApproachingLimit(
  storeName: StoreName,
): Promise<boolean> {
  const count = await getStoreCount(storeName);
  const limit = DB_CONFIG.limits[storeName];
  return count >= limit * DB_CONFIG.cleanupThreshold;
}

/**
 * Cleanup oldest entries from a store based on a date index
 * Removes the oldest entries when the store exceeds its limit
 * @param storeName - Name of the object store ('logEntries' or 'alertHistory')
 * @param indexName - Name of the date-based index to sort by
 * @returns Promise resolving to the number of deleted entries
 */
export async function cleanupStore(
  storeName: "logEntries" | "alertHistory",
  indexName: "by-date" | "by-triggeredAt",
): Promise<number> {
  const db = await getDB();
  const count = await db.count(storeName);
  const limit = DB_CONFIG.limits[storeName];

  if (count < limit) {
    return 0;
  }

  const deleteCount = Math.ceil(count * DB_CONFIG.cleanupPercentage);
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);

  let cursor = await index.openCursor();
  let deleted = 0;

  while (cursor && deleted < deleteCount) {
    await cursor.delete();
    deleted++;
    cursor = await cursor.continue();
  }

  await tx.done;
  return deleted;
}

/**
 * Initialize database and run startup cleanup if needed
 * Call this once when the application starts
 */
export async function initializeDB(): Promise<void> {
  await getDB();

  // Check and cleanup logEntries if needed
  if (await isApproachingLimit("logEntries")) {
    const deleted = await cleanupStore("logEntries", "by-date");
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} old log entries`);
    }
  }

  // Check and cleanup alertHistory if needed
  if (await isApproachingLimit("alertHistory")) {
    const deleted = await cleanupStore("alertHistory", "by-triggeredAt");
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} old alert history entries`);
    }
  }
}

/**
 * Delete the entire database
 * WARNING: This permanently removes all data
 * Use only for testing or user-requested data reset
 */
export async function deleteDatabase(): Promise<void> {
  await closeDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_CONFIG.name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn("Database deletion blocked - close all other tabs");
    };
  });
}
