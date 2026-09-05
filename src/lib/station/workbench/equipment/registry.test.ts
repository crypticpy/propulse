import { describe, expect, it } from "vitest";
import { equipmentInstanceSchema, evidenceSchema, legacyRecordSchema, workbenchArchiveSchema, type Evidence } from "@/lib/station/workbench/contracts";
import { createHfFixture, FIXTURE_DATE, FIXTURE_OWNER } from "@/lib/station/workbench/fixtures";
import {
  EQUIPMENT_FIELD_REGISTRY, parseEquipmentFields, validateEquipmentFields, validateEquipmentNumericFacts,
} from "@/lib/station/workbench/equipment/registry";
import { type EquipmentFieldValue, type EquipmentFieldDefinition } from "@/lib/station/workbench/equipment/types";

const known = (value: Extract<EquipmentFieldValue, { state: "known" }>["value"], unit?: string, evidenceId = "declared"): EquipmentFieldValue => ({ state: "known", value, ...(unit ? { unit } : {}), evidenceId });
const unknown: EquipmentFieldValue = { state: "unknown", reason: "Not recorded" };

function sample(definition: EquipmentFieldDefinition): EquipmentFieldValue {
  const number = definition.min ?? -2;
  const values = {
    number, text: definition.values?.[0] ?? "Custom description", boolean: false,
    "text-list": [definition.values?.[0] ?? "custom"],
    "number-range": { min: number, max: number + 1 }, "number-map": { "20m": number },
  };
  return known(values[definition.valueKind], definition.unit);
}

function report(reportType: "manufacturer" | "independent-test" | "unknown"): Evidence {
  return evidenceSchema.parse({
    id: `report-${reportType}`, ownerId: FIXTURE_OWNER, kind: "report", reportType,
    source: "Imported report metadata", recordedAt: FIXTURE_DATE,
    citation: { name: "Original source", url: "https://example.test/manual", retrievedAt: "2020-01-01", license: "Source license", notes: "Original source notes" },
    measurementContext: { state: "unknown", reason: "Original record did not supply frequency, observation date or method" },
  });
}

function measurement(): Extract<Evidence, { kind: "measurement" }> {
  const parsed = evidenceSchema.parse({
    id: "reading", ownerId: FIXTURE_OWNER, kind: "measurement", source: "Synthetic operator record", observedAt: FIXTURE_DATE,
    point: { kind: "port", instanceId: "antenna", portId: "feed" }, reading: { value: 1.5, unit: "ratio" }, quantityKind: "swr",
    context: { kind: "rf", frequencyHz: 14_200_000 }, method: "Synthetic analyzer check",
  });
  if (parsed.kind !== "measurement") throw new Error("Expected measurement");
  return parsed;
}

