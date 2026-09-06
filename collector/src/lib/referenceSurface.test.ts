import { describe, expect, it } from "vitest";

import {
  REFERENCE_BANDS,
  REFERENCE_HUBS,
  REFERENCE_SURFACE_ID,
  continentOf,
  referencePaths,
} from "./referenceSurface.js";

describe("REFERENCE_SURFACE_ID / REFERENCE_HUBS", () => {
  it("is the frozen v1 hub surface with 11 hubs", () => {
    expect(REFERENCE_SURFACE_ID).toBe("hubs11-v1");
    expect(REFERENCE_HUBS).toHaveLength(11);
  });

  it("has a valid grid4 for every hub", () => {
    for (const hub of REFERENCE_HUBS) {
      expect(hub.grid4).toMatch(/^[A-R]{2}[0-9]{2}$/);
    }
  });

  it("has no duplicate grids", () => {
    const grids = new Set(REFERENCE_HUBS.map((h) => h.grid4));
    expect(grids.size).toBe(REFERENCE_HUBS.length);
  });
});

describe("REFERENCE_BANDS", () => {
  it("has ten HF bands and excludes 6m", () => {
    expect(REFERENCE_BANDS).toHaveLength(10);
    expect(REFERENCE_BANDS).not.toContain("6m");
    expect(REFERENCE_BANDS).toEqual([
      "160m",
      "80m",
      "60m",
      "40m",
      "30m",
      "20m",
      "17m",
      "15m",
      "12m",
      "10m",
    ]);
  });
});

describe("continentOf", () => {
  it("resolves the continent tag for each hub", () => {
    expect(continentOf("FN31")).toBe("NA");
    expect(continentOf("EM12")).toBe("NA");
    expect(continentOf("CN87")).toBe("NA");
    expect(continentOf("GG66")).toBe("SA");
    expect(continentOf("JO21")).toBe("EU");
    expect(continentOf("JN58")).toBe("EU");
    expect(continentOf("KO85")).toBe("EU");
    expect(continentOf("JF96")).toBe("AF");
    expect(continentOf("MK82")).toBe("AS");
    expect(continentOf("PM95")).toBe("AS");
    expect(continentOf("QF56")).toBe("OC");
  });

  it("throws on an unknown grid", () => {
    expect(() => continentOf("AA00")).toThrow(/Unknown reference hub grid/);
  });
});

describe("referencePaths", () => {
  it("returns exactly 110 directed pairs with no self-pairs", () => {
    const paths = referencePaths();
    expect(paths).toHaveLength(110);
    expect(paths.every((p) => p.origin_grid4 !== p.target_grid4)).toBe(true);
  });

  it("has no duplicate ordered pairs", () => {
    const keys = referencePaths().map(
      (p) => `${p.origin_grid4}>${p.target_grid4}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses every hub as both an origin and a target", () => {
    const paths = referencePaths();
    for (const hub of REFERENCE_HUBS) {
      expect(paths.some((p) => p.origin_grid4 === hub.grid4)).toBe(true);
      expect(paths.some((p) => p.target_grid4 === hub.grid4)).toBe(true);
      // 10 outbound + 10 inbound pairs per hub in an 11-hub complete digraph.
      expect(paths.filter((p) => p.origin_grid4 === hub.grid4)).toHaveLength(10);
      expect(paths.filter((p) => p.target_grid4 === hub.grid4)).toHaveLength(10);
    }
  });

  it("is stable across repeated calls (deterministic order)", () => {
    expect(referencePaths()).toEqual(referencePaths());
  });

  it("orders by hub list: outer loop origin, inner loop target", () => {
    const paths = referencePaths();
    expect(paths[0]).toEqual({ origin_grid4: "FN31", target_grid4: "EM12" });
    expect(paths[1]).toEqual({ origin_grid4: "FN31", target_grid4: "CN87" });
  });
});
