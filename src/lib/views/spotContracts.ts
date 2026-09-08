/** SP-01 v1: renderer-independent spot contracts. No stores, clocks or I/O. */
import { z } from "zod";

export const contractIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/);
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const count = z.number().int().nonnegative().safe();
const label = z.string().trim().min(1).max(256);
const unique = <T>(items: T[]) => new Set(items).size === items.length;
export const reportIdsSchema = z.array(contractIdSchema).max(5_000).refine(unique, "Duplicate report IDs");
export const coordinatesSchema = z.object({
  lat: finite.min(-90).max(90),
  lon: finite.min(-180).max(180),
}).strict();
export const spotSourceSchema = z.enum(["PSKReporter", "RBN", "Cluster", "WSJT-X"]);
export const modeCategorySchema = z.enum(["phone", "cw", "digital", "unknown"]);
export const normalizedModeSchema = z.object({
  name: z.string().regex(/^[A-Z0-9-]{1,24}$/),
  category: modeCategorySchema,
  provenance: z.enum(["reported", "inferred", "unknown"]),
  originalLabel: z.string().max(80).nullable(),
}).strict().superRefine((mode, ctx) => {
  if ((mode.provenance === "unknown") !== (mode.category === "unknown") ||
      ((mode.category === "unknown") !== (mode.name === "UNKNOWN"))) {
    ctx.addIssue({ code: "custom", message: "Unknown mode must retain unknown category/provenance" });
  }
});
export const regionSchema = z.object({
  id: contractIdSchema,
  name: label,
  kind: z.enum(["country", "subdivision"]),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
}).strict();
export const maidenheadSchema = z.string().trim().toUpperCase()
  .regex(/^[A-R]{2}(?:[0-9]{2}(?:[A-X]{2}(?:[0-9]{2})?)?)?$/);

const coordinateLocation = z.object({
  kind: z.literal("reported-coordinate"), coordinates: coordinatesSchema,
}).strict();
const gridLocation = z.object({
  kind: z.literal("reported-grid"), grid: maidenheadSchema, coordinates: coordinatesSchema,
}).strict();
const approximateLocation = z.object({
  kind: z.literal("approximate"), coordinates: coordinatesSchema,
  source: z.enum(["prefix", "lookup", "legacy"]),
  region: regionSchema.nullable(),
  precision: z.enum(["country", "subdivision", "unknown"]),
  reason: label,
}).strict().superRefine((location, ctx) => {
  if (location.region && location.precision !== location.region.kind) {
    ctx.addIssue({ code: "custom", message: "Approximate region and precision must agree" });
  }
});
export const spotLocationSchema = z.union([
  coordinateLocation, gridLocation, approximateLocation,
  z.object({ kind: z.literal("unavailable"), reason: label }).strict(),
]);
export const stationEndpointSchema = z.object({
  callsign: z.string().trim().min(1).max(32),
  role: z.enum(["transmitter", "receiver", "posting-service", "unknown"]),
  location: spotLocationSchema,
}).strict();
export const normalizedSpotReportSchema = z.object({
  id: contractIdSchema,
  source: spotSourceSchema,
  sourceReportId: z.string().max(256).nullable(),
  /** Preserve every contributing feed so deduplication cannot erase source filtering. */
  sourceRefs: z.array(z.object({
    source: spotSourceSchema, sourceReportId: z.string().max(256).nullable(),
  }).strict()).min(1).max(32),
  /** Milliseconds since epoch; pipeline gets an explicit now for expiration. */
  observedAtMs: count,
  frequencyKhz: finite.positive().max(1_000_000_000),
  band: z.string().regex(/^[a-zA-Z0-9.]{1,16}$/),
  mode: normalizedModeSchema,
  dx: stationEndpointSchema,
  reporter: stationEndpointSchema.nullable(),
  snrDb: finite.nullable(),
}).strict().superRefine((report, ctx) => {
  const keys = report.sourceRefs.map((ref) => JSON.stringify([ref.source, ref.sourceReportId]));
  if (!unique(keys) || !report.sourceRefs.some((ref) => ref.source === report.source && ref.sourceReportId === report.sourceReportId)) {
    ctx.addIssue({ code: "custom", message: "Source references must be unique and include the primary report source" });
  }
});

