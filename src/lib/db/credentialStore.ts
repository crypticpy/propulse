/**
 * Encrypted credential storage for PropUlse
 *
 * Uses Web Crypto API (PBKDF2 key derivation + AES-GCM encryption) with
 * IndexedDB persistence via the `idb` library. Credentials are encrypted
 * at rest and only accessible after the user provides their passphrase.
 *
 * Security model:
 * - PBKDF2: 100,000 iterations, SHA-256, 256-bit derived key
 * - AES-GCM: unique 12-byte IV per credential
 * - Salt: 16 random bytes, generated on first setup, stored in IndexedDB
 * - Derived CryptoKey held in memory, cleared on lock or after 30 min inactivity
 */

import { openDB, type IDBPDatabase } from "idb";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredCredential {
  /** Service identifier: "lotw" | "clublog" | "eqsl" | "qrz" */
  service: string;
  /** AES-GCM encrypted payload */
  encryptedData: ArrayBuffer;
  /** Unique initialisation vector for this credential */
  iv: Uint8Array;
  /** Timestamp of last update (epoch ms) */
  updatedAt: number;
}

export interface DecryptedCredential {
  username: string;
  password: string;
}

export interface CredentialStoreState {
  /** Whether a passphrase has been configured */
  isSetup: boolean;
  /** Whether the derived key is currently in memory */
  isUnlocked: boolean;
  /** List of services that have stored credentials */
  services: string[];
}

// ---------------------------------------------------------------------------
// IndexedDB schema (separate database from the main propulse-db)
// ---------------------------------------------------------------------------

