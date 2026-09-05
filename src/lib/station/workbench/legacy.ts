import { z } from "zod";
import type { UserRadio } from "@/types/radio";
import {
  equipmentInstanceSchema, legacyRecordSchema,
  type EquipmentInstance, type Evidence, type LegacyRecord,
} from "@/lib/station/workbench/contracts";

/** Compile-time field ledger, in addition to retaining every raw persisted JSON field. */
export const legacyRadioFieldMapping = {
  id: "instance.id", equipmentId: "instance.modelId", nickname: "instance.label",
  customPowerLimit: "instance.facts.powerLimit (declared, never measured)", addedAt: "instance.addedAt",
  purchaseDate: "instance.privateMetadata.purchaseDate", purchaseLocation: "instance.privateMetadata.purchaseLocation",
  firmwareRevision: "instance.privateMetadata.firmwareRevision", wiringConfiguration: "instance.privateMetadata.wiringConfiguration",
  notes: "instance.privateMetadata.notes", imageId: "instance.privateMetadata.imageIds[0]",
  galleryImageIds: "instance.privateMetadata.imageIds (ordered, deduplicated; raw array retained)",
  specPreference: "instance.privateMetadata.specPreference",
} satisfies Record<keyof UserRadio, string>;

/** The private raw envelope also retains unrecognized future fields and malformed graph references. */
export function captureLegacyRecord(input: LegacyRecord): LegacyRecord {
  return legacyRecordSchema.parse(input);
}

const persistedRadioSchema = z.object({
  id: z.string().min(1), equipmentId: z.string().min(1), nickname: z.string().optional(),
  customPowerLimit: z.number().finite().nonnegative().optional(), addedAt: z.string().datetime({ offset: true }),
  purchaseDate: z.string().optional(), purchaseLocation: z.string().optional(),
  firmwareRevision: z.string().optional(), wiringConfiguration: z.string().optional(),
  notes: z.string().optional(), imageId: z.string().min(1).optional(), galleryImageIds: z.array(z.string().min(1)).optional(),
  specPreference: z.enum(["global", "factory", "tested"]).optional(),
}).passthrough();

/**
 * W01 migration example only. Does not write, assign ports, switch the active reader, or
 * replace W04's staged account-wide migration. A rejected source stays in its raw backup.
 */
export function proposeLegacyRadio(
  raw: LegacyRecord["payload"], ownerId: string, sourceVersion: number,
): { instance: EquipmentInstance; evidence: Evidence[] } {
  const legacy = captureLegacyRecord({ kind: "radio", sourceId: String(raw.id ?? "unidentified"), sourceVersion, payload: raw });
  const radio = persistedRadioSchema.parse(legacy.payload);
  const evidenceId = `legacy-radio:${radio.id}:power-limit`;
  const evidence: Evidence[] = radio.customPowerLimit === undefined ? [] : [{
    id: evidenceId, ownerId, kind: "declared", source: `Legacy radio ${radio.id} customPowerLimit; measurement context not recorded`, recordedAt: radio.addedAt,
  }];
  const instance = equipmentInstanceSchema.parse({
    id: radio.id, ownerId, modelId: radio.equipmentId, kind: "radio", label: radio.nickname?.trim() || radio.equipmentId,
    lifecycle: "owned", addedAt: radio.addedAt,
    // Missing port/connector facts are deliberately not invented by the import example.
    ports: [], internalPaths: [],
    facts: { powerLimit: radio.customPowerLimit === undefined ? { state: "unknown", reason: "No legacy custom power limit" } : { state: "known", value: radio.customPowerLimit, unit: "W", evidenceId } },
    privateMetadata: {
      purchaseDate: radio.purchaseDate, purchaseLocation: radio.purchaseLocation,
      firmwareRevision: radio.firmwareRevision, wiringConfiguration: radio.wiringConfiguration,
      notes: radio.notes, specPreference: radio.specPreference, receiptMediaIds: [],
      imageIds: Array.from(new Set([...(radio.imageId ? [radio.imageId] : []), ...(radio.galleryImageIds ?? [])])),
    }, legacy: [legacy],
  });
  return { instance, evidence };
}
