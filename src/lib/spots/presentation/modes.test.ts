import { describe, expect, it } from "vitest";
import { createSpotFixtures } from "@/lib/views/fixtures";
import {
  allModesSelection,
  expandModeCategory,
  modeMatchesSelection,
  normalizeMode,
  normalizeModeSelection,
  summarizeModeSelection,
} from "./modes";

describe("mode normalization", () => {
  it("keeps PHONE broader than SSB and DIGITAL broader than FT8", () => {
    expect(normalizeMode("PHONE")).toMatchObject({ name: "PHONE", category: "phone", provenance: "reported" });
    expect(normalizeMode("SSB")).toMatchObject({ name: "SSB", category: "phone" });
    expect(normalizeMode("DIGITAL")).toMatchObject({ name: "DIGITAL", category: "digital" });
    expect(normalizeMode("FT8")).toMatchObject({ name: "FT8", category: "digital" });
    expect(normalizeMode("PHONE").name).not.toBe("SSB");
    expect(normalizeMode("DIGITAL").name).not.toBe("FT8");
  });

  it("normalizes aliases without dropping original labels", () => {
    expect(normalizeMode("FT-8")).toMatchObject({ name: "FT8", originalLabel: "FT-8" });
    expect(normalizeMode("usb")).toMatchObject({ name: "SSB", category: "phone", originalLabel: "usb" });
    expect(normalizeMode("LSB")).toMatchObject({ name: "SSB", originalLabel: "LSB" });
    expect(normalizeMode("cw")).toMatchObject({ name: "CW", category: "cw" });
    expect(normalizeMode("")).toMatchObject({ name: "UNKNOWN", category: "unknown", provenance: "unknown" });
    expect(normalizeMode(undefined)).toMatchObject({ name: "UNKNOWN", provenance: "unknown" });
  });

  it("matches fixture aliases against category and specific selections", () => {
    const fixtures = createSpotFixtures().modes.map((spot) => normalizeMode(spot.mode));
    const phone = { all: false, categories: ["phone" as const], modes: [], includeUnknown: false, includeInferred: true };
    const ft8 = { all: false, categories: [], modes: ["FT8"], includeUnknown: false, includeInferred: true };
    expect(fixtures.filter((mode) => modeMatchesSelection(mode, phone)).map((mode) => mode.name))
      .toEqual(["SSB", "SSB", "SSB", "PHONE", "AM", "FM"]);
    expect(fixtures.filter((mode) => modeMatchesSelection(mode, ft8)).map((mode) => mode.name))
      .toEqual(["FT8", "FT8"]);
    expect(modeMatchesSelection(normalizeMode("FT8", "inferred"), {
      all: true, categories: [], modes: [], includeUnknown: true, includeInferred: false,
    })).toBe(false);
    expect(modeMatchesSelection(normalizeMode(""), allModesSelection(false))).toBe(false);
  });

  it("normalizes empty or All-plus-specific selections to All", () => {
    expect(normalizeModeSelection({
      all: true, categories: ["cw"], modes: ["FT8"], includeUnknown: true, includeInferred: true,
    })).toEqual(allModesSelection());
    expect(normalizeModeSelection({
      all: false, categories: [], modes: [], includeUnknown: false, includeInferred: true,
    }).all).toBe(true);
    expect(expandModeCategory("phone")).toEqual(["SSB", "AM", "FM"]);
    expect(summarizeModeSelection(allModesSelection())).toBe("All modes");
  });
});
