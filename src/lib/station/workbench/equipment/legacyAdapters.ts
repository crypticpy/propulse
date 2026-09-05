/** Pure W02 proposals. No store access, clock, random IDs, ports, topology or measured evidence. */
import { z } from "zod";
import {
  equipmentInstanceSchema, equipmentModelSchema, evidenceSchema, legacyRecordSchema,
  type EquipmentInstance, type Evidence, type LegacyRecord,
} from "@/lib/station/workbench/contracts";
import { EQUIPMENT_FIELD_REGISTRY, validateEquipmentFields } from "@/lib/station/workbench/equipment/registry";
import type { EquipmentFields, EquipmentKind } from "@/lib/station/workbench/equipment/types";
import {
  accessoryFields, antennaFields, fallbackAccessoryFields, fallbackInlineFields,
  feedlineFields, feedpointFerriteFields, inlineFields, oldRadioInstanceFields,
  radioInstanceFields, radioModelFields, receiverFields, sourceReportFields, transmitFields,
} from "@/lib/station/workbench/equipment/legacyFields";

export type LegacyEquipmentKind = "radio" | "antenna" | "feedline" | "inline" | "accessory";
export interface LegacyMappingContext {
  ownerId: string;
  sourceId: string;
  sourceVersion: number;
  capturedAt: string;
  targetId?: string;
}
export interface LegacyModelMappingContext extends LegacyMappingContext {
  origin: "catalog" | "custom" | "legacy";
  /** An explicit per-citation classification, never inferred from its name or URL. */
  reportTypes?: Record<number, "manufacturer" | "independent-test" | "unknown">;
}
export interface LegacyMappingDiagnostic {
  code: "invalid-shape" | "invalid-value" | "unknown-enum" | "ambiguous-unit" | "missing-provenance" | "missing-identity" | "source-id-mismatch";
  path: (string | number)[];
  severity: "warning" | "error";
  message: string;
}
type Quarantined = { status: "quarantined"; source: LegacyRecord | null; diagnostics: LegacyMappingDiagnostic[] };
type Mapped<T> = { status: "mapped" | "needs-review"; value: T; source: LegacyRecord; evidence: Evidence[]; diagnostics: LegacyMappingDiagnostic[] };
export type LegacyEquipmentProposal = Quarantined | Mapped<EquipmentInstance>;
export type LegacyModelProposal = Quarantined | Mapped<z.infer<typeof equipmentModelSchema>>;

const instant = z.string().datetime({ offset: true });
const contextSchema = z.object({
  ownerId: z.string().trim().min(1), sourceId: z.string().trim().min(1), sourceVersion: z.number().int().nonnegative(),
  capturedAt: instant, targetId: z.string().trim().min(1).optional(),
});
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const unknown = (reason = "Not recorded in legacy source") => ({ state: "unknown" as const, reason });
const identity = (context: LegacyMappingContext, kind: string, path: (string | number)[]) =>
  `legacy:${[context.ownerId, kind, context.sourceId, JSON.stringify(path)].map(encodeURIComponent).join(":")}`;

function begin(kind: string, raw: unknown, context: LegacyMappingContext) {
  const diagnostics: LegacyMappingDiagnostic[] = [];
  const add = (code: LegacyMappingDiagnostic["code"], path: (string | number)[], message: string, severity: "warning" | "error" = "warning") => diagnostics.push({ code, path, message, severity });
  // A malformed/non-JSON input is not silently JSON-stringified: callers retain their original input.
  const captured = legacyRecordSchema.safeParse({ kind, sourceId: context.sourceId, sourceVersion: context.sourceVersion, payload: raw });
  if (!captured.success) {
    captured.error.issues.forEach((issue) => add("invalid-shape", issue.path, issue.message, "error"));
    return { source: null, diagnostics, add, valid: false } as const;
  }
  const source = captured.data;
  const validContext = contextSchema.safeParse(context);
  if (!validContext.success) {
    validContext.error.issues.forEach((issue) => add("invalid-shape", ["context", ...issue.path], issue.message, "error"));
    return { source, diagnostics, add, valid: false } as const;
  }
  return { source, diagnostics, add, valid: true } as const;
}

