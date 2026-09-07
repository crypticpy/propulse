/** SP-01 v1. Saved intent is complete, serializable and independent of live stores. */
import { z } from "zod";
import { contractIdSchema, coordinatesSchema, spotPresentationPreferencesSchema } from "./spotContracts";

export const VIEW_SCHEMA_VERSION = 1;
export const VIEW_PAYLOAD_LIMIT_BYTES = 65_536;
export const ASSIGNMENT_PAYLOAD_LIMIT_BYTES = 524_288;
export const MAX_DISPLAY_SCENES = 24;
const finite = z.number().finite();
const boundedName = z.string().trim().min(1).max(100);
const revision = z.number().int().min(1).safe();
const route = z.enum(["/map", "/map/explorer", "/map/photorealistic", "/", "/solar", "/dx", "/atmos", "/satellites", "/clock", "/stopwatch"]);
export const viewFamilySchema = z.enum(["normal", "pro", "lite", "hamclock", "route"]);
export const projectionSchema = z.enum(["globe", "flat", "azimuthal"]);

/** Explicit booleans prevent a scene from inheriting a previous scene's overlays. */
export const viewLayersSchema = z.object({
  terminator: z.boolean(), greyline: z.boolean(), aurora: z.boolean(), muf: z.boolean(),
  nvis: z.boolean(), spots: z.boolean(), activations: z.boolean(), spotTraces: z.boolean(),
  nightLights: z.boolean(), lunarSubpoint: z.boolean(), labels: z.boolean(), satellites: z.boolean(),
  earthquakes: z.boolean(), weather: z.boolean(), lightning: z.boolean(), wspr: z.boolean(),
  contestQsos: z.boolean(), loggedQsos: z.boolean(), fires: z.boolean(), radar: z.boolean(),
  issTracker: z.boolean(), gridActivity: z.boolean(), ionosphere: z.boolean(), rayPath: z.boolean(),
  drap: z.boolean(), geomagField: z.boolean(), noiseFloor: z.boolean(), meteorShowers: z.boolean(),
  beacons: z.boolean(), spectrumRing: z.boolean(), ducting: z.boolean(), sporadicE: z.boolean(),
  satelliteFootprints: z.boolean(), ft8Spotter: z.boolean(), goesCloud: z.boolean(), tec: z.boolean(),
  repeaters: z.boolean(), riverGauges: z.boolean(), aprs: z.boolean(), tropical: z.boolean(),
  sst: z.boolean(), timeStations: z.boolean(),
}).strict();
export const cameraHomeSchema = z.object({
  center: coordinatesSchema,
  zoom: finite.min(0.1).max(100),
  tiltDegrees: finite.min(-90).max(90),
  rotationDegrees: finite.min(-180).max(180),
  latitudeSpan: finite.positive().max(180),
  longitudeSpan: finite.positive().max(360),
}).strict();
const panelSchema = z.object({
  id: contractIdSchema, visible: z.boolean(), collapsed: z.boolean(),
  x: finite, y: finite, width: finite.positive().max(16_384), height: finite.positive().max(16_384),
  dockedEdge: z.enum(["left", "right"]).nullable(), dockedOrder: z.number().int().nonnegative(),
}).strict();
const railPage = z.object({
  pageId: contractIdSchema,
  tileIds: z.array(contractIdSchema).max(16).refine((ids) => new Set(ids).size === ids.length),
}).strict();

export type ViewJson = null | boolean | number | string | ViewJson[] | { [key: string]: ViewJson };
/** Widget schemas are registered independently; this outer envelope is still bounded plain JSON. */
const widgetJson = z.unknown().transform((input, ctx): ViewJson => {
  const seen = new Set<object>();
  let nodes = 0;
  function valid(value: unknown, depth: number): boolean {
    if (++nodes > 4_096 || depth > 8) return false;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.length <= 4_096;
    if (typeof value !== "object" || seen.has(value)) return false;
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > 257) return false;
    if (Array.isArray(value) && (keys.length !== value.length + 1 ||
        keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key))))) return false;
    for (const key of keys) {
      if (Array.isArray(value) && key === "length") continue;
      if (typeof key !== "string" || /^(?:__proto__|prototype|constructor|deviceToken|password|secret|access_token|refresh_token)$/i.test(key)) return false;
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable || !valid(descriptor.value, depth + 1)) return false;
    }
    seen.delete(value);
    return true;
  }
  try {
    if (valid(input, 0)) return structuredClone(input) as ViewJson;
  } catch { /* Reject proxies/accessors/cycles rather than persisting arbitrary runtime objects. */ }
  ctx.addIssue({ code: "custom", message: "Widget configuration must be bounded plain JSON without credentials" });
  return z.NEVER;
});

