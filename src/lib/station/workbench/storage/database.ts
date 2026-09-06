/** Internal IndexedDB foundation. Repository validation owns every transaction's owner/body checks. */
import { unwrap, wrap, type DBSchema, type IDBPDatabase, type StoreNames } from "idb";
import type { StationEntityKind } from "@/lib/station/workbench/storage/operations";

export const STATION_DATABASE_NAME = "propulse-station-workbench";
export const STATION_DATABASE_VERSION = 1;
export const ABSENT_POINTER_VERSION = "absent";

export type StationRecordKind = StationEntityKind;
export interface AccountPointer { generationId: string | null; versionId: string }
export type AccountMetaRecord =
  | { ownerId: string; key: "active-pointer"; generationId: string | null; versionId: string }
  | { ownerId: string; key: "local-sequence"; value: number }
  | { ownerId: string; key: "sync-cursor"; cursor: string | null };
export interface GenerationRecord {
  ownerId: string; generationId: string; state: "staging" | "sealed" | "active" | "recovery";
  schemaVersion: number; createdAt: string; sourceGenerationId: string | null; sealDigest: string | null; manifest: unknown;
}
export interface RecordVersionRecord {
  ownerId: string; generationId: string; kind: StationRecordKind; id: string; versionId: string;
  payloadDigest: string; body: unknown;
}
export interface HeadRecord {
  ownerId: string; generationId: string; kind: StationRecordKind; id: string; versionId: string; tombstone: boolean;
}
export interface OperationRecord {
  ownerId: string; operationId: string; generationId: string; payloadDigest: string; localSequence: number;
  status: "committed" | "conflict"; operation: unknown; result: unknown;
}
export interface OutboxRecord {
  ownerId: string; operationId: string; generationId: string; localSequence: number;
  state: "pending" | "acknowledged" | "blocked" | "conflicted"; dependencyOperationIds: string[]; operation: unknown;
}
export interface ConflictRecord {
  ownerId: string; generationId: string; conflictId: string; state: "unresolved" | "resolved";
  operationId: string; createdAt: string; resolutionOperationId: string | null; details: unknown;
}
export interface MigrationRecord {
  ownerId: string; stageId: string; chunkId: string; generationId: string; schemaVersion: number;
  payloadDigest: string; kind: "source" | "mapping" | "records" | "validation" | "seal"; payload: unknown;
}
export interface RecoveryRecord {
  ownerId: string; generationId: string; recordId: string; sourceLocator: string;
  sourceVersion: number | null; payloadDigest: string; payload: unknown;
}
export interface MediaReferenceRecord {
  ownerId: string; generationId: string; mediaId: string; availability: "available" | "missing" | "unverified";
  blobDigest: string | null;
  references: { kind: StationRecordKind | "profile"; id: string; versionId: string | null; path: (string | number)[]; role: string }[];
}

export interface StationDatabaseSchema extends DBSchema {
  accountMeta: { key: [string, AccountMetaRecord["key"]]; value: AccountMetaRecord };
  generations: { key: [string, string]; value: GenerationRecord; indexes: { "by-state": [string, GenerationRecord["state"]] } };
  recordVersions: { key: [string, string, StationRecordKind, string, string]; value: RecordVersionRecord; indexes: { "by-entity": [string, string, StationRecordKind, string]; "by-kind": [string, string, StationRecordKind] } };
  heads: { key: [string, string, StationRecordKind, string]; value: HeadRecord; indexes: { "by-kind": [string, string, StationRecordKind] } };
  operations: { key: [string, string]; value: OperationRecord; indexes: { "by-sequence": [string, string, number] } };
  outbox: { key: [string, string]; value: OutboxRecord; indexes: { "by-state-sequence": [string, string, OutboxRecord["state"], number] } };
  conflicts: { key: [string, string, string]; value: ConflictRecord; indexes: { "by-state": [string, string, ConflictRecord["state"]] } };
  migrationRecords: { key: [string, string, string]; value: MigrationRecord; indexes: { "by-stage": [string, string] } };
  recoveryRecords: { key: [string, string, string]; value: RecoveryRecord; indexes: { "by-generation": [string, string] } };
  mediaRefs: { key: [string, string, string]; value: MediaReferenceRecord; indexes: { "by-generation": [string, string] } };
}

