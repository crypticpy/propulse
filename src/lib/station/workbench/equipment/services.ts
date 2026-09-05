/** Pure W02 preparation/read services. Callers own persistence and reviewed promotion. */
import { z } from "zod";
import {
  equipmentInstanceSchema, equipmentModelSchema, parseWorkbenchArchive,
  type DeepReadonly, type EquipmentInstance, type EquipmentModel, type EquipmentPort,
  type EquipmentInternalPath, type Evidence, type WorkbenchArchive,
} from "@/lib/station/workbench/contracts";
import { parseEquipmentFields, validateEquipmentNumericFacts } from "@/lib/station/workbench/equipment/registry";
import type { EquipmentFieldValue } from "@/lib/station/workbench/equipment/types";

type Archive = DeepReadonly<WorkbenchArchive>;
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function checkLifecycle(item: DeepReadonly<EquipmentInstance>): void {
  if (item.lifecycle === "retired" && !item.retiredAt) throw new Error("Retired equipment requires its retirement date");
  if (item.lifecycle !== "retired" && item.retiredAt) throw new Error("Only retired equipment can have a retirement date");
  if (item.retiredAt && Date.parse(item.retiredAt) < Date.parse(item.addedAt)) throw new Error("Retirement cannot precede addition");
}

function immutable<T>(value: T): DeepReadonly<T> {
  const copy: T = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy as DeepReadonly<T>;
}

const stableId = z.string().trim().min(1);
const portMappingSchema = z.object({
  portIds: z.record(stableId, stableId), pathIds: z.record(stableId, stableId),
}).strict();

/** Map validated template structure/units; aggregate validation still owns evidence references.
 * Caller generates IDs once. Neither array order nor labels determine endpoint identity. */
export function instantiateModelPorts(modelInput: unknown, mappingInput: unknown): DeepReadonly<{
  ports: EquipmentPort[]; internalPaths: EquipmentInternalPath[];
}> {
  const model = equipmentModelSchema.parse(modelInput);
  parseEquipmentFields(model.fields ?? {}, model.kind);
  if (model.portTemplates.some((port) => Object.keys(port.ratings).some((key) => !key.startsWith("port.")))) {
    throw new Error("Port templates require canonical port.* rating keys");
  }
  const diagnostics = [
    ...validateEquipmentNumericFacts(model.specifications, model.kind, model.fields),
    ...model.portTemplates.flatMap((port) => validateEquipmentNumericFacts(port.ratings, model.kind)),
  ];
  if (diagnostics.length) throw new Error(diagnostics.map((entry) => entry.message).join("; "));
  const mapping = portMappingSchema.parse(mappingInput);
  const assertMapping = (ids: string[], values: Record<string, string>, label: string) => {
    if (new Set(ids).size !== ids.length || Object.keys(values).length !== ids.length
      || ids.some((id) => !hasOwn(values, id))
      || new Set(Object.values(values)).size !== ids.length) {
      throw new Error(`Every ${label} template requires one distinct explicit ID`);
    }
  };
  assertMapping(model.portTemplates.map((port) => port.id), mapping.portIds, "port");
  assertMapping((model.internalPathTemplates ?? []).map((path) => path.id), mapping.pathIds, "path");
  const ports = model.portTemplates.map((port) => ({ ...port, templateId: port.id, id: mapping.portIds[port.id] }));
  const internalPaths = (model.internalPathTemplates ?? []).map((path) => {
    if (!hasOwn(mapping.portIds, path.fromPortId) || !hasOwn(mapping.portIds, path.toPortId)
      || path.fromPortId === path.toPortId) throw new Error(`Invalid internal path template: ${path.id}`);
    const endpoints = model.portTemplates.filter((port) => port.id === path.fromPortId || port.id === path.toPortId);
    if (endpoints.some((port) => port.signal !== "unknown" && port.signal !== path.signal)) throw new Error(`Internal path signal mismatch: ${path.id}`);
    return { ...path, id: mapping.pathIds[path.id], fromPortId: mapping.portIds[path.fromPortId], toPortId: mapping.portIds[path.toPortId] };
  });
  return immutable({ ports, internalPaths });
}

/** Returns a validated detached item, not a changed archive or a persisted transaction. */
export function createEquipment(archive: Archive, input: unknown): DeepReadonly<EquipmentInstance> {
  const current = parseWorkbenchArchive(archive);
  const equipment = equipmentInstanceSchema.parse(input);
  parseEquipmentFields(equipment.fields ?? {}, equipment.kind);
  checkLifecycle(equipment);
  const next = parseWorkbenchArchive({ ...current, inventory: [...current.inventory, equipment] });
  return next.inventory[next.inventory.length - 1];
}

