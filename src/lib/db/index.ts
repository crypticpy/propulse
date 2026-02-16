/**
 * IndexedDB initialization and management for PropUlse
 * Provides database access, cleanup, and utility functions
 */

import { openDB, IDBPDatabase } from "idb";
import { DB_CONFIG, StoreName } from "./config";
import type {
  LogEntry,
  AlertRule,
  AlertHistoryEntry,
  Ft8Decode,
  DBSchema,
} from "./types";

// Re-export types for convenience
export type { LogEntry, AlertRule, AlertHistoryEntry, Ft8Decode, DBSchema };
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
      if (
        oldVersion < 2 &&
        db.objectStoreNames.contains(DB_CONFIG.stores.alertHistory)
      ) {
        const historyStore = transaction.objectStore(
          DB_CONFIG.stores.alertHistory,
        );
        if (!historyStore.indexNames.contains("by-ruleId-spotId")) {
          historyStore.createIndex("by-ruleId-spotId", ["ruleId", "spotId"]);
        }
      }

      // Version 3: Add indexes for guest logging feature
      if (
        oldVersion < 3 &&
        db.objectStoreNames.contains(DB_CONFIG.stores.logEntries)
      ) {
        const logStore = transaction.objectStore(DB_CONFIG.stores.logEntries);
        if (!logStore.indexNames.contains("by-operatorCallsign")) {
          logStore.createIndex("by-operatorCallsign", "operatorCallsign");
        }
        if (!logStore.indexNames.contains("by-guestSessionId")) {
          logStore.createIndex("by-guestSessionId", "guestSessionId");
        }
      }

      // Version 4: Add indexes for QSO logging enhancements
      if (
        oldVersion < 4 &&
        db.objectStoreNames.contains(DB_CONFIG.stores.logEntries)
      ) {
        const logStore = transaction.objectStore(DB_CONFIG.stores.logEntries);
        if (!logStore.indexNames.contains("by-dxcc")) {
          logStore.createIndex("by-dxcc", "dxcc");
        }
        if (!logStore.indexNames.contains("by-mySig")) {
          logStore.createIndex("by-mySig", "mySig");
        }
        if (!logStore.indexNames.contains("by-version")) {
          logStore.createIndex("by-version", "version");
        }
      }

      // Version 5: FT8/FT4 decode persistence
      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains(DB_CONFIG.stores.ft8Decodes)) {
          const ft8Store = db.createObjectStore(DB_CONFIG.stores.ft8Decodes, {
            keyPath: "id",
          });
          ft8Store.createIndex("by-timestamp", "timestamp");
          ft8Store.createIndex("by-callsign", "callsign");
          ft8Store.createIndex("by-band", "band");
          ft8Store.createIndex("by-mode", "mode");
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
  storeName: "logEntries" | "alertHistory" | "ft8Decodes",
  indexName: "by-date" | "by-triggeredAt" | "by-timestamp",
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

  // Check and cleanup ft8Decodes if needed
  if (await isApproachingLimit("ft8Decodes")) {
    const deleted = await cleanupStore("ft8Decodes", "by-timestamp");
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} old FT8 decodes`);
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
  await deleteSingleDatabase(DB_CONFIG.name);
}

/**
 * Delete a single IndexedDB database by name with timeout handling.
 * Safari can block indefinitely if connections are open — this resolves
 * after a timeout so the caller can proceed (e.g., reload the page to
 * release connections).
 */
function deleteSingleDatabase(name: string, timeoutMs = 3000): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      const timer = setTimeout(() => {
        console.warn(
          `Database "${name}" deletion timed out (blocked) — will be cleaned up on reload`,
        );
        resolve();
      }, timeoutMs);

      request.onsuccess = () => {
        clearTimeout(timer);
        resolve();
      };
      request.onerror = () => {
        clearTimeout(timer);
        console.warn(`Failed to delete database "${name}":`, request.error);
        resolve(); // Don't reject — let the caller continue
      };
      request.onblocked = () => {
        // Safari often fires onblocked when any connection is open.
        // The timeout above will resolve the promise if onsuccess
        // never fires. Don't resolve here — onsuccess may still come.
        console.warn(
          `Database "${name}" deletion blocked — waiting for connections to close`,
        );
      };
    } catch {
      resolve(); // IDB not available — nothing to delete
    }
  });
}

/**
 * All IndexedDB database names used by the application.
 * Keep this in sync when adding new databases.
 */
const ALL_DB_NAMES = [
  "propulse-db",
  "propulse-api-cache",
  "propulse-images",
  "propulse-credentials",
  "propulse-scp",
];

/**
 * Delete ALL IndexedDB databases used by the application.
 * Each deletion has a timeout so blocked databases don't hang forever.
 * A page reload after calling this will release any remaining connections.
 */
export async function deleteAllDatabases(): Promise<void> {
  // Close the main database connection first
  await closeDB();

  // Delete all databases in parallel (each has its own timeout)
  await Promise.all(ALL_DB_NAMES.map((name) => deleteSingleDatabase(name)));
}