type StoreName = StoreNames<StationDatabaseSchema>;
const STRUCTURE: Record<StoreName, { key: string[]; indexes: Record<string, string[]> }> = {
  accountMeta: { key: ["ownerId", "key"], indexes: {} },
  generations: { key: ["ownerId", "generationId"], indexes: { "by-state": ["ownerId", "state"] } },
  recordVersions: { key: ["ownerId", "generationId", "kind", "id", "versionId"], indexes: { "by-entity": ["ownerId", "generationId", "kind", "id"], "by-kind": ["ownerId", "generationId", "kind"] } },
  heads: { key: ["ownerId", "generationId", "kind", "id"], indexes: { "by-kind": ["ownerId", "generationId", "kind"] } },
  operations: { key: ["ownerId", "operationId"], indexes: { "by-sequence": ["ownerId", "generationId", "localSequence"] } },
  outbox: { key: ["ownerId", "operationId"], indexes: { "by-state-sequence": ["ownerId", "generationId", "state", "localSequence"] } },
  conflicts: { key: ["ownerId", "generationId", "conflictId"], indexes: { "by-state": ["ownerId", "generationId", "state"] } },
  migrationRecords: { key: ["ownerId", "stageId", "chunkId"], indexes: { "by-stage": ["ownerId", "stageId"] } },
  recoveryRecords: { key: ["ownerId", "generationId", "recordId"], indexes: { "by-generation": ["ownerId", "generationId"] } },
  mediaRefs: { key: ["ownerId", "generationId", "mediaId"], indexes: { "by-generation": ["ownerId", "generationId"] } },
};

export class StationDatabaseError extends Error {
  constructor(readonly code: "closed" | "recovery-required", message: string) {
    super(message);
    this.name = "StationDatabaseError";
  }
}
export interface StationDatabaseHandle {
  readonly ownerId: string;
  readAccountPointer(): Promise<Readonly<AccountPointer>>;
  /** Internal repository bridge only. It must validate owner-first keys and domain bodies.
   * This is not an account authorization boundary or a component-facing generic write API. */
  readonly transaction: IDBPDatabase<StationDatabaseSchema>["transaction"];
  close(): void;
}
export type StationDatabaseOpenResult =
  | { status: "ready"; database: StationDatabaseHandle }
  | { status: "unavailable" | "blocked" | "recovery-required"; reason: string };