const clearablePrivateMetadataKeys = new Set(Object.entries(equipmentInstanceSchema.shape.privateMetadata.shape)
  .filter(([, schema]) => schema.isOptional()).map(([key]) => key));
const clearPrivateMetadataKeySchema = z.string().refine((key) => clearablePrivateMetadataKeys.has(key), {
  message: "Only optional private metadata fields can be cleared; replace required arrays with []",
});

const updateSchema = equipmentInstanceSchema.pick({
  modelId: true, label: true, ports: true, internalPaths: true, facts: true, fields: true,
}).partial().extend({
  privateMetadata: equipmentInstanceSchema.shape.privateMetadata.partial().optional(),
  lifecycle: z.enum(["owned", "borrowed", "planned"]).optional(),
  clearPrivateMetadata: z.array(clearPrivateMetadataKeySchema).optional(),
}).strict().superRefine((patch, ctx) => {
  const seen = new Set<string>();
  patch.clearPrivateMetadata?.forEach((key, index) => {
    if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clearPrivateMetadata", index], message: "Duplicate metadata clear request" });
    seen.add(key);
    if (hasOwn(patch.privateMetadata ?? {}, key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clearPrivateMetadata", index], message: `Cannot set and clear ${key} in the same update` });
  });
});

/** Omitted keys are preserved. Map/metadata patches merge; port/path arrays explicitly replace.
 * clearPrivateMetadata removes optional metadata only, never media blobs or required reference arrays. */
export function updateEquipment(archive: Archive, instanceId: string, patchInput: unknown): DeepReadonly<EquipmentInstance> {
  const current = parseWorkbenchArchive(archive);
  const index = current.inventory.findIndex((item) => item.id === instanceId);
  if (index < 0) throw new Error(`Unknown equipment: ${instanceId}`);
  const item = current.inventory[index];
  const patch = updateSchema.parse(patchInput);
  // Undefined means omitted, including explicit undefined supplied by JS callers.
  const { clearPrivateMetadata, ...changes } = patch;
  const clearKeys = new Set(clearPrivateMetadata ?? []);
  const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  const metadata = Object.fromEntries(Object.entries(patch.privateMetadata ?? {}).filter(([, value]) => value !== undefined));
  const nextItem = {
    ...item, ...defined,
    facts: { ...item.facts, ...patch.facts },
    ...(item.fields || patch.fields ? { fields: { ...item.fields, ...patch.fields } } : {}),
    privateMetadata: Object.fromEntries(Object.entries({ ...item.privateMetadata, ...metadata }).filter(([key]) => !clearKeys.has(key))),
    ...(patch.lifecycle ? { retiredAt: undefined } : {}),
  };
  parseEquipmentFields(nextItem.fields ?? {}, item.kind);
  checkLifecycle(equipmentInstanceSchema.parse(nextItem));
  const inventory = current.inventory.map((value, itemIndex) => itemIndex === index ? nextItem : value);
  return parseWorkbenchArchive({ ...current, inventory }).inventory[index];
}

/** Retirement preserves identity, photos, evidence and every referenced historical snapshot. */
export function retireEquipment(archive: Archive, instanceId: string, retiredAt: string): DeepReadonly<EquipmentInstance> {
  const current = parseWorkbenchArchive(archive);
  const index = current.inventory.findIndex((item) => item.id === instanceId);
  if (index < 0) throw new Error(`Unknown equipment: ${instanceId}`);
  const at = z.string().datetime({ offset: true }).parse(retiredAt);
  const item = current.inventory[index];
  if (Date.parse(at) < Date.parse(item.addedAt)) throw new Error("Retirement cannot precede addition");
  const inventory = current.inventory.map((value, itemIndex) => itemIndex === index
    ? { ...value, lifecycle: "retired", retiredAt: item.retiredAt ?? at } : value);
  return parseWorkbenchArchive({ ...current, inventory }).inventory[index];
}

const receiverMetricNames = ["rmdr", "imdr3", "blockingGain", "sensitivity", "noiseFloorDbm", "phaseNoiseDbcHz", "ip3Dbm"] as const;
export type ReceiverMetric = typeof receiverMetricNames[number];
export type CatalogSource = "factory" | "tested";
export interface CatalogReceiverSelection {
  requestedSource: CatalogSource;
  selectedSource: CatalogSource | "unknown";
  fallbackReason: string | null;
  fields: Record<ReceiverMetric, EquipmentFieldValue>;
  evidence: Evidence[];
  /** Complete model sourceReportIds bibliography; may overlap field evidence.
   * Membership does not establish a particular selected field or imply the selected source. */
  modelCitations: Extract<Evidence, { kind: "report" }>[];
}

/** Select a whole catalog group. Independent reports never become owner measurements. */
export function resolveCatalogReceiver(archive: Archive, instanceId: string, globalPreferTested: boolean): DeepReadonly<CatalogReceiverSelection> {
  const current = parseWorkbenchArchive(archive);
  const item = current.inventory.find((value) => value.id === instanceId);
  if (!item) throw new Error(`Unknown equipment: ${instanceId}`);
  if (item.kind !== "radio") throw new Error("Receiver specification selection requires a radio");
  const model = current.models.find((value) => value.id === item.modelId);
  const preference = item.privateMetadata.specPreference;
  const requestedSource = preference === "tested" || (preference !== "factory" && globalPreferTested) ? "tested" : "factory";
  const hasGroup = (source: CatalogSource) => receiverMetricNames.some((metric) =>
    model?.fields?.[`radio.${source === "tested" ? "testedSpecs" : "receiver"}.${metric}`]?.state === "known");
  const selectedSource = requestedSource === "tested" && hasGroup("tested") ? "tested" : hasGroup("factory") ? "factory" : "unknown";
  const evidenceIds = new Set<string>();
  const fields = Object.fromEntries(receiverMetricNames.map((metric) => {
    const field = selectedSource === "unknown" ? undefined : model?.fields?.[`radio.${selectedSource === "tested" ? "testedSpecs" : "receiver"}.${metric}`];
    if (field?.state === "known") evidenceIds.add(field.evidenceId);
    return [metric, field ?? { state: "unknown", reason: `No ${selectedSource === "unknown" ? "catalog" : selectedSource} ${metric} recorded` }];
  })) as Record<ReceiverMetric, EquipmentFieldValue>;
  return immutable({
    requestedSource, selectedSource,
    fallbackReason: selectedSource === requestedSource ? null : selectedSource === "unknown" ? "No requested or fallback catalog receiver group is available" : "Tested receiver group unavailable; using factory group",
    fields, evidence: current.evidence.filter((entry) => evidenceIds.has(entry.id)) as Evidence[],
    modelCitations: current.evidence.filter((entry) => entry.kind === "report" && model?.sourceReportIds?.includes(entry.id)) as Extract<Evidence, { kind: "report" }>[],
  });
}

export interface EquipmentUsage {
  kind: "draft" | "revision" | "experiment-baseline" | "experiment-candidate" | "operating" | "publication";
  referenceId: string;
  setupId: string;
  revisionId: string;
}

/** Owner-only impact input. This is not a public projection or a deletion permission. */
export function findEquipmentUsage(archive: Archive, instanceId: string, ownerId: string): DeepReadonly<EquipmentUsage[]> {
  const current = parseWorkbenchArchive(archive);
  if (current.ownerId !== ownerId) throw new Error("Equipment usage requires the owning account");
  if (!current.inventory.some((item) => item.id === instanceId)) throw new Error(`Unknown equipment: ${instanceId}`);
  const revisions = new Map(current.revisions.filter((revision) => revision.equipment.some((item) => item.id === instanceId)).map((revision) => [revision.id, revision]));
  const usages: EquipmentUsage[] = [];
  const add = (kind: EquipmentUsage["kind"], referenceId: string, revisionId: string) => {
    const revision = revisions.get(revisionId);
    if (revision) usages.push({ kind, referenceId, setupId: revision.setupId, revisionId });
  };
  revisions.forEach((revision) => add("revision", revision.id, revision.id));
  current.setups.forEach((setup) => add("draft", setup.id, setup.draftRevisionId));
  current.experiments.forEach((experiment) => {
    add("experiment-baseline", experiment.id, experiment.baselineRevisionId);
    add("experiment-candidate", experiment.id, experiment.candidateRevisionId);
  });
  if (current.operating) add("operating", current.operating.setupId, current.operating.revisionId);
  current.publications.forEach((publication) => add("publication", publication.id, publication.revisionId));
  return immutable(usages.sort((a, b) => a.kind.localeCompare(b.kind) || a.referenceId.localeCompare(b.referenceId) || a.revisionId.localeCompare(b.revisionId)));
}

// Re-exporting a type here keeps consumers from depending on the schema's internal inference.
export type { EquipmentModel };
