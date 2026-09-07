import {
  presetRecipeSchema,
  viewConfigurationSchema,
  type PresetRecipe,
  type ViewConfiguration,
} from "../contracts";
import type { SpotPresentationPreferences } from "../spotContracts";
import {
  getBuiltInRecipe,
  isBuiltInPresetId,
  type ActivityPresetRecipe,
  type BuiltInPresetId,
  type DisplayPresetRecipe,
} from "./catalog";
import { cloneJson } from "./clone";
import { explainSourceAvailability, type FeedAvailability, type SourceAvailabilityNote } from "./sources";

export type PresetFieldChange = {
  path: string;
  before: unknown;
  after: unknown;
};

export type ApplyPresetOptions = {
  /** Explicit caller-supplied feed state. Never inferred or connected by this helper. */
  feedAvailability?: readonly FeedAvailability[];
};

export type ApplyPresetResult = {
  config: ViewConfiguration;
  changes: PresetFieldChange[];
  sourceNotes: SourceAvailabilityNote[];
};

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Arrays and scalars are compared as wholes; objects recurse by key. */
export function describeFieldChanges(before: unknown, after: unknown, path = ""): PresetFieldChange[] {
  if (jsonEqual(before, after)) return [];
  const bothObjects = isPlainObject(before) && isPlainObject(after);
  if (!bothObjects) {
    return [{ path: path || "(root)", before, after }];
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: PresetFieldChange[] = [];
  for (const key of [...keys].sort()) {
    const nextPath = path ? `${path}.${key}` : key;
    changes.push(...describeFieldChanges(before[key], after[key], nextPath));
  }
  return changes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function copyPresetRecipe(recipe: PresetRecipe): PresetRecipe {
  return presetRecipeSchema.parse(cloneJson(recipe));
}

export function copyViewConfiguration(config: ViewConfiguration): ViewConfiguration {
  return viewConfigurationSchema.parse(cloneJson(config));
}

export function activityRecipeFromWorkingSpots(input: {
  id: string;
  name: string;
  version?: number;
  spots: SpotPresentationPreferences;
}): ActivityPresetRecipe {
  return presetRecipeSchema.parse({
    kind: "activity",
    id: input.id,
    version: input.version ?? 1,
    name: input.name,
    spots: cloneJson(input.spots),
  }) as ActivityPresetRecipe;
}

export function displayRecipeFromWorkingConfiguration(input: {
  id: string;
  name: string;
  version?: number;
  config: ViewConfiguration;
}): DisplayPresetRecipe {
  return presetRecipeSchema.parse({
    kind: "display",
    id: input.id,
    version: input.version ?? 1,
    name: input.name,
    config: cloneJson(input.config),
  }) as DisplayPresetRecipe;
}

export function isActivityCustomized(
  working: SpotPresentationPreferences,
  recipe: ActivityPresetRecipe,
): boolean {
  return !jsonEqual(working, recipe.spots);
}

export function isDisplayCustomized(
  working: ViewConfiguration,
  recipe: DisplayPresetRecipe,
): boolean {
  return !jsonEqual(working, recipe.config);
}

export function resetBuiltInRecipe(id: BuiltInPresetId): PresetRecipe {
  return getBuiltInRecipe(id);
}

function applyActivity(recipe: ActivityPresetRecipe, current: ViewConfiguration): ViewConfiguration {
  return viewConfigurationSchema.parse({
    ...cloneJson(current),
    spots: cloneJson(recipe.spots),
  });
}

function applyDisplay(recipe: DisplayPresetRecipe): ViewConfiguration {
  return copyViewConfiguration(recipe.config);
}

/**
 * Pure application: returns a new configuration. Does not write stores, persistence,
 * TVs, radios, or the input objects. Activity recipes replace only `spots`.
 */
export function applyPresetRecipe(
  recipe: PresetRecipe,
  current: ViewConfiguration,
  options: ApplyPresetOptions = {},
): ApplyPresetResult {
  const parsed = presetRecipeSchema.parse(cloneJson(recipe));
  const before = copyViewConfiguration(current);
  const config = parsed.kind === "activity"
    ? applyActivity(parsed, before)
    : applyDisplay(parsed);
  const requested = parsed.kind === "activity"
    ? parsed.spots.filters.sources
    : parsed.config.spots.filters.sources;
  return {
    config,
    changes: describeFieldChanges(before, config),
    sourceNotes: explainSourceAvailability(requested, options.feedAvailability),
  };
}

export function getBuiltInRecipeIfKnown(id: string): PresetRecipe | null {
  return isBuiltInPresetId(id) ? getBuiltInRecipe(id) : null;
}