interface CredentialDBSchema {
  credentials: {
    key: string;
    value: StoredCredential;
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const CRED_DB_NAME = "propulse-credentials";
const CRED_DB_VERSION = 1;

let credDB: IDBPDatabase<CredentialDBSchema> | null = null;

async function getCredDB(): Promise<IDBPDatabase<CredentialDBSchema>> {
  if (credDB) return credDB;

  credDB = await openDB<CredentialDBSchema>(CRED_DB_NAME, CRED_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("credentials")) {
        db.createObjectStore("credentials", { keyPath: "service" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    },
    blocked() {
      console.warn(
        "[credentialStore] DB upgrade blocked – close other tabs using PropUlse",
      );
    },
    blocking() {
      console.warn(
        "[credentialStore] Closing DB connection to allow upgrade in other tab",
      );
      credDB?.close();
      credDB = null;
    },
    terminated() {
      console.warn("[credentialStore] DB connection terminated unexpectedly");
      credDB = null;
    },
  });

  return credDB;
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** Derive an AES-GCM-256 key from a passphrase and salt using PBKDF2. */
async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt a plaintext string with AES-GCM, returning ciphertext + IV. */
async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return { ciphertext, iv };
}

/** Decrypt an AES-GCM ciphertext, returning the plaintext string. */
async function decrypt(
  key: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** The derived CryptoKey – only present while the store is unlocked. */
let _derivedKey: CryptoKey | null = null;

/** Auto-lock timer handle. */
let _autoLockTimer: ReturnType<typeof setTimeout> | null = null;

/** Auto-lock delay: 30 minutes. */
const AUTO_LOCK_MS = 30 * 60 * 1000;

/** Reset (or start) the auto-lock countdown. */
function resetAutoLock(): void {
  if (_autoLockTimer !== null) {
    clearTimeout(_autoLockTimer);
  }
  _autoLockTimer = setTimeout(() => {
    lock();
  }, AUTO_LOCK_MS);
}

// ---------------------------------------------------------------------------
// Meta helpers (salt & setup flag)
// ---------------------------------------------------------------------------

async function getSalt(): Promise<Uint8Array | null> {
  const db = await getCredDB();
  const row = await db.get("meta", "salt");
  if (!row) return null;
  return row.value as Uint8Array;
}

async function saveSalt(salt: Uint8Array): Promise<void> {
  const db = await getCredDB();
  await db.put("meta", { key: "salt", value: salt });
}

async function getSetupFlag(): Promise<boolean> {
  const db = await getCredDB();
  const row = await db.get("meta", "setup");
  return row?.value === true;
}

async function setSetupFlag(value: boolean): Promise<void> {
  const db = await getCredDB();
  await db.put("meta", { key: "setup", value });
}

/**
 * Store a hash of the derived key so we can verify passphrases on unlock.
 * We encrypt a known sentinel value and store it. On unlock we try to
 * decrypt it – if it succeeds the passphrase is correct.
 */
const SENTINEL = "__propulse_credential_store_sentinel__";

async function storeSentinel(key: CryptoKey): Promise<void> {
  const { ciphertext, iv } = await encrypt(key, SENTINEL);
  const db = await getCredDB();
  await db.put("meta", {
    key: "sentinel",
    value: { ciphertext, iv },
  });
}

async function verifySentinel(key: CryptoKey): Promise<boolean> {
  const db = await getCredDB();
  const row = await db.get("meta", "sentinel");
  if (!row) return false;

  const { ciphertext, iv } = row.value as {
    ciphertext: ArrayBuffer;
    iv: Uint8Array;
  };

  try {
    const plaintext = await decrypt(key, ciphertext, iv);
    return plaintext === SENTINEL;
  } catch {
    // Decryption failure → wrong passphrase
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Set up the credential store for the first time.
 * Generates a random salt, derives a key, and persists setup state.
 * The store is left in an unlocked state after setup.
 */
export async function setupPassphrase(passphrase: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(passphrase, salt);

  await saveSalt(salt);
  await storeSentinel(key);
  await setSetupFlag(true);

  _derivedKey = key;
  resetAutoLock();
}

/**
 * Unlock the credential store with an existing passphrase.
 * @returns `true` if the passphrase was correct, `false` otherwise.
 */
export async function unlock(passphrase: string): Promise<boolean> {
  const salt = await getSalt();
  if (!salt) return false;

  const key = await deriveKey(passphrase, salt);
  const valid = await verifySentinel(key);

  if (!valid) return false;

  _derivedKey = key;
  resetAutoLock();
  return true;
}

/**
 * Lock the credential store, clearing the derived key from memory.
 */
export function lock(): void {
  _derivedKey = null;
  if (_autoLockTimer !== null) {
    clearTimeout(_autoLockTimer);
    _autoLockTimer = null;
  }
}

/**
 * Check whether the derived key is currently held in memory.
 */
export function isUnlocked(): boolean {
  return _derivedKey !== null;
}

/**
 * Check whether a passphrase has been set up (salt + sentinel exist).
 */
export async function isSetup(): Promise<boolean> {
  return getSetupFlag();
}

/**
 * Save (or overwrite) an encrypted credential for a service.
 * The store must be unlocked first.
 */
export async function saveCredential(
  service: string,
  username: string,
  password: string,
): Promise<void> {
  if (!_derivedKey) {
    throw new Error("Credential store is locked");
  }

  resetAutoLock();

  const payload = JSON.stringify({ username, password });
  const { ciphertext, iv } = await encrypt(_derivedKey, payload);

  const stored: StoredCredential = {
    service,
    encryptedData: ciphertext,
    iv,
    updatedAt: Date.now(),
  };

  const db = await getCredDB();
  await db.put("credentials", stored);
}

/**
 * Retrieve and decrypt a credential for a service.
 * Returns `null` if no credential is stored for that service.
 * The store must be unlocked first.
 */
export async function getCredential(
  service: string,
): Promise<DecryptedCredential | null> {
  if (!_derivedKey) {
    throw new Error("Credential store is locked");
  }

  resetAutoLock();

  const db = await getCredDB();
  const stored = await db.get("credentials", service);
  if (!stored) return null;

  const plaintext = await decrypt(_derivedKey, stored.encryptedData, stored.iv);
  return JSON.parse(plaintext) as DecryptedCredential;
}

/**
 * Delete the credential for a single service.
 */
export async function deleteCredential(service: string): Promise<void> {
  const db = await getCredDB();
  await db.delete("credentials", service);
}

/**
 * Delete ALL credentials AND reset the passphrase setup.
 * Use when the user has forgotten their passphrase.
 */
export async function deleteAllCredentials(): Promise<void> {
  lock();

  const db = await getCredDB();
  const tx = db.transaction(["credentials", "meta"], "readwrite");
  await tx.objectStore("credentials").clear();
  await tx.objectStore("meta").clear();
  await tx.done;
}

/**
 * List the service keys that have stored credentials.
 */
export async function getStoredServices(): Promise<string[]> {
  const db = await getCredDB();
  const keys = await db.getAllKeys("credentials");
  return keys as string[];
}

/**
 * Get a snapshot of the credential store state (does not require unlock).
 */
export async function getState(): Promise<CredentialStoreState> {
  const [setup, services] = await Promise.all([isSetup(), getStoredServices()]);

  return {
    isSetup: setup,
    isUnlocked: isUnlocked(),
    services,
  };
}
