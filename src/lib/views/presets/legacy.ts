import { modeSelectionFromLegacyModes } from "@/lib/spots/presentation";
import { presetRecipeSchema, type ViewConfiguration } from "../contracts";
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

function parseSources(raw: readonly string[] | undefined): SpotSource[] {
  if (!raw) return [];
  return [...new Set(raw.map((source) => spotSourceSchema.parse(source)))];
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
  if (input.initialPageId !== undefined) config.presentation.hamclock.initialPageId = input.initialPageId;
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
