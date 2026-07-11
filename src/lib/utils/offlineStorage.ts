/**
 * Offline Storage Utility
 * IndexedDB-based cache for solar data with TTL support
 * Uses the 'idb' library for a Promise-based IndexedDB wrapper
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// Database schema interface
interface PropulseDB extends DBSchema {
  solarCache: {
    key: string;
    value: CachedSolarData;
    indexes: { "by-expiry": number };
  };
}

// Cached data interface
export interface CachedSolarData {
  key: string;
  data: unknown;
  timestamp: number;
  expiresAt: number;
}

// Database instance (singleton)
let dbPromise: Promise<IDBPDatabase<PropulseDB>> | null = null;

// Database name and version
const DB_NAME = "propulse-offline";
const DB_VERSION = 1;

/**
 * Get or create the database instance
 */
function getDB(): Promise<IDBPDatabase<PropulseDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PropulseDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create the solar cache store if it doesn't exist
        if (!db.objectStoreNames.contains("solarCache")) {
          const store = db.createObjectStore("solarCache", { keyPath: "key" });
          store.createIndex("by-expiry", "expiresAt");
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Check if a timestamp has expired
 */
export function isExpired(expiresAt: number): boolean {
  return Date.now() > expiresAt;
}

/**
 * Get cached data by key
 * Returns null if not found or expired
 */
export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    const cached = await db.get("solarCache", key);

    if (!cached) {
      return null;
    }

    // Return data even if expired - let consumer decide what to do
    // The isStale flag in hooks will indicate freshness
    return cached.data as T;
  } catch (error) {
    console.warn("[OfflineStorage] Error getting cached data:", error);
    return null;
  }
}

/**
 * Get cached data with metadata
 * Useful for checking staleness
 */
export async function getCachedDataWithMeta(
  key: string,
): Promise<CachedSolarData | null> {
  try {
    const db = await getDB();
    return (await db.get("solarCache", key)) || null;
  } catch (error) {
    console.warn(
      "[OfflineStorage] Error getting cached data with meta:",
      error,
    );
    return null;
  }
}

/**
 * Set cached data with TTL
 * @param key - Cache key
 * @param data - Data to cache
 * @param ttlMs - Time to live in milliseconds
 */
export async function setCachedData(
  key: string,
  data: unknown,
  ttlMs: number,
): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();

    const cached: CachedSolarData = {
      key,
      data,
      timestamp: now,
      expiresAt: now + ttlMs,
    };

    await db.put("solarCache", cached);
  } catch (error) {
    console.warn("[OfflineStorage] Error setting cached data:", error);
  }
}

/**
 * Clear expired cache entries
 * Should be called periodically to clean up old data
 */
export async function clearExpiredCache(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("solarCache", "readwrite");
    const store = tx.objectStore("solarCache");
    const index = store.index("by-expiry");
    const now = Date.now();

    // Get all expired entries
    let cursor = await index.openCursor(IDBKeyRange.upperBound(now));

    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await tx.done;
  } catch (error) {
    console.warn("[OfflineStorage] Error clearing expired cache:", error);
  }
}

/**
 * Clear all cached data
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear("solarCache");
  } catch (error) {
    console.warn("[OfflineStorage] Error clearing all cache:", error);
  }
}

/**
 * Get all cache keys
 * Useful for debugging
 */
export async function getAllCacheKeys(): Promise<string[]> {
  try {
    const db = await getDB();
    return db.getAllKeys("solarCache");
  } catch (error) {
    console.warn("[OfflineStorage] Error getting cache keys:", error);
    return [];
  }
}

// Cache key constants for solar data types
export const CACHE_KEYS = {
  kIndex: "solar:k-index",
  solarFlux: "solar:flux",
  probabilities: "solar:probabilities",
  sunspots: "solar:sunspots",
  magnetometer: "solar:magnetometer",
  aurora: "solar:aurora",
} as const;

// Default TTL values in milliseconds
export const CACHE_TTL = {
  kIndex: 60 * 60 * 1000, // 1 hour
  solarFlux: 4 * 60 * 60 * 1000, // 4 hours
  probabilities: 6 * 60 * 60 * 1000, // 6 hours
  sunspots: 24 * 60 * 60 * 1000, // 24 hours
  magnetometer: 60 * 60 * 1000, // 1 hour
  aurora: 60 * 60 * 1000, // 1 hour
} as const;
