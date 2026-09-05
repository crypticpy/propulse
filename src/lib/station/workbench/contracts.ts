/** W01 executable contracts. No store, hardware, engine, or publication side effects. */
import { z } from "zod";

const id = z.string().trim().min(1);
const instant = z.string().datetime({ offset: true });
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const signal = z.enum(["rf", "power", "audio", "control", "bonding", "unknown"]);
const equipmentKind = z.enum(["radio", "antenna", "cable", "inline", "accessory", "other"]);
const endpoint = z.object({ instanceId: id, portId: id }).strict();

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const jsonValue: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), finite, z.string(), z.array(jsonValue), z.record(jsonValue),
]));

/** Known zero is valid; missing information never coerces to zero. */
export const quantitySchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unknown"), reason: id }).strict(),
  z.object({
    state: z.literal("known"), value: finite, unit: id,
    evidenceId: id,
  }).strict(),
]);

export const evidenceSchema = z.discriminatedUnion("kind", [
  z.object({
    id, ownerId: id, kind: z.literal("measurement"), source: id,
    observedAt: instant, point: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("port"), instanceId: id, portId: id }).strict(),
      z.object({ kind: z.literal("equipment"), instanceId: id, description: id }).strict(),
    ]),
    reading: z.object({ value: finite, unit: id }).strict(),
    quantityKind: z.enum(["swr", "gain", "loss", "rf-power", "other"]),
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
]);

export const portSchema = z.object({
  id, label: id, signal,
  direction: z.enum(["input", "output", "bidirectional", "unknown"]),
  role: z.enum(["source", "load", "through", "switch-common", "switch-throw", "unknown"]),
  connector: z.discriminatedUnion("state", [
    z.object({ state: z.literal("unknown") }).strict(),
    z.object({ state: z.literal("known"), family: id, gender: z.enum(["male", "female", "genderless", "unknown"]) }).strict(),
  ]),
  ratings: z.record(quantitySchema),
}).strict();

const internalPathSchema = z.object({
  id, fromPortId: id, toPortId: id, signal,
  /** At most one path in this group may occur in a selected route. */
  exclusiveGroupId: id.optional(),
}).strict();

export const equipmentModelSchema = z.object({
  id, origin: z.enum(["catalog", "custom", "homebrew", "legacy"]),
  manufacturer: z.string().optional(), name: id,
  kind: equipmentKind,
  portTemplates: z.array(portSchema), specifications: z.record(quantitySchema),
}).strict();

/** Private recovery envelope, never a public projection field. JSON values are retained verbatim. */
export const legacyRecordSchema = z.object({
  kind: z.enum(["radio", "antenna", "feedline", "inline", "accessory", "chain", "preset", "profile", "location"]),
  sourceId: id, sourceVersion: z.number().int().nonnegative(), payload: z.record(jsonValue),
}).strict();

