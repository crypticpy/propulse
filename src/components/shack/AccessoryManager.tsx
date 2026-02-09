/**
 * AccessoryManager — Grouped-card CRUD for station accessories.
 *
 * Groups accessories by category with section headers.
 * Category-specific form fields adapt based on selected category.
 * Uses EquipmentCard for display and EquipmentDetailModal for detail view.
 */

import { useState } from "react";
import { useShackStore, useUserAccessories } from "@/stores/shackStore";
import type {
  UserAccessory,
  AccessoryCategory,
  AmplifierAccessory,
  TunerAccessory,
  FilterAccessory,
  SwitchAccessory,
  PowerSupplyAccessory,
  GroundingAccessory,
  RotatorAccessory,
  KeyerAccessory,
  AudioDspAccessory,
} from "@/types/shack";
import { MAX_ACCESSORIES, ACCESSORY_CATEGORY_LABELS } from "@/types/shack";
import { DetailModal } from "@/components/ui/DetailModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AccessoryCategoryFields } from "./AccessoryCategoryFields";
import { EquipmentCard } from "@/components/shack/EquipmentCard";
import { EquipmentHeroCard } from "@/components/shack/EquipmentHeroCard";
import type {
  EquipmentCardStat,
  EquipmentCardCapability,
} from "@/components/shack/EquipmentCard";
import type {
  EquipmentDetailField,
  EquipmentDetailGroup,
} from "@/components/shack/equipmentCardTypes";

// ─── Labels ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS = ACCESSORY_CATEGORY_LABELS;

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as AccessoryCategory[];

const GROUND_TYPE_LABELS: Record<string, string> = {
  rod: "Ground Rod",
  radial_system: "Radial System",
  counterpoise: "Counterpoise",
  water_pipe: "Water Pipe",
  other: "Other",
};

const FILTER_TYPE_LABELS: Record<string, string> = {
  bandpass: "Bandpass",
  lowpass: "Lowpass",
  highpass: "Highpass",
  notch: "Notch",
};

const ROTATOR_TYPE_LABELS: Record<string, string> = {
  azimuth: "Azimuth",
  elevation: "Elevation",
  az_el: "Az/El",
};

const KEYER_TYPE_LABELS: Record<string, string> = {
  paddle: "Paddle",
  straight_key: "Straight Key",
  bug: "Bug",
  electronic_keyer: "Electronic Keyer",
  keyboard: "Keyboard",
};

const DSP_TYPE_LABELS: Record<string, string> = {
  external_speaker: "External Speaker",
  headphones: "Headphones",
  dsp_filter: "DSP Filter",
  audio_processor: "Audio Processor",
  voice_keyer: "Voice Keyer",
};

// ─── Badge color per category ────────────────────────────────────────────────

const CATEGORY_BADGE_COLOR: Record<
  AccessoryCategory,
  "orange" | "green" | "amber" | "red" | "blue" | "gray"
> = {
  amplifier: "orange",
  tuner: "blue",
  filter: "green",
  switch: "gray",
  power_supply: "amber",
  grounding: "green",
  rotator: "blue",
  keyer: "gray",
  audio_dsp: "blue",
};

const CATEGORY_BADGE_HEX: Record<AccessoryCategory, string> = {
  amplifier: "#F97316",
  tuner: "#3B82F6",
  filter: "#22C55E",
  switch: "#9CA3AF",
  power_supply: "#F59E0B",
  grounding: "#22C55E",
  rotator: "#3B82F6",
  keyer: "#9CA3AF",
  audio_dsp: "#3B82F6",
};

// ─── Form state ──────────────────────────────────────────────────────────────

interface AccessoryForm {
  name: string;
  category: AccessoryCategory;
  manufacturer: string;
  modelNumber: string;
  notes: string;
  // Amplifier
  maxPowerWatts: string;
  gainDb: string;
  bands: Set<string>;
  // Tuner
  tunerType: "manual" | "automatic";
  tunerMaxPower: string;
  tunerInsertionLoss: string;
  // Filter
  filterType: "bandpass" | "lowpass" | "highpass" | "notch";
  filterInsertionLoss: string;
  filterBands: Set<string>;
  // Switch
  ports: string;
  switchInsertionLoss: string;
  // Power supply
  voltageOutput: string;
  maxCurrentAmps: string;
  // Grounding
  groundType: "rod" | "radial_system" | "counterpoise" | "water_pipe" | "other";
  radialCount: string;
  // Rotator
  rotatorType: "azimuth" | "elevation" | "az_el";
  speedDegPerSec: string;
  // Keyer
  keyerType:
    | "paddle"
    | "straight_key"
    | "bug"
    | "electronic_keyer"
    | "keyboard";
  speedMin: string;
  speedMax: string;
  // Audio DSP
  dspType:
    | "external_speaker"
    | "headphones"
    | "dsp_filter"
    | "audio_processor"
    | "voice_keyer";
  noiseReduction: boolean;
  notchFilter: boolean;
}

