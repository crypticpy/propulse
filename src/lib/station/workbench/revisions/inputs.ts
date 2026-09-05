/** Pure W03 input capture and structural assessment; no storage, engine or operating writes. */
import { z } from "zod";
import {
  legacyRecordSchema, parseWorkbenchArchive, workbenchArchiveSchema,
  type DeepReadonly, type EquipmentInstance, type EquipmentModel, type LegacyRecord,
  type Quantity, type SetupRevision, type WorkbenchArchive,
} from "@/lib/station/workbench/contracts";
import type { EquipmentFields } from "@/lib/station/workbench/equipment/types";
import { captureLegacyRecord } from "@/lib/station/workbench/legacy";

type Archive = DeepReadonly<WorkbenchArchive>;
export type ResolvedRevisionInputs = Pick<SetupRevision, "equipment" | "models" | "evidence" | "location">;
export interface RevisionInputSelection {
  instanceIds: readonly string[];
  locationId: string | null;
  evidenceIds?: readonly string[];
}

const selectionSchema = z.object({
  instanceIds: z.array(z.string().min(1)), locationId: z.string().min(1).nullable(),
  evidenceIds: z.array(z.string().min(1)).optional(),
}).strict();

function immutable<T>(value: T): DeepReadonly<T> {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy as DeepReadonly<T>;
}

/** Resolve live inputs only for an explicit initial/edit proposal. Restore/clone use pinned inputs.
 * Pass settings/run-length sources explicitly in evidenceIds; no measurements are inferred. */
export function resolveRevisionInputs(archive: Archive, selectionInput: RevisionInputSelection): DeepReadonly<ResolvedRevisionInputs> {
  const current = parseWorkbenchArchive(archive);
  const selection = selectionSchema.parse(selectionInput);
  if (new Set(selection.instanceIds).size !== selection.instanceIds.length) throw new Error("Duplicate selected equipment identity");
  if (new Set(selection.evidenceIds).size !== (selection.evidenceIds?.length ?? 0)) throw new Error("Duplicate explicit evidence identity");
  const inventory = new Map(current.inventory.map((item) => [item.id, item]));
  const equipment = selection.instanceIds.map((instanceId) => {
    const item = inventory.get(instanceId);
    if (!item) throw new Error(`Missing selected equipment: ${instanceId}`);
    return item;
  });
  const modelIds = new Set(equipment.flatMap((item) => item.modelId === null ? [] : [item.modelId]));
  const models = current.models.filter((model) => modelIds.has(model.id));
  const evidenceIds = new Set(selection.evidenceIds ?? []);
  for (const evidenceId of evidenceIds) {
    const source = current.evidence.find((item) => item.id === evidenceId);
    if (!source) throw new Error(`Missing explicit evidence: ${evidenceId}`);
    if (source.kind === "measurement") {
      const point = source.point;
      const item = equipment.find((entry) => entry.id === point.instanceId);
      if (!item || (point.kind === "port" && !item.ports.some((port) => port.id === point.portId))) throw new Error(`Explicit measurement references unselected equipment or port: ${evidenceId}`);
    }
  }
  const collect = (fields: DeepReadonly<Record<string, Quantity>> | DeepReadonly<EquipmentFields> | undefined) => {
    Object.values(fields ?? {}).forEach((field) => { if (field.state === "known") evidenceIds.add(field.evidenceId); });
  };
  const collectEquipment = (item: DeepReadonly<EquipmentInstance>) => {
    collect(item.facts);
    collect(item.fields);
    item.ports.forEach((port) => collect(port.ratings));
  };
  const collectModel = (model: DeepReadonly<EquipmentModel>) => {
    collect(model.specifications);
    collect(model.fields);
    model.portTemplates.forEach((port) => collect(port.ratings));
    model.sourceReportIds?.forEach((reportId) => evidenceIds.add(reportId));
  };
  equipment.forEach(collectEquipment);
  models.forEach(collectModel);
  const location = selection.locationId === null ? null : current.locations.find((item) => item.id === selection.locationId);
  if (location === undefined) throw new Error(`Missing selected location: ${selection.locationId}`);
  return immutable({ equipment, models, evidence: current.evidence.filter((item) => evidenceIds.has(item.id)), location }) as DeepReadonly<ResolvedRevisionInputs>;
}

export interface TopologyDiagnostic {
  category: "invalid" | "incomplete" | "unsupported";
  code: "invalid-document" | "missing-revision" | "recovery-unavailable" | "empty-equipment" | "missing-route" | "unknown-input" | "unknown-port" | "documented-limit";
  message: string;
  path: (string | number)[];
  instanceId?: string;
  portId?: string;
  routeId?: string;
}

export interface TopologyAssessment {
  /** Candidate means structurally documented, never engine-supported or safe to operate. */
  status: "invalid" | "incomplete" | "unsupported" | "candidate";
  diagnostics: TopologyDiagnostic[];
  /** Owner-only original input for repair. Never include this in a public projection. */
  recovery: LegacyRecord | null;
}

export interface TopologyRecoveryContext { sourceId: string; sourceVersion: number }

/** Assess one revision without rewriting candidate flags, inventing connectors or measuring gear.
 * An invalid aggregate stays outside canonical topology, with its original JSON retained privately. */