export const equipmentInstanceSchema = z.object({
  id, ownerId: id, modelId: id.nullable(), label: id, kind: equipmentKind,
  lifecycle: z.enum(["owned", "borrowed", "planned", "retired"]),
  addedAt: instant, ports: z.array(portSchema), internalPaths: z.array(internalPathSchema),
  facts: z.record(quantitySchema),
  privateMetadata: z.object({
    serialNumber: z.string().optional(), purchaseDate: z.string().optional(),
    purchaseLocation: z.string().optional(), firmwareRevision: z.string().optional(),
    wiringConfiguration: z.string().optional(), notes: z.string().optional(),
    receiptMediaIds: z.array(id), imageIds: z.array(id),
    specPreference: z.enum(["global", "factory", "tested"]).optional(),
  }).strict(),
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
  /** The actual physical cable, when known. Inline devices have their own ports/nodes. */
  cableInstanceId: id.nullable(), label: id, lengthMeters: quantitySchema,
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

export const setupRevisionSchema = z.object({
  id, ownerId: id, setupId: id, parentRevisionId: id.nullable(), createdAt: instant,
  /** Resolved inputs are copied at revision creation. Later shared edits cannot rewrite them. */
  equipment: z.array(equipmentInstanceSchema), models: z.array(equipmentModelSchema),
  evidence: z.array(evidenceSchema), location: locationSchema.nullable(),
  connections: z.array(connectionSchema), routes: z.array(routeIntentSchema),
  settings: z.object({ frequencyHz: quantitySchema, requestedPowerWatts: quantitySchema, mode: z.string().nullable() }).strict(),
  notes: z.string(),
}).strict();

export const layoutSchema = z.object({
  id, ownerId: id, setupId: id, revisionId: id, view: z.enum(["diagram", "rack"]),
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
  id, ownerId: id, publicationVersion: z.number().int().positive(),
  audience: z.enum(["visitor", "friend"]), displayName: id, biography: z.string(),
  featuredSetup: z.object({ title: id, equipmentLabels: z.array(id), description: z.string() }).strict().nullable(),
  regionLabel: z.string().nullable(), publicMediaIds: z.array(id),
  modules: z.array(z.object({ id, kind: z.enum(["identity", "interests", "station", "activity", "projects", "qsl"]), title: id, text: z.string() }).strict()),
}).strict();

/** Private reviewed source lineage. Public DTOs deliberately omit working setup/revision IDs. */
export const publicationSourceSchema = z.object({
  id, ownerId: id, setupId: id, revisionId: id, audience: z.enum(["visitor", "friend"]),
  publicationVersion: z.number().int().positive(), reviewedAt: instant,
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
  const checkFacts = (facts: Record<string, Quantity>, available: Map<string, Evidence>) => {
    Object.values(facts).forEach((fact) => {
      if (fact.state === "known" && !available.has(fact.evidenceId)) issue(`Missing evidence: ${fact.evidenceId}`);
      if (fact.state === "known") {
        const source = available.get(fact.evidenceId);
        if (source?.kind === "measurement" && (source.reading.value !== fact.value || source.reading.unit !== fact.unit)) issue(`Fact differs from measured reading: ${fact.evidenceId}`);
      }
    });
  };
  const checkInstance = (item: EquipmentInstance, available: Map<string, Evidence>, availableModels = models) => {
    owned(item);
    if (item.modelId !== null && !availableModels.has(item.modelId)) issue(`Missing model: ${item.modelId}`);
    if (item.modelId !== null && availableModels.has(item.modelId) && availableModels.get(item.modelId)?.kind !== item.kind) issue(`Model kind mismatch: ${item.id}`);
    const ports = unique(item.ports, "port");
    unique(item.internalPaths, "internal path");
    checkFacts(item.facts, available);
    item.ports.forEach((port) => checkFacts(port.ratings, available));
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
      const unit = { swr: "ratio", gain: "dBi", loss: "dB", "rf-power": "W", other: row.reading.unit }[row.quantityKind];
      if (row.reading.unit !== unit) issue(`Wrong measurement unit: ${row.id}`);
      if (row.quantityKind === "swr" && row.reading.value < 1) issue(`Invalid measured SWR: ${row.id}`);
      if (row.quantityKind === "rf-power" && row.reading.value < 0) issue(`Invalid measured power: ${row.id}`);
    }
  });
  archive.models.forEach((model) => {
    unique(model.portTemplates, "model port");
    checkFacts(model.specifications, evidence);
    model.portTemplates.forEach((port) => checkFacts(port.ratings, evidence));
  });
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
    const ancestors = new Set([revision.id]);
    let ancestorId = revision.parentRevisionId;
    while (ancestorId) {
      if (ancestors.has(ancestorId)) { issue(`Revision ancestry cycle: ${revision.id}`); break; }
      ancestors.add(ancestorId);
      ancestorId = revisions.get(ancestorId)?.parentRevisionId ?? null;
    }
    const equipment = unique(revision.equipment, "snapshot instance");
    const pinnedEvidence = unique(revision.evidence, "snapshot evidence");
    const pinnedModels = unique(revision.models, "snapshot model");
    revision.models.forEach((model) => {
      unique(model.portTemplates, "snapshot model port");
      checkFacts(model.specifications, pinnedEvidence);
      model.portTemplates.forEach((port) => checkFacts(port.ratings, pinnedEvidence));
    });
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
    unique(revision.routes, "route");
    const portAt = (point: Endpoint) => equipment.get(point.instanceId)?.ports.find((port) => port.id === point.portId);
    revision.connections.forEach((connection) => {
      const from = portAt(connection.from);
      const to = portAt(connection.to);
      if (!from || !to || sameEndpoint(connection.from, connection.to)) issue(`Invalid connection endpoint: ${connection.id}`);
      if ([from, to].some((port) => port && port.signal !== "unknown" && port.signal !== connection.signal)) issue(`Connection signal mismatch: ${connection.id}`);
      if (connection.cableInstanceId !== null && equipment.get(connection.cableInstanceId)?.kind !== "cable") issue(`Missing or non-cable snapshot: ${connection.id}`);
      checkFacts({ length: connection.lengthMeters }, pinnedEvidence);
      if (connection.lengthMeters.state === "known" && (connection.lengthMeters.unit !== "m" || connection.lengthMeters.value < 0)) issue("Cable length must be nonnegative meters");
    });
    revision.routes.forEach((route) => {
      let previous: Endpoint | undefined;
      const usedHops = new Set<string>();
      const selectedGroups = new Set<string>();
      route.hops.forEach((hop) => {
        let from: Endpoint | undefined;
        let to: Endpoint | undefined;
        let hopSignal: string | undefined;
        const key = hop.kind === "connection" ? `c:${hop.connectionId}` : `i:${hop.instanceId}:${hop.internalPathId}`;
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
              const group = `${hop.instanceId}:${path.exclusiveGroupId}`;
              if (selectedGroups.has(group) && route.analysis.state === "candidate") issue(`Exclusive route conflict: ${route.id}`);
              selectedGroups.add(group);
            }
          }
        }
        if (!from || !to) { issue(`Missing route hop: ${route.id}`); return; }
        if (hop.reverse) [from, to] = [to, from];
        if (previous && !sameEndpoint(previous, from)) issue(`Disconnected route: ${route.id}`);
        if (hopSignal !== "rf") issue(`Non-RF route hop: ${route.id}`);
        if (route.analysis.state === "candidate" && [from, to].some((point) => revision.connections.filter((connection) => sameEndpoint(connection.from, point) || sameEndpoint(connection.to, point)).length > 1)) issue(`Unmodeled RF branch: ${route.id}`);
        previous = to;
      });
    });
  });
  archive.layouts.forEach((layout) => {
    owned(layout);
    const revision = revisions.get(layout.revisionId);
    if (!revision || revision.setupId !== layout.setupId) issue(`Invalid layout revision: ${layout.id}`);
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
    if (!baseline || !candidate || baseline.id === candidate.id) issue(`Invalid experiment revisions: ${experiment.id}`);
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
