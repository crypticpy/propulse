import { z } from "zod";
import { contractIdSchema } from "../spotContracts";
import type { LibraryTransport } from "./repository";
import { libraryKindSchema, libraryOperationSchema, libraryRecordSchema, validateCommitResult, type CommitResult, type LibraryOperation } from "./schema";

export interface ViewLibrarySession { ownerId: string; accessToken: string }
const RESPONSE_LIMIT = 600 * 1024;
export const libraryCursorSchema = z.object({ kind: libraryKindSchema, id: contractIdSchema }).strict();
export const libraryPageSchema = z.object({ records: z.array(libraryRecordSchema).max(10), nextCursor: libraryCursorSchema.nullable() }).strict();
export type LibraryCursor = z.infer<typeof libraryCursorSchema>;
export type LibraryPage = z.infer<typeof libraryPageSchema>;
export type LibraryPageResult = { status: "loaded"; page: LibraryPage } | { status: "forbidden" | "unavailable"; message: string };

/** Reads a bounded response without accepting an unbounded chunked body. */
async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body");
  const decoder = new TextDecoder();
  let bytes = 0;
  let json = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > RESPONSE_LIMIT) throw new Error("Response exceeds limit");
      json += decoder.decode(value, { stream: true });
    }
    return JSON.parse(json + decoder.decode());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Same-origin authenticated adapter. Construction does not open storage or start sync. */
export class HttpViewLibraryTransport implements LibraryTransport {
  constructor(
    private readonly ownerId: string,
    private readonly session: () => Promise<ViewLibrarySession | null>,
    private readonly request: typeof fetch = fetch,
  ) {}

  /** Refreshes only library data; callers must check lifecycle before caching it. */
  async readPage(cursor: LibraryCursor | null, signal: AbortSignal): Promise<LibraryPageResult> {
    try {
      if (cursor) libraryCursorSchema.parse(cursor);
      const session = await this.session();
      if (signal.aborted || !session || session.ownerId !== this.ownerId || !session.accessToken) {
        return { status: "forbidden", message: "View library session is no longer active" };
      }
      const query = cursor ? `?after=${encodeURIComponent(JSON.stringify(cursor))}` : "";
      const response = await this.request(`/api/views/library${query}`, {
        method: "GET", signal, credentials: "omit", redirect: "error",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (response.status !== 200) {
        await response.body?.cancel();
        return { status: response.status === 401 || response.status === 403 ? "forbidden" : "unavailable", message: "View library refresh failed" };
      }
      const page = libraryPageSchema.parse(await readResponse(response));
      if (signal.aborted || page.records.some((record) => record.ownerId !== this.ownerId)) throw new Error("Owner mismatch");
      const last = page.records[page.records.length - 1];
      if (page.nextCursor && (!last || last.kind !== page.nextCursor.kind || last.id !== page.nextCursor.id ||
          (cursor?.kind === page.nextCursor.kind && cursor.id === page.nextCursor.id))) throw new Error("Invalid page continuation");
      return { status: "loaded", page };
    } catch { return { status: "unavailable", message: "View library refresh was not confirmed" }; }
  }

  async commit(raw: LibraryOperation, signal: AbortSignal): Promise<CommitResult> {
    const parsed = libraryOperationSchema.safeParse(raw);
    if (!parsed.success) return { status: "invalid", message: "Invalid library operation" };
    const operation = parsed.data;
    if (operation.ownerId !== this.ownerId) return { status: "forbidden", message: "Owner mismatch" };
    try {
      const session = await this.session();
      if (signal.aborted || !session || session.ownerId !== this.ownerId || !session.accessToken) {
        return { status: "forbidden", message: "View library session is no longer active" };
      }
      const response = await this.request("/api/views/library", {
        method: "POST", signal, credentials: "omit", redirect: "error",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify(operation),
      });
      // A transient service failure does not prove whether an earlier request committed.
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        return { status: "unavailable", message: "View library service is unavailable; save remains pending" };
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        return { status: "forbidden", message: "View library access was denied" };
      }
      if (response.status !== 200 && response.status !== 409 && response.status !== 400) {
        await response.body?.cancel();
        return { status: "unavailable", message: "Unexpected library response; save remains pending" };
      }
      const result = validateCommitResult(operation, await readResponse(response));
      const expected = response.status === 200 ? "saved" : response.status === 409 ? "conflict" : "invalid";
      if (result.status !== expected) return { status: "unavailable", message: "Unconfirmed library acknowledgement; save remains pending" };
      return result;
    } catch {
      return { status: "unavailable", message: "Library connection interrupted; save remains pending" };
    }
  }
}
