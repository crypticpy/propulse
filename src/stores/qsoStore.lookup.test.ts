import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldPreserveLookupGrid, useQSOStore } from "./qsoStore";

vi.mock("@/lib/api/authFetch", () => ({ authHeaders: async () => ({ Authorization: "Bearer test-session" }) }));

function lookupResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      callsign: "K5ABC",
      name: "Jane Operator",
      qth: "Austin",
      grid: "EM10aa",
      source: "callook",
      ...overrides,
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("qsoStore callsign lookup", () => {
  beforeEach(() => {
    useQSOStore.setState({ formDefaults: {} });
    useQSOStore.getState().resetForm();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(lookupResponse()),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enriches identity without replacing an authoritative activation grid", async () => {
    const store = useQSOStore.getState();
    store.setField("callsign", "K5ABC");
    store.setField("grid", "EM10df");

    await store.lookupCallsign("K5ABC", { preserveGrid: true });

    expect(useQSOStore.getState().form).toEqual(
      expect.objectContaining({
        name: "Jane Operator",
        qth: "Austin",
        grid: "EM10df",
      }),
    );
    expect(useQSOStore.getState().lookupResult?.grid).toBe("EM10aa");
    expect(shouldPreserveLookupGrid("K5ABC")).toBe(true);
  });

  it("uses the profile grid for an ordinary empty draft", async () => {
    const store = useQSOStore.getState();
    store.setField("callsign", "K5ABC");

    await store.lookupCallsign("K5ABC");

    expect(useQSOStore.getState().form.grid).toBe("EM10aa");
  });

  it("ignores a superseded ordinary lookup for the same activation callsign", async () => {
    const ordinaryResponse = deferred<ReturnType<typeof lookupResponse>>();
    const activationResponse = deferred<ReturnType<typeof lookupResponse>>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(ordinaryResponse.promise)
        .mockReturnValueOnce(activationResponse.promise),
    );

    const store = useQSOStore.getState();
    store.setField("callsign", "K5ABC");
    const ordinaryLookup = store.lookupCallsign("K5ABC");

    store.resetForm();
    store.setField("callsign", "K5ABC");
    store.setField("grid", "EM10df");
    const activationLookup = store.lookupCallsign("K5ABC", {
      preserveGrid: true,
    });

    activationResponse.resolve(
      lookupResponse({ name: "Current Activation", grid: "EM10aa" }),
    );
    await activationLookup;
    ordinaryResponse.resolve(
      lookupResponse({ name: "Superseded Profile", grid: "EM99zz" }),
    );
    await ordinaryLookup;

    expect(useQSOStore.getState().form).toEqual(
      expect.objectContaining({
        callsign: "K5ABC",
        name: "Current Activation",
        grid: "EM10df",
      }),
    );
    expect(useQSOStore.getState().lookupResult?.name).toBe(
      "Current Activation",
    );
  });

  it("invalidates portable-grid ownership when the operator changes callsign", async () => {
    const store = useQSOStore.getState();
    store.setField("callsign", "K5ABC");
    store.setField("grid", "EM10df");
    store.setField("sig", "POTA");
    store.setField("sigInfo", "US-1234");
    store.setField("notes", "POTA US-1234 activation report");
    await store.lookupCallsign("K5ABC", { preserveGrid: true });

    store.setField("callsign", "W1XYZ");

    expect(shouldPreserveLookupGrid("K5ABC")).toBe(false);
    expect(shouldPreserveLookupGrid("W1XYZ")).toBe(false);
    expect(useQSOStore.getState().form).toEqual(
      expect.objectContaining({
        callsign: "W1XYZ",
        name: "",
        qth: "",
        grid: "",
        sig: "",
        sigInfo: "",
        notes: "",
      }),
    );
    expect(useQSOStore.getState().lookupResult).toBeNull();
  });
  it("falls back from a portable DX Callook 404 while preserving the activation grid", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Callsign not found" }), { status: 404 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ callsign: "G4ABC", name: "DX Operator", grid: "IO91wm", country: "England", cqzone: 14, ituzone: 27, source: "hamqth" })));
    const store = useQSOStore.getState();
    store.setField("callsign", "G4ABC/P");
    store.setField("grid", "IO92aa");
    await store.lookupCallsign("G4ABC/P", { preserveGrid: true });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/callsign/lookup?callsign=G4ABC");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/callsign/hamqth?callsign=G4ABC", { headers: { Authorization: "Bearer test-session" } });
    expect(useQSOStore.getState().form).toEqual(expect.objectContaining({ callsign: "G4ABC/P", name: "DX Operator", grid: "IO92aa" }));
    expect(useQSOStore.getState().lookupResult).toEqual(expect.objectContaining({ source: "hamqth", cqZone: 14, ituZone: 27 }));
  });

  it.each([
    [501, "credentials are not configured"],
    [401, "Sign in"],
    [429, "rate limit"],
    [502, "Upstream unavailable"],
    [404, "HamQTH: Callsign not found"],
  ])("explains a failed international lookup (%s)", async (status, message) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Callsign not found" }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: status === 404 ? "Callsign not found" : "Upstream unavailable" }), { status: Number(status) }));
    const store = useQSOStore.getState();
    store.setField("callsign", "G4ABC");
    await store.lookupCallsign("G4ABC");
    expect(useQSOStore.getState().lookupLoading).toBe(false);
    expect(useQSOStore.getState().lookupError).toContain(message);
    expect(useQSOStore.getState().lookupResult).toBeNull();
  });

  it("uses HamQTH when Callook is unreachable", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ callsign: "G4ABC", grid: "IO91wm", source: "hamqth" })));
    const store = useQSOStore.getState();
    store.setField("callsign", "G4ABC");
    await store.lookupCallsign("G4ABC");
    expect(useQSOStore.getState().form.grid).toBe("IO91wm");
    expect(useQSOStore.getState().lookupError).toBeNull();
  });

});
