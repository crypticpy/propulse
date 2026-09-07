/**
 * FILTER-01/02 selection algebra for the Spots & Paths surfaces.
 *
 * Pure: no store, no clock, no I/O. Category checkboxes are tri-state because
 * unchecking one child of a fully selected category must degrade that category
 * to an explicit member list rather than leave a hidden category OR behind.
 */
import {
  expandModeCategory,
  normalizeMode,
  normalizeModeSelection,
  summarizeModeSelection,
} from "@/lib/spots/presentation";
import type { ModeSelection } from "@/lib/views/spotContracts";
import { createSpotPreferences } from "@/lib/views/defaults";
import type { SpotFilterPreferences } from "./types";

export type ModeCategoryKey = "phone" | "cw" | "digital";

export const MODE_CATEGORIES: readonly { key: ModeCategoryKey; label: string }[] = [
  { key: "phone", label: "Phone / Voice" },
  { key: "cw", label: "CW" },
  { key: "digital", label: "Digital" },
];

/** Bands offered in the band multi-select. Empty selection still means all bands. */
export const SPOT_FILTER_BANDS = [
  "160m", "80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m",
  "6m", "2m", "70cm",
] as const;

export const SPOT_SOURCES = [
  { value: "PSKReporter", label: "PSKReporter" },
  { value: "RBN", label: "RBN" },
  { value: "Cluster", label: "DX Cluster" },
  { value: "WSJT-X", label: "WSJT-X" },
] as const;

export type CategoryState = "on" | "partial" | "off";

function membersOf(category: ModeCategoryKey): string[] {
  return expandModeCategory(category);
}

/** Tri-state for one category checkbox. All modes reads as every category on. */
export function categoryState(selection: ModeSelection, category: ModeCategoryKey): CategoryState {
  const normalized = normalizeModeSelection(selection);
  if (normalized.all) return "on";
  if (normalized.categories.includes(category)) return "on";
  const members = membersOf(category);
  const chosen = members.filter((mode) => normalized.modes.includes(mode));
  if (chosen.length === 0) return "off";
  return chosen.length === members.length ? "on" : "partial";
}

export function isModeSelected(selection: ModeSelection, mode: string): boolean {
  const normalized = normalizeModeSelection(selection);
  if (normalized.all) return true;
  const name = normalizeMode(mode).name;
  if (normalized.modes.includes(name)) return true;
  const category = MODE_CATEGORIES.find(({ key }) => membersOf(key).includes(name));
  return category ? normalized.categories.includes(category.key) : false;
}

/**
 * Expand every currently selected category into explicit members so a child can
 * be removed without the category silently re-adding it.
 */
function explode(selection: ModeSelection): { modes: string[]; includeUnknown: boolean; includeInferred: boolean } {
  const normalized = normalizeModeSelection(selection);
  const modes = normalized.all
    ? MODE_CATEGORIES.flatMap(({ key }) => membersOf(key))
    : [
        ...normalized.categories.flatMap((category) => membersOf(category)),
        ...normalized.modes,
      ];
  return {
    modes: [...new Set(modes)],
    includeUnknown: normalized.includeUnknown,
    includeInferred: normalized.includeInferred,
  };
}

/** Collapse explicit members back into whole categories wherever they are complete. */
function implode(
  modes: readonly string[],
  includeUnknown: boolean,
  includeInferred: boolean,
): ModeSelection {
  const chosen = new Set(modes);
  const categories: ModeCategoryKey[] = [];
  for (const { key } of MODE_CATEGORIES) {
    const members = membersOf(key);
    if (members.length > 0 && members.every((mode) => chosen.has(mode))) {
      categories.push(key);
      for (const mode of members) chosen.delete(mode);
    }
  }
  if (categories.length === MODE_CATEGORIES.length && chosen.size === 0) {
    return normalizeModeSelection({
      all: true, categories: [], modes: [], includeUnknown, includeInferred,
    });
  }
  return normalizeModeSelection({
    all: false,
    categories,
    modes: [...chosen],
    includeUnknown,
    includeInferred,
  });
}

/** Selecting All discards every specific choice and re-includes unknown modes. */
export function selectAllModes(selection: ModeSelection): ModeSelection {
  return normalizeModeSelection({
    all: true, categories: [], modes: [], includeUnknown: true,
    includeInferred: selection.includeInferred,
  });
}

/**
 * Leaving All for a specific selection turns Include unknown off by default
 * (FILTER-02); an already-specific selection keeps whatever the user chose.
 */
function unknownForSpecific(selection: ModeSelection): boolean {
  return normalizeModeSelection(selection).all ? false : selection.includeUnknown;
}

export function toggleModeCategory(selection: ModeSelection, category: ModeCategoryKey): ModeSelection {
  const state = categoryState(selection, category);
  const { modes, includeInferred } = explode(selection);
  const includeUnknown = unknownForSpecific(selection);
  const members = new Set(membersOf(category));
  const next = state === "off"
    ? [...new Set([...modes, ...members])]
    : modes.filter((mode) => !members.has(mode));
  if (next.length === 0) return selectAllModes(selection);
  return implode(next, includeUnknown, includeInferred);
}

export function toggleMode(selection: ModeSelection, mode: string): ModeSelection {
  const name = normalizeMode(mode).name;
  if (name === "UNKNOWN") return selection;
  const { modes, includeInferred } = explode(selection);
  const includeUnknown = unknownForSpecific(selection);
  const next = modes.includes(name)
    ? modes.filter((entry) => entry !== name)
    : [...modes, name];
  if (next.length === 0) return selectAllModes(selection);
  return implode(next, includeUnknown, includeInferred);
}

export function setIncludeUnknown(selection: ModeSelection, includeUnknown: boolean): ModeSelection {
  return normalizeModeSelection({ ...selection, includeUnknown });
}

export function setIncludeInferred(selection: ModeSelection, includeInferred: boolean): ModeSelection {
  return normalizeModeSelection({ ...selection, includeInferred });
}

/** Every mode the category chips can offer, category by category. */
export function modeCatalog(): { key: ModeCategoryKey; label: string; modes: string[] }[] {
  return MODE_CATEGORIES.map(({ key, label }) => ({ key, label, modes: membersOf(key) }));
}

export const DEFAULT_SPOT_FILTERS: SpotFilterPreferences = createSpotPreferences().filters;

/** FILTER-04: restore filter defaults only; grouping, motion and preset are untouched. */
export function defaultFilters(): SpotFilterPreferences {
  return createSpotPreferences().filters;
}

export function filtersAreDefault(filters: SpotFilterPreferences): boolean {
  return JSON.stringify(filters) === JSON.stringify(DEFAULT_SPOT_FILTERS);
}

/** Persistent, human filter summary (FILTER-04). No storage or schema words. */
export function summarizeFilters(filters: SpotFilterPreferences): string {
  const bands = filters.bands.length === 0 ? "All bands" : filters.bands.join(", ");
  const sources = filters.sources.length === 0
    ? "all available sources"
    : filters.sources.map((source) => (source === "Cluster" ? "DX Cluster" : source)).join(", ");
  const inferred = normalizeModeSelection(filters.modes).includeInferred ? "" : ", inferred modes excluded";
  return `${summarizeModeSelection(filters.modes)} · ${bands} · ${sources} · last ${filters.maxAgeMinutes} min · up to ${filters.spotLimit} spots${inferred}`;
}
