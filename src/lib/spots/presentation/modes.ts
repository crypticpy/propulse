import {
  modeCategorySchema,
  modeSelectionSchema,
  type ModeSelection,
  type NormalizedMode,
} from "@/lib/views/spotContracts";
import type { z } from "zod";

type ModeCategory = z.infer<typeof modeCategorySchema>;

const MODE_NAME = /^[A-Z0-9-]{1,24}$/;

const PHONE_MODES = new Set(["AM", "FM", "PHONE", "SSB"]);
const CW_MODES = new Set(["CW"]);
const DIGITAL_MODES = new Set([
  "ARDOP", "CONTESTI", "DIGITAL", "DOMINO", "FST4", "FST4W", "FT4", "FT8",
  "HELL", "JS8", "JT65", "JT6M", "JT9", "MFSK", "MSK144", "OLIVIA", "PACKET",
  "PACTOR", "PSK125", "PSK31", "PSK63", "Q65", "ROS", "RTTY", "SSTV", "THOR",
  "VARA", "WSPR",
]);
const CATEGORY_MEMBERS: Record<Exclude<ModeCategory, "unknown">, ReadonlySet<string>> = {
  phone: PHONE_MODES,
  cw: CW_MODES,
  digital: DIGITAL_MODES,
};

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

/** Every recognized member of a category, sorted. Generic PHONE/DIGITAL stay in their catalogs. */
export function expandModeCategory(category: Exclude<ModeCategory, "unknown">): string[] {
  return [...CATEGORY_MEMBERS[category]].sort();
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

/**
 * True only when the selection admits every spot outright. `all` alone is not
 * enough: `modeMatchesSelection` still drops unknown-provenance/category
 * modes when `includeUnknown` is false, and inferred-provenance modes when
 * `includeInferred` is false, even with `all: true`.
 */
export function modeSelectionMatchesEverything(selection: ModeSelection): boolean {
  const normalized = normalizeModeSelection(selection);
  return normalized.all && normalized.includeUnknown && normalized.includeInferred;
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