describe("W02 explicit equipment field registry", () => {
  it.each(Object.entries(EQUIPMENT_FIELD_REGISTRY))("round-trips registered %s and an explicit unknown", (key, definition) => {
    const value = sample(definition);
    expect(parseEquipmentFields({ [key]: value }, definition.kinds[0])).toEqual({ [key]: value });
    expect(parseEquipmentFields({ [key]: unknown }, definition.kinds[0])).toEqual({ [key]: unknown });
  });

  it("retains signed receiver/gain values, false flags, zero and exact map keys", () => {
    const fields = {
      "radio.receiver.noiseFloorDbm": known(-132, "dBm"),
      "radio.receiver.phaseNoiseDbcHz": known({ "2kHz": -127.5, "20kHz": -140 }, "dBc/Hz"),
      "radio.transmit.imd3Db": known(-30, "dB"), "radio.customPowerLimit": known(0, "W"),
    };
    expect(parseEquipmentFields(fields, "radio")).toEqual(fields);
    expect(parseEquipmentFields({ "antenna.isRotatable": known(false), "antenna.gain": known(-2, "dBi") }, "antenna")).toMatchObject({ "antenna.isRotatable": { value: false }, "antenna.gain": { value: -2 } });
    expect(parseEquipmentFields({ "accessory.lossAtSwr": known({ "1.5:1": 0.2, "3": 0.7 }, "dB") }, "accessory")["accessory.lossAtSwr"]).toMatchObject({ value: { "1.5:1": 0.2, "3": 0.7 } });
  });

  it.each([
    ["radio.receiver.sensitivity", "uV"], ["feedline.length", "ft"], ["inline.length", "in"],
    ["accessory.ripple", "mV"], ["accessory.maxWindLoad", "ft2"], ["antenna.gain", "dB"],
  ])("rejects noncanonical %s units %s", (key, unit) => {
    expect(validateEquipmentFields({ [key]: known(1, unit) }, EQUIPMENT_FIELD_REGISTRY[key].kinds[0]).some((item) => item.code === "wrong-unit")).toBe(true);
  });

  it("rejects unknown keys, wrong kinds, wrong shapes and malformed or inverted ranges", () => {
    expect(validateEquipmentFields({ "future.value": known(1, "W") }, "radio")[0].code).toBe("unknown-field");
    expect(validateEquipmentFields({ "antenna.gain": known(1, "dBi") }, "radio")[0].code).toBe("wrong-equipment-kind");
    expect(validateEquipmentFields({ "radio.maxPower": known("100", "W") }, "radio")[0].code).toBe("wrong-value-kind");
    expect(validateEquipmentFields({ "accessory.matchingRangeOhms": known({ min: 100, max: 10 }, "ohm") }, "accessory")[0].code).toBe("invalid-value");
    expect(validateEquipmentFields({ "accessory.ports": known(2.5, "count") }, "accessory")[0].code).toBe("invalid-value");
    expect(validateEquipmentFields({ "radio.maxPower": known(Infinity, "W") }, "radio")[0].code).toBe("invalid-shape");
    expect(validateEquipmentFields({ "antenna.isRotatable": known(false, "W") }, "antenna")[0].code).toBe("wrong-unit");
  });

  it("rejects inverted min/max power across fields and compatibility facts", () => {
    expect(validateEquipmentFields({ "radio.minPower": known(100, "W"), "radio.maxPower": known(5, "W") }, "radio")).toHaveLength(1);
    expect(validateEquipmentNumericFacts({ minPower: known(100, "W") }, "radio", { "radio.maxPower": known(5, "W") })).toHaveLength(1);
  });

  it("allows duty cycle only as an explicitly supplied fraction, while unknown stays unknown", () => {
    expect(parseEquipmentFields({ "accessory.dutyCycle": known(0.5, "ratio") }, "accessory")).toMatchObject({ "accessory.dutyCycle": { value: 0.5 } });
    expect(validateEquipmentFields({ "accessory.dutyCycle": known(50, "ratio") }, "accessory")[0].code).toBe("invalid-value");
    expect(validateEquipmentFields({ "accessory.dutyCycle": known(50, "%") }, "accessory").length).toBeGreaterThan(0);
    expect(parseEquipmentFields({ "accessory.dutyCycle": unknown }, "accessory")["accessory.dutyCycle"]).toEqual(unknown);
  });

  it("prevents bypassing canonical units or contradicting typed values through W01 numeric aliases", () => {
    expect(validateEquipmentNumericFacts({ maxPower: known(100, "V") }, "radio")[0].code).toBe("wrong-unit");
    expect(validateEquipmentNumericFacts({ powerLimit: known(100, "W") }, "radio", { "radio.customPowerLimit": known(5, "W") }).some((item) => item.code === "invalid-value")).toBe(true);
    expect(validateEquipmentNumericFacts({ powerLimit: known(5, "W") }, "radio", { "radio.customPowerLimit": known(5, "W") })).toEqual([]);
    expect(validateEquipmentNumericFacts({ unregistered: known(5, "W") }, "radio")[0].code).toBe("unknown-field");
  });

  it("rejects reserved explicit field/map keys before record parsing can strip them", () => {
    const root = JSON.parse('{"__proto__":{"state":"known","value":2,"unit":"W","evidenceId":"declared"}}');
    const map = JSON.parse('{"__proto__":-120,"2kHz":-125}');
    expect(validateEquipmentFields(root, "radio")[0].code).toBe("invalid-shape");
    expect(validateEquipmentFields({ "radio.receiver.phaseNoiseDbcHz": known(map, "dBc/Hz") }, "radio")[0].code).toBe("invalid-shape");
  });
});

