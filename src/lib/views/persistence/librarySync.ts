import { libraryPageSchema, type LibraryCursor, type LibraryPageResult } from "./httpTransport";
import { IndexedViewLibrary } from "./indexedLibrary";
import { RevisionedViewRepository, type LibraryTransport } from "./repository";

export interface ReadableLibraryTransport extends LibraryTransport {
  readPage(cursor: LibraryCursor | null, signal: AbortSignal): Promise<LibraryPageResult>;
}

export type LibraryRefreshResult =
  | { status: "refreshed"; records: number }
  | { status: "forbidden" | "unavailable"; message: string };

/** One authenticated session. Call dispose on every auth transition, even to the same owner.
 * Pulls update reusable library records only; they never select or activate a working view.
 * Construction is inert. The integration layer explicitly schedules refresh/reconnect work.
 */
export class ViewLibrarySync {
  readonly repository: RevisionedViewRepository;
  private readonly controller = new AbortController();
  private refreshPromise: Promise<LibraryRefreshResult> | null = null;

  constructor(
    private readonly library: IndexedViewLibrary,
    private readonly transport: ReadableLibraryTransport,
    private readonly currentOwner: () => string | null,
  ) {
    this.repository = new RevisionedViewRepository(library, { mode: "account", transport, currentOwner });
  }

  private active = (): boolean => !this.controller.signal.aborted && this.currentOwner() === this.library.ownerId;

  dispose(): void {
    this.controller.abort();
    this.repository.dispose();
  }

  /** Coalesces refreshes; committed earlier pages remain useful if a later page fails. */
  refresh(): Promise<LibraryRefreshResult> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.pull().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  private async pull(): Promise<LibraryRefreshResult> {
    const ended = (): LibraryRefreshResult => ({ status: "forbidden", message: "View library session ended" });
    if (!this.active()) return ended();
    let cursor: LibraryCursor | null = null;
    let records = 0;
    const cursors = new Set<string>();
    try {
      do {
        const result = await this.transport.readPage(cursor, this.controller.signal);
        if (!this.active()) return ended();
        if (result.status !== "loaded") return result;
        const page = libraryPageSchema.parse(result.page);
        const last = page.records.at(-1);
        const nextKey = page.nextCursor ? JSON.stringify([page.nextCursor.kind, page.nextCursor.id]) : null;
        if (page.nextCursor && (!last || last.kind !== page.nextCursor.kind || last.id !== page.nextCursor.id || cursors.has(nextKey!))) {
          throw new Error("Invalid library page continuation");
        }
        await this.library.cache(page.records, { signal: this.controller.signal, isActive: this.active });
        if (!this.active()) return ended();
        records += page.records.length;
        cursor = page.nextCursor;
        if (nextKey) cursors.add(nextKey);
      } while (cursor);
      return { status: "refreshed", records };
    } catch {
      return this.active()
        ? { status: "unavailable", message: "Library refresh incomplete; cached records and pending drafts were retained" }
        : ended();
    }
  }
}