/** Categories expand at selection time. No hidden category OR after unchecking a child. */
export const modeSelectionSchema = z.object({
  all: z.boolean(),
  categories: z.array(z.enum(["phone", "cw", "digital"])).max(3).refine(unique),
  modes: z.array(z.string().regex(/^[A-Z0-9-]{1,24}$/)).max(100).refine(unique),
  includeUnknown: z.boolean(),
  includeInferred: z.boolean(),
}).strict().superRefine((selection, ctx) => {
  if (selection.all && (selection.categories.length || selection.modes.length)) {
    ctx.addIssue({ code: "custom", message: "All modes cannot also contain specific selections" });
  }
  if (!selection.all && !selection.categories.length && !selection.modes.length) {
    ctx.addIssue({ code: "custom", message: "Empty mode selection must normalize to All" });
  }
});
export const spotFilterPreferencesSchema = z.object({
  modes: modeSelectionSchema,
  /** Empty arrays mean all available bands/enabled authorized sources. */
  bands: z.array(z.string().regex(/^[a-zA-Z0-9.]{1,16}$/)).max(40).refine(unique),
  sources: z.array(spotSourceSchema).max(4).refine(unique),
  maxAgeMinutes: z.number().int().min(1).max(60),
  spotLimit: z.number().int().min(10).max(200),
}).strict();
export const groupingPreferencesSchema = z.object({
  enabled: z.boolean(),
  detail: z.enum(["regions", "grid4", "grid6"]),
  minGroupSize: z.number().int().min(2).max(50),
}).strict();
export const pathAppearanceSchema = z.object({
  shape: z.enum(["simple-arc", "ionospheric-hops"]),
  style: z.enum(["off", "quick-sweep", "traveling-pulse", "flowing-dashes"]),
  travelSeconds: finite.min(0.25).max(5),
  trailSeconds: finite.min(0).max(30),
  fadeSeconds: finite.min(0).max(5),
  repeatSeconds: finite.min(1).max(10),
  arrivalPulse: z.boolean(),
  bounceGlow: z.boolean(),
}).strict();
export const spotPresentationPreferencesSchema = z.object({
  filters: spotFilterPreferencesSchema,
  grouping: groupingPreferencesSchema,
  paths: z.object({
    background: pathAppearanceSchema,
    /** Null explicitly inherits the background appearance. */
    selected: pathAppearanceSchema.nullable(),
    animate: z.enum(["new-spots", "selected-only", "all-displayed"]),
    reduceMotion: z.boolean(),
    maxActive: z.number().int().min(1).max(12),
    maxPending: z.number().int().min(0).max(100),
  }).strict(),
}).strict();

