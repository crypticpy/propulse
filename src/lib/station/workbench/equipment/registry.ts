import { z } from "zod";
import { ANTENNA_TYPE_TO_PATTERN, CONNECTOR_TYPE_LABELS, FEEDLINE_TYPE_LABELS } from "@/types/shack";
import {
  equipmentFieldsSchema, type EquipmentDimension, type EquipmentFieldDefinition,
  type EquipmentFieldDiagnostic, type EquipmentFields, type EquipmentFieldValueKind, type EquipmentKind,
} from "@/lib/station/workbench/equipment/types";

const all: readonly EquipmentKind[] = ["radio", "antenna", "cable", "inline", "accessory", "other"];
const numeric = (kinds: readonly EquipmentKind[], unit: string, dimension: EquipmentDimension, options: Partial<EquipmentFieldDefinition> = {}): EquipmentFieldDefinition => ({ valueKind: "number", kinds, unit, dimension, measurementKind: "other", ...options });
const value = (kinds: readonly EquipmentKind[], valueKind: EquipmentFieldValueKind, values?: readonly string[]): EquipmentFieldDefinition => ({ valueKind, kinds, ...(values ? { values } : {}) });
const radio = ["radio"] as const;
const antenna = ["antenna"] as const;
const cable = ["cable"] as const;
const inline = ["inline"] as const;
const accessory = ["accessory"] as const;
const connectors = Object.keys(CONNECTOR_TYPE_LABELS);
const cables = Object.keys(FEEDLINE_TYPE_LABELS);
const nonnegative = { min: 0 };
const count = { min: 0, integer: true };

const receiverFields = (prefix: "receiver" | "testedSpecs"): Record<string, EquipmentFieldDefinition> => ({
  [`radio.${prefix}.rmdr`]: numeric(radio, "dB", "relative-level", { frequencyDependent: true }),
  [`radio.${prefix}.imdr3`]: numeric(radio, "dB", "relative-level", { frequencyDependent: true }),
  [`radio.${prefix}.blockingGain`]: numeric(radio, "dB", "relative-level", { frequencyDependent: true }),
  [`radio.${prefix}.sensitivity`]: numeric(radio, "V", "voltage", { ...nonnegative, frequencyDependent: true }),
  [`radio.${prefix}.noiseFloorDbm`]: numeric(radio, "dBm", "absolute-power", { frequencyDependent: true }),
  [`radio.${prefix}.phaseNoiseDbcHz`]: numeric(radio, "dBc/Hz", "phase-noise", { valueKind: "number-map", frequencyDependent: true }),
  [`radio.${prefix}.ip3Dbm`]: numeric(radio, "dBm", "absolute-power", { frequencyDependent: true }),
});

