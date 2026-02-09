/**
 * Isolated IndexedDB database for storing compressed image blobs.
 * Uses a separate "propulse-images" database to keep binary data
 * out of the main application database.
 */

import { openDB, IDBPDatabase } from "idb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A compressed image stored in IndexedDB */
export interface StoredImage {
  /** Unique identifier (UUID) */
  id: string;
  /** Compressed JPEG blob */
  blob: Blob;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** Size of the blob in bytes */
  sizeBytes: number;
}

/** Schema for the propulse-images database */
interface ImageDBSchema {
  images: {
    key: string;
    value: StoredImage;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = "propulse-images";
const DB_VERSION = 1;
const STORE_NAME = "images";

// ---------------------------------------------------------------------------
// Lazy-initialised database instance
// ---------------------------------------------------------------------------

let dbInstance: IDBPDatabase<ImageDBSchema> | null = null;

/**
 * Get or create the image database instance.
 * Uses lazy initialisation to defer creation until first use.
 */
async function getImageDB(): Promise<IDBPDatabase<ImageDBSchema>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<ImageDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    },
    blocked() {
      console.warn("Image database upgrade blocked — please close other tabs");
    },
    blocking() {
      console.warn(
        "Closing image database connection to allow upgrade in other tab",
      );
      dbInstance?.close();
      dbInstance = null;
    },
    terminated() {
      console.warn("Image database connection terminated unexpectedly");
      dbInstance = null;
    },
  });

  return dbInstance;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store a compressed image blob in IndexedDB.
 * @param blob - Compressed JPEG blob
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns The generated UUID for the stored image
 */
export async function storeImage(
  blob: Blob,
  width: number,
  height: number,
): Promise<string> {
  const id = crypto.randomUUID();
  const entry: StoredImage = {
    id,
    blob,
    width,
    height,
    createdAt: new Date().toISOString(),
    sizeBytes: blob.size,
  };

  const db = await getImageDB();
  await db.put(STORE_NAME, entry);
  return id;
}

/**
 * Retrieve a stored image by its ID.
 * @param id - UUID of the image
 * @returns The StoredImage record, or undefined if not found
 */
export async function getImage(id: string): Promise<StoredImage | undefined> {
  const db = await getImageDB();
  return db.get(STORE_NAME, id);
}

/**
 * Delete a stored image by its ID.
 * @param id - UUID of the image to remove
 */
export async function deleteImage(id: string): Promise<void> {
  const db = await getImageDB();
  await db.delete(STORE_NAME, id);
}

/**
 * Store a compressed image blob with a specific ID.
 * Used by sync pull to preserve the server-side UUID instead of generating a new one.
 * @param id - Existing UUID to store under
 * @param blob - Compressed JPEG blob
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 */
export async function storeImageWithId(
  id: string,
  blob: Blob,
  width: number,
  height: number,
): Promise<void> {
  const entry: StoredImage = {
    id,
    blob,
    width,
    height,
    createdAt: new Date().toISOString(),
    sizeBytes: blob.size,
  };

  const db = await getImageDB();
  await db.put(STORE_NAME, entry);
}

/**
 * List all stored image IDs.
 * Useful for orphan cleanup — compare against IDs referenced in stores.
 * @returns Array of UUID strings
 */
export async function getAllImageIds(): Promise<string[]> {
  const db = await getImageDB();
  return db.getAllKeys(STORE_NAME) as Promise<string[]>;
}
