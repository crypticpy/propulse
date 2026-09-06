/** Internal IndexedDB foundation. Repository validation owns every transaction's owner/body checks. */
import { unwrap, wrap, type DBSchema, type IDBPDatabase, type StoreNames } from "idb";
import type { StationEntityKind } from "@/lib/station/workbench/storage/operations";
import type { StationDeliveryResult } from "@/lib/station/workbench/storage/delivery";

export const STATION_DATABASE_NAME = "propulse-station-workbench";
const DISPOSABLE_DATABASE_PREFIX = `${STATION_DATABASE_NAME}-test-`;
export const STATION_DATABASE_VERSION = 2;
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
  deliveryResults: { key: [string, string]; value: StationDeliveryResult; indexes: { "by-generation": [string, string] } };
}

type StoreName = StoreNames<StationDatabaseSchema>;
type StoreStructure = { key: string[]; indexes: Record<string, string[]> };
// This is the exact previously supported v1 structure, checked before upgrade.
const V1_STRUCTURE: Record<Exclude<StoreName, "deliveryResults">, StoreStructure> = {
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
const STRUCTURE: Record<StoreName, StoreStructure> = {
  ...V1_STRUCTURE,
  deliveryResults: { key: ["ownerId", "operationId"], indexes: { "by-generation": ["ownerId", "generationId"] } },
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
  /** Disposable overrides must use propulse-station-workbench-test- plus a nonempty suffix. */
  dbName?: string;
  /** Injection keeps availability and blocked-open tests independent of browser globals. */
  indexedDB?: Pick<IDBFactory, "open"> | null;
  onBlocked?: () => void;
  onInvalidated?: (reason: "versionchange" | "terminated") => void;
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function verifyStructure(db: IDBDatabase, structure: Record<string, StoreStructure>, upgrade?: IDBTransaction): boolean {
  const names = Object.keys(structure);
  if (db.objectStoreNames.length !== names.length
    || names.some((name) => !db.objectStoreNames.contains(name))) return false;
  const tx = upgrade ?? db.transaction(names, "readonly");
  return names.every((name) => {
    const store = tx.objectStore(name);
    const expected = structure[name];
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
  let strictDurability: boolean | undefined;
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
  const track = (native: IDBTransaction) => {
    pending.add(native);
    void wrap(native).done.then(() => { pending.delete(native); }, () => { pending.delete(native); });
  };
  const supportsStrictDurability = () => {
    if (strictDurability !== undefined) return strictDurability;
    try {
      // Known-valid readonly arguments isolate unsupported options from invalid
      // caller arguments or a failed write. The probe does not change any data.
      const probe = raw.transaction("accountMeta", "readonly", { durability: "strict" });
      track(probe);
      strictDurability = probe.durability === "strict";
    } catch (error) {
      if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === "NotSupportedError")) throw error;
      strictDurability = false;
    }
    return strictDurability;
  };
  const transaction = ((...args: Parameters<IDBPDatabase<StationDatabaseSchema>["transaction"]>) => {
    assertOpen();
    const tx = args[1] === "readwrite"
      ? supportsStrictDurability()
        ? db.transaction(args[0], "readwrite", { ...args[2], durability: "strict" })
        : db.transaction(args[0], "readwrite")
      : db.transaction(...args);
    // The wrapped transaction has native abort semantics; keep it only until completion.
    track(unwrap(tx));
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

/** Creates v2 or upgrades only an intact v1 by adding deliveryResults. Existing
 * records, generations, pointers and legacy application databases are untouched. */
export async function openStationDatabase(options: StationDatabaseOptions): Promise<StationDatabaseOpenResult> {
  const { ownerId, onBlocked, onInvalidated } = options;
  if (!validIdentity(ownerId)) return { status: "unavailable", reason: "A nonempty, unpadded owner identity is required" };
  const name = options.dbName ?? STATION_DATABASE_NAME;
  if (!validIdentity(name) || (name !== STATION_DATABASE_NAME
    && (!name.startsWith(DISPOSABLE_DATABASE_PREFIX) || name.slice(DISPOSABLE_DATABASE_PREFIX.length).trim().length === 0))) {
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
      if (settled || (event.oldVersion !== 0 && event.oldVersion !== 1) || event.newVersion !== STATION_DATABASE_VERSION) {
        invalidUpgrade = true;
        request.transaction?.abort();
        return;
      }
      try {
        if (event.oldVersion === 1 && (!request.transaction || !verifyStructure(request.result, V1_STRUCTURE, request.transaction))) {
          throw new TypeError("Only an intact station v1 schema can be upgraded");
        }
        const additions = event.oldVersion === 0 ? STRUCTURE : { deliveryResults: STRUCTURE.deliveryResults };
        for (const [storeName, definition] of Object.entries(additions)) {
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
        if (db.version !== STATION_DATABASE_VERSION || !verifyStructure(db, STRUCTURE)) {
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
