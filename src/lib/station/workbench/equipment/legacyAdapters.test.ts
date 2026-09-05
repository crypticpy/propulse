import { describe, expect, it } from "vitest";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type { UserAntenna, UserFeedline, InlineComponent, UserAccessory } from "@/types/shack";
import { workbenchArchiveSchema } from "@/lib/station/workbench/contracts";
import { validateEquipmentFields } from "@/lib/station/workbench/equipment/registry";
import { mapLegacyEquipment, mapLegacyRadioModel, type LegacyEquipmentKind, type LegacyEquipmentProposal } from "@/lib/station/workbench/equipment/legacyAdapters";

const date = "2026-09-05T12:00:00Z";
const context = { ownerId: "owner", sourceId: "legacy", sourceVersion: 5, capturedAt: date };
const common = { id: "legacy", name: "Legacy gear", manufacturer: "Example", notes: "PRIVATE notes", imageId: "cover", addedAt: date };
const model: RadioEquipment = {
  id: "model", displayName: "Custom rig", manufacturer: "Example", model: "One",
  receiver: { rmdr: 95, imdr3: 88, blockingGain: 115, sensitivity: 0.2, noiseFloorDbm: -125, phaseNoiseDbcHz: { "2kHz": -130, "10kHz": -140 }, ip3Dbm: -2 },
  testedSpecs: { rmdr: 94, imdr3: 87, blockingGain: 114, sensitivity: 0.3, noiseFloorDbm: -124, phaseNoiseDbcHz: { "2kHz": -131 }, ip3Dbm: -3 },
  transmit: { imd3Db: -35, spuriousDbc: 60, notes: "Published ALC comments" },
  sources: [{ name: "Original report", url: "https://example.test/report", retrievedAt: "2025-01-01", license: "Attribution", notes: "Report conditions" }, { name: "Additional source" }],
  maxPower: 100, minPower: 0, modes: ["SSB", "CW", "FT8"], bands: ["20m", "40m"], tier: "midrange", releaseYear: 2020,
};
const radio: UserRadio = {
  id: "legacy", equipmentId: "model", nickname: "My radio", customPowerLimit: 0, addedAt: date,
  purchaseDate: "2020-02-02", purchaseLocation: "Private seller", firmwareRevision: "1.2", wiringConfiguration: "CAT/audio notes", notes: "Service history",
  imageId: "cover", galleryImageIds: ["second", "cover", "second"], specPreference: "tested",
};
const antenna: UserAntenna = {
  ...common, antennaType: "beverage", gainPatternType: "wire_inverted_v", modelNumber: "Homebrew", bands: ["160m", "80m"], heightMeters: 0,
  azimuthDeg: 360, isRotatable: false, polarization: "horizontal", mounting: "ground", gainDbiOverride: { "160m": -3 }, swrByBand: { "160m": 1.4 },
  feedpointFerrites: { type: "current_balun", material: "31", turns: 3, count: 2, insertionLossDb: 0, notes: "Private feedpoint notes" },
  galleryImageIds: ["detail"], retiredAt: date, photos: ["https://example.test/legacy.jpg"],
};
const feedline: UserFeedline = {
  ...common, feedlineType: "lmr400", lengthFeet: 40, connectorCount: 2, connectorType: "pl259", connectorTypeFarEnd: "n_type", condition: "fair", yearInstalled: 2019, retiredAt: date,
};
const inlineCommon = { ...common, insertionLossDb: 0 };
const inlineFixtures: InlineComponent[] = [
  { ...inlineCommon, componentType: "adapter", connectorFrom: "pl259", connectorTo: "n_type" },
  { ...inlineCommon, componentType: "pigtail", connectorFrom: "bnc", connectorTo: "sma", lengthInches: 12, cableType: "rg58" },
  { ...inlineCommon, componentType: "choke", chokeType: "common_mode", impedance: 1000, turns: 0, bands: ["20m"] },
  { ...inlineCommon, componentType: "balun", ratio: "4:1_current", maxPowerWatts: 100, bands: ["40m"] },
  { ...inlineCommon, componentType: "ferrite", ferriteType: "toroid", material: "43", count: 2, turns: 4, impedanceOhms: 500 },
];
const accessoryCommon = { ...common, modelNumber: "Unit", currentDrawAmps: 0, galleryImageIds: ["rear"], retiredAt: date };
const accessoryFixtures: UserAccessory[] = [
  { ...accessoryCommon, category: "amplifier", maxPowerWatts: 500, gainDb: 10, bands: ["20m"], dutyCycle: 0.5, warmupTimeSec: 30, currentDrawTxAmps: 20, protectionFeatures: ["SWR", "thermal"] },
  { ...accessoryCommon, category: "tuner", type: "automatic", maxPowerWatts: 100, insertionLossDb: 0.2, matchingRangeOhms: { min: 12, max: 800 }, lossAtSwr: { "1:1": 0.1, "3:1": 0.4 } },
  { ...accessoryCommon, category: "filter", filterType: "bandpass", insertionLossDb: 0.3, bands: ["20m"], selectivityDb: 40, passbandMHz: { low: 14, high: 14.35 } },
  { ...accessoryCommon, category: "switch", ports: 4, insertionLossDb: 0.1, isolationDb: 60, maxPowerWatts: 1000 },
  { ...accessoryCommon, category: "power_supply", voltageOutput: 13.8, maxCurrentAmps: 30, rippleMv: 5, regulated: false },
  { ...accessoryCommon, category: "grounding", groundType: "radial_system", radialCount: 16, groundResistanceOhms: 0 },
  { ...accessoryCommon, category: "rotator", rotatorType: "az_el", speedDegPerSec: 6, rangeDeg: 450, brakeType: "worm_gear", maxWindLoadSqFt: 20 },
  { ...accessoryCommon, category: "keyer", keyerType: "electronic_keyer", speedRangeWpm: { min: 5, max: 60 }, memorySlots: 0 },
  { ...accessoryCommon, category: "audio_dsp", dspType: "dsp_filter", noiseReduction: false, notchFilter: true, bandwidthHz: { min: 100, max: 3000 } },
];
function mapped(result: LegacyEquipmentProposal) {
  if (result.status === "quarantined") throw new Error(JSON.stringify(result.diagnostics));
  return result;
}
const cases: [string, LegacyEquipmentKind, unknown][] = [
  ["radio", "radio", radio], ["antenna", "antenna", antenna], ["feedline", "feedline", feedline],
  ...inlineFixtures.map((raw): [string, LegacyEquipmentKind, unknown] => [raw.componentType, "inline", raw]),
  ...accessoryFixtures.map((raw): [string, LegacyEquipmentKind, unknown] => [raw.category, "accessory", raw]),
];