export const modelProvenanceSchema = z.object({
  name: label, version: label, modeledAtMs: count,
  inputsAsOfMs: count.nullable(),
  explanation: z.string().max(2_000),
}).strict();
export const pathDescriptorSchema = z.object({
  id: contractIdSchema,
  reportIds: reportIdsSchema,
  kind: z.enum(["reported", "approximate", "modeled"]),
  from: stationEndpointSchema,
  to: stationEndpointSchema,
  direction: z.enum(["from-to", "unknown"]),
  model: modelProvenanceSchema.nullable(),
}).strict().superRefine((path, ctx) => {
  if ((path.kind === "modeled") !== (path.model !== null)) {
    ctx.addIssue({ code: "custom", message: "Only modeled paths carry model provenance" });
  }
  if (path.kind !== "modeled" && path.reportIds.length === 0) {
    ctx.addIssue({ code: "custom", message: "Observed paths require contributing reports" });
  }
  if (path.direction === "from-to" && path.kind !== "modeled" &&
      (path.from.role !== "transmitter" || path.to.role !== "receiver")) {
    ctx.addIssue({ code: "custom", message: "Observed direction requires transmitter and receiver roles" });
  }
});
export const pathPointDescriptorSchema = z.object({
  id: contractIdSchema, pathId: contractIdSchema,
  hopIndex: z.number().int().min(0).max(100),
  role: z.enum(["ray-apex", "shell-highlight", "ground-point"]),
  coordinates: coordinatesSchema,
  /** Geometry height and modeled reflection height are deliberately distinct. */
  displayHeightKm: nonnegative.max(2_000),
  modeledHeightKm: nonnegative.max(2_000).nullable(),
  layer: z.enum(["D", "E", "F1", "F2"]).nullable(),
  locationPrecision: z.enum(["modeled", "approximate"]),
  explanation: z.string().trim().min(1).max(2_000),
  model: modelProvenanceSchema,
}).strict();
export const clusterGroupSchema = z.object({
  id: contractIdSchema,
  geographyVersion: label,
  endpointRole: z.literal("dx"),
  label,
  detail: z.enum(["regions", "grid4", "grid6"]),
  region: regionSchema.nullable(),
  grid: maidenheadSchema.nullable(),
  precision: z.enum(["reported-coordinate", "reported-grid", "approximate"]),
  anchor: coordinatesSchema,
  /** Newest first; ID tie-break. Badge count is reportIds.length. */
  reportIds: reportIdsSchema.refine((ids) => ids.length > 0),
}).strict().superRefine((group, ctx) => {
  if (group.detail === "regions" ? group.region === null || group.grid !== null :
      group.grid === null || group.grid.length !== (group.detail === "grid4" ? 4 : 6) || group.precision === "approximate") {
    ctx.addIssue({ code: "custom", message: "Group detail must match its region/grid and source precision" });
  }
});
export const spotSceneCountsSchema = z.object({
  loaded: count, deduplicated: count, scopeEligible: count, matching: count,
  unlocated: count, mapped: count, budgetOmitted: count,
}).strict();
export const spotSceneModelSchema = z.object({
  schemaVersion: z.literal(1),
  nowMs: count,
  /** Only mapped, budget-selected reports. Unlocated rows stay in source lists. */
  reports: z.array(normalizedSpotReportSchema).max(200),
  groups: z.array(clusterGroupSchema).max(200),
  singles: reportIdsSchema,
  paths: z.array(pathDescriptorSchema).max(200),
  counts: spotSceneCountsSchema,
}).strict().superRefine((scene, ctx) => {
  const ids = scene.reports.map((report) => report.id);
  const represented = [...scene.singles, ...scene.groups.flatMap((group) => group.reportIds)];
  const idSet = new Set(ids);
  const c = scene.counts;
  if (scene.reports.some((report) => report.dx.location.kind === "unavailable") ||
      !unique(scene.paths.map((path) => path.id))) {
    ctx.addIssue({ code: "custom", message: "Mapped reports require a location and path IDs must be unique" });
  }
  if (!unique(ids) || !unique(scene.groups.map((group) => group.id)) ||
      !unique(represented) || represented.length !== ids.length ||
      represented.some((id) => !idSet.has(id))) {
    ctx.addIssue({ code: "custom", message: "Every mapped report must appear exactly once in groups or singles" });
  }
  if (scene.paths.some((path) => path.reportIds.some((id) => !idSet.has(id)))) {
    ctx.addIssue({ code: "custom", message: "Path references an unmapped report" });
  }
  if (c.loaded < c.deduplicated || c.deduplicated < c.scopeEligible ||
      c.scopeEligible < c.matching || c.matching !== c.unlocated + c.mapped + c.budgetOmitted ||
      c.mapped !== ids.length) {
    ctx.addIssue({ code: "custom", message: "Scene counts do not reconcile" });
  }
});

export type SpotPresentationPreferences = z.infer<typeof spotPresentationPreferencesSchema>;
export type NormalizedSpotReport = z.infer<typeof normalizedSpotReportSchema>;
export type SpotLocation = z.infer<typeof spotLocationSchema>;
export type StationEndpoint = z.infer<typeof stationEndpointSchema>;
export type NormalizedMode = z.infer<typeof normalizedModeSchema>;
export type ModeSelection = z.infer<typeof modeSelectionSchema>;
export type ClusterGroup = z.infer<typeof clusterGroupSchema>;
export type SpotSceneModel = z.infer<typeof spotSceneModelSchema>;
export type SpotSceneCounts = z.infer<typeof spotSceneCountsSchema>;
export type PathDescriptor = z.infer<typeof pathDescriptorSchema>;
export type PathPointDescriptor = z.infer<typeof pathPointDescriptorSchema>;
export type PathAppearance = z.infer<typeof pathAppearanceSchema>;
