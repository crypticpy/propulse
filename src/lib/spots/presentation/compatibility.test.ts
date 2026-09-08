import { describe, expect, it } from "vitest";
import { legacyDisplayFiltersMatch, modeSelectionFromLegacyModes } from "./compatibility";
import { normalizeMode } from "./modes";
import { modeMatchesSelection } from "./modes";

describe("legacy display-filter helpers", () => {
  it("treats an empty legacy mode list as All without claiming FT8 from DIGITAL", () => {
    expect(modeSelectionFromLegacyModes([]).all).toBe(true);
    const ft8 = modeSelectionFromLegacyModes(["ft8", "FT-8"]);
    expect(ft8).toMatchObject({ all: false, modes: ["FT8"] });
    expect(modeMatchesSelection(normalizeMode("DIGITAL"), ft8)).toBe(false);
    expect(legacyDisplayFiltersMatch({ band: "20m", mode: "USB" }, { bands: ["20M"], modes: ["ssb"] })).toBe(true);
    expect(legacyDisplayFiltersMatch({ band: "40m", mode: "USB" }, { bands: ["20M"], modes: ["ssb"] })).toBe(false);
  });
});