export const hamclockPresentationSchema = z.object({
  mode: z.enum(["traffic", "bands", "satellites", "weather"]),
  density: z.enum(["wall", "desk"]),
  theme: z.enum(["pulse", "classic", "brass"]),
  units: z.enum(["auto", "imperial", "metric"]),
  mapContent: z.enum(["activity", "contacts", "both"]),
  panelCollapsed: z.record(contractIdSchema, z.boolean()),
  bandFocus: z.array(z.string().max(16)).max(40),
  crawlHamNews: z.boolean(), crawlWorldNews: z.boolean(),
  reliability: z.object({
    mode: z.enum(["SSB", "CW", "FT8"]),
    powerWatts: z.union([z.literal(5), z.literal(25), z.literal(100), z.literal(500), z.literal(1500)]),
    antennaType: z.enum(["dipole", "vertical", "yagi_3el", "yagi_5el", "hex_beam", "wire_inverted_v", "nvis_dipole", "isotropic"]),
  }).strict(),
  hiddenPanels: z.array(contractIdSchema).max(64),
  spotsSide: z.enum(["left", "right"]),
  spotsSidebarCollapsed: z.boolean(), infoSidebarCollapsed: z.boolean(),
  railLayout: z.object({ left: z.array(railPage).max(24), right: z.array(railPage).max(24) }).strict(),
  autoPage: z.object({ enabled: z.boolean(), dwellSeconds: z.number().int().min(15).max(3_600) }).strict(),
  initialPageId: contractIdSchema.nullable(),
  pinnedTile: z.object({ side: z.enum(["left", "right"]), tileId: contractIdSchema }).strict().nullable(),
  widgets: z.array(z.object({
    tileId: contractIdSchema, schemaVersion: revision, config: widgetJson,
  }).strict()).max(64),
}).strict().superRefine((wall, ctx) => {
  for (const side of [wall.railLayout.left, wall.railLayout.right]) {
    if (new Set(side.map((page) => page.pageId)).size !== side.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate rail page ID" });
    }
  }
  const pageIds = new Set([...wall.railLayout.left, ...wall.railLayout.right].map((page) => page.pageId));
  for (const id of pageIds) {
    const tiles = [...wall.railLayout.left, ...wall.railLayout.right]
      .filter((page) => page.pageId === id).flatMap((page) => page.tileIds);
    if (new Set(tiles).size !== tiles.length) ctx.addIssue({ code: "custom", message: "A tile may appear only once per wall page" });
  }
  if (wall.initialPageId !== null && !pageIds.has(wall.initialPageId)) {
    ctx.addIssue({ code: "custom", message: "Initial wall page is missing" });
  }
  if (new Set(wall.widgets.map((widget) => widget.tileId)).size !== wall.widgets.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate widget configuration" });
  }
});

