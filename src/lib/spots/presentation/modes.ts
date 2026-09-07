import {
  modeCategorySchema,
  modeSelectionSchema,
  type ModeSelection,
  type NormalizedMode,
} from "@/lib/views/spotContracts";
import type { z } from "zod";

type ModeCategory = z.infer<typeof modeCategorySchema>;

const MODE_NAME = /^[A-Z0-9-]{1,24}$/;

const PHONE_MODES = new Set(["SSB", "AM", "FM", "PHONE"]);
const CW_MODES = new Set(["CW"]);
const DIGITAL_MODES = new Set([
  "FT8", "FT4", "RTTY", "JT65", "JT9", "JT6M", "PSK31", "PSK63", "PSK125",
  "MFSK", "OLIVIA", "CONTESTI", "JS8", "WSPR", "FST4", "FST4W", "Q65",
  "MSK144", "VARA", "PACKET", "PACTOR", "ARDOP", "ROS", "THOR", "DOMINO",
  "HELL", "SSTV", "DIGITAL",
]);

const ALIASES: Record<string, string> = {
  "FT-8": "FT8",
  FT8: "FT8",
  "FT-4": "FT4",
  USB: "SSB",
  LSB: "SSB",
  SSB: "SSB",
  PHONE: "PHONE",
  VOICE: "PHONE",
  PH: "PHONE",
  DIGITAL: "DIGITAL",
  DATA: "DIGITAL",
  DIGI: "DIGITAL",
  JS8CALL: "JS8",
};

export const PHONE_CATEGORY_MODES = ["SSB", "AM", "FM"] as const;
export const DIGITAL_CATEGORY_MODES = ["FT8", "FT4", "RTTY"] as const;

export const UNKNOWN_MODE: NormalizedMode = {
  name: "UNKNOWN",
  category: "unknown",
  provenance: "unknown",
  originalLabel: null,
};

export function canonicalizeModeToken(raw: string | undefined | null): string {
  return (raw ?? "").trim().toUpperCase().replace(/[\s_]+/g, "-");
}

export function modeCategoryForName(name: string): ModeCategory {
  if (PHONE_MODES.has(name)) return "phone";
  if (CW_MODES.has(name)) return "cw";
  if (DIGITAL_MODES.has(name)) return "digital";
  return "unknown";
}

export function expandModeCategory(category: Exclude<ModeCategory, "unknown">): string[] {
  if (category === "phone") return [...PHONE_CATEGORY_MODES];
  if (category === "cw") return ["CW"];
  return [...DIGITAL_CATEGORY_MODES];
}

/**
 * Normalize a reported label. USB/LSB become SSB; FT-8 becomes FT8.
 * Generic PHONE/DIGITAL keep those names so they cannot be asserted as SSB/FT8.
 */
export function normalizeMode(
  raw: string | undefined | null,
  provenance: NormalizedMode["provenance"] = "reported",
): NormalizedMode {
  const original = (raw ?? "").trim();
  if (!original) return { ...UNKNOWN_MODE, originalLabel: original || null };

  const token = canonicalizeModeToken(original);
  const aliased = ALIASES[token] ?? token.replace(/-/g, "");
  const name = ALIASES[aliased] ?? aliased;
  if (!MODE_NAME.test(name)) {
    return { ...UNKNOWN_MODE, originalLabel: original.slice(0, 80) };
  }
  const category = modeCategoryForName(name);
  if (category === "unknown" || provenance === "unknown") {
    return { ...UNKNOWN_MODE, originalLabel: original.slice(0, 80) };
  }
  return {
    name,
    category,
    provenance: provenance === "inferred" ? "inferred" : "reported",
    originalLabel: original.slice(0, 80),
  };
}

export function allModesSelection(
  includeUnknown = true,
  includeInferred = true,
): ModeSelection {
  return { all: true, categories: [], modes: [], includeUnknown, includeInferred };
}

/** Empty or All+specific collapses to All. Persisted selections never mix All with children. */
export function normalizeModeSelection(selection: ModeSelection): ModeSelection {
  const modes = [...new Set(selection.modes.map((mode) => normalizeMode(mode).name)
    .filter((name) => name !== "UNKNOWN"))];
  const categories = [...new Set(selection.categories)];
  if (selection.all || (categories.length === 0 && modes.length === 0)) {
    return allModesSelection(
      selection.all ? selection.includeUnknown : true,
      selection.includeInferred,
    );
  }
  return modeSelectionSchema.parse({
    all: false,
    categories,
    modes,
    includeUnknown: selection.includeUnknown,
    includeInferred: selection.includeInferred,
  });
}

export function modeMatchesSelection(mode: NormalizedMode, selection: ModeSelection): boolean {
  const normalized = normalizeModeSelection(selection);
  if (mode.provenance === "unknown" || mode.category === "unknown") {
    return normalized.includeUnknown;
  }
  if (mode.provenance === "inferred" && !normalized.includeInferred) return false;
  if (normalized.all) return true;
  if (normalized.categories.includes(mode.category as "phone" | "cw" | "digital")) {
    return true;
  }
  return normalized.modes.includes(mode.name);
}

export function summarizeModeSelection(selection: ModeSelection): string {
  const normalized = normalizeModeSelection(selection);
  if (normalized.all) {
    return normalized.includeUnknown ? "All modes" : "All modes except unknown";
  }
  const parts = [
    ...normalized.categories.map((category) => category[0].toUpperCase() + category.slice(1)),
    ...normalized.modes,
  ];
  if (normalized.includeUnknown) parts.push("Unknown");
  return parts.join(", ");
}
