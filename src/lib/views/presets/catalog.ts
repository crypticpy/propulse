import {
  presetRecipeSchema,
  viewConfigurationSchema,
  type PresetRecipe,
  type ViewConfiguration,
} from "../contracts";
import { createSpotPreferences, createViewConfiguration } from "../defaults";
import {
  spotPresentationPreferencesSchema,
  type PathAppearance,
  type SpotPresentationPreferences,
} from "../spotContracts";
import { cloneJson, freezeDeep } from "./clone";

export const ACTIVITY_PRESET_IDS = [
  "activity-balanced-v1",
  "activity-ssb-v1",
  "activity-cw-v1",
  "activity-ft8-v1",
  "activity-quiet-v1",
  "activity-explore-v1",
] as const;

export const DISPLAY_PRESET_IDS = [
  "display-station-v1",
  "display-hamclock-v1",
  "display-team-v1",
  "display-solar-v1",
] as const;

export type ActivityPresetId = (typeof ACTIVITY_PRESET_IDS)[number];
export type DisplayPresetId = (typeof DISPLAY_PRESET_IDS)[number];
export type BuiltInPresetId = ActivityPresetId | DisplayPresetId;
export type ActivityPresetRecipe = Extract<PresetRecipe, { kind: "activity" }>;
export type DisplayPresetRecipe = Extract<PresetRecipe, { kind: "display" }>;

/** MOTION-03 timing. Style-off appearances still materialize valid numeric fields. */
const QUICK_SWEEP = { travelSeconds: 0.6, trailSeconds: 1, fadeSeconds: 0.5, repeatSeconds: 3 };
const TRAVELING_PULSE = { travelSeconds: 1.5, trailSeconds: 1, fadeSeconds: 0.5, repeatSeconds: 3 };
const FLOWING_DASHES = { travelSeconds: 2.5, trailSeconds: 1, fadeSeconds: 0.5, repeatSeconds: 3 };

function appearance(
  shape: PathAppearance["shape"],
  style: PathAppearance["style"],
  timing: typeof QUICK_SWEEP,
  extras: Pick<PathAppearance, "arrivalPulse" | "bounceGlow">,
): PathAppearance {
  return { shape, style, ...timing, ...extras };
}

function allModeFilters(
  maxAgeMinutes: number,
  spotLimit: number,
): SpotPresentationPreferences["filters"] {
  return {
    modes: { all: true, categories: [], modes: [], includeUnknown: true, includeInferred: true },
    bands: [],
    sources: [],
    maxAgeMinutes,
    spotLimit,
  };
}

function specificModeFilters(
  modes: string[],
  maxAgeMinutes: number,
  spotLimit: number,
): SpotPresentationPreferences["filters"] {
  return {
    modes: { all: false, categories: [], modes, includeUnknown: false, includeInferred: true },
    bands: [],
    sources: [],
    maxAgeMinutes,
    spotLimit,
  };
}

function spotsFrom(filters: SpotPresentationPreferences["filters"], paths: SpotPresentationPreferences["paths"]): SpotPresentationPreferences {
  return spotPresentationPreferencesSchema.parse({
    filters,
    grouping: { enabled: true, detail: "regions", minGroupSize: 3 },
    paths,
  });
}

function balancedPaths(): SpotPresentationPreferences["paths"] {
  return {
    background: appearance("simple-arc", "quick-sweep", QUICK_SWEEP, { arrivalPulse: true, bounceGlow: false }),
    selected: appearance("ionospheric-hops", "traveling-pulse", TRAVELING_PULSE, { arrivalPulse: false, bounceGlow: true }),
    animate: "new-spots",
    reduceMotion: false,
    maxActive: 12,
    maxPending: 100,
  };
}

function quietPaths(): SpotPresentationPreferences["paths"] {
  return {
    background: appearance("simple-arc", "off", QUICK_SWEEP, { arrivalPulse: false, bounceGlow: false }),
    selected: appearance("simple-arc", "off", QUICK_SWEEP, { arrivalPulse: false, bounceGlow: false }),
    animate: "new-spots",
    reduceMotion: false,
    maxActive: 12,
    maxPending: 100,
  };
}

