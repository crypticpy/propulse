import { z } from "zod";

export const equipmentKinds = ["radio", "antenna", "cable", "inline", "accessory", "other"] as const;
export type EquipmentKind = typeof equipmentKinds[number];
const finite = z.number().finite();
export const rejectReservedEquipmentKey = (input: unknown, ctx: z.RefinementCtx): unknown => {
  if (input !== null && typeof input === "object" && Object.prototype.hasOwnProperty.call(input, "__proto__")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Reserved object keys are not supported in explicit equipment fields", fatal: true });
    return z.NEVER;
  }
  return input;
};

/** Field shape is generic; the registry supplies exact value kind, units and bounds. */
export const equipmentFieldValueSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unknown"), reason: z.string().trim().min(1) }).strict(),
  z.object({
    state: z.literal("known"),
    value: z.preprocess(rejectReservedEquipmentKey, z.union([
      finite, z.string(), z.boolean(), z.array(z.string()),
      z.object({ min: finite, max: finite }).strict(), z.record(z.string().min(1), finite),
    ])),
    unit: z.string().min(1).optional(), evidenceId: z.string().trim().min(1),
  }).strict(),
]);

export const equipmentFieldsSchema = z.preprocess(rejectReservedEquipmentKey, z.record(z.string().min(1), equipmentFieldValueSchema));
export type EquipmentFieldValue = z.infer<typeof equipmentFieldValueSchema>;
export type EquipmentFields = z.infer<typeof equipmentFieldsSchema>;
export type EquipmentFieldValueKind = "number" | "text" | "boolean" | "text-list" | "number-range" | "number-map";
export type EquipmentDimension = "power" | "length" | "frequency" | "relative-level" | "isotropic-gain" | "absolute-power" | "carrier-level" | "phase-noise" | "voltage" | "current" | "impedance" | "angle" | "angular-speed" | "area" | "duration" | "count" | "ratio" | "speed" | "year";
export const equipmentMeasurementKinds = ["swr", "antenna-gain", "relative-gain", "loss", "rf-power", "other"] as const;
export type EquipmentMeasurementKind = typeof equipmentMeasurementKinds[number];

export interface EquipmentFieldDefinition {
  valueKind: EquipmentFieldValueKind;
  kinds: readonly EquipmentKind[];
  unit?: string;
  dimension?: EquipmentDimension;
  min?: number;
  max?: number;
  integer?: boolean;
  values?: readonly string[];
  measurementKind?: EquipmentMeasurementKind;
  frequencyDependent?: boolean;
}

export interface EquipmentFieldDiagnostic {
  code: "invalid-shape" | "unknown-field" | "wrong-equipment-kind" | "wrong-value-kind" | "wrong-unit" | "invalid-value";
  path: (string | number)[];
  message: string;
}