function extraction(kind: EquipmentKind, sourceKind: string, context: LegacyMappingContext, diagnostics: LegacyMappingDiagnostic[]) {
  const fields: EquipmentFields = {};
  const evidence: Evidence[] = [];
  const add = (code: LegacyMappingDiagnostic["code"], path: (string | number)[], message: string) => diagnostics.push({ code, path, message, severity: "warning" });
  function field(key: string, input: unknown, path: (string | number)[]) {
    if (input === undefined) { fields[key] = unknown(); return; }
    if (key === "accessory.dutyCycle") {
      fields[key] = unknown("Legacy dutyCycle has ambiguous fraction/percent units");
      add("ambiguous-unit", path, "Legacy seed and display conventions disagree; retain raw dutyCycle until explicitly resolved.");
      return;
    }
    let converted = input;
    const factors: Record<string, number> = {
      "feedline.length": 0.3048, "inline.length": 0.0254, "accessory.ripple": 0.001,
      "accessory.maxWindLoad": 0.09290304, "radio.receiver.sensitivity": 0.000001, "radio.testedSpecs.sensitivity": 0.000001,
    };
    if (has(factors, key) && typeof input === "number") converted = input * factors[key];
    if (key === "accessory.passband" && record(input) && typeof input.low === "number" && typeof input.high === "number" && Object.keys(input).length === 2) {
      converted = { min: input.low * 1e6, max: input.high * 1e6 };
    }
    const definition = EQUIPMENT_FIELD_REGISTRY[key];
    const evidenceId = identity(context, sourceKind, path);
    const candidate = { state: "known", value: converted, ...(definition?.unit ? { unit: definition.unit } : {}), evidenceId };
    const problems = validateEquipmentFields({ [key]: candidate }, kind);
    if (problems.length) {
      fields[key] = unknown("Invalid legacy value retained in raw recovery payload");
      problems.forEach((problem) => add(definition?.values ? "unknown-enum" : "invalid-value", path, problem.message));
      return;
    }
    // Registry validation precedes the type assertion, and the final entity parse clones the values.
    fields[key] = candidate as EquipmentFields[string];
    const provenance = { id: evidenceId, ownerId: context.ownerId, recordedAt: context.capturedAt,
      source: `Imported ${sourceKind} ${context.sourceId}, field ${JSON.stringify(path)}; original units and value retained in legacy payload` };
    evidence.push(evidenceSchema.parse(key.startsWith("radio.testedSpecs.") ? {
      ...provenance, kind: "report", reportType: "independent-test",
      citation: { name: "Unattributed legacy tested specifications" },
      measurementContext: { state: "unknown", reason: "Legacy testedSpecs contains a reported value without complete test attribution or measurement context" },
    } : { ...provenance, kind: "declared" }));
    if (key === "antenna.swrByBand" || key.startsWith("radio.testedSpecs.")) {
      add("missing-provenance", path, "Legacy reported value retained as a declaration; measurement time, method and point were not established.");
    }
  }
  function ledger(raw: Record<string, unknown>, mappings: Record<string, string>, prefix: (string | number)[] = []) {
    for (const [name, key] of Object.entries(mappings)) if (!key.startsWith("@")) field(key, raw[name], [...prefix, name]);
  }
  function nested(raw: Record<string, unknown>, name: string, mappings: Record<string, string>) {
    if (!has(raw, name)) return;
    if (!record(raw[name])) { add("invalid-shape", [name], "Expected a field object; original value retained."); return; }
    ledger(raw[name], mappings, [name]);
  }
  return { fields, evidence, ledger, nested, add };
}

function stringField(raw: Record<string, unknown>, key: string, add: ReturnType<typeof extraction>["add"]): string | undefined {
  if (!has(raw, key)) return undefined;
  if (typeof raw[key] === "string") return raw[key];
  add("invalid-value", [key], "Expected text; original value retained.");
  return undefined;
}
function mediaList(raw: Record<string, unknown>, key: string, add: ReturnType<typeof extraction>["add"]): string[] | undefined {
  if (!has(raw, key)) return undefined;
  if (!Array.isArray(raw[key])) { add("invalid-value", [key], "Expected a media reference array; original value retained."); return undefined; }
  return raw[key].flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) return [item];
    add("invalid-value", [key, index], "Invalid media reference retained in raw payload.");
    return [];
  });
}