export const viewPresentationSchema = z.object({
  projection: projectionSchema,
  cameraHomes: z.object({ globe: cameraHomeSchema, flat: cameraHomeSchema, azimuthal: cameraHomeSchema }).strict(),
  layers: viewLayersSchema,
  mapStyle: z.enum(["satellite", "standard"]),
  tileProviderId: contractIdSchema.nullable(),
  quality: z.enum(["auto", "data-saver", "uhd", "extreme"]),
  fit: z.enum(["auto", "compact", "full"]),
  nightDarkness: finite.min(0).max(1),
  autoRotate: z.object({ enabled: z.boolean(), secondsPerRevolution: finite.min(60).max(86_400) }).strict(),
  textScale: z.enum(["sm", "md", "lg", "xl", "200", "250"]),
  smartScaling: z.boolean(),
  forecast: z.object({
    bandMode: z.enum(["common", "all", "custom"]), customBands: z.array(z.string().max(16)).max(40),
    showSnrValues: z.boolean(), detailedFooter: z.boolean(), hoursToShow: z.union([z.literal(13), z.literal(24)]),
  }).strict(),
  ticker: z.object({ position: z.enum(["bottom", "above-panels", "top"]), coverageArea: z.enum(["nearby", "regional", "wide"]) }).strict(),
  theme: z.object({
    id: z.enum(["dark", "light", "high-contrast", "midnight"]), accentId: contractIdSchema,
    customPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    customSecondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  }).strict(),
  labels: z.object({
    borders: z.boolean(), stateBorders: z.boolean(), countryNames: z.boolean(), cities: z.boolean(),
    maidenheadGrid: z.boolean(), gridLabels: z.boolean(), wasOverlay: z.boolean(), tileLabels: z.boolean(),
    callsigns: z.boolean(), endpoints: z.boolean(), scale: finite.min(0.5).max(3),
    gridDetail: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }).strict(),
  panels: z.array(panelSchema).max(64),
  dockGroups: z.array(z.object({
    id: contractIdSchema, panelIds: z.array(contractIdSchema).min(2).max(64),
    sharedX: finite, sharedWidth: finite.positive(),
  }).strict()).max(32),
  proRibbonExpanded: z.boolean(),
  pathMode: z.enum(["short", "long", "both"]),
  spotColorMode: z.enum(["mode", "band", "snr", "age"]),
  visualStyle: z.enum(["realistic", "high-viz"]),
  controls: z.object({
    globeOrientation: z.enum(["qth", "natural"]),
    holdDurationMs: finite.min(300).max(2_000), flyoutAutoDismissMs: finite.min(1_000).max(10_000),
    flyoutAutoDismissEnabled: z.boolean(), spotHitRadiusMultiplier: finite.min(0.5).max(2),
    spotDotScale: finite.min(0.5).max(2), mapPinScale: finite.min(0.5).max(2),
    showHoverTooltips: z.boolean(), mapAspectRatio: finite.min(1.5).max(2.5),
    bandHeightArcs: z.boolean(), spotAgeDecay: z.boolean(), showAgeColumn: z.boolean(),
    compassRose: z.object({ enabled: z.boolean(), beamWidth: finite.min(1).max(360), showBeamWidth: z.boolean() }).strict(),
    timeFormat: z.enum(["12h", "24h"]),
  }).strict(),
  overlays: z.object({
    nvisEnabled: z.boolean(), nvisOpacity: finite.min(0.1).max(0.8),
    beaconInactiveOpacity: finite.min(0).max(1),
    gridActivityEndpoint: z.enum(["dx", "reporter", "both"]),
    showEsLayer: z.boolean(), observedMUFMode: z.enum(["observed", "divergence", "off"]),
    showCorrelation: z.boolean(), satelliteCategoryFilter: z.enum(["all", "fm", "linear", "digital", "iss", "weather", "other"]),
    satelliteShowAll: z.boolean(),
  }).strict(),
  hamclock: hamclockPresentationSchema,
}).strict().superRefine((presentation, ctx) => {
  const ids = presentation.panels.map((panel) => panel.id);
  const docked = presentation.dockGroups.flatMap((group) => group.panelIds);
  if (new Set(presentation.dockGroups.map((group) => group.id)).size !== presentation.dockGroups.length ||
      new Set(ids).size !== ids.length || new Set(docked).size !== docked.length || docked.some((id) => !ids.includes(id))) {
    ctx.addIssue({ code: "custom", message: "Panel/dock identities must be unique and refer to known panels" });
  }
});
export const viewOperatingContextSchema = z.object({
  scope: z.enum(["observation", "logging", "contest"]),
  followOperatingSession: z.boolean(),
  followRadio: z.boolean(),
  stationId: contractIdSchema.nullable(),
  radioId: contractIdSchema.nullable(),
  displayTime: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("live") }).strict(),
    z.object({ kind: z.literal("offset"), hours: finite.min(-24).max(24) }).strict(),
    z.object({ kind: z.literal("fixed"), iso: z.string().datetime({ offset: true }) }).strict(),
  ]),
}).strict();

