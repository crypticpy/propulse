import { describe, expect, it } from "vitest";
import type { BandLadderEntry } from "@/hooks/useBandVerdicts";
import type { CanonicalLadderRow } from "@/hooks/useBandLadder";
import {
  bandHealthDotClass,
  canonicalScopeUpdatedAt,
  readyBandHealthByBand,
} from "./bandHealthPresentation";

const persistedEntry = { band: "80m" } as BandLadderEntry;

describe("readyBandHealthByBand", () => {
  it("hides persisted entries until current inputs are ready", () => {
    expect(readyBandHealthByBand([persistedEntry], false).size).toBe(0);
    expect(readyBandHealthByBand([persistedEntry], true).get("80m")).toBe(
      persistedEntry,
    );
  });

  it("derives both headline dots from the live ladder state", () => {
    expect(
      bandHealthDotClass({ ...persistedEntry, stable: "verified" }),
    ).toBe("bg-signal-green");
    expect(
      bandHealthDotClass({ ...persistedEntry, stable: "closed" }),
    ).toBe("bg-gray-500");
  });

  it("ages canonical freshness from the oldest active-scope row", () => {
    const rows = [
      {
        scopeType: "regional",
        scopeKey: "NA",
        updatedAt: "2026-08-31T06:00:00Z",
      },
      {
        scopeType: "regional",
        scopeKey: "NA",
        updatedAt: "2026-08-31T05:45:00Z",
      },
      {
        scopeType: "global",
        scopeKey: "",
        updatedAt: "2026-08-31T04:00:00Z",
      },
    ] as CanonicalLadderRow[];

    expect(canonicalScopeUpdatedAt(rows, "regional", "NA")).toBe(
      Date.parse("2026-08-31T05:45:00Z"),
    );
  });
});
