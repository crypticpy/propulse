import { modeSelectionFromLegacyModes } from "@/lib/spots/presentation";
import { presetRecipeSchema, viewLayersSchema, type ViewConfiguration } from "../contracts";
import { createSpotPreferences, createViewConfiguration } from "../defaults";
import { spotSourceSchema } from "../spotContracts";
import { cloneJson } from "./clone";
import type { ActivityPresetRecipe, DisplayPresetRecipe } from "./catalog";
import type { SpotSource } from "./sources";

export type LegacyActivityInput = {
  id: string;
  name: string;
  version?: number;
  modes?: readonly string[];
  bands?: readonly string[];
  sources?: readonly string[];
  maxAgeMinutes?: number;
  spotLimit?: number;
};

export type LegacyWallInput = {
  id: string;
  name: string;
  version?: number;
  theme: ViewConfiguration["presentation"]["hamclock"]["theme"];
  railLayout: ViewConfiguration["presentation"]["hamclock"]["railLayout"];
  autoPage: ViewConfiguration["presentation"]["hamclock"]["autoPage"];
  initialPageId?: ViewConfiguration["presentation"]["hamclock"]["initialPageId"];
};

export type LegacyOperatingProfileSnapshot = {
  id: string;
  name: string;
  version?: number;
  spotFilters: { bands: readonly string[]; modes: readonly string[] };
  layers?: Partial<ViewConfiguration["presentation"]["layers"]>;
  spotColorMode?: ViewConfiguration["presentation"]["spotColorMode"];
  visualStyle?: ViewConfiguration["presentation"]["visualStyle"];
  mapStyle?: ViewConfiguration["presentation"]["mapStyle"];
  autoFollow?: boolean;
  panelConfig?: unknown;
  suggestedLayoutMode?: unknown;
  defaultZoomLevel?: unknown;
  shortLabel?: unknown;
  description?: unknown;
  iconPath?: unknown;
  activeColor?: unknown;
};

export type LegacyFieldOmission = {
  field: string;
  reason: string;
};

function parseSources(raw: readonly string[] | undefined): SpotSource[] {
  if (!raw) return [];
  return [...new Set(raw.map((source) => spotSourceSchema.parse(source)))];
}

function layoutPageIds(layout: LegacyWallInput["railLayout"]): string[] {
  return [...new Set([
    ...layout.left.map((page) => page.pageId),
    ...layout.right.map((page) => page.pageId),
  ])];
}

function initialPageFromLayout(
  layout: LegacyWallInput["railLayout"],
  requested: string | null | undefined,
): string | null {
  const ids = layoutPageIds(layout);
  if (requested === null) return null;
  if (requested !== undefined && ids.includes(requested)) return requested;
  return ids[0] ?? null;
}

/**
 * Pure adapter: explicit legacy filter input → activity recipe.
 * Does not import stores or start feed connections.
 */
export function activityRecipeFromLegacyInput(input: LegacyActivityInput): ActivityPresetRecipe {
  const spots = createSpotPreferences();
  const modes = input.modes ?? [];
  spots.filters.modes = modeSelectionFromLegacyModes(modes);
  if (modes.length > 0) spots.filters.modes.includeUnknown = false;
  spots.filters.bands = [...new Set(input.bands ?? [])];
  spots.filters.sources = parseSources(input.sources);
  if (input.maxAgeMinutes !== undefined) spots.filters.maxAgeMinutes = input.maxAgeMinutes;
  if (input.spotLimit !== undefined) spots.filters.spotLimit = input.spotLimit;
  return presetRecipeSchema.parse({
    kind: "activity",
    id: input.id,
    version: input.version ?? 1,
    name: input.name,
    spots,
  }) as ActivityPresetRecipe;
}

/**
 * Pure adapter: explicit wall layout/theme snapshot → HamClock display recipe.
 * Callers pass data; this module does not read hamclockDisplayStore or wall preset files.
 */
export function hamclockDisplayRecipeFromLegacyWall(input: LegacyWallInput): DisplayPresetRecipe {
  const config = createViewConfiguration("hamclock");
  config.presentation.hamclock.theme = input.theme;
  config.presentation.hamclock.railLayout = cloneJson(input.railLayout);
  config.presentation.hamclock.autoPage = cloneJson(input.autoPage);
  config.presentation.hamclock.initialPageId = initialPageFromLayout(input.railLayout, input.initialPageId);
  config.context.followRadio = false;
  config.context.followOperatingSession = false;
  return presetRecipeSchema.parse({
    kind: "display",
    id: input.id,
    version: input.version ?? 1,
    name: input.name,
    config,
  }) as DisplayPresetRecipe;
}

const VIEW_LAYER_KEYS = new Set<string>(viewLayersSchema.keyof().options);

/**
 * Pure adapter for SP-02 migration: explicit captured profile + complete baseline.
 * Preserves the profile id. Does not read stores. Callers persist one recipe kind per id.
 */
export function recipesFromLegacyOperatingProfile(input: {
  profile: LegacyOperatingProfileSnapshot;
  capturedConfig: ViewConfiguration;
}): {
  activity: ActivityPresetRecipe;
  display: DisplayPresetRecipe;
  omitted: LegacyFieldOmission[];
} {
  const profile = input.profile;
  const omitted: LegacyFieldOmission[] = [];
  const activity = activityRecipeFromLegacyInput({
    id: profile.id,
    name: profile.name,
    version: profile.version,
    modes: profile.spotFilters.modes,
    bands: profile.spotFilters.bands,
  });
  const config = cloneJson(input.capturedConfig);
  config.spots = cloneJson(activity.spots);
  if (profile.layers) {
    for (const [key, value] of Object.entries(profile.layers)) {
      if (!VIEW_LAYER_KEYS.has(key) || typeof value !== "boolean") {
        omitted.push({ field: `layers.${key}`, reason: "Not a frozen v1 view layer boolean" });
        continue;
      }
      config.presentation.layers[key as keyof ViewConfiguration["presentation"]["layers"]] = value;
    }
  }
  if (profile.spotColorMode) config.presentation.spotColorMode = profile.spotColorMode;
  if (profile.visualStyle) config.presentation.visualStyle = profile.visualStyle;
  if (profile.mapStyle) config.presentation.mapStyle = profile.mapStyle;
  config.context.followRadio = false;
  config.context.followOperatingSession = false;
  if (profile.autoFollow !== undefined) {
    omitted.push({
      field: "autoFollow",
      reason: "Follow is application policy, not a stored recipe field; apply always clears follow without commanding a radio",
    });
  }
  if (profile.panelConfig !== undefined) {
    omitted.push({
      field: "panelConfig",
      reason: "Legacy panel visibility lacks the geometry required by presentation.panels",
    });
  }
  if (profile.suggestedLayoutMode !== undefined) {
    omitted.push({
      field: "suggestedLayoutMode",
      reason: "Layout mode is not a ViewConfiguration family or projection",
    });
  }
  if (profile.defaultZoomLevel !== undefined) {
    omitted.push({
      field: "defaultZoomLevel",
      reason: "A single zoom cannot replace per-projection camera homes",
    });
  }
  for (const field of ["shortLabel", "description", "iconPath", "activeColor"] as const) {
    if (profile[field] !== undefined) {
      omitted.push({ field, reason: "Chrome metadata is not part of a frozen preset recipe" });
    }
  }
  const display = presetRecipeSchema.parse({
    kind: "display",
    id: profile.id,
    version: profile.version ?? 1,
    name: profile.name,
    config,
  }) as DisplayPresetRecipe;
  return { activity, display, omitted };
}