/** Explicit API allowlist. Unrecognized imported fields stay in private raw recovery payloads. */
export const EQUIPMENT_FIELD_REGISTRY: Readonly<Record<string, EquipmentFieldDefinition>> = {
  "equipment.manufacturer": value(all, "text"),
  "equipment.modelNumber": value(all, "text"),
  "equipment.bands": value(all, "text-list"),
  "equipment.relativeGain": numeric(all, "dB", "relative-level", { measurementKind: "relative-gain", frequencyDependent: true }),
  "port.maxPower": numeric(all, "W", "power", { ...nonnegative, measurementKind: "rf-power", frequencyDependent: true }),
  "port.rfPower": numeric(all, "W", "power", { ...nonnegative, measurementKind: "rf-power", frequencyDependent: true }),
  "port.dcPower": numeric(all, "W", "power", nonnegative),
  "port.impedance": numeric(all, "ohm", "impedance", nonnegative),
  "port.voltage": numeric(all, "V", "voltage", nonnegative),
  "port.current": numeric(all, "A", "current", nonnegative),
  "port.maxVoltage": numeric(all, "V", "voltage", nonnegative),
  "port.maxCurrent": numeric(all, "A", "current", nonnegative),
  "port.minFrequency": numeric(all, "Hz", "frequency", nonnegative),
  "port.maxFrequency": numeric(all, "Hz", "frequency", nonnegative),
  "radio.displayName": value(radio, "text"),
  "radio.model": value(radio, "text"),
  "radio.maxPower": numeric(radio, "W", "power", { ...nonnegative, measurementKind: "rf-power", frequencyDependent: true }),
  "radio.minPower": numeric(radio, "W", "power", { ...nonnegative, measurementKind: "rf-power", frequencyDependent: true }),
  "radio.customPowerLimit": numeric(radio, "W", "power", { ...nonnegative, measurementKind: "rf-power", frequencyDependent: true }),
  "radio.modes": value(radio, "text-list", ["CW", "SSB", "AM", "FM", "FT8", "FT4", "RTTY", "PSK31", "JS8", "DATA"]),
  "radio.bands": value(radio, "text-list"),
  "radio.tier": value(radio, "text", ["entry", "midrange", "highend", "flagship"]),
  "radio.releaseYear": numeric(radio, "year", "year", count),
  ...receiverFields("receiver"),
  ...receiverFields("testedSpecs"),
  "radio.transmit.imd3Db": numeric(radio, "dB", "relative-level", { frequencyDependent: true }),
  "radio.transmit.spuriousDbc": numeric(radio, "dBc", "carrier-level", { frequencyDependent: true }),
  "radio.transmit.notes": value(radio, "text"),
  "antenna.antennaType": value(antenna, "text", Object.keys(ANTENNA_TYPE_TO_PATTERN)),
  "antenna.gainPatternType": value(antenna, "text", [...new Set(Object.values(ANTENNA_TYPE_TO_PATTERN))]),
  "antenna.bands": value(antenna, "text-list"),
  "antenna.gain": numeric(antenna, "dBi", "isotropic-gain", { measurementKind: "antenna-gain", frequencyDependent: true }),
  "antenna.swr": numeric(antenna, "ratio", "ratio", { min: 1, measurementKind: "swr", frequencyDependent: true }),
  "antenna.heightMeters": numeric(antenna, "m", "length", nonnegative),
  "antenna.azimuthDeg": numeric(antenna, "deg", "angle", { min: 0, max: 360 }),
  "antenna.isRotatable": value(antenna, "boolean"),
  "antenna.polarization": value(antenna, "text", ["horizontal", "vertical", "circular", "mixed"]),
  "antenna.mounting": value(antenna, "text", ["tower", "roof", "mast", "ground", "tree", "portable", "mobile", "attic", "balcony", "other"]),
  "antenna.gainDbiOverride": numeric(antenna, "dBi", "isotropic-gain", { valueKind: "number-map", measurementKind: "antenna-gain", frequencyDependent: true }),
  "antenna.swrByBand": numeric(antenna, "ratio", "ratio", { min: 1, valueKind: "number-map", measurementKind: "swr", frequencyDependent: true }),
  "antenna.feedpointFerrites.type": value(antenna, "text", ["snap_on", "toroid", "bead_string", "balun_1_1", "balun_4_1", "unun_9_1", "current_balun"]),
  "antenna.feedpointFerrites.material": value(antenna, "text", ["43", "31", "61", "77", "unknown"]),
  "antenna.feedpointFerrites.turns": numeric(antenna, "count", "count", count),
  "antenna.feedpointFerrites.count": numeric(antenna, "count", "count", count),
  "antenna.feedpointFerrites.insertionLossDb": numeric(antenna, "dB", "relative-level", { ...nonnegative, measurementKind: "loss", frequencyDependent: true }),
  "antenna.feedpointFerrites.notes": value(antenna, "text"),
  "feedline.feedlineType": value(cable, "text", cables),
  "feedline.length": numeric(cable, "m", "length", nonnegative),
  "feedline.connectorCount": numeric(cable, "count", "count", count),
  "feedline.connectorType": value(cable, "text", connectors),
  "feedline.connectorTypeFarEnd": value(cable, "text", connectors),
  "feedline.condition": value(cable, "text", ["new", "good", "fair", "poor"]),
  "feedline.yearInstalled": numeric(cable, "year", "year", count),
  "inline.componentType": value(inline, "text", ["adapter", "pigtail", "choke", "balun", "ferrite"]),
  "inline.insertionLossDb": numeric(inline, "dB", "relative-level", { ...nonnegative, measurementKind: "loss", frequencyDependent: true }),
  "inline.connectorFrom": value(inline, "text", connectors),
  "inline.connectorTo": value(inline, "text", connectors),
  "inline.length": numeric(inline, "m", "length", nonnegative),
  "inline.cableType": value(inline, "text", cables),
  "inline.chokeType": value(inline, "text", ["common_mode", "line_isolator", "feed_through"]),
  "inline.impedance": numeric(inline, "ohm", "impedance", nonnegative),
  "inline.turns": numeric(inline, "count", "count", count),
  "inline.bands": value(inline, "text-list"),
  "inline.ratio": value(inline, "text", ["1:1", "4:1", "6:1", "9:1", "1:1_current", "4:1_current"]),
  "inline.maxPowerWatts": numeric(inline, "W", "power", { ...nonnegative, measurementKind: "rf-power", frequencyDependent: true }),
  "inline.ferriteType": value(inline, "text", ["snap_on", "toroid", "bead"]),
  "inline.material": value(inline, "text", ["43", "31", "61", "77", "unknown"]),
  "inline.count": numeric(inline, "count", "count", count),
  "inline.impedanceOhms": numeric(inline, "ohm", "impedance", nonnegative),
  "accessory.category": value(accessory, "text", ["amplifier", "tuner", "filter", "switch", "power_supply", "grounding", "rotator", "keyer", "audio_dsp"]),
  "accessory.currentDrawAmps": numeric(accessory, "A", "current", nonnegative),
  "accessory.maxPowerWatts": numeric(accessory, "W", "power", { ...nonnegative, measurementKind: "rf-power", frequencyDependent: true }),
  "accessory.gainDb": numeric(accessory, "dB", "relative-level", { measurementKind: "relative-gain", frequencyDependent: true }),
  "accessory.bands": value(accessory, "text-list"),
  // Legacy sources disagree on fraction vs percent. Adapters must not infer from magnitude.
  "accessory.dutyCycle": numeric(accessory, "ratio", "ratio", { min: 0, max: 1 }),
  "accessory.warmupTimeSec": numeric(accessory, "s", "duration", nonnegative),
  "accessory.currentDrawTxAmps": numeric(accessory, "A", "current", nonnegative),
  "accessory.protectionFeatures": value(accessory, "text-list"),
  "accessory.tunerType": value(accessory, "text", ["manual", "automatic"]),
  "accessory.insertionLossDb": numeric(accessory, "dB", "relative-level", { ...nonnegative, measurementKind: "loss", frequencyDependent: true }),
  "accessory.matchingRangeOhms": numeric(accessory, "ohm", "impedance", { valueKind: "number-range", min: 0 }),
  "accessory.lossAtSwr": numeric(accessory, "dB", "relative-level", { valueKind: "number-map", min: 0 }),
  "accessory.filterType": value(accessory, "text", ["bandpass", "lowpass", "highpass", "notch"]),
  "accessory.selectivityDb": numeric(accessory, "dB", "relative-level"),
  "accessory.passband": numeric(accessory, "Hz", "frequency", { valueKind: "number-range", min: 0 }),
  "accessory.ports": numeric(accessory, "count", "count", { min: 1, integer: true }),
  "accessory.isolationDb": numeric(accessory, "dB", "relative-level"),
  "accessory.voltageOutput": numeric(accessory, "V", "voltage", nonnegative),
  "accessory.maxCurrentAmps": numeric(accessory, "A", "current", nonnegative),
  "accessory.ripple": numeric(accessory, "V", "voltage", nonnegative),
  "accessory.regulated": value(accessory, "boolean"),
  "accessory.groundType": value(accessory, "text", ["rod", "radial_system", "counterpoise", "water_pipe", "other"]),
  "accessory.radialCount": numeric(accessory, "count", "count", count),
  "accessory.groundResistanceOhms": numeric(accessory, "ohm", "impedance", nonnegative),
  "accessory.rotatorType": value(accessory, "text", ["azimuth", "elevation", "az_el"]),
  "accessory.speedDegPerSec": numeric(accessory, "deg/s", "angular-speed", nonnegative),
  "accessory.rangeDeg": numeric(accessory, "deg", "angle", nonnegative),
  "accessory.brakeType": value(accessory, "text", ["friction", "magnetic", "worm_gear", "none"]),
  "accessory.maxWindLoad": numeric(accessory, "m2", "area", nonnegative),
  "accessory.keyerType": value(accessory, "text", ["paddle", "straight_key", "bug", "electronic_keyer", "keyboard"]),
  "accessory.speedRangeWpm": numeric(accessory, "wpm", "speed", { valueKind: "number-range", min: 0 }),
  "accessory.memorySlots": numeric(accessory, "count", "count", count),
  "accessory.dspType": value(accessory, "text", ["external_speaker", "headphones", "dsp_filter", "audio_processor", "voice_keyer"]),
  "accessory.noiseReduction": value(accessory, "boolean"),
  "accessory.notchFilter": value(accessory, "boolean"),
  "accessory.bandwidthHz": numeric(accessory, "Hz", "frequency", { valueKind: "number-range", min: 0 }),
};

