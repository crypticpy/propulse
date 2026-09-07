import { beforeEach, describe, expect, it, vi } from "vitest";
import { createViewConfiguration } from "../../../src/lib/views/defaults";
import { createDisplayAssignmentFixture } from "../../../src/lib/views/fixtures";
import { handleViewDisplayAssignment, handleViewLibrary } from "./viewLibrary";
const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("../stationAuth", () => ({ verifyStationOwner: mock.auth }));
vi.mock("../rateLimit", () => ({ applyRateLimit: () => null }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mock.rpc, from: mock.from }) }));
const ownerId = "11111111-1111-4111-8111-111111111111";
const foreign = "22222222-2222-4222-8222-222222222222";
const value = { kind: "view", data: { id: "station", name: "Station", schemaVersion: 1, sourcePreset: null, config: createViewConfiguration() } };
const op = { ownerId, kind: "view", id: "station", operationId: "save-1", expectedRevision: 0, value };
const saved = { status: "saved", record: { ownerId, kind: "view", id: "station", revision: 1, value } };
function post(body: unknown = op) { return new Request("https://app.test/api/views/library", { method: "POST", body: JSON.stringify(body) }); }
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://synthetic.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ ownerId });
  mock.rpc.mockResolvedValue({ data: saved, error: null });
});

describe("view library service boundary", () => {
  it("uses verified authority and returns only a validated acknowledgement", async () => {
    const response = await handleViewLibrary(post());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(saved);
    expect(mock.rpc).toHaveBeenCalledWith("commit_view_library", { actor: ownerId, op });
  });
  it("rejects owner spoofing and authentication failures before RPC", async () => {
    expect((await handleViewLibrary(post({ ...op, ownerId: foreign }))).status).toBe(403);
    mock.auth.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    expect((await handleViewLibrary(post())).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects future/invalid payloads and oversized bodies without calling SQL", async () => {
    const future = structuredClone(op); future.value.data.config.schemaVersion = 2 as 1;
    expect((await handleViewLibrary(post(future))).status).toBe(400);
    expect((await handleViewLibrary(post({ ...op, expectedRevision: -1 }))).status).toBe(400);
    expect((await handleViewLibrary(post("x".repeat(601 * 1024)))).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("preserves conflicts and treats uncertain/mismatched server responses as retryable", async () => {
    const conflict = { status: "conflict", current: saved.record };
    mock.rpc.mockResolvedValueOnce({ data: conflict, error: null });
    const response = await handleViewLibrary(post());
    expect(response.status).toBe(409); expect(await response.json()).toEqual(conflict);
    mock.rpc.mockResolvedValueOnce({ data: { ...saved, record: { ...saved.record, ownerId: foreign } }, error: null });
    expect((await handleViewLibrary(post())).status).toBe(503);
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: "secret detail" } });
    const unavailable = await handleViewLibrary(post());
    expect(unavailable.status).toBe(503); expect(await unavailable.text()).not.toContain("secret detail");
  });
  it("keeps display publication distinct and rejects non-device IDs", async () => {
    const { revision: _revision, ...assignment } = createDisplayAssignmentFixture();
    const request = { ...op, kind: "display", value: { kind: "display", data: assignment } };
    expect((await handleViewLibrary(post(request))).status).toBe(400);
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    mock.rpc.mockResolvedValueOnce({ data: { status: "saved", record: { ownerId, kind: "display", id, revision: 1, value: request.value } }, error: null });
    expect((await handleViewLibrary(post({ ...request, id }))).status).toBe(200);
    expect(mock.rpc.mock.calls[0][1].op.kind).toBe("display");
  });
  it("bounds owner-scoped pages and validates cursor input before the query", async () => {
    const rows = Array.from({ length: 11 }, (_, n) => ({ owner_id: ownerId, kind: "view", id: `view-${n}`, revision: 1, value: { kind: "view", data: { ...value.data, id: `view-${n}` } } }));
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), then: (resolve: (value: { data: typeof rows; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve) };
    mock.from.mockReturnValue(query);
    const response = await handleViewLibrary(new Request("https://app.test/api/views/library"));
    const result = await response.json();
    expect(result.records).toHaveLength(10);
    expect(result.nextCursor).toEqual({ kind: "view", id: "view-9" });
    expect(query.eq).toHaveBeenCalledWith("owner_id", ownerId);
    const after = encodeURIComponent(JSON.stringify({ kind: "view", id: "station" }));
    expect((await handleViewLibrary(new Request(`https://app.test/api/views/library?after=${after}`))).status).toBe(200);
    expect(query.or).toHaveBeenCalledWith("kind.gt.view,and(kind.eq.view,id.gt.station)");
    expect((await handleViewLibrary(new Request("https://app.test/api/views/library?after=bad"))).status).toBe(400);
  });
});

describe("paired display assignment endpoint", () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const request = () => new Request(`https://app.test/api/displays/assignment?id=${id}`, { headers: { Authorization: `Bearer ${"a".repeat(64)}` } });
  it("binds the token hash and device in one RPC and returns a complete assignment", async () => {
    const assignment = createDisplayAssignmentFixture();
    mock.rpc.mockResolvedValue({ data: { paired: true, bindingId: id, assignment }, error: null });
    const response = await handleViewDisplayAssignment(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ paired: true, bindingId: id, assignment });
    expect(mock.rpc).toHaveBeenCalledWith("read_view_display_assignment", { display_uuid: id, token_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(mock.rpc.mock.calls[0][1].token_hash).not.toBe("a".repeat(64));
    expect(mock.auth).not.toHaveBeenCalled();
  });
  it("does not distinguish an unknown device from a wrong token or disclose malformed snapshots", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await handleViewDisplayAssignment(request())).status).toBe(404);
    mock.rpc.mockResolvedValueOnce({ data: { paired: true, assignment: { revision: 1 } }, error: null });
    expect((await handleViewDisplayAssignment(request())).status).toBe(503);
  });
});
