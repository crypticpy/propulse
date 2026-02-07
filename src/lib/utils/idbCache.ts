/**
 * Simple IndexedDB cache for API responses.
 * Gracefully degrades (returns null) in private browsing or when IDB is unavailable.
 */

const DB_NAME = "propulse-api-cache";
const DB_VERSION = 1;
const STORE_NAME = "responses";

interface CacheEntry {
  url: string;
  data: unknown;
  timestamp: number;
  ttl: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "url" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedResponse(url: string): Promise<unknown | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (entry && entry.timestamp + entry.ttl > Date.now()) {
          resolve(entry.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  url: string,
  data: unknown,
  ttlMs: number,
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const entry: CacheEntry = { url, data, timestamp: Date.now(), ttl: ttlMs };
    store.put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Swallow write errors (private browsing, quota exceeded, etc.)
  }
}

export async function clearExpiredCache(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    const now = Date.now();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const entry = cursor.value as CacheEntry;
        if (entry.timestamp + entry.ttl <= now) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch {
    // Ignore cleanup errors
  }
}
