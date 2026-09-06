/** W01 executable contracts. No store, hardware, engine, or publication side effects. */
import { z } from "zod";
import { equipmentFieldsSchema, equipmentMeasurementKinds, rejectReservedEquipmentKey, type EquipmentFields, type EquipmentKind } from "@/lib/station/workbench/equipment/types";
import { canonicalEquipmentFactId, EQUIPMENT_FIELD_REGISTRY, validateEquipmentFields, validateEquipmentNumericFacts } from "@/lib/station/workbench/equipment/registry";

const id = z.string().trim().min(1);
const instant = z.string().datetime({ offset: true });
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const signal = z.enum(["rf", "power", "audio", "control", "bonding", "unknown"]);
const equipmentKind = z.enum(["radio", "antenna", "cable", "inline", "accessory", "other"]);
const endpoint = z.object({ instanceId: id, portId: id }).strict();

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
/** Validate before cloning: Zod object/record parsing drops an own __proto__ property. */
const jsonValue = z.unknown().transform((input, ctx): JsonValue => {
  const active = new WeakSet<object>();
  const valid = (value: unknown): boolean => {
    if (value === null || typeof value === "boolean" || typeof value === "string") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || active.has(value)) return false;
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
    active.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) return false;
    if (array && keys.length !== value.length + 1) return false;
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string") return false;
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return false;
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor) || !valid(descriptor.value)) return false;
    }
    active.delete(value);
    return true;
  };
  try {
    if (valid(input)) return structuredClone(input) as JsonValue;
  } catch {
    // Proxies, non-cloneable values and excessive nesting are invalid capture inputs.
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Legacy payload must contain only finite, acyclic plain JSON values" });
  return z.NEVER;
});
const jsonObject = jsonValue.transform((value, ctx): Record<string, JsonValue> => {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Legacy payload must be a JSON object" });
  return z.NEVER;
});

/** Known zero is valid; missing information never coerces to zero. */
export const quantitySchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unknown"), reason: id }).strict(),
  z.object({
    state: z.literal("known"), value: finite, unit: id,
    evidenceId: id,
  }).strict(),
]);
const numericFactsSchema = z.preprocess(rejectReservedEquipmentKey, z.record(quantitySchema));

export const evidenceSchema = z.discriminatedUnion("kind", [
  z.object({
    id, ownerId: id, kind: z.literal("measurement"), source: id,
    observedAt: instant, point: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("port"), instanceId: id, portId: id }).strict(),
      z.object({ kind: z.literal("equipment"), instanceId: id, description: id }).strict(),
    ]),
    reading: z.object({ value: finite, unit: id }).strict(),
    quantityKind: z.enum(equipmentMeasurementKinds),
    context: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("rf"), frequencyHz: finite.positive() }).strict(),
      z.object({ kind: z.literal("not-applicable"), reason: id }).strict(),
    ]),
    method: id, notes: z.string().optional(),
  }).strict(),
  z.object({
    id, ownerId: id, kind: z.enum(["manufacturer", "declared", "estimate"]),
    source: id, recordedAt: instant, notes: z.string().optional(),
  }).strict(),
  z.object({
    id, ownerId: id, kind: z.literal("report"), reportType: z.enum(["manufacturer", "independent-test", "unknown"]),
    source: id, recordedAt: instant,
    citation: z.object({ name: id, url: z.string().optional(), retrievedAt: z.string().optional(), license: z.string().optional(), notes: z.string().optional() }).strict(),
    // A report is attributed published/legacy evidence, never a measurement of this instance.
    measurementContext: z.union([
      z.object({ state: z.literal("unknown"), reason: id }).strict(),
      z.object({ state: z.literal("recorded"), observedAt: instant.optional(), frequencyHz: finite.positive().optional(), method: id.optional() }).strict().refine((context) => context.observedAt !== undefined || context.frequencyHz !== undefined || context.method !== undefined, "Recorded context needs at least one actual observation detail"),
    ]),
  }).strict(),
]);

export const portSchema = z.object({
  id, label: id, signal, templateId: id.optional(),
  direction: z.enum(["input", "output", "bidirectional", "unknown"]),
  role: z.enum(["source", "load", "through", "switch-common", "switch-throw", "unknown"]),
  connector: z.discriminatedUnion("state", [
    z.object({ state: z.literal("unknown") }).strict(),
    z.object({ state: z.literal("known"), family: id, gender: z.enum(["male", "female", "genderless", "unknown"]) }).strict(),
  ]),
  ratings: numericFactsSchema,
}).strict();

export const internalPathSchema = z.object({
  id, fromPortId: id, toPortId: id, signal,
  /** At most one path in this group may occur in a selected route. */
  exclusiveGroupId: id.optional(),
}).strict();