describe("W02 exhaustive legacy equipment proposals", () => {
  it.each(cases)("preserves %s source, declared fields and physical identity without wiring", (_name, kind, raw) => {
    const result = mapped(mapLegacyEquipment(kind, raw, context));
    expect(result.source).toMatchObject({ kind, sourceId: "legacy", sourceVersion: 5, payload: raw });
    expect(result.value.legacy[0]).toEqual(result.source);
    expect(result.value.id).toBe("legacy");
    expect(result.value.ports).toEqual([]);
    expect(result.value.internalPaths).toEqual([]);
    expect(validateEquipmentFields(result.value.fields, result.value.kind)).toEqual([]);
    expect(result.evidence.every((entry) => entry.kind !== "measurement")).toBe(true);
    expect(result.diagnostics.every((entry) => entry.code === "missing-provenance" || entry.code === "ambiguous-unit")).toBe(true);
    const known = Object.values(result.value.fields ?? {}).filter((field) => field.state === "known");
    expect(known.length).toBeGreaterThan(0);
    for (const field of known) if (field.state === "known") expect(result.evidence.some((entry) => entry.id === field.evidenceId)).toBe(true);
    expect(mapLegacyEquipment(kind, raw, context)).toEqual(result);
    const models = result.value.modelId ? [{ id: result.value.modelId, origin: "legacy", name: "Preserved model identity", kind: "radio", portTemplates: [], specifications: {} }] : [];
    const archive = workbenchArchiveSchema.safeParse({ schemaVersion: 1, ownerId: "owner", models, inventory: [result.value], evidence: result.evidence, locations: [], setups: [], revisions: [], layouts: [], experiments: [], publications: [], operating: null });
    expect(archive.success, archive.success ? "valid proposal" : archive.error.message).toBe(true);
  });

  it("keeps original media roles/order/duplicates and private ownership metadata", () => {
    const result = mapped(mapLegacyEquipment("radio", radio, context));
    expect(result.value.privateMetadata).toMatchObject({ primaryImageId: "cover", galleryImageIds: ["second", "cover", "second"], imageIds: ["cover", "second"], purchaseDate: radio.purchaseDate, purchaseLocation: radio.purchaseLocation, firmwareRevision: radio.firmwareRevision, wiringConfiguration: radio.wiringConfiguration, notes: radio.notes, specPreference: "tested" });
    expect(result.value.fields?.["radio.customPowerLimit"]).toMatchObject({ state: "known", value: 0, unit: "W" });
    const aerial = mapped(mapLegacyEquipment("antenna", antenna, context));
    expect(aerial.value.privateMetadata.legacyPhotoUrls).toEqual(antenna.photos);
    expect(aerial.value.privateMetadata.imageIds).not.toContain(antenna.photos![0]);
    expect(aerial.value.lifecycle).toBe("retired");
    expect(aerial.value.retiredAt).toBe(date);
  });

  it("converts source units once while retaining signed values, false and raw quantities", () => {
    expect(mapped(mapLegacyEquipment("feedline", feedline, context)).value.fields?.["feedline.length"]).toMatchObject({ value: 12.192, unit: "m" });
    expect(mapped(mapLegacyEquipment("inline", inlineFixtures[1], context)).value.fields?.["inline.length"]).toMatchObject({ value: 0.30479999999999996, unit: "m" });
    expect(mapped(mapLegacyEquipment("accessory", accessoryFixtures[2], context)).value.fields?.["accessory.passband"]).toMatchObject({ value: { min: 14e6, max: 14.35e6 }, unit: "Hz" });
    expect(mapped(mapLegacyEquipment("accessory", accessoryFixtures[4], context)).value.fields?.["accessory.ripple"]).toMatchObject({ value: 0.005, unit: "V" });
    expect(mapped(mapLegacyEquipment("accessory", accessoryFixtures[6], context)).value.fields?.["accessory.maxWindLoad"]).toMatchObject({ value: 20 * 0.09290304, unit: "m2" });
    const aerial = mapped(mapLegacyEquipment("antenna", antenna, context));
    expect(aerial.value.fields?.["antenna.gainDbiOverride"]).toMatchObject({ value: { "160m": -3 }, unit: "dBi" });
    expect(aerial.value.fields?.["antenna.isRotatable"]).toMatchObject({ value: false });
    expect(aerial.source.payload).toEqual(antenna);
  });

  it.each([0.5, 1, 50, 100])("does not infer duty-cycle units for %s", (dutyCycle) => {
    const result = mapped(mapLegacyEquipment("accessory", { ...accessoryFixtures[0], dutyCycle }, context));
    expect(result.value.fields?.["accessory.dutyCycle"].state).toBe("unknown");
    expect(result.source.payload.dutyCycle).toBe(dutyCycle);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "ambiguous-unit", path: ["dutyCycle"] })]));
  });

  it("preserves malformed values and unknown nested fields without source mutation", () => {
    const raw = { ...feedline, lengthFeet: -10, connectorType: "unrecognized", connectorTypeFarEnd: null, futureField: { nested: [false, 0, null, "keep"] } };
    const result = mapped(mapLegacyEquipment("feedline", raw, context));
    expect(result.value.fields?.["feedline.length"].state).toBe("unknown");
    expect(result.value.fields?.["feedline.connectorType"].state).toBe("unknown");
    expect(result.value.fields?.["feedline.connectorTypeFarEnd"].state).toBe("unknown");
    expect(result.source.payload).toEqual(raw);
    raw.futureField.nested.push("later");
    expect(result.source.payload).not.toEqual(raw);
    expect(result.value.legacy[0].payload).toEqual(result.source.payload);
  });

  it("keeps absent far-end connector unknown and direct connector declaration distinct", () => {
    const { connectorTypeFarEnd: _omitted, ...raw } = feedline;
    void _omitted;
    const result = mapped(mapLegacyEquipment("feedline", { ...raw, connectorType: "none" }, context));
    expect(result.value.fields?.["feedline.connectorTypeFarEnd"].state).toBe("unknown");
    expect(result.value.fields?.["feedline.connectorType"]).toMatchObject({ state: "known", value: "none" });
    expect(result.value.ports).toEqual([]);
  });

  it("quarantines malformed identities/dates while retaining valid JSON raw source", () => {
    for (const raw of [{ ...radio, id: "wrong" }, { ...radio, id: null }, { ...radio, addedAt: "invalid" }]) {
      const result = mapLegacyEquipment("radio", raw, context);
      expect(result.status).toBe("quarantined");
      expect(result.source?.payload).toEqual(raw);
    }
    const nonJson = mapLegacyEquipment("radio", { ...radio, extra: NaN }, context);
    expect(nonJson.status).toBe("quarantined");
    expect(nonJson.source).toBeNull();
    expect(nonJson.diagnostics[0].code).toBe("invalid-shape");
  });

  it("maps pre-instance radio with explicit stable source identity and never generates one", () => {
    const raw = { radioId: "model", nickname: "Old radio", addedAt: date, customPowerLimit: 5 };
    const result = mapped(mapLegacyEquipment("radio", raw, { ...context, targetId: "stable-import-id" }));
    expect(result.value).toMatchObject({ id: "stable-import-id", modelId: "model" });
    expect(result.source.payload).toEqual(raw);
    expect(result.source.sourceId).toBe("legacy");
  });

  it.each(["bad-date", "2020-01-01T00:00:00Z"])("quarantines invalid retirement %s without silently reactivating gear", (retiredAt) => {
    const result = mapLegacyEquipment("antenna", { ...antenna, retiredAt }, context);
    expect(result.status).toBe("quarantined");
    expect(result).not.toHaveProperty("value");
    expect(result.source?.payload.retiredAt).toBe(retiredAt);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "invalid-value", path: ["retiredAt"], severity: "error" }));
  });

  it("preserves inverted range and unknown subtype for repair", () => {
    const result = mapped(mapLegacyEquipment("accessory", { ...accessoryFixtures[1], matchingRangeOhms: { min: 800, max: 12 } }, context));
    expect(result.value.fields?.["accessory.matchingRangeOhms"].state).toBe("unknown");
    const unknownType = mapped(mapLegacyEquipment("accessory", { ...accessoryFixtures[0], category: "future-accessory" }, context));
    expect(unknownType.value.fields?.["accessory.category"].state).toBe("unknown");
    expect(unknownType.source.payload.maxPowerWatts).toBe(500);
  });
});