describe("W02 equipment provenance and metadata aggregate", () => {
  it("keeps factory and incomplete independently reported specs and every original citation", () => {
    const archive = createHfFixture();
    archive.evidence.push(report("manufacturer"), report("independent-test"), report("unknown"));
    archive.models[0].fields = {
      "radio.receiver.rmdr": known(100, "dB", "report-manufacturer"),
      "radio.testedSpecs.rmdr": known(110, "dB", "report-independent-test"),
    };
    archive.models[0].sourceReportIds = ["report-manufacturer", "report-independent-test", "report-unknown"];
    archive.models[0].legacy = [{ kind: "radio-model", sourceId: "legacy-model", sourceVersion: 24, payload: { id: "legacy-model", sources: [{ name: "Original source", extra: { retained: true } }] } }];
    const parsed = workbenchArchiveSchema.parse(archive);
    expect(parsed.models[0]).toEqual(archive.models[0]);
    expect(parsed.evidence.find((item) => item.id === "report-independent-test")).toMatchObject({ kind: "report", measurementContext: { state: "unknown" } });
    archive.models[0].fields["radio.testedSpecs.rmdr"] = known(110, "dB", "report-unknown");
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("requires referenced reports, preserves partial recorded context, and rejects fake empty context", () => {
    const archive = createHfFixture();
    archive.models[0].sourceReportIds = ["missing-report"];
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    expect(evidenceSchema.safeParse({ ...report("independent-test"), measurementContext: { state: "recorded", frequencyHz: 14_200_000 } }).success).toBe(true);
    expect(evidenceSchema.safeParse({ ...report("independent-test"), measurementContext: { state: "recorded" } }).success).toBe(false);
  });

  it("enforces reading, subject, dimension, quantity kind and RF context for numeric fields", () => {
    const archive = createHfFixture();
    const measured = measurement();
    archive.revisions[0].evidence.push(measured);
    archive.revisions[0].equipment[1].fields = { "antenna.swr": known(1.5, "ratio", measured.id) };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    measured.quantityKind = "other";
    measured.context = { kind: "not-applicable", reason: "No RF details" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    measured.quantityKind = "swr";
    measured.context = { kind: "rf", frequencyHz: 14_200_000 };
    measured.point.instanceId = "radio";
    measured.point = { kind: "port", instanceId: "radio", portId: "antenna" };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("does not let one scalar measurement establish a text field, map or model specification", () => {
    const archive = createHfFixture();
    archive.revisions[0].evidence.push(measurement());
    archive.revisions[0].equipment[1].fields = { "antenna.swrByBand": known({ "20m": 1.5 }, "ratio", "reading") };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    archive.revisions[0].equipment[1].fields = { "equipment.modelNumber": known("Model", undefined, "reading") };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    archive.revisions[0].equipment[1].fields = {};
    archive.revisions[0].models[0].fields = { "radio.receiver.rmdr": known(1.5, "dB", "reading") };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("supports measured DC ratings on a radio port without inventing RF power or frequency", () => {
    const archive = createHfFixture();
    const revision = archive.revisions[0];
    revision.equipment[0].ports.push({ id: "dc", label: "DC input", signal: "power", direction: "input", role: "load", connector: { state: "unknown" }, ratings: { "port.dcPower": { state: "known", value: 20, unit: "W", evidenceId: "dc-reading" } } });
    const measured = measurement();
    measured.id = "dc-reading";
    measured.point = { kind: "port", instanceId: "radio", portId: "dc" };
    measured.reading = { value: 20, unit: "W" };
    measured.quantityKind = "other";
    measured.context = { kind: "not-applicable", reason: "DC input power" };
    revision.evidence.push(measured);
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    measured.quantityKind = "rf-power";
    measured.context = { kind: "rf", frequencyHz: 14_200_000 };
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    measured.quantityKind = "other";
    measured.reading.unit = "V";
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("retains explicit private metadata/media roles and rejects inconsistent lifecycle dates", () => {
    const archive = createHfFixture();
    const item = archive.inventory[0];
    item.privateMetadata = {
      ...item.privateMetadata, purchaseDate: "2020-01-01", purchaseLocation: "Private store", firmwareRevision: "2.0",
      wiringConfiguration: "Private wiring", condition: "Used", maintenanceNotes: "Bench service", manualNotes: "Annotated manual",
      manualMediaIds: ["private-manual"], manualUrls: ["https://example.test/manual"], primaryImageId: "primary", galleryImageIds: ["b", "a"], legacyPhotoUrls: ["https://example.test/old.jpg"],
    };
    expect(equipmentInstanceSchema.parse(item).privateMetadata).toEqual(item.privateMetadata);
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    item.lifecycle = "retired";
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    item.retiredAt = "2026-09-06T12:00:00Z";
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(true);
    item.retiredAt = "2020-01-01T12:00:00Z";
    expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
  });

  it("preserves own reserved keys safely in root/nested legacy JSON instead of silently stripping", () => {
    const payload = JSON.parse('{"__proto__":{"retained":true},"nested":{"__proto__":[0,false,null]},"array":[{"__proto__":"keep"}]}');
    const record = legacyRecordSchema.parse({ kind: "radio-model", sourceId: "legacy", sourceVersion: 24, payload });
    expect(JSON.stringify(record.payload)).toBe(JSON.stringify(payload));
    expect(Object.prototype.hasOwnProperty.call(record.payload, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(record.payload)).toBe(Object.prototype);
    expect(record.payload).not.toBe(payload);
    payload.nested.__proto__.push("caller mutation");
    expect(JSON.stringify(record.payload)).not.toBe(JSON.stringify(payload));
  });

  it("rejects reserved compatibility fact/specification/rating keys before Zod can strip them", () => {
    const reserved = JSON.parse('{"__proto__":{"state":"known","value":5,"unit":"W","evidenceId":"declared"}}');
    for (const scope of ["instance", "model", "port"] as const) {
      const archive = createHfFixture();
      if (scope === "instance") archive.inventory[0].facts = reserved;
      if (scope === "model") archive.models[0].specifications = reserved;
      if (scope === "port") archive.inventory[0].ports[0].ratings = reserved;
      expect(workbenchArchiveSchema.safeParse(archive).success).toBe(false);
    }
    const raw = legacyRecordSchema.parse({ kind: "radio", sourceId: "raw", sourceVersion: 24, payload: reserved });
    expect(JSON.stringify(raw.payload)).toBe(JSON.stringify(reserved));
  });

  it("rejects cyclic/non-JSON payloads without invoking getters or pretending capture succeeded", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let readGetter = false;
    const getter = { get value() { readGetter = true; return "not persisted JSON"; } };
    for (const payload of [cyclic, { missing: undefined }, { n: Infinity }, { date: new Date() }, { value: () => 1 }, { symbol: Symbol("value") }, { sparse: new Array(2) }, getter]) {
      expect(legacyRecordSchema.safeParse({ kind: "radio", sourceId: "legacy", sourceVersion: 24, payload }).success).toBe(false);
    }
    expect(readGetter).toBe(false);
  });
});