/** Private recovery envelope, never a public projection field. JSON values are retained verbatim. */
export const legacyRecordSchema = z.object({
  kind: z.enum(["radio", "radio-model", "antenna", "feedline", "feedline-run", "inline", "accessory", "chain", "preset", "profile", "location", "workbench"]),
  sourceId: id, sourceVersion: z.number().int().nonnegative().safe(), payload: jsonObject,
}).strict();

export const equipmentModelSchema = z.object({
  id, origin: z.enum(["catalog", "custom", "homebrew", "legacy"]),
  manufacturer: z.string().optional(), name: id, kind: equipmentKind,
  portTemplates: z.array(portSchema), internalPathTemplates: z.array(internalPathSchema).optional(),
  specifications: numericFactsSchema, fields: equipmentFieldsSchema.optional(),
  sourceReportIds: z.array(id).optional(), legacy: z.array(legacyRecordSchema).optional(),
}).strict();

export const equipmentPrivateMetadataSchema = z.object({
  serialNumber: z.string().optional(), purchaseDate: z.string().optional(),
  purchaseLocation: z.string().optional(), firmwareRevision: z.string().optional(),
  wiringConfiguration: z.string().optional(), notes: z.string().optional(),
  receiptMediaIds: z.array(id), imageIds: z.array(id),
  specPreference: z.enum(["global", "factory", "tested"]).optional(),
  condition: z.string().optional(), maintenanceNotes: z.string().optional(), manualNotes: z.string().optional(),
  manualMediaIds: z.array(id).optional(), manualUrls: z.array(z.string()).optional(),
  primaryImageId: id.optional(), galleryImageIds: z.array(id).optional(), legacyPhotoUrls: z.array(z.string()).optional(),
}).strict();

export const equipmentInstanceSchema = z.object({
  id, ownerId: id, modelId: id.nullable(), label: id, kind: equipmentKind,
  lifecycle: z.enum(["owned", "borrowed", "planned", "retired"]),
  addedAt: instant, retiredAt: instant.optional(), ports: z.array(portSchema), internalPaths: z.array(internalPathSchema),
  facts: numericFactsSchema, fields: equipmentFieldsSchema.optional(),
  privateMetadata: equipmentPrivateMetadataSchema,
  legacy: z.array(legacyRecordSchema),
}).strict();

export const locationSchema = z.object({
  id, ownerId: id, label: id, kind: z.enum(["home", "portable", "mobile", "club", "remote", "pota", "sota", "fieldday", "other"]),
  coordinates: z.object({ latitude: finite.min(-90).max(90), longitude: finite.min(-180).max(180) }).strict().nullable(),
  grid: z.string().optional(), timezone: z.string().optional(), activationRef: z.string().optional(),
  createdAt: instant, privateNotes: z.string().optional(), legacy: z.array(legacyRecordSchema),
}).strict();

export const setupSchema = z.object({
  id, ownerId: id, name: id, locationId: id.nullable(),
  draftRevisionId: id, archivedAt: instant.nullable(), legacy: z.array(legacyRecordSchema),
}).strict();

export const connectionSchema = z.object({
  id, signal, from: endpoint, to: endpoint,
  /** The run owns its base cable and length once, even when inline gear splits its edges. */
  runId: id.nullable(), label: id,
  /** Explicit mating interface; a cable run alone does not identify its physical ends. */
  connectorInterface: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("direct") }).strict(),
    z.object({ kind: z.literal("cable"), fromPortId: id, toPortId: id, internalPathId: id }).strict(),
  ]).optional(),
}).strict();

export const cableRunSchema = z.object({
  id, label: id, signal, baseCableInstanceId: id.nullable(),
  /** Base cable length only (legacy feedline length); inline pigtails keep their own length. */
  lengthMeters: quantitySchema,
  connections: z.array(z.object({ connectionId: id, reverse: z.boolean() }).strict()).min(1),
  inlineItems: z.array(z.object({ instanceId: id, internalPathId: id, reverse: z.boolean() }).strict()),
  legacy: z.array(legacyRecordSchema),
}).strict();

const routeHopSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("connection"), connectionId: id, reverse: z.boolean() }).strict(),
  z.object({ kind: z.literal("internal"), instanceId: id, internalPathId: id, reverse: z.boolean() }).strict(),
]);

export const routeIntentSchema = z.object({
  id, name: id, purpose: z.enum(["transmit", "receive"]),
  /** Ordered, oriented hops describe intent; they never assert hardware state. */
  hops: z.array(routeHopSchema).min(1),
  analysis: z.discriminatedUnion("state", [
    z.object({ state: z.literal("candidate") }).strict(),
    z.object({ state: z.literal("documentation-only"), reasons: z.array(id).min(1) }).strict(),
  ]),
}).strict();