export const viewConfigurationSchema = z.object({
  schemaVersion: z.literal(VIEW_SCHEMA_VERSION),
  family: viewFamilySchema,
  route,
  spots: spotPresentationPreferencesSchema,
  presentation: viewPresentationSchema,
  context: viewOperatingContextSchema,
}).strict().superRefine((config, ctx) => {
  if (config.family !== "route" && config.route !== "/map") {
    ctx.addIssue({ code: "custom", message: "Map layout families require /map" });
  }
  if (new TextEncoder().encode(JSON.stringify(config)).length > VIEW_PAYLOAD_LIMIT_BYTES) {
    ctx.addIssue({ code: "custom", message: "View configuration exceeds 64 KiB" });
  }
});
const presetReference = z.object({ id: contractIdSchema, version: revision }).strict();
export const savedViewSchema = z.object({
  id: contractIdSchema, ownerId: contractIdSchema, name: boundedName,
  schemaVersion: z.literal(VIEW_SCHEMA_VERSION), revision,
  config: viewConfigurationSchema,
  sourcePreset: presetReference.nullable(),
}).strict();
export const presetRecipeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("activity"), id: contractIdSchema, version: revision, name: boundedName,
    spots: spotPresentationPreferencesSchema,
  }).strict(),
  z.object({
    kind: z.literal("display"), id: contractIdSchema, version: revision, name: boundedName,
    config: viewConfigurationSchema,
  }).strict(),
]);
export const sceneSnapshotSchema = z.object({
  id: contractIdSchema, name: boundedName, enabled: z.boolean(),
  durationSec: z.number().int().min(15).max(3_600),
  transition: z.enum(["fade", "cut"]),
  config: viewConfigurationSchema,
  sourceView: z.object({ id: contractIdSchema, revision }).strict().nullable(),
}).strict();
export const displayAssignmentSchema = z.object({
  schemaVersion: z.literal(VIEW_SCHEMA_VERSION), revision,
  scenes: z.array(sceneSnapshotSchema).min(1).max(MAX_DISPLAY_SCENES),
  rotation: z.object({ enabled: z.boolean(), intervalSec: z.number().int().min(15).max(3_600) }).strict(),
  breakInLevel: z.enum(["CRITICAL", "WARNING", "off"]),
  presentation: z.object({
    headerScale: z.enum(["compact", "standard", "large"]), slashedZero: z.boolean(), autoNightDim: z.boolean(),
  }).strict(),
  startSceneId: contractIdSchema,
}).strict().superRefine((assignment, ctx) => {
  if (new Set(assignment.scenes.map((scene) => scene.id)).size !== assignment.scenes.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate scene ID" });
  }
  if (!assignment.scenes.some((scene) => scene.id === assignment.startSceneId && scene.enabled)) {
    ctx.addIssue({ code: "custom", message: "Starting scene must exist and be enabled" });
  }
  if (new TextEncoder().encode(JSON.stringify(assignment)).length > ASSIGNMENT_PAYLOAD_LIMIT_BYTES) {
    ctx.addIssue({ code: "custom", message: "Display assignment exceeds 512 KiB" });
  }
});

export type ViewConfiguration = z.infer<typeof viewConfigurationSchema>;
export type ViewFamily = z.infer<typeof viewFamilySchema>;
export type ViewPresentationPreferences = z.infer<typeof viewPresentationSchema>;
export type ViewOperatingContext = z.infer<typeof viewOperatingContextSchema>;
export type SavedView = z.infer<typeof savedViewSchema>;
export type PresetRecipe = z.infer<typeof presetRecipeSchema>;
export type SceneSnapshot = z.infer<typeof sceneSnapshotSchema>;
export type DisplayAssignment = z.infer<typeof displayAssignmentSchema>;

/** Replace complete top-level slices; no deep merge of arrays or partial scenes. */
export type WorkingViewPatch = Partial<Pick<ViewConfiguration, "spots" | "presentation" | "context">>;
export type SaveResult<T> =
  | { status: "saved"; record: T }
  | { status: "conflict"; current: T | null }
  | { status: "pending"; operationId: string }
  | { status: "invalid" | "unavailable" | "forbidden"; message: string };

export interface ViewRepository {
  getView(ownerId: string, viewId: string): Promise<SavedView | null>;
  /** expectedRevision=0 creates; otherwise compare-and-swap. Never activates another view. */
  saveView(ownerId: string, view: Omit<SavedView, "ownerId" | "revision">, expectedRevision: number): Promise<SaveResult<SavedView>>;
  publishDisplay(ownerId: string, displayId: string, assignment: Omit<DisplayAssignment, "revision">, expectedRevision: number): Promise<SaveResult<DisplayAssignment>>;
}

export interface ViewBinding {
  ownerId: string;
  slotId: string;
  kind: "interactive" | "preview" | "display";
  sourceView: { id: string; revision: number } | null;
  displayId: string | null;
}

export interface ViewInteractionState {
  selectedReportId: string | null;
  selectedPathPointId: string | null;
  target: { lat: number; lon: number; origin: "manual" | "spot"; reportId: string | null } | null;
  expandedGroupIds: readonly string[];
}

/** Factory/command implementations land in SP-03; no global active runtime. */
export interface ViewRuntime {
  readonly instanceId: string;
  readonly binding: ViewBinding;
  getSnapshot(): { config: ViewConfiguration; interaction: ViewInteractionState; workingRevision: number };
  subscribe(listener: () => void): () => void;
  updateWorkingView(patch: WorkingViewPatch): void;
  /** Explicit load/scene entry: validated complete replacement clears interaction state. */
  replaceWorkingView(config: ViewConfiguration): void;
  applyPreset(preset: PresetRecipe): void;
  selectSpot(reportId: string, location: { lat: number; lon: number } | null): void;
  clearSelection(): void;
  selectPathPoint(pointId: string | null): void;
  setExpandedGroups(groupIds: readonly string[]): void;
  dispose(): void;
}