function createDefaultForm(): AccessoryForm {
  return {
    name: "",
    category: "amplifier",
    manufacturer: "",
    modelNumber: "",
    notes: "",
    maxPowerWatts: "1000",
    gainDb: "10",
    bands: new Set<string>(),
    tunerType: "automatic",
    tunerMaxPower: "100",
    tunerInsertionLoss: "",
    filterType: "bandpass",
    filterInsertionLoss: "0.5",
    filterBands: new Set<string>(),
    ports: "2",
    switchInsertionLoss: "0.1",
    voltageOutput: "13.8",
    maxCurrentAmps: "30",
    groundType: "rod",
    radialCount: "",
    rotatorType: "azimuth",
    speedDegPerSec: "1",
    keyerType: "paddle",
    speedMin: "5",
    speedMax: "50",
    dspType: "external_speaker",
    noiseReduction: false,
    notchFilter: false,
  };
}

function formFromAccessory(a: UserAccessory): AccessoryForm {
  const base: AccessoryForm = {
    ...createDefaultForm(),
    name: a.name,
    category: a.category,
    manufacturer: a.manufacturer ?? "",
    modelNumber: a.modelNumber ?? "",
    notes: a.notes ?? "",
  };

  switch (a.category) {
    case "amplifier":
      base.maxPowerWatts = String(a.maxPowerWatts);
      base.gainDb = String(a.gainDb);
      base.bands = new Set(a.bands ?? []);
      break;
    case "tuner":
      base.tunerType = a.type;
      base.tunerMaxPower = String(a.maxPowerWatts);
      base.tunerInsertionLoss =
        a.insertionLossDb != null ? String(a.insertionLossDb) : "";
      break;
    case "filter":
      base.filterType = a.filterType;
      base.filterInsertionLoss = String(a.insertionLossDb);
      base.filterBands = new Set(a.bands ?? []);
      break;
    case "switch":
      base.ports = String(a.ports);
      base.switchInsertionLoss = String(a.insertionLossDb);
      break;
    case "power_supply":
      base.voltageOutput = String(a.voltageOutput);
      base.maxCurrentAmps = String(a.maxCurrentAmps);
      break;
    case "grounding":
      base.groundType = a.groundType;
      base.radialCount = a.radialCount != null ? String(a.radialCount) : "";
      break;
    case "rotator":
      base.rotatorType = a.rotatorType;
      base.speedDegPerSec =
        a.speedDegPerSec != null ? String(a.speedDegPerSec) : "1";
      break;
    case "keyer":
      base.keyerType = a.keyerType;
      base.speedMin =
        a.speedRangeWpm?.min != null ? String(a.speedRangeWpm.min) : "5";
      base.speedMax =
        a.speedRangeWpm?.max != null ? String(a.speedRangeWpm.max) : "50";
      break;
    case "audio_dsp":
      base.dspType = a.dspType;
      base.noiseReduction = a.noiseReduction ?? false;
      base.notchFilter = a.notchFilter ?? false;
      break;
  }

  return base;
}

// ─── Card helpers ────────────────────────────────────────────────────────────

