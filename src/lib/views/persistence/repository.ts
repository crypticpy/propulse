import type { DisplayAssignment, PresetRecipe, SavedView, SaveResult, ViewRepository } from "../contracts";
import { IndexedViewLibrary } from "./indexedLibrary";
import {
  libraryOperationSchema, validateCommitResult,
  type CommitResult, type DisplayDraft, type LibraryKind, type LibraryOperation, type LibraryRecord,
  type LibraryValue, type ViewDraft,
} from "./schema";

/** Implemented by the authenticated server adapter. Retrying operationId must be idempotent. */
export interface LibraryTransport {
  commit(operation: LibraryOperation, signal: AbortSignal): Promise<CommitResult>;
}

export type RepositoryOptions =
  | { mode: "local" }
  | { mode: "account"; transport: LibraryTransport; currentOwner: () => string | null };

export class RevisionedViewRepository implements ViewRepository {
  private readonly controller = new AbortController();
  private flushPromise: Promise<void> | null = null;

  constructor(
    readonly library: IndexedViewLibrary,
    private readonly options: RepositoryOptions,
    private readonly newOperationId: () => string = () => crypto.randomUUID(),
  ) {}

  private active(ownerId = this.library.ownerId): boolean {
    return !this.controller.signal.aborted && ownerId === this.library.ownerId &&
      (this.options.mode === "local" || this.options.currentOwner() === ownerId);
  }

  dispose(): void {
    this.controller.abort();
    // Keep durable pending requests partitioned under their original owner for later replay.
    void this.library.close().catch(() => undefined);
  }

  /** Read the owner's local library cache; cloud pull populates it without touching runtimes. */
  async getView(ownerId: string, viewId: string): Promise<SavedView | null> {
    if (!this.active(ownerId)) throw new Error("View library owner is no longer active");
    const record = await this.library.get("view", viewId);
    if (!this.active(ownerId)) throw new Error("View library owner changed while reading");
    return record?.value?.kind === "view"
      ? { ...record.value.data, ownerId, revision: record.revision } : null;
  }

  private async send(operation: LibraryOperation): Promise<CommitResult> {
    if (!this.active()) return { status: "forbidden", message: "View library owner is no longer active" };
    if (this.options.mode === "local") return this.library.commitLocal(operation);
    try {
      const raw = await this.options.transport.commit(operation, this.controller.signal);
      if (!this.active()) return { status: "forbidden", message: "Owner changed; response was not applied" };
      const result = validateCommitResult(operation, raw);
      return await this.library.settle(operation, result);
    } catch {
      return { status: "unavailable", message: "Save remains pending; server acceptance is unconfirmed" };
    }
  }

  private async submit(
    ownerId: string, kind: LibraryKind, id: string, value: LibraryValue | null, expectedRevision: number,
  ): Promise<SaveResult<LibraryRecord>> {
    if (!this.active(ownerId)) return { status: "forbidden", message: "View library owner is no longer active" };
    const parsed = libraryOperationSchema.safeParse({
      operationId: this.newOperationId(), ownerId, kind, id, value, expectedRevision,
    });
    if (!parsed.success) return { status: "invalid", message: "Invalid view library request" };
    const operation = parsed.data;
    if (this.options.mode === "local") return this.send(operation);
    const queued = await this.library.enqueue(operation);
    if (queued.status !== "pending") return queued;
    const result = await this.send(operation);
    return result.status === "unavailable" ? queued : result;
  }

  async saveView(ownerId: string, view: ViewDraft, expectedRevision: number): Promise<SaveResult<SavedView>> {
    const result = await this.submit(ownerId, "view", view.id, { kind: "view", data: view }, expectedRevision);
    if (result.status === "saved") {
      if (result.record.value?.kind !== "view") return { status: "invalid", message: "Invalid view acknowledgement" };
      return { status: "saved", record: { ...result.record.value.data, ownerId, revision: result.record.revision } };
    }
    if (result.status === "conflict") return {
      status: "conflict", current: result.current?.value?.kind === "view"
        ? { ...result.current.value.data, ownerId, revision: result.current.revision } : null,
    };
    return result;
  }

  async savePreset(ownerId: string, preset: PresetRecipe, expectedRevision: number): Promise<SaveResult<LibraryRecord>> {
    return this.submit(ownerId, "preset", preset.id, { kind: "preset", data: preset }, expectedRevision);
  }

  async deleteEntry(ownerId: string, kind: "view" | "preset", id: string, expectedRevision: number): Promise<SaveResult<LibraryRecord>> {
    return this.submit(ownerId, kind, id, null, expectedRevision);
  }

  async publishDisplay(ownerId: string, displayId: string, assignment: DisplayDraft, expectedRevision: number): Promise<SaveResult<DisplayAssignment>> {
    // Local storage cannot claim to have delivered an assignment to a paired display.
    if (this.options.mode !== "account") return { status: "unavailable", message: "Display publication requires an authenticated connection" };
    const result = await this.submit(ownerId, "display", displayId, { kind: "display", data: assignment }, expectedRevision);
    if (result.status === "saved") {
      if (result.record.value?.kind !== "display") return { status: "invalid", message: "Invalid display acknowledgement" };
      return { status: "saved", record: { ...result.record.value.data, revision: result.record.revision } };
    }
    if (result.status === "conflict") return {
      status: "conflict", current: result.current?.value?.kind === "display"
        ? { ...result.current.value.data, revision: result.current.revision } : null,
    };
    return result;
  }

  /** Conflicts/rejections remain drafts and require an explicit discard/rebase choice. */
  flushPending(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flush().finally(() => { this.flushPromise = null; });
    return this.flushPromise;
  }

  private async flush(): Promise<void> {
    if (this.options.mode !== "account" || !this.active()) return;
    const pending = await this.library.pending();
    for (const entry of pending) {
      if (!this.active()) return;
      if (entry.state === "queued") {
        const result = await this.send(entry.operation);
        if (result.status === "unavailable") return;
      }
    }
  }
}