function explorePaths(): SpotPresentationPreferences["paths"] {
  return {
    background: appearance("simple-arc", "off", QUICK_SWEEP, { arrivalPulse: false, bounceGlow: false }),
    selected: appearance("ionospheric-hops", "flowing-dashes", FLOWING_DASHES, { arrivalPulse: false, bounceGlow: true }),
    animate: "selected-only",
    reduceMotion: false,
    maxActive: 12,
    maxPending: 100,
  };
}

function activityRecipe(
  id: ActivityPresetId,
  name: string,
  spots: SpotPresentationPreferences,
): ActivityPresetRecipe {
  return freezeDeep(presetRecipeSchema.parse({ kind: "activity", id, version: 1, name, spots })) as ActivityPresetRecipe;
}

function displayRecipe(
  id: DisplayPresetId,
  name: string,
  config: ViewConfiguration,
): DisplayPresetRecipe {
  return freezeDeep(presetRecipeSchema.parse({
    kind: "display", id, version: 1, name, config: viewConfigurationSchema.parse(config),
  })) as DisplayPresetRecipe;
}

function withSpots(config: ViewConfiguration, spots: SpotPresentationPreferences): ViewConfiguration {
  config.spots = cloneJson(spots);
  return config;
}

const ACTIVITY_RECIPES: Record<ActivityPresetId, ActivityPresetRecipe> = {
  "activity-balanced-v1": activityRecipe(
    "activity-balanced-v1",
    "Balanced activity",
    spotsFrom(allModeFilters(30, 50), balancedPaths()),
  ),
  "activity-ssb-v1": activityRecipe(
    "activity-ssb-v1",
    "SSB operating",
    spotsFrom(specificModeFilters(["SSB"], 15, 50), balancedPaths()),
  ),
  "activity-cw-v1": activityRecipe(
    "activity-cw-v1",
    "CW hunting",
    spotsFrom(specificModeFilters(["CW"], 15, 100), balancedPaths()),
  ),
  "activity-ft8-v1": activityRecipe(
    "activity-ft8-v1",
    "FT8 monitoring",
    spotsFrom(specificModeFilters(["FT8"], 5, 100), balancedPaths()),
  ),
  "activity-quiet-v1": activityRecipe(
    "activity-quiet-v1",
    "Quiet monitoring",
    spotsFrom(allModeFilters(30, 50), quietPaths()),
  ),
  "activity-explore-v1": activityRecipe(
    "activity-explore-v1",
    "Propagation exploration",
    spotsFrom(allModeFilters(30, 50), explorePaths()),
  ),
};

function stationMonitorConfig(): ViewConfiguration {
  const config = createViewConfiguration("pro");
  withSpots(config, ACTIVITY_RECIPES["activity-balanced-v1"].spots);
  config.presentation.projection = "globe";
  config.presentation.textScale = "md";
  config.presentation.autoRotate.enabled = false;
  config.presentation.layers.spots = true;
  config.presentation.controls.showHoverTooltips = true;
  config.presentation.controls.flyoutAutoDismissEnabled = true;
  config.presentation.labels.callsigns = true;
  config.presentation.labels.endpoints = true;
  config.context.followRadio = false;
  config.context.followOperatingSession = false;
  return config;
}

function hamclockWallConfig(): ViewConfiguration {
  const config = createViewConfiguration("hamclock");
  withSpots(config, ACTIVITY_RECIPES["activity-quiet-v1"].spots);
  config.presentation.projection = "flat";
  config.presentation.textScale = "lg";
  config.presentation.autoRotate.enabled = false;
  config.presentation.hamclock.mode = "traffic";
  config.presentation.hamclock.mapContent = "activity";
  config.presentation.hamclock.theme = "pulse";
  config.presentation.hamclock.initialPageId = "spots";
  config.presentation.hamclock.hiddenPanels = [];
  config.presentation.hamclock.spotsSidebarCollapsed = false;
  config.presentation.hamclock.infoSidebarCollapsed = false;
  config.context.followRadio = false;
  config.context.followOperatingSession = false;
  return config;
}

