import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldPreserveLookupGrid, useQSOStore } from "./qsoStore";

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
});