export const revisionTransitionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("initial") }).strict(),
  z.object({ kind: z.literal("edit") }).strict(),
  z.object({ kind: z.literal("clone"), sourceRevisionId: id }).strict(),
  z.object({ kind: z.literal("restore"), sourceRevisionId: id }).strict(),
]);

export const setupRevisionSchema = z.object({
  id, ownerId: id, setupId: id, parentRevisionId: id.nullable(), createdAt: instant,
  transition: revisionTransitionSchema.optional(),
  /** Resolved inputs are copied at revision creation. Later shared edits cannot rewrite them. */
  equipment: z.array(equipmentInstanceSchema), models: z.array(equipmentModelSchema),
  evidence: z.array(evidenceSchema), location: locationSchema.nullable(),
  connections: z.array(connectionSchema), cableRuns: z.array(cableRunSchema), routes: z.array(routeIntentSchema),
  settings: z.object({ frequencyHz: quantitySchema, requestedPowerWatts: quantitySchema, mode: z.string().nullable(), bandId: id.nullable().optional() }).strict(),
  notes: z.string(),
}).strict();

export const layoutSchema = z.object({
  id, ownerId: id, setupId: id, revisionId: id, view: z.enum(["diagram", "rack", "list"]),
  itemOrder: z.array(id).optional(),
  preferences: z.object({ showLabels: z.boolean().optional(), showPorts: z.boolean().optional(), showGrid: z.boolean().optional(), snapToGrid: z.boolean().optional() }).strict().optional(),
  positions: z.array(z.object({ instanceId: id, x: finite, y: finite, groupId: id.nullable() }).strict()),
  groups: z.array(z.object({ id, label: id }).strict()),
  viewport: z.object({ x: finite, y: finite, zoom: finite.positive() }).strict(),
}).strict();

export const experimentSchema = z.object({
  id, ownerId: id, name: id, baselineRevisionId: id, candidateRevisionId: id,
  comparison: z.object({ frequencyHz: finite.positive(), requestedPowerWatts: nonnegative, mode: id }).strict(),
  /** Deliberately not evidence: a scenario assumption cannot become a measurement. */
  assumptions: z.array(z.object({ instanceId: id, field: id, value: finite, unit: id, rationale: id }).strict()),
  notes: z.string(), promotionDefault: z.literal("save-as-new-setup"),
}).strict();

export const operatingSelectionSchema = z.object({
  ownerId: id, setupId: id, revisionId: id, routeId: id, reviewedAt: instant,
  /** Hardware connectivity/telemetry belongs to a separate consumer contract. */
  intent: z.literal("use-in-propulse"),
}).strict();

/** Output contract only. W05 must authorize audience and media before constructing this value. */
export const publishedProfileSchema = z.object({
  id, ownerId: id, publicationVersion: z.number().int().positive().safe(),
  audience: z.enum(["owner", "visitor", "friend"]), displayName: id, biography: z.string(),
  featuredSetup: z.object({ title: id, equipmentLabels: z.array(id), description: z.string() }).strict().nullable(),
  regionLabel: z.string().nullable(), publicMediaIds: z.array(id),
  modules: z.array(z.object({ id, kind: z.enum(["identity", "interests", "station", "activity", "projects", "qsl"]), title: id, text: z.string() }).strict()),
}).strict();

/** Private reviewed source lineage. Public DTOs deliberately omit working setup/revision IDs. */
export const publicationSourceSchema = z.object({
  id, ownerId: id, setupId: id, revisionId: id, audience: z.enum(["owner", "visitor", "friend"]),
  publicationVersion: z.number().int().positive().safe(), reviewedAt: instant,
}).strict();

const archiveObjectSchema = z.object({
  schemaVersion: z.literal(1), ownerId: id,
  models: z.array(equipmentModelSchema), inventory: z.array(equipmentInstanceSchema),
  evidence: z.array(evidenceSchema), locations: z.array(locationSchema), setups: z.array(setupSchema),
  revisions: z.array(setupRevisionSchema), layouts: z.array(layoutSchema),
  experiments: z.array(experimentSchema), operating: operatingSelectionSchema.nullable(),
  publications: z.array(publicationSourceSchema),
}).strict();

export type EquipmentInstance = z.infer<typeof equipmentInstanceSchema>;
export type EquipmentModel = z.infer<typeof equipmentModelSchema>;
export type EquipmentPort = z.infer<typeof portSchema>;
export type EquipmentInternalPath = z.infer<typeof internalPathSchema>;
export type EquipmentPrivateMetadata = z.infer<typeof equipmentPrivateMetadataSchema>;
export type Setup = z.infer<typeof setupSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type RevisionTransition = z.infer<typeof revisionTransitionSchema>;
export type SetupRevision = z.infer<typeof setupRevisionSchema>;
export type WorkbenchArchive = z.infer<typeof archiveObjectSchema>;
export type RouteIntent = z.infer<typeof routeIntentSchema>;
export type Quantity = z.infer<typeof quantitySchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type LegacyRecord = z.infer<typeof legacyRecordSchema>;
export type Endpoint = z.infer<typeof endpoint>;