export interface StationDatabaseOptions {
  ownerId: string;
  /** Disposable database override; never use a legacy application database name. */
  dbName?: string;
  /** Injection keeps availability and blocked-open tests independent of browser globals. */
  indexedDB?: Pick<IDBFactory, "open"> | null;
  onBlocked?: () => void;
  onInvalidated?: (reason: "versionchange" | "terminated") => void;
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function verifyStructure(db: IDBDatabase): boolean {
  const names = Object.keys(STRUCTURE) as StoreName[];
  if (db.version !== STATION_DATABASE_VERSION || db.objectStoreNames.length !== names.length
    || names.some((name) => !db.objectStoreNames.contains(name))) return false;
  const tx = db.transaction(names, "readonly");
  return names.every((name) => {
    const store = tx.objectStore(name);
    const expected = STRUCTURE[name];
    if (JSON.stringify(store.keyPath) !== JSON.stringify(expected.key) || store.autoIncrement
      || store.indexNames.length !== Object.keys(expected.indexes).length) return false;
    return Object.entries(expected.indexes).every(([indexName, key]) => {
      if (!store.indexNames.contains(indexName)) return false;
      const index = store.index(indexName);
      return JSON.stringify(index.keyPath) === JSON.stringify(key) && !index.unique && !index.multiEntry;
    });
  });
}

function notify(callback: (() => void) | undefined): void {
  try { callback?.(); } catch { /* A notification cannot change the database lifecycle outcome. */ }
}

function createHandle(raw: IDBDatabase, ownerId: string, onInvalidated: StationDatabaseOptions["onInvalidated"]): StationDatabaseHandle {
  const db = wrap(raw) as IDBPDatabase<StationDatabaseSchema>;
  const pending = new Set<IDBTransaction>();
  let closed = false;
  const assertOpen = () => {
    if (closed) throw new StationDatabaseError("closed", "Station database handle is closed");
  };
  const close = () => {
    if (closed) return;
    closed = true;
    pending.forEach((tx) => {
      try { tx.abort(); } catch { /* Already committed/aborted transactions need no action. */ }
    });
    pending.clear();
    raw.close();
  };
  raw.addEventListener("versionchange", () => {
    if (closed) return;
    close();
    notify(() => onInvalidated?.("versionchange"));
  });
  raw.addEventListener("close", () => {
    if (closed) return;
    close();
    notify(() => onInvalidated?.("terminated"));
  });
  const transaction = ((...args: Parameters<IDBPDatabase<StationDatabaseSchema>["transaction"]>) => {
    assertOpen();
    const tx = db.transaction(...args);
    // The wrapped transaction has native abort semantics; keep it only until completion.
    const native = unwrap(tx);
    pending.add(native);
    void tx.done.then(() => { pending.delete(native); }, () => { pending.delete(native); });
    return tx;
  }) as IDBPDatabase<StationDatabaseSchema>["transaction"];
  return Object.freeze({
    ownerId,
    transaction,
    async readAccountPointer(): Promise<Readonly<AccountPointer>> {
      assertOpen();
      const tx = transaction("accountMeta", "readonly");
      const row = await tx.store.get([ownerId, "active-pointer"]);
      await tx.done;
      assertOpen();
      if (row === undefined) return Object.freeze({ generationId: null, versionId: ABSENT_POINTER_VERSION });
      if (row.ownerId !== ownerId || row.key !== "active-pointer" || !validIdentity(row.versionId)
        || row.versionId === ABSENT_POINTER_VERSION || (row.generationId !== null && !validIdentity(row.generationId))) {
        throw new StationDatabaseError("recovery-required", "Stored account pointer is invalid");
      }
      return Object.freeze({ generationId: row.generationId, versionId: row.versionId });
    },
    close,
  });
}

/** Opens only the additive v1 schema. No generation, pointer or legacy record is initialized. */
export async function openStationDatabase(options: StationDatabaseOptions): Promise<StationDatabaseOpenResult> {
  const { ownerId, onBlocked, onInvalidated } = options;
  if (!validIdentity(ownerId)) return { status: "unavailable", reason: "A nonempty, unpadded owner identity is required" };
  const name = options.dbName ?? STATION_DATABASE_NAME;
  if (!validIdentity(name) || name === "propulse-db" || name === "propulse-images") {
    return { status: "unavailable", reason: "A dedicated station database name is required" };
  }
  let factory: Pick<IDBFactory, "open"> | null | undefined;
  try { factory = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB; } catch {
    return { status: "unavailable", reason: "IndexedDB is unavailable" };
  }
  if (!factory) return { status: "unavailable", reason: "IndexedDB is unavailable" };
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    let settled = false;
    let invalidUpgrade = false;
    const finish = (result: StationDatabaseOpenResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try { request = factory.open(name, STATION_DATABASE_VERSION); } catch {
      finish({ status: "unavailable", reason: "IndexedDB could not be opened" });
      return;
    }
    request.onblocked = () => {
      finish({ status: "blocked", reason: "Station database opening is blocked by another connection" });
      notify(onBlocked);
    };
    request.onupgradeneeded = (event) => {
      if (settled || event.oldVersion !== 0 || event.newVersion !== STATION_DATABASE_VERSION) {
        invalidUpgrade = true;
        request.transaction?.abort();
        return;
      }
      try {
        for (const [storeName, definition] of Object.entries(STRUCTURE)) {
          const store = request.result.createObjectStore(storeName, { keyPath: definition.key });
          Object.entries(definition.indexes).forEach(([indexName, keyPath]) => store.createIndex(indexName, keyPath));
        }
      } catch {
        invalidUpgrade = true;
        request.transaction?.abort();
      }
    };
    request.onerror = () => {
      finish({ status: request.error?.name === "VersionError" || invalidUpgrade ? "recovery-required" : "unavailable", reason: "Station database could not be opened with the supported schema" });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      try {
        if (!verifyStructure(db)) {
          db.close();
          finish({ status: "recovery-required", reason: "Station database structure is unsupported or damaged" });
          return;
        }
        finish({ status: "ready", database: createHandle(db, ownerId, onInvalidated) });
      } catch {
        db.close();
        finish({ status: "recovery-required", reason: "Station database structure could not be verified" });
      }
    };
  });
}