export function validateEquipmentFields(input: unknown, kind: EquipmentKind): EquipmentFieldDiagnostic[] {
  const parsed = equipmentFieldsSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((issue) => ({ code: "invalid-shape", path: issue.path, message: issue.message }));
  const diagnostics: EquipmentFieldDiagnostic[] = [];
  for (const [key, field] of Object.entries(parsed.data)) {
    const add = (code: EquipmentFieldDiagnostic["code"], message: string) => diagnostics.push({ code, path: [key], message });
    const definition = Object.prototype.hasOwnProperty.call(EQUIPMENT_FIELD_REGISTRY, key) ? EQUIPMENT_FIELD_REGISTRY[key] : undefined;
    if (!definition) { add("unknown-field", `Unregistered equipment field: ${key}`); continue; }
    if (!definition.kinds.includes(kind)) add("wrong-equipment-kind", `${key} does not apply to ${kind}`);
    if (field.state === "unknown") continue;
    const actual = field.value;
    const isObject = typeof actual === "object" && actual !== null && !Array.isArray(actual);
    const isRange = isObject && "min" in actual && "max" in actual && Object.keys(actual).length === 2;
    const rightKind = {
      number: typeof actual === "number", text: typeof actual === "string", boolean: typeof actual === "boolean",
      "text-list": Array.isArray(actual), "number-range": isRange, "number-map": isObject,
    }[definition.valueKind];
    if (!rightKind) { add("wrong-value-kind", `${key} requires ${definition.valueKind}`); continue; }
    if (field.unit !== definition.unit) add("wrong-unit", `${key} requires ${definition.unit ?? "no unit"}`);
    const numbers = typeof actual === "number" ? [actual] : isObject ? Object.values(actual) : [];
    if (numbers.some((number) => typeof number !== "number" || (definition.min !== undefined && number < definition.min) || (definition.max !== undefined && number > definition.max) || (definition.integer && !Number.isInteger(number)))) add("invalid-value", `${key} is outside its declared range`);
    if (definition.valueKind === "number-range" && isRange && actual.min > actual.max) add("invalid-value", `${key} minimum exceeds maximum`);
    const strings = typeof actual === "string" ? [actual] : Array.isArray(actual) ? actual : [];
    if (definition.values && strings.some((entry) => !definition.values?.includes(entry))) add("invalid-value", `${key} has an unsupported category`);
  }
  for (const [minKey, maxKey] of [["radio.minPower", "radio.maxPower"], ["port.minFrequency", "port.maxFrequency"]]) {
    const min = parsed.data[minKey];
    const max = parsed.data[maxKey];
    if (min?.state === "known" && max?.state === "known" && typeof min.value === "number" && typeof max.value === "number" && min.value > max.value) diagnostics.push({ code: "invalid-value", path: [minKey], message: `${minKey} exceeds ${maxKey}` });
  }
  return diagnostics;
}

