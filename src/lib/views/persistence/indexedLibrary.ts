import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import { contractIdSchema } from "../spotContracts";
import { canonicalJson } from "./canonical";
import { legacyMigrationKey, legacyMigrationPlanSchema, type LegacyMigrationJournal, type LegacyMigrationPlan, type LegacyMigrationResult } from "./legacyMigration";
import {
  libraryOperationSchema, libraryRecordSchema, pendingOperationSchema, validateCommitResult,
  type CommitResult, type LibraryKind, type LibraryOperation, type LibraryRecord, type PendingOperation,
} from "./schema";

interface LibraryDatabase extends DBSchema {
  migrations: { key: string; value: LegacyMigrationJournal };
  records: { key: [string, LibraryKind, string]; value: LibraryRecord; indexes: { owner: string } };
  pending: { key: [string, string]; value: PendingOperation; indexes: { owner: string; document: [string, LibraryKind, string] } };
  receipts: { key: [string, string]; value: { operation: LibraryOperation; result: CommitResult }; indexes: { owner: string } };
}

const documentKey = (entry: Pick<LibraryRecord, "ownerId" | "kind" | "id">): [string, LibraryKind, string] => [entry.ownerId, entry.kind, entry.id];
const operationKey = (operation: LibraryOperation): [string, string] => [operation.ownerId, operation.operationId];
const invalid = (message: string): CommitResult => ({ status: "invalid", message });

async function atomic<T>(transaction: { abort(): void; done: Promise<unknown> }, work: () => Promise<T>): Promise<T> {
  void transaction.done.catch(() => undefined);
  try {
    const result = await work();
    await transaction.done;
    return result;
  } catch (error) {
    try { transaction.abort(); } catch { /* Already aborted/completed. */ }
    await transaction.done.catch(() => undefined);
    throw error;
  }
}

/** A library connection is bound to one owner. It never reads/writes active UI stores. */
export class IndexedViewLibrary {
  readonly ownerId: string;
  private connection: Promise<IDBPDatabase<LibraryDatabase>> | null = null;
  private closed = false;

  constructor(ownerId: string, private readonly databaseName = "propulse-view-library-v1") {
    this.ownerId = contractIdSchema.parse(ownerId);
  }

