import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQSOStore } from "./qsoStore";

describe("qsoStore callsign lookup", () => {
  beforeEach(() => {
    useQSOStore.setState({ formDefaults: {} });
    useQSOStore.getState().resetForm();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          callsign: "K5ABC",
          name: "Jane Operator",
          qth: "Austin",
          grid: "EM10aa",
          source: "callook",
        }),
      }),
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
  });

  it("uses the profile grid for an ordinary empty draft", async () => {
    const store = useQSOStore.getState();
    store.setField("callsign", "K5ABC");

    await store.lookupCallsign("K5ABC");

    expect(useQSOStore.getState().form.grid).toBe("EM10aa");
  });
});