const sameEndpoint = (a: Endpoint, b: Endpoint) => a.instanceId === b.instanceId && a.portId === b.portId;

/** Structural validity is not electrical compatibility or a supported engine result. */
export const workbenchArchiveSchema = archiveObjectSchema.superRefine((archive, ctx) => {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  const unique = <T extends { id: string }>(rows: T[], label: string) => {
    const map = new Map<string, T>();
    rows.forEach((row) => {
      if (map.has(row.id)) issue(`Duplicate ${label} ID: ${row.id}`);
      map.set(row.id, row);
    });
    return map;
  };
  const owned = (row: { ownerId: string }) => {
    if (row.ownerId !== archive.ownerId) issue("Cross-owner reference or record");
  };
  const models = unique(archive.models, "model");
  const inventory = unique(archive.inventory, "inventory");
  const evidence = unique(archive.evidence, "evidence");
  const locations = unique(archive.locations, "location");
  const setups = unique(archive.setups, "setup");
  const revisions = unique(archive.revisions, "revision");
  unique(archive.layouts, "layout");
  unique(archive.experiments, "experiment");
  unique(archive.publications, "publication source");
  const checkFields = (fields: EquipmentFields, kind: EquipmentKind, available: Map<string, Evidence>, subject?: { instanceId: string; portId?: string }, portRating = false) => {
    validateEquipmentFields(fields, kind).forEach((diagnostic) => issue(diagnostic.message, diagnostic.path));
    Object.entries(fields).forEach(([key, field]) => {
      if (key.startsWith("port.") && !portRating) issue(`Port field must be attached to a specific port: ${key}`);
      if (field.state === "unknown") return;
      const source = available.get(field.evidenceId);
      if (!source) { issue(`Missing field evidence: ${field.evidenceId}`); return; }
      if (key.startsWith("radio.testedSpecs.") && (source.kind !== "report" || source.reportType !== "independent-test")) issue(`Tested catalog field requires independently attributed report: ${key}`);
      if (key.startsWith("radio.receiver.") && source.kind === "report" && source.reportType !== "manufacturer") issue(`Factory receiver field cannot cite a tested report: ${key}`);
      if (source.kind !== "measurement") return;
      const definition = EQUIPMENT_FIELD_REGISTRY[key];
      if (typeof field.value !== "number" || definition?.valueKind !== "number") { issue(`Scalar measurement cannot establish a composite or categorical field: ${key}`); return; }
      if (!subject || source.point.instanceId !== subject.instanceId || (subject.portId !== undefined && (source.point.kind !== "port" || source.point.portId !== subject.portId))) issue(`Measurement belongs to a different field subject: ${key}`);
      if (source.reading.value !== field.value || source.reading.unit !== field.unit) issue(`Field differs from measured reading: ${key}`);
      if (source.quantityKind !== definition.measurementKind) issue(`Measurement quantity kind does not establish ${key}`);
      if (definition.frequencyDependent && source.context.kind !== "rf") issue(`Field measurement requires RF frequency: ${key}`);
    });
  };
  const checkFacts = (facts: Record<string, Quantity>, available: Map<string, Evidence>, subject?: { instanceId: string; portId?: string }, kind?: EquipmentKind, fields: EquipmentFields = {}, portRating = false) => {
    if (kind) {
      validateEquipmentNumericFacts(facts, kind, fields).forEach((diagnostic) => issue(diagnostic.message, diagnostic.path));
      const normalized: EquipmentFields = {};
      Object.entries(facts).forEach(([key, fact]) => { normalized[canonicalEquipmentFactId(key, kind, fact.state === "known" ? fact.unit : undefined)] = fact; });
      checkFields(normalized, kind, available, subject, portRating);
    }
    Object.values(facts).forEach((fact) => {
      if (fact.state === "known" && !available.has(fact.evidenceId)) issue(`Missing evidence: ${fact.evidenceId}`);
      if (fact.state === "known") {
        const source = available.get(fact.evidenceId);
        if (source?.kind === "measurement" && (source.reading.value !== fact.value || source.reading.unit !== fact.unit)) issue(`Fact differs from measured reading: ${fact.evidenceId}`);
        if (source?.kind === "measurement" && (!subject || source.point.instanceId !== subject.instanceId || (subject.portId !== undefined && (source.point.kind !== "port" || source.point.portId !== subject.portId)))) issue(`Measurement belongs to a different subject: ${fact.evidenceId}`);
      }
    });
  };
  const checkInstance = (item: EquipmentInstance, available: Map<string, Evidence>, availableModels = models) => {
    owned(item);
    if ((item.lifecycle === "retired") !== (item.retiredAt !== undefined)) issue(`Retired lifecycle requires its timestamp and other lifecycles must not have one: ${item.id}`);
    if (item.retiredAt && Date.parse(item.retiredAt) < Date.parse(item.addedAt)) issue(`Retirement predates inventory addition: ${item.id}`);
    if (item.modelId !== null && !availableModels.has(item.modelId)) issue(`Missing model: ${item.modelId}`);
    if (item.modelId !== null && availableModels.has(item.modelId) && availableModels.get(item.modelId)?.kind !== item.kind) issue(`Model kind mismatch: ${item.id}`);
    const ports = unique(item.ports, "port");
    unique(item.internalPaths, "internal path");
    checkFields(item.fields ?? {}, item.kind, available, { instanceId: item.id });
    checkFacts(item.facts, available, { instanceId: item.id }, item.kind, item.fields);
    item.ports.forEach((port) => checkFacts(port.ratings, available, { instanceId: item.id, portId: port.id }, item.kind, {}, true));
    item.internalPaths.forEach((path) => {
      const from = ports.get(path.fromPortId);
      const to = ports.get(path.toPortId);
      if (!from || !to || from.id === to.id) issue(`Invalid internal path: ${path.id}`);
      if ([from, to].some((port) => port && port.signal !== "unknown" && port.signal !== path.signal)) issue(`Internal path signal mismatch: ${path.id}`);
    });
  };
  const checkEvidence = (rows: Evidence[], equipment: Map<string, EquipmentInstance>) => rows.forEach((row) => {
    owned(row);
    if (row.kind === "measurement") {
      const point = row.point;
      const measuredItem = equipment.get(point.instanceId);
      if (!measuredItem || (point.kind === "port" && !measuredItem.ports.some((port) => port.id === point.portId))) issue(`Missing measurement point: ${row.id}`);
    }
    if (row.kind === "measurement" && row.quantityKind !== "other" && row.context.kind !== "rf") issue(`RF measurement requires frequency: ${row.id}`);
    if (row.kind === "measurement") {
      const unit = { swr: "ratio", "antenna-gain": "dBi", "relative-gain": "dB", loss: "dB", "rf-power": "W", other: row.reading.unit }[row.quantityKind];
      if (row.reading.unit !== unit) issue(`Wrong measurement unit: ${row.id}`);
      if (row.quantityKind === "swr" && row.reading.value < 1) issue(`Invalid measured SWR: ${row.id}`);
      if (row.quantityKind === "rf-power" && row.reading.value < 0) issue(`Invalid measured power: ${row.id}`);
    }
  });
  const checkModel = (model: EquipmentModel, available: Map<string, Evidence>) => {
    unique(model.portTemplates, "model port");
    unique(model.internalPathTemplates ?? [], "model internal path");
    model.internalPathTemplates?.forEach((path) => {
      const from = model.portTemplates.find((port) => port.id === path.fromPortId);
      const to = model.portTemplates.find((port) => port.id === path.toPortId);
      if (!from || !to || from.id === to.id) issue(`Invalid model internal path: ${path.id}`);
      if ([from, to].some((port) => port && port.signal !== "unknown" && port.signal !== path.signal)) issue(`Model internal path signal mismatch: ${path.id}`);
    });
    checkFields(model.fields ?? {}, model.kind, available);
    checkFacts(model.specifications, available, undefined, model.kind, model.fields);
    model.portTemplates.forEach((port) => checkFacts(port.ratings, available, undefined, model.kind, {}, true));
    model.sourceReportIds?.forEach((reportId) => {
      if (available.get(reportId)?.kind !== "report") issue(`Missing model source report: ${reportId}`);
    });
    if (new Set(model.sourceReportIds).size !== (model.sourceReportIds?.length ?? 0)) issue(`Duplicate model source report: ${model.id}`);
  };
  archive.models.forEach((model) => checkModel(model, evidence));
  archive.inventory.forEach((item) => checkInstance(item, evidence));
  checkEvidence(archive.evidence, inventory);
  archive.locations.forEach(owned);
  archive.setups.forEach((setup) => {
    owned(setup);
    if (setup.locationId !== null && !locations.has(setup.locationId)) issue(`Missing location: ${setup.locationId}`);
    if (revisions.get(setup.draftRevisionId)?.setupId !== setup.id) issue(`Invalid draft revision: ${setup.id}`);
  });
  archive.revisions.forEach((revision) => {
    owned(revision);
    if (!setups.has(revision.setupId)) issue(`Missing setup: ${revision.setupId}`);
    if (revision.parentRevisionId !== null && revisions.get(revision.parentRevisionId)?.setupId !== revision.setupId) issue(`Invalid parent revision: ${revision.id}`);
    const transition = revision.transition;
    if (transition) {
      if ((transition.kind === "initial" || transition.kind === "clone") && revision.parentRevisionId !== null) issue(`Initial or cloned revision cannot have a parent: ${revision.id}`);
      if ((transition.kind === "edit" || transition.kind === "restore") && revision.parentRevisionId === null) issue(`Edited or restored revision requires a parent: ${revision.id}`);
      if (transition.kind === "clone" || transition.kind === "restore") {
        const source = revisions.get(transition.sourceRevisionId);
        if (!source || source.id === revision.id) issue(`Missing or self transition source: ${revision.id}`);
        else if (transition.kind === "restore" ? source.setupId !== revision.setupId : source.setupId === revision.setupId) issue(`Invalid transition source setup: ${revision.id}`);
      }
    }
    const equipment = unique(revision.equipment, "snapshot instance");
    const pinnedEvidence = unique(revision.evidence, "snapshot evidence");
    const pinnedModels = unique(revision.models, "snapshot model");
    revision.models.forEach((model) => checkModel(model, pinnedEvidence));
    if (revision.location) {
      owned(revision.location);
      if (!locations.has(revision.location.id)) issue(`Missing location identity: ${revision.location.id}`);
    }
    revision.equipment.forEach((item) => {
      if (!inventory.has(item.id)) issue(`Missing physical instance: ${item.id}`);
      checkInstance(item, pinnedEvidence, pinnedModels);
    });
    checkEvidence(revision.evidence, equipment);
    checkFacts({ frequency: revision.settings.frequencyHz, power: revision.settings.requestedPowerWatts }, pinnedEvidence);
    if (revision.settings.frequencyHz.state === "known" && (revision.settings.frequencyHz.unit !== "Hz" || revision.settings.frequencyHz.value <= 0)) issue("Frequency must be positive Hz");
    if (revision.settings.requestedPowerWatts.state === "known" && (revision.settings.requestedPowerWatts.unit !== "W" || revision.settings.requestedPowerWatts.value < 0)) issue("Requested power must be nonnegative W");
    const connections = unique(revision.connections, "connection");
    const cableRuns = unique(revision.cableRuns, "cable run");
    unique(revision.routes, "route");
    const portAt = (point: Endpoint) => equipment.get(point.instanceId)?.ports.find((port) => port.id === point.portId);
    const boundCables = new Set<string>();
    const boundCableEnds = new Set<string>();
    revision.connections.forEach((connection) => {
      const from = portAt(connection.from);
      const to = portAt(connection.to);
      if (!from || !to || sameEndpoint(connection.from, connection.to)) issue(`Invalid connection endpoint: ${connection.id}`);
      if ([from, to].some((port) => port && port.signal !== "unknown" && port.signal !== connection.signal)) issue(`Connection signal mismatch: ${connection.id}`);
      if (connection.runId !== null && !cableRuns.get(connection.runId)?.connections.some((segment) => segment.connectionId === connection.id)) issue(`Invalid connection run reference: ${connection.id}`);
      const mating = connection.connectorInterface;
      if (mating?.kind === "cable") {
        const run = connection.runId === null ? undefined : cableRuns.get(connection.runId);
        const cable = run?.baseCableInstanceId ? equipment.get(run.baseCableInstanceId) : undefined;
        const from = cable?.ports.find((port) => port.id === mating.fromPortId);
        const to = cable?.ports.find((port) => port.id === mating.toPortId);
        const path = cable?.internalPaths.find((item) => item.id === mating.internalPathId);
        if (!cable || cable.kind !== "cable" || connection.from.instanceId === cable.id || connection.to.instanceId === cable.id || !from || !to || from.id === to.id || !path
          || !((path.fromPortId === from.id && path.toPortId === to.id) || (path.fromPortId === to.id && path.toPortId === from.id))
          || (path.signal !== "unknown" && path.signal !== connection.signal) || (from.signal !== "unknown" && from.signal !== connection.signal) || (to.signal !== "unknown" && to.signal !== connection.signal)) {
          issue(`Invalid cable connector interface: ${connection.id}`);
        }
        if (cable) {
          if (boundCables.has(cable.id)) issue(`Physical cable is bound to multiple connections: ${cable.id}`);
          boundCables.add(cable.id);
          boundCableEnds.add(JSON.stringify([cable.id, mating.fromPortId]));
          boundCableEnds.add(JSON.stringify([cable.id, mating.toPortId]));
        }
      }
    });
    revision.connections.forEach((connection) => {
      if ([connection.from, connection.to].some((point) => boundCableEnds.has(JSON.stringify([point.instanceId, point.portId])))) {
        issue(`Bound cable termination is also an explicit connection endpoint: ${connection.id}`);
      }
    });
    const runBaseOwners = new Set<string>();
    revision.cableRuns.forEach((run) => {
      if (run.baseCableInstanceId !== null) {
        if (runBaseOwners.has(run.baseCableInstanceId)) issue(`Physical cable belongs to multiple runs: ${run.baseCableInstanceId}`);
        runBaseOwners.add(run.baseCableInstanceId);
      }
      if (run.baseCableInstanceId !== null && equipment.get(run.baseCableInstanceId)?.kind !== "cable") issue(`Missing or non-cable run base: ${run.id}`);
      if (run.baseCableInstanceId !== null && run.connections.every((segment) => connections.get(segment.connectionId)?.connectorInterface?.kind === "direct")) issue(`Cable run cannot describe only direct mating interfaces: ${run.id}`);
      checkFacts({ length: run.lengthMeters }, pinnedEvidence, run.baseCableInstanceId === null ? undefined : { instanceId: run.baseCableInstanceId });
      if (run.lengthMeters.state === "known" && (run.lengthMeters.unit !== "m" || run.lengthMeters.value < 0)) issue("Cable run length must be nonnegative meters");
      if (run.connections.length !== run.inlineItems.length + 1) issue(`Cable run requires one connection around each inline item: ${run.id}`);
      const seenConnections = new Set<string>();
      const seenInline = new Set<string>();
      let previous: Endpoint | undefined;
      run.connections.forEach((segment, index) => {
        if (seenConnections.has(segment.connectionId)) issue(`Repeated cable run connection: ${run.id}`);
        seenConnections.add(segment.connectionId);
        const connection = connections.get(segment.connectionId);
        if (!connection || connection.runId !== run.id) { issue(`Invalid cable run connection: ${run.id}`); return; }
        if (connection.signal !== run.signal) issue(`Cable run signal mismatch: ${run.id}`);
        const from = segment.reverse ? connection.to : connection.from;
        const to = segment.reverse ? connection.from : connection.to;
        if (previous && !sameEndpoint(previous, from)) issue(`Disconnected cable run: ${run.id}`);
        previous = to;
        const inline = run.inlineItems[index];
        if (inline) {
          if (seenInline.has(inline.instanceId)) issue(`Repeated cable run inline item: ${run.id}`);
          seenInline.add(inline.instanceId);
          const item = equipment.get(inline.instanceId);
          const path = item?.internalPaths.find((candidate) => candidate.id === inline.internalPathId);
          if (item?.kind !== "inline" || !path) { issue(`Invalid cable run inline item: ${run.id}`); return; }
          if (path.signal !== run.signal) issue(`Cable run inline signal mismatch: ${run.id}`);
          const input = { instanceId: item.id, portId: inline.reverse ? path.toPortId : path.fromPortId };
          const output = { instanceId: item.id, portId: inline.reverse ? path.fromPortId : path.toPortId };
          if (!sameEndpoint(to, input)) issue(`Incorrect cable run inline order: ${run.id}`);
          previous = output;
        }
      });
    });
    revision.routes.forEach((route) => {
      let previous: Endpoint | undefined;
      const usedHops = new Set<string>();
      const selectedGroups = new Set<string>();
      route.hops.forEach((hop) => {
        let from: Endpoint | undefined;
        let to: Endpoint | undefined;
        let hopSignal: string | undefined;
        const key = JSON.stringify(hop.kind === "connection" ? ["connection", hop.connectionId] : ["internal", hop.instanceId, hop.internalPathId]);
        if (usedHops.has(key)) issue(`Repeated route hop: ${route.id}`);
        usedHops.add(key);
        if (hop.kind === "connection") {
          const connection = connections.get(hop.connectionId);
          if (connection) { from = connection.from; to = connection.to; hopSignal = connection.signal; }
        } else {
          const path = equipment.get(hop.instanceId)?.internalPaths.find((item) => item.id === hop.internalPathId);
          if (path) {
            from = { instanceId: hop.instanceId, portId: path.fromPortId };
            to = { instanceId: hop.instanceId, portId: path.toPortId };
            hopSignal = path.signal;
            if (path.exclusiveGroupId) {
              const group = JSON.stringify([hop.instanceId, path.exclusiveGroupId]);
              if (selectedGroups.has(group) && route.analysis.state === "candidate") issue(`Exclusive route conflict: ${route.id}`);
              selectedGroups.add(group);
            }
          }
        }
        if (!from || !to) { issue(`Missing route hop: ${route.id}`); return; }
        if (hop.reverse) [from, to] = [to, from];
        if (previous && !sameEndpoint(previous, from)) issue(`Disconnected route: ${route.id}`);
        if (hopSignal !== "rf") issue(`Non-RF route hop: ${route.id}`);
        if (route.analysis.state === "candidate" && [from, to].some((point) => {
          const externalCount = revision.connections.filter((connection) => connection.signal === "rf" && (sameEndpoint(connection.from, point) || sameEndpoint(connection.to, point))).length;
          const paths = equipment.get(point.instanceId)?.internalPaths.filter((path) => path.signal === "rf" && (path.fromPortId === point.portId || path.toPortId === point.portId)) ?? [];
          const internalChoices = new Set(paths.map((path) => JSON.stringify(path.exclusiveGroupId ? ["group", path.exclusiveGroupId] : ["path", path.id])));
          return externalCount > 1 || internalChoices.size > 1;
        })) issue(`Unmodeled RF branch: ${route.id}`);
        previous = to;
      });
    });
  });
  // Parent and source provenance jointly form history; neither edge may point back into itself.
  const checkedHistory = new Set<string>();
  const visitingHistory = new Set<string>();
  for (const start of archive.revisions) {
    if (checkedHistory.has(start.id)) continue;
    const stack: { id: string; exiting: boolean }[] = [{ id: start.id, exiting: false }];
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exiting) {
        visitingHistory.delete(frame.id);
        checkedHistory.add(frame.id);
        continue;
      }
      if (visitingHistory.has(frame.id)) { issue(`Revision provenance cycle: ${frame.id}`); continue; }
      if (checkedHistory.has(frame.id)) continue;
      const revision = revisions.get(frame.id);
      if (!revision) continue;
      visitingHistory.add(frame.id);
      stack.push({ id: frame.id, exiting: true });
      if (revision.transition?.kind === "clone" || revision.transition?.kind === "restore") stack.push({ id: revision.transition.sourceRevisionId, exiting: false });
      if (revision.parentRevisionId) stack.push({ id: revision.parentRevisionId, exiting: false });
    }
  }
  archive.layouts.forEach((layout) => {
    owned(layout);
    const revision = revisions.get(layout.revisionId);
    if (!revision || revision.setupId !== layout.setupId) issue(`Invalid layout revision: ${layout.id}`);
    if (layout.itemOrder !== undefined) {
      const order = new Set(layout.itemOrder);
      if (order.size !== layout.itemOrder.length || order.size !== revision?.equipment.length
        || revision.equipment.some((item) => !order.has(item.id))) issue(`Layout order must include every revision item exactly once: ${layout.id}`);
    }
    const groups = unique(layout.groups, "layout group");
    const positions = new Set<string>();
    layout.positions.forEach((position) => {
      if (positions.has(position.instanceId)) issue(`Duplicate layout position: ${position.instanceId}`);
      positions.add(position.instanceId);
      if (!revision?.equipment.some((item) => item.id === position.instanceId)) issue(`Missing layout equipment: ${position.instanceId}`);
      if (position.groupId !== null && !groups.has(position.groupId)) issue(`Missing layout group: ${position.groupId}`);
    });
  });
  archive.experiments.forEach((experiment) => {
    owned(experiment);
    const baseline = revisions.get(experiment.baselineRevisionId);
    const candidate = revisions.get(experiment.candidateRevisionId);
    if (!baseline || !candidate || baseline.id === candidate.id || baseline.setupId !== candidate.setupId) issue(`Invalid experiment revisions: ${experiment.id}`);
    experiment.assumptions.forEach((assumption) => {
      if (!candidate?.equipment.some((item) => item.id === assumption.instanceId)) issue(`Missing experiment equipment: ${assumption.instanceId}`);
    });
  });
  archive.publications.forEach((publication) => {
    owned(publication);
    if (revisions.get(publication.revisionId)?.setupId !== publication.setupId) issue(`Invalid publication source: ${publication.id}`);
  });
  if (archive.operating) {
    owned(archive.operating);
    const revision = revisions.get(archive.operating.revisionId);
    const route = revision?.routes.find((item) => item.id === archive.operating?.routeId);
    if (!revision || revision.setupId !== archive.operating.setupId || !route) issue("Invalid operating selection");
    if (route?.analysis.state !== "candidate") issue("Documentation-only route cannot be operating selection");
  }
});

export type DeepReadonly<T> = T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** Parse creates an independent copy; recursive freeze enforces revision isolation at runtime. */
export function parseWorkbenchArchive(input: unknown): DeepReadonly<WorkbenchArchive> {
  const parsed = workbenchArchiveSchema.parse(input);
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(parsed);
  return parsed;
}