export function assessRevisionTopology(
  input: unknown, revisionId: string, recoveryContext: TopologyRecoveryContext,
): DeepReadonly<TopologyAssessment> {
  const diagnostics: TopologyDiagnostic[] = [];
  const recover = (): DeepReadonly<TopologyAssessment> => {
    let recovery: LegacyRecord | null = null;
    try {
      const record = legacyRecordSchema.parse({
        kind: "workbench", sourceId: recoveryContext.sourceId, sourceVersion: recoveryContext.sourceVersion,
        payload: { selectedRevisionId: revisionId, archive: input },
      });
      recovery = captureLegacyRecord(record);
    } catch {
      diagnostics.push({ category: "invalid", code: "recovery-unavailable", path: [], message: "Input or source context is not valid capture JSON; retain the original external source for recovery" });
    }
    return immutable({ status: "invalid", diagnostics, recovery });
  };
  let parsed: ReturnType<typeof workbenchArchiveSchema.safeParse>;
  try {
    parsed = workbenchArchiveSchema.safeParse(input);
  } catch {
    diagnostics.push({ category: "invalid", code: "invalid-document", path: [], message: "Input could not be read as a workbench document" });
    return recover();
  }
  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => diagnostics.push({ category: "invalid", code: "invalid-document", path: issue.path, message: issue.message }));
    return recover();
  }
  const revisionIndex = parsed.data.revisions.findIndex((item) => item.id === revisionId);
  const revision = parsed.data.revisions[revisionIndex];
  if (!revision) {
    diagnostics.push({ category: "invalid", code: "missing-revision", path: ["revisions"], message: `Selected revision does not exist: ${revisionId}` });
    return recover();
  }
  const rootPath: (string | number)[] = ["revisions", revisionIndex];
  const incomplete = (code: TopologyDiagnostic["code"], message: string, path: (string | number)[], ids: Pick<TopologyDiagnostic, "instanceId" | "portId" | "routeId"> = {}) => diagnostics.push({ category: "incomplete", code, message, path: [...rootPath, ...path], ...ids });
  if (!revision.equipment.length) incomplete("empty-equipment", "No equipment has been added to this setup", ["equipment"]);
  if (!revision.routes.length) incomplete("missing-route", "No intended RF route is recorded; this may remain a documentation-only setup", ["routes"]);
  if (revision.settings.frequencyHz.state === "unknown") incomplete("unknown-input", revision.settings.frequencyHz.reason, ["settings", "frequencyHz"]);
  if (revision.routes.some((route) => route.purpose === "transmit") && revision.settings.requestedPowerWatts.state === "unknown") incomplete("unknown-input", revision.settings.requestedPowerWatts.reason, ["settings", "requestedPowerWatts"]);
  revision.routes.forEach((route, routeIndex) => {
    if (route.analysis.state === "documentation-only") route.analysis.reasons.forEach((reason, reasonIndex) => diagnostics.push({ category: "unsupported", code: "documented-limit", message: reason, routeId: route.id, path: [...rootPath, "routes", routeIndex, "analysis", "reasons", reasonIndex] }));
  });
  revision.cableRuns.forEach((run, runIndex) => {
    if (run.lengthMeters.state === "unknown") incomplete("unknown-input", run.lengthMeters.reason, ["cableRuns", runIndex, "lengthMeters"]);
    if (run.baseCableInstanceId === null) incomplete("unknown-input", "The physical base cable for this run is not recorded", ["cableRuns", runIndex, "baseCableInstanceId"]);
  });
  revision.models.forEach((model, modelIndex) => {
    for (const fieldGroup of ["specifications", "fields"] as const) {
      Object.entries(model[fieldGroup] ?? {}).forEach(([key, field]) => {
        if (field.state === "unknown") incomplete("unknown-input", field.reason, ["models", modelIndex, fieldGroup, key]);
      });
    }
  });
  revision.equipment.forEach((item, itemIndex) => {
    for (const fieldGroup of ["facts", "fields"] as const) {
      Object.entries(item[fieldGroup] ?? {}).forEach(([key, field]) => {
        if (field.state === "unknown") incomplete("unknown-input", field.reason, ["equipment", itemIndex, fieldGroup, key], { instanceId: item.id });
      });
    }
    item.ports.forEach((port, portIndex) => {
      const connected = revision.connections.some((edge) => [edge.from, edge.to].some((point) => point.instanceId === item.id && point.portId === port.id));
      // Spare/unwired accessories remain members; there is no invented wiring requirement.
      if (!connected) return;
      for (const unknownField of ["signal", "role", "direction"] as const) {
        if (port[unknownField] === "unknown") incomplete("unknown-port", `Connected port ${port.label} has an unknown ${unknownField}`, ["equipment", itemIndex, "ports", portIndex, unknownField], { instanceId: item.id, portId: port.id });
      }
      if (port.connector.state === "unknown") incomplete("unknown-port", `Connected port ${port.label} has an unknown connector`, ["equipment", itemIndex, "ports", portIndex, "connector"], { instanceId: item.id, portId: port.id });
      if (port.connector.state === "known" && port.connector.gender === "unknown") incomplete("unknown-port", `Connected port ${port.label} has an unknown connector gender`, ["equipment", itemIndex, "ports", portIndex, "connector", "gender"], { instanceId: item.id, portId: port.id });
      Object.entries(port.ratings).forEach(([key, field]) => {
        if (field.state === "unknown") incomplete("unknown-input", field.reason, ["equipment", itemIndex, "ports", portIndex, "ratings", key], { instanceId: item.id, portId: port.id });
      });
    });
  });
  const status = diagnostics.some((item) => item.category === "unsupported") ? "unsupported" : diagnostics.length ? "incomplete" : "candidate";
  return immutable({ status, diagnostics, recovery: null });
}
