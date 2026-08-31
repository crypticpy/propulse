import { describe, expect, it } from "vitest";
import type { BandLadderEntry } from "@/hooks/useBandVerdicts";
import { readyBandHealthByBand } from "./bandHealthPresentation";

const persistedEntry = { band: "80m" } as BandLadderEntry;

describe("readyBandHealthByBand", () => {
  it("hides persisted entries until current inputs are ready", () => {
    expect(readyBandHealthByBand([persistedEntry], false).size).toBe(0);
    expect(readyBandHealthByBand([persistedEntry], true).get("80m")).toBe(
      persistedEntry,
    );
  });
});