function teamActivityConfig(): ViewConfiguration {
  const config = createViewConfiguration("hamclock");
  const spots = cloneJson(ACTIVITY_RECIPES["activity-balanced-v1"].spots);
  spots.filters.spotLimit = 100;
  withSpots(config, spots);
  config.presentation.projection = "flat";
  config.presentation.textScale = "lg";
  config.presentation.autoRotate.enabled = false;
  config.presentation.layers.spots = true;
  config.presentation.layers.spotTraces = false;
  config.presentation.layers.gridActivity = true;
  config.presentation.layers.muf = true;
  config.presentation.hamclock.mode = "traffic";
  config.presentation.hamclock.mapContent = "activity";
  config.presentation.hamclock.theme = "pulse";
  config.context.followRadio = false;
  config.context.followOperatingSession = false;
  return config;
}

function solarConditionsConfig(): ViewConfiguration {
  const config = createViewConfiguration("route");
  const dormant = cloneJson(createSpotPreferences());
  dormant.paths.background.style = "off";
  dormant.paths.background.arrivalPulse = false;
  dormant.paths.selected = appearance("ionospheric-hops", "off", TRAVELING_PULSE, {
    arrivalPulse: false, bounceGlow: false,
  });
  withSpots(config, dormant);
  config.route = "/solar";
  config.presentation.textScale = "lg";
  config.presentation.autoRotate.enabled = false;
  config.presentation.layers.spots = false;
  config.presentation.layers.spotTraces = false;
  config.context.followRadio = false;
  config.context.followOperatingSession = false;
  return config;
}

const DISPLAY_RECIPES: Record<DisplayPresetId, DisplayPresetRecipe> = {
  "display-station-v1": displayRecipe("display-station-v1", "Station Monitor", stationMonitorConfig()),
  "display-hamclock-v1": displayRecipe("display-hamclock-v1", "HamClock Wall", hamclockWallConfig()),
  "display-team-v1": displayRecipe("display-team-v1", "Team Activity TV", teamActivityConfig()),
  "display-solar-v1": displayRecipe("display-solar-v1", "Solar Conditions TV", solarConditionsConfig()),
};

const ALL_RECIPES: Record<BuiltInPresetId, PresetRecipe> = { ...ACTIVITY_RECIPES, ...DISPLAY_RECIPES };

export function isActivityPresetId(id: string): id is ActivityPresetId {
  return (ACTIVITY_PRESET_IDS as readonly string[]).includes(id);
}

export function isDisplayPresetId(id: string): id is DisplayPresetId {
  return (DISPLAY_PRESET_IDS as readonly string[]).includes(id);
}

export function isBuiltInPresetId(id: string): id is BuiltInPresetId {
  return isActivityPresetId(id) || isDisplayPresetId(id);
}

/** Fresh copy of an immutable built-in recipe. Catalog objects are never returned by alias. */
export function getBuiltInRecipe(id: BuiltInPresetId): PresetRecipe {
  return cloneJson(ALL_RECIPES[id]);
}

export function getActivityRecipe(id: ActivityPresetId): ActivityPresetRecipe {
  return cloneJson(ACTIVITY_RECIPES[id]);
}

export function getDisplayRecipe(id: DisplayPresetId): DisplayPresetRecipe {
  return cloneJson(DISPLAY_RECIPES[id]);
}

export function listBuiltInRecipes(): PresetRecipe[] {
  return [...ACTIVITY_PRESET_IDS, ...DISPLAY_PRESET_IDS].map((id) => getBuiltInRecipe(id));
}

export function listActivityRecipes(): ActivityPresetRecipe[] {
  return ACTIVITY_PRESET_IDS.map((id) => getActivityRecipe(id));
}

export function listDisplayRecipes(): DisplayPresetRecipe[] {
  return DISPLAY_PRESET_IDS.map((id) => getDisplayRecipe(id));
}