function getAccessoryStats(a: UserAccessory): EquipmentCardStat[] {
  const stats: EquipmentCardStat[] = [];

  switch (a.category) {
    case "amplifier":
      stats.push({
        icon: "power",
        label: "Output",
        value: `${a.maxPowerWatts}W`,
      });
      stats.push({ icon: "gain", label: "Gain", value: `${a.gainDb} dB` });
      if (a.dutyCycle != null)
        stats.push({ icon: "score", label: "Duty", value: `${a.dutyCycle}%` });
      break;
    case "tuner":
      stats.push({
        icon: "power",
        label: "Max Power",
        value: `${a.maxPowerWatts}W`,
      });
      stats.push({
        icon: "score",
        label: "Type",
        value: a.type === "automatic" ? "Auto" : "Manual",
      });
      if (a.insertionLossDb != null)
        stats.push({
          icon: "loss",
          label: "Loss",
          value: `${a.insertionLossDb} dB`,
        });
      break;
    case "filter":
      stats.push({
        icon: "frequency",
        label: "Filter",
        value: FILTER_TYPE_LABELS[a.filterType],
      });
      stats.push({
        icon: "loss",
        label: "Loss",
        value: `${a.insertionLossDb} dB`,
      });
      break;
    case "switch":
      stats.push({ icon: "connector", label: "Ports", value: String(a.ports) });
      stats.push({
        icon: "loss",
        label: "Loss",
        value: `${a.insertionLossDb} dB`,
      });
      break;
    case "power_supply":
      stats.push({
        icon: "power",
        label: "Output",
        value: `${a.maxCurrentAmps}A @ ${a.voltageOutput}V`,
      });
      if (a.regulated != null)
        stats.push({
          icon: "score",
          label: "Regulated",
          value: a.regulated ? "Yes" : "No",
        });
      break;
    case "grounding":
      stats.push({
        icon: "impedance",
        label: "Type",
        value: GROUND_TYPE_LABELS[a.groundType] ?? a.groundType,
      });
      if (a.radialCount != null)
        stats.push({
          icon: "score",
          label: "Radials",
          value: String(a.radialCount),
        });
      if (a.groundResistanceOhms != null)
        stats.push({
          icon: "impedance",
          label: "Resistance",
          value: `${a.groundResistanceOhms} \u03A9`,
        });
      break;
    case "rotator":
      stats.push({
        icon: "score",
        label: "Type",
        value: ROTATOR_TYPE_LABELS[a.rotatorType] ?? a.rotatorType,
      });
      if (a.speedDegPerSec != null)
        stats.push({
          icon: "frequency",
          label: "Speed",
          value: `${a.speedDegPerSec}\u00B0/s`,
        });
      break;
    case "keyer":
      stats.push({
        icon: "score",
        label: "Type",
        value: KEYER_TYPE_LABELS[a.keyerType] ?? a.keyerType,
      });
      if (a.speedRangeWpm)
        stats.push({
          icon: "frequency",
          label: "Speed",
          value: `${a.speedRangeWpm.min}-${a.speedRangeWpm.max} WPM`,
        });
      break;
    case "audio_dsp":
      stats.push({
        icon: "score",
        label: "Type",
        value: DSP_TYPE_LABELS[a.dspType] ?? a.dspType,
      });
      if (a.noiseReduction)
        stats.push({ icon: "gain", label: "NR", value: "Enabled" });
      if (a.notchFilter)
        stats.push({ icon: "frequency", label: "Notch", value: "Enabled" });
      break;
  }

  return stats;
}

function getAccessoryCapabilities(
  a: UserAccessory,
): EquipmentCardCapability[] | undefined {
  const caps: EquipmentCardCapability[] = [];

  // Band capabilities for amplifiers and filters
  if (a.category === "amplifier" && a.bands && a.bands.length > 0) {
    for (const b of a.bands) caps.push({ label: b, category: "band" as const });
  }
  if (a.category === "filter" && a.bands && a.bands.length > 0) {
    for (const b of a.bands) caps.push({ label: b, category: "band" as const });
  }

  // Feature capabilities for certain categories
  if (a.category === "tuner") {
    caps.push({
      label: a.type === "automatic" ? "Auto" : "Manual",
      category: "feature" as const,
    });
  }
  if (a.category === "audio_dsp") {
    if (a.noiseReduction)
      caps.push({ label: "NR", category: "feature" as const });
    if (a.notchFilter)
      caps.push({ label: "Notch", category: "feature" as const });
  }

  return caps.length > 0 ? caps : undefined;
}