describe("W02 legacy radio model attribution", () => {
  const modelContext = { ...context, sourceId: "model", origin: "custom" as const };
  it("retains every model field/citation, converts sensitivity and separates factory/test reports", () => {
    const result = mapLegacyRadioModel(model, modelContext);
    if (result.status === "quarantined") throw new Error(JSON.stringify(result.diagnostics));
    expect(result.source.payload).toEqual(model);
    expect(validateEquipmentFields(result.value.fields, "radio")).toEqual([]);
    expect(result.value.fields?.["radio.receiver.sensitivity"]).toMatchObject({ value: 0.2e-6, unit: "V" });
    expect(result.value.fields?.["radio.receiver.phaseNoiseDbcHz"]).toMatchObject({ value: { "2kHz": -130, "10kHz": -140 }, unit: "dBc/Hz" });
    for (const [key, field] of Object.entries(result.value.fields ?? {})) if (key.startsWith("radio.testedSpecs.") && field.state === "known") {
      expect(result.evidence.find((entry) => entry.id === field.evidenceId)).toMatchObject({ kind: "report", reportType: "independent-test", measurementContext: { state: "unknown" } });
    }
    expect(result.evidence.some((entry) => entry.kind === "measurement")).toBe(false);
    const citations = result.evidence.filter((entry) => entry.kind === "report" && entry.citation.name !== "Unattributed legacy tested specifications");
    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({ citation: model.sources![0], reportType: "unknown" });
    expect(result.value.sourceReportIds).toEqual(result.evidence.filter((entry) => entry.kind === "report").map((entry) => entry.id));
    const inventory = mapped(mapLegacyEquipment("radio", radio, context));
    expect(workbenchArchiveSchema.safeParse({ schemaVersion: 1, ownerId: "owner", models: [result.value], inventory: [inventory.value], evidence: [...result.evidence, ...inventory.evidence], locations: [], setups: [], revisions: [], layouts: [], experiments: [], publications: [], operating: null }).success).toBe(true);
  });

  it("supports explicit citation classifications and preserves invalid optional citation fields", () => {
    const raw = { ...model, sources: [{ name: "Bench report", url: 4, future: true }, { notes: "Unnamed original" }] };
    const result = mapLegacyRadioModel(raw, { ...modelContext, reportTypes: { 0: "independent-test" } });
    if (result.status === "quarantined") throw new Error(JSON.stringify(result.diagnostics));
    expect(result.source.payload).toEqual(raw);
    expect(result.evidence.some((entry) => entry.kind === "report" && entry.citation.name === "Bench report" && entry.reportType === "independent-test")).toBe(true);
    expect(result.evidence.some((entry) => entry.kind === "report" && entry.citation.name === "Unattributed legacy source citation")).toBe(true);
    expect(result.diagnostics.some((entry) => entry.path.join(".") === "sources.0.url")).toBe(true);
  });
});