/** Strict explicit-edit boundary; raw legacy recovery does not pass through this parser. */
export function parseEquipmentFields(input: unknown, kind: EquipmentKind): EquipmentFields {
  const diagnostics = validateEquipmentFields(input, kind);
  if (diagnostics.length) throw new z.ZodError(diagnostics.map((diagnostic) => ({ code: z.ZodIssueCode.custom, path: diagnostic.path, message: diagnostic.message })));
  return equipmentFieldsSchema.parse(input);
}

/** Explicit compatibility names from W01; units disambiguate its former generic gain key. */
export function canonicalEquipmentFactId(key: string, kind: EquipmentKind, unit?: string): string {
  if (Object.prototype.hasOwnProperty.call(EQUIPMENT_FIELD_REGISTRY, key)) return key;
  if (key === "gain") return unit === "dB" ? "equipment.relativeGain" : "antenna.gain";
  const aliases: Partial<Record<EquipmentKind, Record<string, string>>> = {
    radio: { powerLimit: "radio.customPowerLimit", maxPower: "radio.maxPower", minPower: "radio.minPower" },
    antenna: { swr: "antenna.swr", height: "antenna.heightMeters" },
  };
  return aliases[kind]?.[key] ?? key;
}

/** Numeric W01 compatibility inputs use the same registry and cannot contradict typed fields. */
export function validateEquipmentNumericFacts(input: unknown, kind: EquipmentKind, fields: EquipmentFields = {}): EquipmentFieldDiagnostic[] {
  const parsed = equipmentFieldsSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((issue) => ({ code: "invalid-shape", path: issue.path, message: issue.message }));
  const normalized: EquipmentFields = {};
  const diagnostics: EquipmentFieldDiagnostic[] = [];
  for (const [key, field] of Object.entries(parsed.data)) {
    const canonical = canonicalEquipmentFactId(key, kind, field.state === "known" ? field.unit : undefined);
    if (field.state === "known" && typeof field.value !== "number") diagnostics.push({ code: "wrong-value-kind", path: [key], message: "Legacy numeric facts require a scalar number" });
    if (normalized[canonical] && JSON.stringify(normalized[canonical]) !== JSON.stringify(field)) diagnostics.push({ code: "invalid-value", path: [key], message: `Conflicting numeric aliases for ${canonical}` });
    if (fields[canonical] && JSON.stringify(fields[canonical]) !== JSON.stringify(field)) diagnostics.push({ code: "invalid-value", path: [key], message: `Numeric fact contradicts typed field ${canonical}` });
    normalized[canonical] = field;
  }
  return [...diagnostics, ...validateEquipmentFields({ ...fields, ...normalized }, kind)];
}
