import { describe, expect, it, vi } from "vitest";
import { createViewConfiguration } from "../defaults";
import { HttpViewLibraryTransport } from "./httpTransport";
import type { LibraryOperation } from "./schema";

const operation: LibraryOperation = {
  operationId: "save-1", ownerId: "owner-a", kind: "view", id: "view-1", expectedRevision: 0,
  value: { kind: "view", data: { id: "view-1", name: "Station", schemaVersion: 1, sourcePreset: null, config: createViewConfiguration() } },
};
const saved = { status: "saved", record: { ownerId: "owner-a", kind: "view", id: "view-1", revision: 1, value: operation.value } };
function adapter(response: () => Promise<Response>) {
  const request = vi.fn<typeof fetch>(response);
  return { request, transport: new HttpViewLibraryTransport("owner-a", async () => ({ ownerId: "owner-a", accessToken: "synthetic-token" }), request) };
}

describe("authenticated view transport", () => {
  it("sends the immutable operation to the same origin and validates its acknowledgement", async () => {
    const { transport, request } = adapter(async () => Response.json(saved));
    const signal = new AbortController().signal;
    expect(await transport.commit(operation, signal)).toEqual(saved);
    expect(request).toHaveBeenCalledWith("/api/views/library", expect.objectContaining({
      signal, redirect: "error", credentials: "omit", method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token" },
    }));
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toEqual(operation);
  });

  it("never sends a foreign operation or an expired owner session", async () => {
    const request = vi.fn();
    const transport = new HttpViewLibraryTransport("owner-a", async () => ({ ownerId: "owner-b", accessToken: "other-token" }), request);
    expect((await transport.commit(operation, new AbortController().signal)).status).toBe("forbidden");
    expect((await transport.commit({ ...operation, ownerId: "owner-b" }, new AbortController().signal)).status).toBe("forbidden");
    expect(request).not.toHaveBeenCalled();
  });

  it("honors cancellation while obtaining authentication", async () => {
    const controller = new AbortController();
    const request = vi.fn();
    const transport = new HttpViewLibraryTransport("owner-a", async () => {
      controller.abort(); return { ownerId: "owner-a", accessToken: "synthetic-token" };
    }, request);
    expect((await transport.commit(operation, controller.signal)).status).toBe("forbidden");
    expect(request).not.toHaveBeenCalled();
  });

  it.each([408, 429, 500, 503])("keeps HTTP %i failures retryable", async (status) => {
    const { transport } = adapter(async () => new Response("service failure", { status }));
    expect((await transport.commit(operation, new AbortController().signal)).status).toBe("unavailable");
  });

  it("preserves a validated conflict but rejects mismatched success acknowledgements", async () => {
    const conflict = { status: "conflict", current: saved.record };
    const { transport } = adapter(async () => Response.json(conflict, { status: 409 }));
    expect(await transport.commit(operation, new AbortController().signal)).toEqual(conflict);
    const mismatched = adapter(async () => Response.json({ ...saved, record: { ...saved.record, ownerId: "owner-b" } }));
    expect((await mismatched.transport.commit(operation, new AbortController().signal)).status).toBe("unavailable");
  });

  it("bounds chunked responses and leaves malformed/lost acknowledgements pending", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(601 * 1024)); }, cancel });
    const { transport } = adapter(async () => new Response(stream));
    expect((await transport.commit(operation, new AbortController().signal)).status).toBe("unavailable");
    expect(cancel).toHaveBeenCalled();
    const malformed = adapter(async () => new Response("{"));
    expect((await malformed.transport.commit(operation, new AbortController().signal)).status).toBe("unavailable");
  });
});

describe("view library page transport", () => {
  it("validates owner pages and passes the opaque cursor without sharing active view state", async () => {
    const page = { records: [saved.record], nextCursor: { kind: "view", id: "view-1" } };
    const { transport, request } = adapter(async () => Response.json(page));
    expect(await transport.readPage(null, new AbortController().signal)).toEqual({ status: "loaded", page });
    expect(request.mock.calls[0][0]).toBe("/api/views/library");
  });
  it("rejects foreign rows, malformed cursors and repeated continuations", async () => {
    const wrong = adapter(async () => Response.json({ records: [{ ...saved.record, ownerId: "owner-b" }], nextCursor: null }));
    expect((await wrong.transport.readPage(null, new AbortController().signal)).status).toBe("unavailable");
    const repeat = adapter(async () => Response.json({ records: [saved.record], nextCursor: { kind: "view", id: "view-1" } }));
    expect((await repeat.transport.readPage({ kind: "view", id: "view-1" }, new AbortController().signal)).status).toBe("unavailable");
    const cursorless = adapter(async () => Response.json({ records: [], nextCursor: { kind: "view", id: "bogus" } }));
    expect((await cursorless.transport.readPage(null, new AbortController().signal)).status).toBe("unavailable");
  });
});
