import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPrefs,
  savePrefs,
  resolveNode,
  canConnect,
  toggleFilter,
  buildConnectPayload,
  DEFAULT_PREFS,
  WELL_KNOWN_NODES,
} from "./clusterPrefs";

const LS_KEY = "propulse-cluster-settings";

beforeEach(() => {
  localStorage.clear();
});

describe("loadPrefs / savePrefs", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("returns defaults when the stored value is malformed", () => {
    localStorage.setItem(LS_KEY, "{not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("merges stored values over the defaults", () => {
    savePrefs({ ...DEFAULT_PREFS, callsign: "N5XXX", filterBands: ["20m"] });
    const loaded = loadPrefs();
    expect(loaded.callsign).toBe("N5XXX");
    expect(loaded.filterBands).toEqual(["20m"]);
    // Untouched fields still come from the defaults
    expect(loaded.customPort).toBe(DEFAULT_PREFS.customPort);
  });

  it("never writes the password to storage", () => {
    savePrefs({ ...DEFAULT_PREFS, callsign: "N5XXX", password: "hunter2" });
    const raw = localStorage.getItem(LS_KEY) ?? "";
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain("password");
  });

  it("drops a password left behind by an older build", () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ callsign: "N5XXX", password: "hunter2" }),
    );
    expect(loadPrefs().password).toBe("");
  });

  // Callers treat the result as their own state and write to it directly, so a
  // shared object or aliased array would corrupt the defaults process-wide.
  it("hands every caller its own object, not the shared defaults", () => {
    const first = loadPrefs();
    first.callsign = "N5XXX";
    first.filterBands.push("20m");

    expect(DEFAULT_PREFS.callsign).toBe("");
    expect(DEFAULT_PREFS.filterBands).toEqual([]);
    expect(loadPrefs().callsign).toBe("");
    expect(loadPrefs().filterBands).toEqual([]);
  });

  it("keeps the arrays unaliased when stored prefs omit them", () => {
    // The stored object has no `filterBands`, so the merge falls through to the
    // default array — which must still be a copy.
    localStorage.setItem(LS_KEY, JSON.stringify({ callsign: "N5XXX" }));
    loadPrefs().filterBands.push("40m");
    expect(DEFAULT_PREFS.filterBands).toEqual([]);
    expect(loadPrefs().filterBands).toEqual([]);
  });
});

describe("resolveNode", () => {
  it("resolves a well-known node by index", () => {
    const node = resolveNode({ ...DEFAULT_PREFS, selectedNodeIndex: 1 });
    expect(node.host).toBe(WELL_KNOWN_NODES[1].host);
    expect(node.port).toBe(WELL_KNOWN_NODES[1].port);
    expect(node.label).toBe(WELL_KNOWN_NODES[1].label);
  });

  it("resolves a custom node when the index is -1", () => {
    const node = resolveNode({
      ...DEFAULT_PREFS,
      selectedNodeIndex: -1,
      customHost: "  dx.example.com  ",
      customPort: 8000,
    });
    expect(node).toEqual({
      host: "dx.example.com",
      port: 8000,
      label: "dx.example.com",
    });
  });

  it("falls back to the custom entry when the index is out of range", () => {
    const node = resolveNode({
      ...DEFAULT_PREFS,
      selectedNodeIndex: 99,
      customHost: "dx.example.com",
    });
    expect(node.host).toBe("dx.example.com");
  });

  it("labels an empty custom host rather than returning a blank label", () => {
    const node = resolveNode({ ...DEFAULT_PREFS, selectedNodeIndex: -1 });
    expect(node.host).toBe("");
    expect(node.label).toBe("Custom node");
  });
});

describe("canConnect", () => {
  it("is false without a callsign", () => {
    expect(canConnect({ ...DEFAULT_PREFS, callsign: "   " })).toBe(false);
  });

  it("is false when a custom node has no host", () => {
    expect(
      canConnect({
        ...DEFAULT_PREFS,
        callsign: "N5XXX",
        selectedNodeIndex: -1,
        customHost: "",
      }),
    ).toBe(false);
  });

  it("is true with a callsign and a well-known node", () => {
    expect(canConnect({ ...DEFAULT_PREFS, callsign: "N5XXX" })).toBe(true);
  });
});

describe("toggleFilter", () => {
  it("adds a value that is absent", () => {
    expect(toggleFilter(["20m"], "40m")).toEqual(["20m", "40m"]);
  });

  it("removes a value that is present", () => {
    expect(toggleFilter(["20m", "40m"], "20m")).toEqual(["40m"]);
  });

  it("does not mutate the input", () => {
    const input = ["20m"];
    toggleFilter(input, "40m");
    expect(input).toEqual(["20m"]);
  });
});

describe("buildConnectPayload", () => {
  it("upper-cases and trims the callsign", () => {
    const payload = buildConnectPayload({
      ...DEFAULT_PREFS,
      callsign: "  n5xxx ",
    });
    expect(payload.callsign).toBe("N5XXX");
  });

  it("converts band labels to wavelength integers", () => {
    const payload = buildConnectPayload({
      ...DEFAULT_PREFS,
      callsign: "N5XXX",
      filterBands: ["160m", "20m", "6m"],
    });
    expect(payload.filters.bands).toEqual([160, 20, 6]);
  });

  it("omits empty filters rather than sending empty arrays", () => {
    const payload = buildConnectPayload({
      ...DEFAULT_PREFS,
      callsign: "N5XXX",
    });
    expect(payload.filters.bands).toBeUndefined();
    expect(payload.filters.modes).toBeUndefined();
  });

  it("omits an empty password", () => {
    const payload = buildConnectPayload({
      ...DEFAULT_PREFS,
      callsign: "N5XXX",
    });
    expect(payload.password).toBeUndefined();
  });

  it("sends the selected node as the single target", () => {
    const payload = buildConnectPayload({
      ...DEFAULT_PREFS,
      callsign: "N5XXX",
      selectedNodeIndex: 0,
    });
    expect(payload.nodes).toEqual([
      {
        host: WELL_KNOWN_NODES[0].host,
        port: WELL_KNOWN_NODES[0].port,
        name: WELL_KNOWN_NODES[0].label,
      },
    ]);
  });
});