function getAccessoryDetailFields(a: UserAccessory): EquipmentDetailField[] {
  const fields: EquipmentDetailField[] = [
    { label: "Name", value: a.name },
    { label: "Category", value: CATEGORY_LABELS[a.category] },
  ];

  if (a.manufacturer)
    fields.push({ label: "Manufacturer", value: a.manufacturer });
  if (a.modelNumber) fields.push({ label: "Model", value: a.modelNumber });

  switch (a.category) {
    case "amplifier":
      fields.push({ label: "Max Power", value: a.maxPowerWatts, unit: "W" });
      fields.push({ label: "Gain", value: a.gainDb, unit: "dB" });
      if (a.dutyCycle != null)
        fields.push({ label: "Duty Cycle", value: a.dutyCycle, unit: "%" });
      if (a.warmupTimeSec != null)
        fields.push({
          label: "Warmup Time",
          value: a.warmupTimeSec,
          unit: "s",
        });
      if (a.currentDrawTxAmps != null)
        fields.push({
          label: "TX Current",
          value: a.currentDrawTxAmps,
          unit: "A",
        });
      if (a.bands && a.bands.length > 0)
        fields.push({ label: "Bands", value: a.bands.join(", ") });
      break;
    case "tuner":
      fields.push({
        label: "Tuner Type",
        value: a.type === "automatic" ? "Automatic" : "Manual",
      });
      fields.push({ label: "Max Power", value: a.maxPowerWatts, unit: "W" });
      if (a.insertionLossDb != null)
        fields.push({
          label: "Insertion Loss",
          value: a.insertionLossDb,
          unit: "dB",
        });
      break;
    case "filter":
      fields.push({
        label: "Filter Type",
        value: FILTER_TYPE_LABELS[a.filterType],
      });
      fields.push({
        label: "Insertion Loss",
        value: a.insertionLossDb,
        unit: "dB",
      });
      if (a.bands && a.bands.length > 0)
        fields.push({ label: "Bands", value: a.bands.join(", ") });
      if (a.selectivityDb != null)
        fields.push({
          label: "Selectivity",
          value: a.selectivityDb,
          unit: "dB",
        });
      if (a.passbandMHz)
        fields.push({
          label: "Passband",
          value: `${a.passbandMHz.low}-${a.passbandMHz.high}`,
          unit: "MHz",
        });
      break;
    case "switch":
      fields.push({ label: "Ports", value: a.ports });
      fields.push({
        label: "Insertion Loss",
        value: a.insertionLossDb,
        unit: "dB",
      });
      if (a.isolationDb != null)
        fields.push({ label: "Isolation", value: a.isolationDb, unit: "dB" });
      if (a.maxPowerWatts != null)
        fields.push({ label: "Max Power", value: a.maxPowerWatts, unit: "W" });
      break;
    case "power_supply":
      fields.push({ label: "Voltage", value: a.voltageOutput, unit: "V" });
      fields.push({ label: "Max Current", value: a.maxCurrentAmps, unit: "A" });
      if (a.regulated != null)
        fields.push({ label: "Regulated", value: a.regulated });
      if (a.rippleMv != null)
        fields.push({ label: "Ripple", value: a.rippleMv, unit: "mV" });
      break;
    case "grounding":
      fields.push({
        label: "Ground Type",
        value: GROUND_TYPE_LABELS[a.groundType] ?? a.groundType,
      });
      if (a.radialCount != null)
        fields.push({ label: "Radial Count", value: a.radialCount });
      if (a.groundResistanceOhms != null)
        fields.push({
          label: "Resistance",
          value: a.groundResistanceOhms,
          unit: "\u03A9",
        });
      break;
    case "rotator":
      fields.push({
        label: "Rotator Type",
        value: ROTATOR_TYPE_LABELS[a.rotatorType] ?? a.rotatorType,
      });
      if (a.speedDegPerSec != null)
        fields.push({
          label: "Speed",
          value: a.speedDegPerSec,
          unit: "\u00B0/s",
        });
      if (a.rangeDeg != null)
        fields.push({ label: "Range", value: a.rangeDeg, unit: "\u00B0" });
      if (a.brakeType)
        fields.push({ label: "Brake", value: a.brakeType.replace(/_/g, " ") });
      if (a.maxWindLoadSqFt != null)
        fields.push({
          label: "Max Wind Load",
          value: a.maxWindLoadSqFt,
          unit: "sq ft",
        });
      break;
    case "keyer":
      fields.push({
        label: "Keyer Type",
        value: KEYER_TYPE_LABELS[a.keyerType] ?? a.keyerType,
      });
      if (a.speedRangeWpm)
        fields.push({
          label: "Speed Range",
          value: `${a.speedRangeWpm.min}-${a.speedRangeWpm.max}`,
          unit: "WPM",
        });
      if (a.memorySlots != null)
        fields.push({ label: "Memory Slots", value: a.memorySlots });
      break;
    case "audio_dsp":
      fields.push({
        label: "DSP Type",
        value: DSP_TYPE_LABELS[a.dspType] ?? a.dspType,
      });
      if (a.noiseReduction != null)
        fields.push({ label: "Noise Reduction", value: a.noiseReduction });
      if (a.notchFilter != null)
        fields.push({ label: "Notch Filter", value: a.notchFilter });
      if (a.bandwidthHz)
        fields.push({
          label: "Bandwidth",
          value: `${a.bandwidthHz.min}-${a.bandwidthHz.max}`,
          unit: "Hz",
        });
      break;
  }

  if (a.currentDrawAmps != null)
    fields.push({ label: "Current Draw", value: a.currentDrawAmps, unit: "A" });
  if (a.notes) fields.push({ label: "Notes", value: a.notes });

  return fields;
}

