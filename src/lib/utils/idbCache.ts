/**
 * Bounded IndexedDB cache. Solar entries retain validated last-good envelopes
 * through soft expiry and are removed from decision support only at hard expiry.
 */

import type {
  SolarCachedEnvelope,
  SolarEnvelope,
  SolarErrorBody,
  SolarSourceId,
} from "@/lib/solar/contracts";
import { isSolarEnvelope } from "@/lib/solar/contracts";
import { getSolarSourcePolicy } from "@/lib/solar/sourcePolicies";

const DB_NAME = "propulse-api-cache";
const DB_VERSION = 2;
const STORE_NAME = "responses";
const SOLAR_PREFIX = "solar:";
const MAX_GENERIC_ENTRIES = 100;
const HOUSEKEEPING_MARGIN_MS = 7 * 24 * 60 * 60_000;

interface GenericCacheEntry {
  kind: "generic";
  key: string;
  data: unknown;
  storedAt: number;
  hardExpiresAt: number;
  approximateBytes: number;
}

interface SolarCacheEntry extends SolarCachedEnvelope {
  kind: "solar";
  key: string;
}

type CacheEntry = GenericCacheEntry | SolarCacheEntry;

let openPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(new Error("IndexedDB unavailable"));
  if (openPromise) return openPromise;
  openPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
      store.createIndex("storedAt", "storedAt");
      store.createIndex("hardExpiresAt", "hardExpiresAt");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        openPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      openPromise = null;
      reject(request.error);
    };
    request.onblocked = () => {
      openPromise = null;
      reject(new Error("IndexedDB upgrade blocked"));
    };
  });
  return openPromise;
}

function approximateBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}

async function readEntry(key: string): Promise<CacheEntry | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve((request.result as CacheEntry | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function deleteEntry(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  } catch {
    // Diagnostics and corruption cleanup are best effort.
  }
}

function isValidSolarCacheEntry(
  value: CacheEntry,
  sourceId: SolarSourceId,
): value is SolarCacheEntry {
  return (
    value.kind === "solar" &&
    value.key === `${SOLAR_PREFIX}${sourceId}` &&
    isSolarEnvelope(value.envelope) &&
    value.envelope.sourceId === sourceId &&
    Number.isFinite(value.storedAt) &&
    Number.isFinite(value.softExpiresAt) &&
    Number.isFinite(value.hardExpiresAt) &&
    value.softExpiresAt <= value.hardExpiresAt &&
    Number.isFinite(value.lastAttemptAt) &&
    Number.isFinite(value.approximateBytes) &&
    value.approximateBytes >= 0
  );
}

async function writeEntry(entry: CacheEntry): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    // Private browsing, quota pressure, corruption, and blocked upgrades must
    // never take the network path or page down.
  }
}

export async function getCachedResponse(url: string): Promise<unknown | null> {
  const entry = await readEntry(url);
  if (!entry || entry.kind !== "generic" || entry.hardExpiresAt <= Date.now()) {
    return null;
  }
  return entry.data;
}

export async function setCachedResponse(
  url: string,
  data: unknown,
  ttlMs: number,
): Promise<void> {
  const storedAt = Date.now();
  await writeEntry({
    kind: "generic",
    key: url,
    data,
    storedAt,
    hardExpiresAt: storedAt + ttlMs,
    approximateBytes: approximateBytes(data),
  });
}

export async function getSolarCachedEnvelope<T>(
  sourceId: SolarSourceId,
): Promise<SolarCachedEnvelope<T> | null> {
  const key = `${SOLAR_PREFIX}${sourceId}`;
  const entry = await readEntry(key);
  if (!entry) return null;
  if (!isValidSolarCacheEntry(entry, sourceId)) {
    await deleteEntry(key);
    return null;
  }
  return entry as SolarCachedEnvelope<T>;
}

export async function setSolarCachedEnvelope<T>(
  envelope: SolarEnvelope<T>,
  lastAttemptError: SolarErrorBody | null = null,
): Promise<void> {
  const policy = getSolarSourcePolicy(envelope.sourceId);
  const storedAt = Date.now();
  const basisValue =
    policy.freshnessBasis === "fetchedAt"
      ? envelope.fetchedAt
      : envelope.observedAt;
  const basis = Date.parse(basisValue);
  const freshnessAnchor = Number.isFinite(basis) ? basis : storedAt;
  await writeEntry({
    kind: "solar",
    key: `${SOLAR_PREFIX}${envelope.sourceId}`,
    envelope,
    storedAt,
    softExpiresAt: freshnessAnchor + policy.softTtlMs,
    hardExpiresAt: freshnessAnchor + policy.hardTtlMs,
    lastAttemptAt: storedAt,
    lastAttemptError,
    approximateBytes: approximateBytes(envelope),
  });
}

export async function recordSolarCacheFailure(
  sourceId: SolarSourceId,
  error: SolarErrorBody,
): Promise<void> {
  const existing = await getSolarCachedEnvelope(sourceId);
  if (!existing) return;
  await writeEntry({
    kind: "solar",
    key: `${SOLAR_PREFIX}${sourceId}`,
    ...existing,
    lastAttemptAt: Date.now(),
    lastAttemptError: error,
  });
}

export async function invalidateSolarCache(sourceId: SolarSourceId): Promise<void> {
  await deleteEntry(`${SOLAR_PREFIX}${sourceId}`);
}

/** Close the current connection so cache migration, recovery, or tests can reopen it. */
export async function resetApiCacheConnection(): Promise<void> {
  const pending = openPromise;
  openPromise = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // The failed open is already unusable.
  }
}

export interface CacheInspectionRow {
  key: string;
  kind: CacheEntry["kind"];
  storedAt: number;
  hardExpiresAt: number;
  approximateBytes: number;
}

export async function inspectApiCache(): Promise<CacheInspectionRow[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const rows: CacheInspectionRow[] = [];
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(rows.sort((left, right) => right.storedAt - left.storedAt));
          return;
        }
        const value = cursor.value as CacheEntry;
        rows.push({
          key: value.key,
          kind: value.kind,
          storedAt: value.storedAt,
          hardExpiresAt: value.hardExpiresAt,
          approximateBytes: value.approximateBytes,
        });
        cursor.continue();
      };
      request.onerror = () => resolve(rows);
    });
  } catch {
    return [];
  }
}

export async function clearExpiredCache(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const now = Date.now();
      const generic: GenericCacheEntry[] = [];
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const entry = cursor.value as CacheEntry;
        const removableAt =
          entry.kind === "solar"
            ? entry.hardExpiresAt + HOUSEKEEPING_MARGIN_MS
            : entry.hardExpiresAt;
        if (removableAt <= now) cursor.delete();
        else if (entry.kind === "generic") generic.push(entry);
        cursor.continue();
      };
      transaction.oncomplete = () => {
        if (generic.length <= MAX_GENERIC_ENTRIES) {
          resolve();
          return;
        }
        const overflow = generic
          .sort((left, right) => left.storedAt - right.storedAt)
          .slice(0, generic.length - MAX_GENERIC_ENTRIES);
        const cleanup = db.transaction(STORE_NAME, "readwrite");
        for (const entry of overflow) cleanup.objectStore(STORE_NAME).delete(entry.key);
        cleanup.oncomplete = () => resolve();
        cleanup.onerror = () => resolve();
      };
      transaction.onerror = () => resolve();
    });
  } catch {
    // Best-effort cleanup.
  }
}