/** Inventory adapters retain legacy connector declarations but never invent port identities or wiring. */
export function mapLegacyEquipment(kind: LegacyEquipmentKind, input: unknown, context: LegacyMappingContext): LegacyEquipmentProposal {
  const initial = begin(kind, input, context);
  if (!initial.valid || !initial.source) return { status: "quarantined", source: initial.source, diagnostics: initial.diagnostics };
  const { source, diagnostics } = initial;
  const raw = source.payload;
  const oldRadio = kind === "radio" && !has(raw, "id") && has(raw, "radioId");
  if ((!oldRadio && (typeof raw.id !== "string" || !raw.id.trim())) || (typeof raw.id === "string" && raw.id !== context.sourceId)) {
    initial.add(typeof raw.id === "string" ? "source-id-mismatch" : "missing-identity", ["id"], "Source identity must match explicit sourceId; no entity was created.", "error");
    return { status: "quarantined", source, diagnostics };
  }
  if (!instant.safeParse(raw.addedAt).success) {
    initial.add("invalid-value", ["addedAt"], "Missing or invalid source creation date; no timestamp was invented.", "error");
    return { status: "quarantined", source, diagnostics };
  }
  const equipmentKind = kind === "feedline" ? "cable" : kind;
  const extract = extraction(equipmentKind, kind, context, diagnostics);
  const subtype = kind === "inline" ? raw.componentType : raw.category;
  const subtypeLedgers: Record<string, Record<string, string>> = kind === "inline" ? inlineFields : accessoryFields;
  const mappings = kind === "radio" ? (oldRadio ? oldRadioInstanceFields : radioInstanceFields)
    : kind === "antenna" ? antennaFields : kind === "feedline" ? feedlineFields
      : typeof subtype === "string" && has(subtypeLedgers, subtype) ? subtypeLedgers[subtype]
        : kind === "inline" ? fallbackInlineFields : fallbackAccessoryFields;
  extract.ledger(raw, mappings);
  if (kind === "antenna") extract.nested(raw, "feedpointFerrites", feedpointFerriteFields);
  const labelName = kind === "radio" ? "nickname" : "name";
  const label = stringField(raw, labelName, extract.add)?.trim();
  if (!label) extract.add("invalid-value", [labelName], "Missing label; source ID is used as the visible recovery label.");
  const primary = stringField(raw, "imageId", extract.add);
  const primaryImageId = primary?.trim() ? primary : undefined;
  if (primary !== undefined && !primaryImageId) extract.add("invalid-value", ["imageId"], "Empty primary image ID retained only in raw payload.");
  const galleryImageIds = mediaList(raw, "galleryImageIds", extract.add);
  const legacyPhotoUrls = mediaList(raw, "photos", extract.add);
  const privateMetadata: Record<string, unknown> = {
    receiptMediaIds: [], imageIds: [...new Set([...(primaryImageId ? [primaryImageId] : []), ...(galleryImageIds ?? [])])],
    ...(primaryImageId ? { primaryImageId } : {}), ...(galleryImageIds ? { galleryImageIds } : {}), ...(legacyPhotoUrls ? { legacyPhotoUrls } : {}),
  };
  for (const name of ["purchaseDate", "purchaseLocation", "firmwareRevision", "wiringConfiguration", "notes"]) {
    if (Object.values(mappings).includes(`@private.${name}`)) {
      const value = stringField(raw, name, extract.add);
      if (value !== undefined) privateMetadata[name] = value;
    }
  }
  if (has(raw, "specPreference") && kind === "radio") {
    if (typeof raw.specPreference === "string" && ["global", "factory", "tested"].includes(raw.specPreference)) privateMetadata.specPreference = raw.specPreference;
    else extract.add("unknown-enum", ["specPreference"], "Invalid specification preference retained only in raw payload.");
  }
  const retired = has(mappings, "retiredAt") && raw.retiredAt !== undefined && raw.retiredAt !== null && raw.retiredAt !== "";
  const retiredAt = retired && typeof raw.retiredAt === "string" && instant.safeParse(raw.retiredAt).success && Date.parse(raw.retiredAt) >= Date.parse(raw.addedAt as string) ? raw.retiredAt : undefined;
  if (retired && retiredAt === undefined) {
    initial.add("invalid-value", ["retiredAt"], "Retirement marker retained in quarantined source; invalid date or chronology cannot be converted to owned gear or an invented retirement date.", "error");
    return { status: "quarantined", source, diagnostics };
  }
  let modelId: string | null = null;
  if (kind === "radio") {
    const modelKey = oldRadio ? "radioId" : "equipmentId";
    if (typeof raw[modelKey] === "string" && raw[modelKey].trim()) modelId = raw[modelKey];
    else extract.add("missing-identity", [modelKey], "Model reference unavailable; no model or specification was invented.");
  }
  const parsed = equipmentInstanceSchema.safeParse({
    id: context.targetId ?? context.sourceId, ownerId: context.ownerId, modelId, label: label || context.sourceId,
    kind: equipmentKind, lifecycle: retired ? "retired" : "owned", addedAt: raw.addedAt,
    ...(retiredAt ? { retiredAt } : {}), ports: [], internalPaths: [], facts: {}, fields: extract.fields,
    privateMetadata, legacy: [source],
  });
  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => initial.add("invalid-shape", issue.path, issue.message, "error"));
    return { status: "quarantined", source, diagnostics };
  }
  return { status: diagnostics.length ? "needs-review" : "mapped", value: parsed.data, source, evidence: extract.evidence, diagnostics };
}