function buildAccessoryDetailGroups(a: UserAccessory): EquipmentDetailGroup[] {
  const groups: EquipmentDetailGroup[] = [];

  // Group 1: Identity
  groups.push({
    heading: "Identity",
    fields: [
      { label: "Category", value: CATEGORY_LABELS[a.category] },
      { label: "Manufacturer", value: a.manufacturer },
      { label: "Model", value: a.modelNumber },
    ].filter((fld) => fld.value != null),
  });

  // Group 2: Specifications (category-specific)
  const specFields: EquipmentDetailField[] = [];
  switch (a.category) {
    case "amplifier":
      specFields.push({
        label: "Max Power",
        value: a.maxPowerWatts,
        unit: "W",
      });
      specFields.push({ label: "Gain", value: a.gainDb, unit: "dB" });
      if (a.dutyCycle != null)
        specFields.push({ label: "Duty Cycle", value: a.dutyCycle, unit: "%" });
      if (a.warmupTimeSec != null)
        specFields.push({
          label: "Warmup Time",
          value: a.warmupTimeSec,
          unit: "s",
        });
      if (a.currentDrawTxAmps != null)
        specFields.push({
          label: "TX Current",
          value: a.currentDrawTxAmps,
          unit: "A",
        });
      if (a.bands && a.bands.length > 0)
        specFields.push({ label: "Bands", value: a.bands.join(", ") });
      break;
    case "tuner":
      specFields.push({
        label: "Tuner Type",
        value: a.type === "automatic" ? "Automatic" : "Manual",
      });
      specFields.push({
        label: "Max Power",
        value: a.maxPowerWatts,
        unit: "W",
      });
      if (a.insertionLossDb != null)
        specFields.push({
          label: "Insertion Loss",
          value: a.insertionLossDb,
          unit: "dB",
        });
      break;
    case "filter":
      specFields.push({
        label: "Filter Type",
        value: FILTER_TYPE_LABELS[a.filterType],
      });
      specFields.push({
        label: "Insertion Loss",
        value: a.insertionLossDb,
        unit: "dB",
      });
      if (a.bands && a.bands.length > 0)
        specFields.push({ label: "Bands", value: a.bands.join(", ") });
      if (a.selectivityDb != null)
        specFields.push({
          label: "Selectivity",
          value: a.selectivityDb,
          unit: "dB",
        });
      if (a.passbandMHz)
        specFields.push({
          label: "Passband",
          value: `${a.passbandMHz.low}-${a.passbandMHz.high}`,
          unit: "MHz",
        });
      break;
    case "switch":
      specFields.push({ label: "Ports", value: a.ports });
      specFields.push({
        label: "Insertion Loss",
        value: a.insertionLossDb,
        unit: "dB",
      });
      if (a.isolationDb != null)
        specFields.push({
          label: "Isolation",
          value: a.isolationDb,
          unit: "dB",
        });
      if (a.maxPowerWatts != null)
        specFields.push({
          label: "Max Power",
          value: a.maxPowerWatts,
          unit: "W",
        });
      break;
    case "power_supply":
      specFields.push({ label: "Voltage", value: a.voltageOutput, unit: "V" });
      specFields.push({
        label: "Max Current",
        value: a.maxCurrentAmps,
        unit: "A",
      });
      if (a.regulated != null)
        specFields.push({ label: "Regulated", value: a.regulated });
      if (a.rippleMv != null)
        specFields.push({ label: "Ripple", value: a.rippleMv, unit: "mV" });
      break;
    case "grounding":
      specFields.push({
        label: "Ground Type",
        value: GROUND_TYPE_LABELS[a.groundType] ?? a.groundType,
      });
      if (a.radialCount != null)
        specFields.push({ label: "Radial Count", value: a.radialCount });
      if (a.groundResistanceOhms != null)
        specFields.push({
          label: "Resistance",
          value: a.groundResistanceOhms,
          unit: "\u03A9",
        });
      break;
    case "rotator":
      specFields.push({
        label: "Rotator Type",
        value: ROTATOR_TYPE_LABELS[a.rotatorType] ?? a.rotatorType,
      });
      if (a.speedDegPerSec != null)
        specFields.push({
          label: "Speed",
          value: a.speedDegPerSec,
          unit: "\u00B0/s",
        });
      if (a.rangeDeg != null)
        specFields.push({ label: "Range", value: a.rangeDeg, unit: "\u00B0" });
      if (a.brakeType)
        specFields.push({
          label: "Brake",
          value: a.brakeType.replace(/_/g, " "),
        });
      if (a.maxWindLoadSqFt != null)
        specFields.push({
          label: "Max Wind Load",
          value: a.maxWindLoadSqFt,
          unit: "sq ft",
        });
      break;
    case "keyer":
      specFields.push({
        label: "Keyer Type",
        value: KEYER_TYPE_LABELS[a.keyerType] ?? a.keyerType,
      });
      if (a.speedRangeWpm)
        specFields.push({
          label: "Speed Range",
          value: `${a.speedRangeWpm.min}-${a.speedRangeWpm.max}`,
          unit: "WPM",
        });
      if (a.memorySlots != null)
        specFields.push({ label: "Memory Slots", value: a.memorySlots });
      break;
    case "audio_dsp":
      specFields.push({
        label: "DSP Type",
        value: DSP_TYPE_LABELS[a.dspType] ?? a.dspType,
      });
      if (a.noiseReduction != null)
        specFields.push({ label: "Noise Reduction", value: a.noiseReduction });
      if (a.notchFilter != null)
        specFields.push({ label: "Notch Filter", value: a.notchFilter });
      if (a.bandwidthHz)
        specFields.push({
          label: "Bandwidth",
          value: `${a.bandwidthHz.min}-${a.bandwidthHz.max}`,
          unit: "Hz",
        });
      break;
  }
  if (specFields.length > 0) {
    groups.push({ heading: "Specifications", fields: specFields });
  }

  // Group 3: Configuration (common fields)
  const configFields: EquipmentDetailField[] = [];
  if (a.currentDrawAmps != null)
    configFields.push({
      label: "Current Draw",
      value: a.currentDrawAmps,
      unit: "A",
    });
  if (a.notes) configFields.push({ label: "Notes", value: a.notes });
  if (configFields.length > 0) {
    groups.push({ heading: "Configuration", fields: configFields });
  }

  return groups.filter((g) => g.fields.length > 0);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface AccessoryManagerProps {
  sectionLabel?: string;
  sectionCount?: number;
}

export function AccessoryManager({
  sectionLabel,
  sectionCount,
}: AccessoryManagerProps) {
  const accessories = useUserAccessories();
  const { addAccessory, updateAccessory, removeAccessory } = useShackStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccessoryForm>(createDefaultForm);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [viewAccessoryId, setViewAccessoryId] = useState<string | null>(null);

  // Group by category
  const grouped = ALL_CATEGORIES.reduce(
    (acc, cat) => {
      const items = accessories.filter((a) => a.category === cat);
      if (items.length > 0) acc.push({ category: cat, items });
      return acc;
    },
    [] as Array<{ category: AccessoryCategory; items: UserAccessory[] }>,
  );

  const viewedAccessory = viewAccessoryId
    ? (accessories.find((a) => a.id === viewAccessoryId) ?? null)
    : null;

  // ─── Handlers ────────────────────────────────────────────────────────

  const openAdd = () => {
    if (accessories.length >= MAX_ACCESSORIES) {
      setError(`Maximum of ${MAX_ACCESSORIES} accessories reached.`);
      return;
    }
    setEditingId(null);
    setForm(createDefaultForm());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (a: UserAccessory) => {
    setEditingId(a.id);
    setForm(formFromAccessory(a));
    setError(null);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    if (deleteTarget) removeAccessory(deleteTarget);
    setDeleteTarget(null);
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required.";

    switch (form.category) {
      case "amplifier": {
        const pw = Number.parseFloat(form.maxPowerWatts);
        if (!Number.isFinite(pw) || pw <= 0)
          return "Max power must be a positive number.";
        const g = Number.parseFloat(form.gainDb);
        if (!Number.isFinite(g)) return "Gain must be a valid number.";
        break;
      }
      case "tuner": {
        const pw = Number.parseFloat(form.tunerMaxPower);
        if (!Number.isFinite(pw) || pw <= 0)
          return "Max power must be a positive number.";
        if (form.tunerInsertionLoss.trim()) {
          const il = Number.parseFloat(form.tunerInsertionLoss);
          if (!Number.isFinite(il))
            return "Insertion loss must be a valid number.";
        }
        break;
      }
      case "filter": {
        const il = Number.parseFloat(form.filterInsertionLoss);
        if (!Number.isFinite(il) || il < 0)
          return "Insertion loss must be a non-negative number.";
        break;
      }
      case "switch": {
        const p = Number.parseInt(form.ports, 10);
        if (!Number.isFinite(p) || p < 1) return "Ports must be at least 1.";
        const il = Number.parseFloat(form.switchInsertionLoss);
        if (!Number.isFinite(il) || il < 0)
          return "Insertion loss must be a non-negative number.";
        break;
      }
      case "power_supply": {
        const v = Number.parseFloat(form.voltageOutput);
        if (!Number.isFinite(v) || v <= 0)
          return "Voltage must be a positive number.";
        const c = Number.parseFloat(form.maxCurrentAmps);
        if (!Number.isFinite(c) || c <= 0)
          return "Current must be a positive number.";
        break;
      }
      case "grounding": {
        if (form.radialCount.trim()) {
          const rc = Number.parseInt(form.radialCount, 10);
          if (!Number.isFinite(rc) || rc < 0)
            return "Radial count must be a non-negative number.";
        }
        break;
      }
      case "rotator":
      case "keyer":
      case "audio_dsp":
        break;
    }

    return null;
  };

  const save = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const base = {
      name: form.name.trim(),
      manufacturer: form.manufacturer.trim() || undefined,
      modelNumber: form.modelNumber.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    type OmitIds<T> = Omit<T, "id" | "addedAt">;

    let payload: OmitIds<UserAccessory>;

    switch (form.category) {
      case "amplifier": {
        const p: OmitIds<AmplifierAccessory> = {
          ...base,
          category: "amplifier",
          maxPowerWatts: Number.parseFloat(form.maxPowerWatts),
          gainDb: Number.parseFloat(form.gainDb),
          bands: form.bands.size > 0 ? Array.from(form.bands) : undefined,
        };
        payload = p;
        break;
      }
      case "tuner": {
        const p: OmitIds<TunerAccessory> = {
          ...base,
          category: "tuner",
          type: form.tunerType,
          maxPowerWatts: Number.parseFloat(form.tunerMaxPower),
          insertionLossDb: form.tunerInsertionLoss.trim()
            ? Number.parseFloat(form.tunerInsertionLoss)
            : undefined,
        };
        payload = p;
        break;
      }
      case "filter": {
        const p: OmitIds<FilterAccessory> = {
          ...base,
          category: "filter",
          filterType: form.filterType,
          insertionLossDb: Number.parseFloat(form.filterInsertionLoss),
          bands:
            form.filterBands.size > 0
              ? Array.from(form.filterBands)
              : undefined,
        };
        payload = p;
        break;
      }
      case "switch": {
        const p: OmitIds<SwitchAccessory> = {
          ...base,
          category: "switch",
          ports: Number.parseInt(form.ports, 10),
          insertionLossDb: Number.parseFloat(form.switchInsertionLoss),
        };
        payload = p;
        break;
      }
      case "power_supply": {
        const p: OmitIds<PowerSupplyAccessory> = {
          ...base,
          category: "power_supply",
          voltageOutput: Number.parseFloat(form.voltageOutput),
          maxCurrentAmps: Number.parseFloat(form.maxCurrentAmps),
        };
        payload = p;
        break;
      }
      case "grounding": {
        const p: OmitIds<GroundingAccessory> = {
          ...base,
          category: "grounding",
          groundType: form.groundType,
          radialCount: form.radialCount.trim()
            ? Number.parseInt(form.radialCount, 10)
            : undefined,
        };
        payload = p;
        break;
      }
      case "rotator": {
        const p: OmitIds<RotatorAccessory> = {
          ...base,
          category: "rotator",
          rotatorType: form.rotatorType,
          speedDegPerSec: form.speedDegPerSec.trim()
            ? Number.parseFloat(form.speedDegPerSec)
            : undefined,
        };
        payload = p;
        break;
      }
      case "keyer": {
        const p: OmitIds<KeyerAccessory> = {
          ...base,
          category: "keyer",
          keyerType: form.keyerType,
          speedRangeWpm: {
            min: Number.parseInt(form.speedMin, 10) || 5,
            max: Number.parseInt(form.speedMax, 10) || 50,
          },
        };
        payload = p;
        break;
      }
      case "audio_dsp": {
        const p: OmitIds<AudioDspAccessory> = {
          ...base,
          category: "audio_dsp",
          dspType: form.dspType,
          noiseReduction: form.noiseReduction,
          notchFilter: form.notchFilter,
        };
        payload = p;
        break;
      }
    }

    if (editingId) {
      const res = updateAccessory(editingId, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
    } else {
      const id = addAccessory(payload);
      if (!id) {
        setError(`Maximum of ${MAX_ACCESSORIES} accessories reached.`);
        return;
      }
    }

    setModalOpen(false);
    setEditingId(null);
    setError(null);
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          {sectionLabel ?? "Accessories"}
        </h2>
        <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
          {sectionCount ?? accessories.length}
        </span>
        <div className="flex-1" />
        <button
          onClick={openAdd}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-plasma-orange/20 border border-plasma-orange/50 text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
        >
          + Add Accessory
        </button>
      </div>

      {/* Grouped cards */}
      {grouped.length > 0 ? (
        <div className="space-y-6">
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {CATEGORY_LABELS[category]}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((a) => (
                  <EquipmentCard
                    key={a.id}
                    title={a.name}
                    subtitle={
                      [a.manufacturer, a.modelNumber]
                        .filter(Boolean)
                        .join(" ") || CATEGORY_LABELS[a.category]
                    }
                    equipmentType="accessory"
                    typeLabel={
                      CATEGORY_LABELS[a.category]?.toUpperCase() ?? "ACCESSORY"
                    }
                    badges={[
                      {
                        label: CATEGORY_LABELS[a.category],
                        color: CATEGORY_BADGE_COLOR[a.category],
                      },
                    ]}
                    stats={getAccessoryStats(a)}
                    capabilities={getAccessoryCapabilities(a)}
                    imageId={a.imageId}
                    galleryImageIds={
                      a.category === "amplifier" ? a.galleryImageIds : undefined
                    }
                    onClick={() => setViewAccessoryId(a.id)}
                    onEdit={() => openEdit(a)}
                    onDelete={() => handleDelete(a.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500 text-sm bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl">
          No accessories added yet. Add amplifiers, tuners, filters, and more to
          complete your station profile.
        </div>
      )}

      {/* View Detail Modal */}
      {viewedAccessory && (
        <EquipmentHeroCard
          open={viewAccessoryId !== null}
          onClose={() => setViewAccessoryId(null)}
          title={viewedAccessory.name}
          subtitle={
            [viewedAccessory.manufacturer, viewedAccessory.modelNumber]
              .filter(Boolean)
              .join(" ") || CATEGORY_LABELS[viewedAccessory.category]
          }
          equipmentType="accessory"
          typeLabel={
            CATEGORY_LABELS[viewedAccessory.category]?.toUpperCase() ??
            "ACCESSORY"
          }
          capabilities={getAccessoryCapabilities(viewedAccessory)}
          stats={getAccessoryStats(viewedAccessory)}
          fields={getAccessoryDetailFields(viewedAccessory)}
          groups={buildAccessoryDetailGroups(viewedAccessory)}
          badges={[
            {
              label: CATEGORY_LABELS[viewedAccessory.category],
              color: CATEGORY_BADGE_HEX[viewedAccessory.category],
            },
          ]}
          imageId={viewedAccessory.imageId}
          onImageChange={(newImageId) => {
            if (newImageId) {
              useShackStore
                .getState()
                .setEquipmentImage("accessory", viewedAccessory.id, newImageId);
            } else {
              useShackStore
                .getState()
                .clearEquipmentImage("accessory", viewedAccessory.id);
            }
          }}
          galleryImageIds={
            viewedAccessory.category === "amplifier"
              ? viewedAccessory.galleryImageIds
              : undefined
          }
          onGalleryAdd={
            viewedAccessory.category === "amplifier"
              ? (imgId) =>
                  useShackStore
                    .getState()
                    .addGalleryImage("accessory", viewedAccessory.id, imgId)
              : undefined
          }
          onGalleryRemove={
            viewedAccessory.category === "amplifier"
              ? (imgId) =>
                  useShackStore
                    .getState()
                    .removeGalleryImage("accessory", viewedAccessory.id, imgId)
              : undefined
          }
          maxGalleryImages={5}
          onEdit={() => {
            setViewAccessoryId(null);
            openEdit(viewedAccessory);
          }}
          onDelete={() => {
            setViewAccessoryId(null);
            handleDelete(viewedAccessory.id);
          }}
        />
      )}

      {/* Add / Edit Modal */}
      <DetailModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
          setError(null);
        }}
        title={editingId ? "Edit Accessory" : "Add Accessory"}
        subtitle="Configure your accessory details"
        size="lg"
      >
        <div className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
              {error}
            </div>
          )}

          {/* Category selector */}
          {!editingId && (
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, category: cat }))}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      form.category === cat
                        ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                        : "bg-white/5 text-gray-400 border border-white/10 hover:text-gray-200 hover:bg-white/10"
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Common fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Name
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                maxLength={100}
                placeholder="e.g., Ameritron AL-811"
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Manufacturer
              </label>
              <input
                value={form.manufacturer}
                onChange={(e) =>
                  setForm((p) => ({ ...p, manufacturer: e.target.value }))
                }
                placeholder="Optional"
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Model
              </label>
              <input
                value={form.modelNumber}
                onChange={(e) =>
                  setForm((p) => ({ ...p, modelNumber: e.target.value }))
                }
                placeholder="Optional"
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Category-specific fields */}
          <AccessoryCategoryFields
            category={form.category}
            form={form}
            setForm={setForm}
          />

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((p) => ({ ...p, notes: e.target.value }))
              }
              rows={3}
              placeholder="Usage notes, maintenance history..."
              className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                setEditingId(null);
                setError(null);
              }}
              className="flex-1 px-4 py-2 bg-nebula-blue/60 border border-white/10 rounded-lg
                         text-gray-200 hover:text-white hover:border-white/20 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium text-sm"
            >
              {editingId ? "Save Changes" : "Add Accessory"}
            </button>
          </div>
        </div>
      </DetailModal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Accessory"
        message="Are you sure you want to delete this accessory? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