  private db(): Promise<IDBPDatabase<LibraryDatabase>> {
    if (this.closed) return Promise.reject(new Error("Library connection is closed"));
    if (!this.connection) {
      this.connection = openDB<LibraryDatabase>(this.databaseName, 2, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            db.createObjectStore("records", { keyPath: ["ownerId", "kind", "id"] }).createIndex("owner", "ownerId");
            const pending = db.createObjectStore("pending", { keyPath: ["operation.ownerId", "operation.operationId"] });
            pending.createIndex("owner", "operation.ownerId");
            pending.createIndex("document", ["operation.ownerId", "operation.kind", "operation.id"], { unique: true });
            db.createObjectStore("receipts", { keyPath: ["operation.ownerId", "operation.operationId"] }).createIndex("owner", "operation.ownerId");
          }
          if (oldVersion < 2) db.createObjectStore("migrations", { keyPath: "key" });
        },
        blocking: () => { void this.close(); },
      }).catch((error: unknown) => { this.connection = null; throw error; });
    }
    return this.connection;
  }

  async close(): Promise<void> {
    this.closed = true;
    const pending = this.connection;
    this.connection = null;
    if (pending) (await pending).close();
  }

  async get(kind: LibraryKind, id: string): Promise<LibraryRecord | null> {
    contractIdSchema.parse(id);
    const raw = await (await this.db()).get("records", [this.ownerId, kind, id]);
    return raw ? libraryRecordSchema.parse(raw) : null;
  }

  async list(kind?: LibraryKind): Promise<LibraryRecord[]> {
    const rows = await (await this.db()).getAllFromIndex("records", "owner", this.ownerId);
    return rows.map((row) => libraryRecordSchema.parse(row))
      .filter((row) => !kind || row.kind === kind).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Local-only CAS. Account-backed saves use durable enqueue + authenticated transport instead. */
  async commitLocal(raw: LibraryOperation): Promise<CommitResult> {
    const parsed = libraryOperationSchema.safeParse(raw);
    if (!parsed.success) return invalid("Invalid library operation");
    const operation = parsed.data;
    if (operation.ownerId !== this.ownerId) return { status: "forbidden", message: "Owner mismatch" };
    let transaction: IDBPTransaction<LibraryDatabase, ["records", "receipts"], "readwrite"> | undefined;
    try {
      const db = await this.db();
      const tx = db.transaction(["records", "receipts"], "readwrite");
      transaction = tx;
      void tx.done.catch(() => undefined);
      const receipts = tx.objectStore("receipts");
      const receipt = await receipts.get(operationKey(operation));
      if (receipt) {
        await tx.done;
        return canonicalJson(receipt.operation) === canonicalJson(operation)
          ? validateCommitResult(operation, receipt.result) : invalid("Operation ID was reused with different content");
      }
      const records = tx.objectStore("records");
      const rawCurrent = await records.get(documentKey(operation));
      const current = rawCurrent ? libraryRecordSchema.parse(rawCurrent) : null;
      const result: CommitResult = (current?.revision ?? 0) !== operation.expectedRevision
        ? { status: "conflict", current }
        : { status: "saved", record: libraryRecordSchema.parse({
          ownerId: operation.ownerId, kind: operation.kind, id: operation.id,
          revision: operation.expectedRevision + 1, value: operation.value,
        }) };
      if (result.status === "saved") await records.put(result.record);
      await receipts.put({ operation, result });
      await tx.done;
      return result;
    } catch {
      if (transaction) {
        try { transaction.abort(); } catch { /* Already aborted/completed. */ }
        await transaction.done.catch(() => undefined);
      }
      return { status: "unavailable", message: "Local library could not commit; no save is confirmed" };
    }
  }

  async enqueue(raw: LibraryOperation): Promise<{ status: "pending"; operationId: string } | CommitResult> {
    const parsed = libraryOperationSchema.safeParse(raw);
    if (!parsed.success) return invalid("Invalid library operation");
    const operation = parsed.data;
    if (operation.ownerId !== this.ownerId) return { status: "forbidden", message: "Owner mismatch" };
    try {
      const db = await this.db();
      const tx = db.transaction("pending", "readwrite");
      void tx.done.catch(() => undefined);
      const existing = await tx.store.index("document").get(documentKey(operation));
      if (existing) {
        await tx.done;
        return canonicalJson(existing.operation) === canonicalJson(operation)
          ? { status: "pending", operationId: operation.operationId }
          : invalid("Resolve the existing pending save for this document first");
      }
      if (await tx.store.index("owner").count(this.ownerId) >= 100) {
        await tx.done;
        return { status: "unavailable", message: "Pending save limit reached" };
      }
      await tx.store.add({ operation, state: "queued", message: null, current: null });
      await tx.done;
      return { status: "pending", operationId: operation.operationId };
    } catch {
      return { status: "unavailable", message: "Could not persist pending save; retain the working draft" };
    }
  }

  async pending(): Promise<PendingOperation[]> {
    const rows = await (await this.db()).getAllFromIndex("pending", "owner", this.ownerId);
    return rows.map((row) => pendingOperationSchema.parse(row));
  }

  /** Explicit discard after UI confirmation/choice; does not overwrite a saved record. */
  async discard(operationId: string): Promise<void> {
    contractIdSchema.parse(operationId);
    await (await this.db()).delete("pending", [this.ownerId, operationId]);
  }

  /** Apply a validated transport result atomically with removing/marking its pending request. */
  async settle(
    operation: LibraryOperation, rawResult: CommitResult,
    lifecycle?: { signal: AbortSignal; isActive: () => boolean },
  ): Promise<CommitResult> {
    const active = () => !this.closed && !lifecycle?.signal.aborted && (lifecycle?.isActive() ?? true);
    const forbidden = (): CommitResult => ({ status: "forbidden", message: "Library lifecycle ended; response was not applied" });
    if (!active()) return forbidden();
    if (operation.ownerId !== this.ownerId) return { status: "forbidden", message: "Owner mismatch" };
    const result = validateCommitResult(operation, rawResult);
    if (result.status === "unavailable") return result;
    const db = await this.db();
    if (!active()) return forbidden();
    const tx = db.transaction(["records", "pending", "receipts"], "readwrite");
    const abort = () => { try { tx.abort(); } catch { /* Transaction already finished. */ } };
    const check = () => { if (!active()) throw new Error("Library lifecycle ended"); };
    lifecycle?.signal.addEventListener("abort", abort, { once: true });
    try {
      return await atomic(tx, async () => {
        check();
        const receipts = tx.objectStore("receipts");
        const receipt = await receipts.get(operationKey(operation));
        check();
        if (receipt) {
          return canonicalJson(receipt.operation) === canonicalJson(operation)
            ? validateCommitResult(operation, receipt.result) : invalid("Operation ID was reused with different content");
        }
        const pending = tx.objectStore("pending");
        const entry = await pending.get(operationKey(operation));
        check();
        if (!entry || canonicalJson(entry.operation) !== canonicalJson(operation)) {
          return invalid("Pending request was discarded or replaced");
        }
        if (result.status === "saved") {
          const records = tx.objectStore("records");
          const current = await records.get(documentKey(operation));
          check();
          if (!current || current.revision <= result.record.revision) await records.put(result.record);
          check();
          await receipts.put({ operation, result });
          check();
          await pending.delete(operationKey(operation));
        } else {
          await pending.put({
            operation, state: result.status === "conflict" ? "conflict" : "rejected",
            message: result.status === "conflict" ? "Saved revision changed; review before retrying" : result.message,
            current: result.status === "conflict" ? result.current : null,
        });
      }
      check();
      return result;
      });
    } catch (error) {
      if (!active()) return forbidden();
      throw error;
    } finally {
      lifecycle?.signal.removeEventListener("abort", abort);
    }
  }

  /** Atomically retain the captured baseline and seed records/drafts. Never publishes scenes.
   * The caller supplies complete conversion results; this method never reads live stores.
   */
  async migrateLegacy(
    rawPlan: LegacyMigrationPlan, mode: "local" | "account",
    lifecycle?: { signal: AbortSignal; isActive: () => boolean },
  ): Promise<LegacyMigrationResult> {
    const parsed = legacyMigrationPlanSchema.safeParse(rawPlan);
    if (!parsed.success || (mode !== "local" && mode !== "account")) {
      return { status: "invalid", message: "Invalid legacy migration plan" };
    }
    const plan = parsed.data;
    const active = () => !this.closed && !lifecycle?.signal.aborted && (lifecycle?.isActive() ?? true);
    const forbidden = (): LegacyMigrationResult => ({ status: "forbidden", message: "Legacy migration owner/session mismatch" });
    if (plan.ownerId !== this.ownerId || !active()) return forbidden();
    if (plan.source === "account" && mode !== "account") {
      return { status: "invalid", message: "Account migration requires pending cloud saves" };
    }
    try {
      const db = await this.db();
      if (!active()) return forbidden();
      const tx = db.transaction(["records", "pending", "migrations"], "readwrite");
      const abort = () => { try { tx.abort(); } catch { /* Already finished. */ } };
      const check = () => { if (!active()) throw new Error("Migration session ended"); };
      lifecycle?.signal.addEventListener("abort", abort, { once: true });
      try {
        return await atomic(tx, async (): Promise<LegacyMigrationResult> => {
          check();
          const key = legacyMigrationKey(this.ownerId, plan.source);
          const migrations = tx.objectStore("migrations");
          const existing = await migrations.get(key);
          check();
          if (existing) {
            if (existing.plan.ownerId !== this.ownerId) return forbidden();
            if (existing.mode !== mode) return { status: "conflict", message: "Migration mode changed; copy saved views explicitly" };
            // The first capture wins even when legacy storage or conversion defaults later change.
            legacyMigrationPlanSchema.parse(existing.plan);
            return { status: "existing", journal: existing };
          }
          const values = [
            ...Object.values(plan.views).map((data) => ({ kind: "view" as const, data })),
            ...plan.presets.map((data) => ({ kind: "preset" as const, data })),
          ];
          const records = tx.objectStore("records");
          const pending = tx.objectStore("pending");
          if (mode === "account") {
            const count = await pending.index("owner").count(this.ownerId);
            check();
            if (count + values.length > 100) return { status: "unavailable", message: "Pending save limit prevents migration; legacy data was retained" };
          }
          for (const value of values) {
            const document: [string, LibraryKind, string] = [this.ownerId, value.kind, value.data.id];
            const current = await records.get(document);
            check();
            const draft = await pending.index("document").get(document);
            check();
            if (current || draft) return { status: "conflict", message: "A migration destination already exists; no records were replaced" };
          }
          const operationIds: string[] = [];
          for (const value of values) {
            if (mode === "local") {
              await records.add({ ownerId: this.ownerId, kind: value.kind, id: value.data.id, revision: 1, value });
            } else {
              const operation = libraryOperationSchema.parse({
                operationId: crypto.randomUUID(), ownerId: this.ownerId,
                kind: value.kind, id: value.data.id, expectedRevision: 0, value,
              });
              operationIds.push(operation.operationId);
              await pending.add({ operation, state: "queued", message: null, current: null });
            }
            check();
          }
          const journal: LegacyMigrationJournal = { key, mode, plan, operationIds };
          await migrations.add(journal);
          check();
          return { status: "migrated", journal };
        });
      } finally {
        lifecycle?.signal.removeEventListener("abort", abort);
      }
    } catch {
      return active() ? { status: "unavailable", message: "Migration was not committed; legacy data was retained" } : forbidden();
    }
  }

  /** Inspect only the device capture owner, never another owner's backup or records. */
  async deviceMigrationOwner(): Promise<string | null> {
    const journal = await (await this.db()).get("migrations", legacyMigrationKey(this.ownerId, "device"));
    if (!journal) return null;
    legacyMigrationPlanSchema.parse(journal.plan);
    return journal.plan.ownerId;
  }

  /** Read the original conversion/rollback data only within the capture's owner namespace. */
  async legacyMigration(source: LegacyMigrationPlan["source"]): Promise<LegacyMigrationJournal | null> {
    if (source !== "device" && source !== "account") throw new Error("Invalid migration source");
    const journal = await (await this.db()).get("migrations", legacyMigrationKey(this.ownerId, source));
    if (!journal || journal.plan.ownerId !== this.ownerId) return null;
    legacyMigrationPlanSchema.parse(journal.plan);
    return journal;
  }

  /** Remote library refresh never alters pending drafts or activates a view. */
  async cache(
    records: readonly LibraryRecord[],
    lifecycle?: { signal: AbortSignal; isActive: () => boolean },
  ): Promise<void> {
    const check = () => {
      if (this.closed || lifecycle?.signal.aborted || !(lifecycle?.isActive() ?? true)) {
        throw new Error("Library lifecycle ended; refresh was not applied");
      }
    };
    check();
    const validated = records.map((row) => libraryRecordSchema.parse(row));
    if (validated.some((row) => row.ownerId !== this.ownerId)) throw new Error("Owner mismatch");
    const db = await this.db();
    check();
    const tx = db.transaction("records", "readwrite");
    const abort = () => { try { tx.abort(); } catch { /* Transaction already finished. */ } };
    lifecycle?.signal.addEventListener("abort", abort, { once: true });
    try {
      await atomic(tx, async () => {
        check();
        for (const record of validated) {
          const current = await tx.store.get(documentKey(record));
          check();
          if (!current || current.revision < record.revision) await tx.store.put(record);
          check();
        }
      });
    } finally {
      lifecycle?.signal.removeEventListener("abort", abort);
    }
  }
}