/** Model reports remain attributed reports/declarations, never physical-instance measurements. */
export function mapLegacyRadioModel(input: unknown, context: LegacyModelMappingContext): LegacyModelProposal {
  const initial = begin("radio-model", input, context);
  if (!initial.valid || !initial.source) return { status: "quarantined", source: initial.source, diagnostics: initial.diagnostics };
  const { source, diagnostics } = initial;
  const raw = source.payload;
  if (typeof raw.id !== "string" || !raw.id.trim() || raw.id !== context.sourceId) {
    initial.add("missing-identity", ["id"], "Model ID must match sourceId; no replacement identity was invented.", "error");
    return { status: "quarantined", source, diagnostics };
  }
  const extract = extraction("radio", "radio-model", context, diagnostics);
  extract.ledger(raw, radioModelFields);
  for (const prefix of ["receiver", "testedSpecs"] as const) extract.nested(raw, prefix, Object.fromEntries(Object.entries(receiverFields).map(([key, suffix]) => [key, `radio.${prefix}.${suffix}`])));
  extract.nested(raw, "transmit", transmitFields);
  const maxPower = extract.fields["radio.maxPower"];
  const minPower = extract.fields["radio.minPower"];
  if (maxPower?.state === "known" && minPower?.state === "known" && typeof maxPower.value === "number" && typeof minPower.value === "number" && minPower.value > maxPower.value) {
    extract.fields["radio.maxPower"] = unknown("Inverted legacy power range");
    extract.fields["radio.minPower"] = unknown("Inverted legacy power range");
    extract.add("invalid-value", ["minPower"], "Minimum power exceeds maximum; raw values retained for review.");
  }
  const sourceReportIds: string[] = extract.evidence.filter((entry) => entry.kind === "report").map((entry) => entry.id);
  if (has(raw, "sources")) {
    if (!Array.isArray(raw.sources)) extract.add("invalid-shape", ["sources"], "Expected source citation array; raw value retained.");
    else raw.sources.forEach((entry, index) => {
      if (!record(entry)) { extract.add("invalid-shape", ["sources", index], "Invalid source citation retained in raw payload."); return; }
      const citation: Record<string, unknown> = {};
      for (const key of Object.keys(sourceReportFields)) if (has(entry, key)) {
        if (typeof entry[key] === "string") citation[key] = entry[key];
        else extract.add("invalid-value", ["sources", index, key], "Invalid citation field retained in raw payload.");
      }
      if (typeof citation.name !== "string" || !citation.name.trim()) {
        citation.name = "Unattributed legacy source citation";
        extract.add("missing-provenance", ["sources", index, "name"], "Missing source name; recovery label does not identify a laboratory or manufacturer.");
      }
      const reportId = identity(context, "radio-model", ["sources", index]);
      const report = evidenceSchema.safeParse({
        id: reportId, ownerId: context.ownerId, kind: "report", source: `Imported citation ${index + 1} for ${context.sourceId}`,
        recordedAt: context.capturedAt, reportType: context.reportTypes?.[index] ?? "unknown", citation,
        measurementContext: { state: "unknown", reason: "Legacy source attribution has no complete measurement context" },
      });
      if (!report.success) { report.error.issues.forEach((issue) => extract.add("invalid-shape", ["sources", index, ...issue.path], issue.message)); return; }
      sourceReportIds.push(reportId);
      extract.evidence.push(report.data);
      if (context.reportTypes?.[index] === undefined) extract.add("missing-provenance", ["sources", index], "Source report classification was not supplied; original citation is retained for review.");
    });
  }
  const manufacturer = typeof raw.manufacturer === "string" ? raw.manufacturer : undefined;
  const name = typeof raw.displayName === "string" && raw.displayName.trim() ? raw.displayName.trim()
    : typeof raw.model === "string" && raw.model.trim() ? [manufacturer, raw.model].filter(Boolean).join(" ") : context.sourceId;
  const parsed = equipmentModelSchema.safeParse({
    id: context.targetId ?? context.sourceId, origin: context.origin, name, ...(manufacturer !== undefined ? { manufacturer } : {}),
    kind: "radio", portTemplates: [], specifications: {}, fields: extract.fields, sourceReportIds, legacy: [source],
  });
  if (!parsed.success) {
    parsed.error.issues.forEach((issue) => initial.add("invalid-shape", issue.path, issue.message, "error"));
    return { status: "quarantined", source, diagnostics };
  }
  return { status: diagnostics.length ? "needs-review" : "mapped", value: parsed.data, source, evidence: extract.evidence, diagnostics };
}
