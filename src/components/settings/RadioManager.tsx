/**
 * RadioManager Component
 *
 * Allows users to manage their radio equipment collection.
 * Supports adding radios from a predefined database and selecting the active radio.
 *
 * Uses EquipmentCard for card rendering and EquipmentDetailModal for detail view.
 */

import { useMemo, useState } from "react";
import {
  useUserStore,
  useUserRadios,
  usePreferTestedSpecs,
} from "@/stores/userStore";
import { useShackStore } from "@/stores/shackStore";
import {
  RADIO_DATABASE,
  getRadiosByManufacturer,
  searchRadios,
  hasTestedSpecs,
  getEffectiveReceiverSpecs,
} from "@/lib/data/radios";
import { DetailModal } from "@/components/ui/DetailModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EquipmentCard } from "@/components/shack/EquipmentCard";
import { EquipmentHeroCard } from "@/components/shack/EquipmentHeroCard";
import type {
  EquipmentCardStat,
  EquipmentCardBadge,
  EquipmentCardCapability,
} from "@/components/shack/EquipmentCard";
import type {
  EquipmentDetailField,
  EquipmentDetailGroup,
} from "@/components/shack/equipmentCardTypes";
import {
  calculateReceiverScore,
  getTierLabel,
  getTierColor,
} from "@/types/radio";
import type { RadioEquipment, RadioMode, RadioTier } from "@/types/radio";

interface RadioManagerProps {
  /** Compact mode for embedding in other UIs */
  compact?: boolean;
  /** Optional z-index override for nested modals */
  modalZIndexClassName?: string;
  /** Override section header label (default: "RADIOS") */
  sectionLabel?: string;
  /** Override section item count shown in badge */
  sectionCount?: number;
}

const CUSTOM_BANDS: string[] = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
  "23cm",
];

const CUSTOM_MODES: RadioMode[] = [
  "CW",
  "SSB",
  "AM",
  "FM",
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "JS8",
  "DATA",
];

const CUSTOM_TIERS: RadioTier[] = ["entry", "midrange", "highend", "flagship"];

function getRadioDisplayLabel(
  radio: RadioEquipment,
  nickname?: string,
): string {
  const base =
    radio.displayName?.trim() || `${radio.manufacturer} ${radio.model}`;
  return nickname?.trim() ? `${nickname} — ${base}` : base;
}

type CustomRadioForm = {
  displayName: string;
  manufacturer: string;
  model: string;
  tier: RadioTier;
  releaseYear: string;
  maxPower: string;
  minPower: string;
  bands: Set<string>;
  modes: Set<RadioMode>;
  receiver: {
    rmdr: string;
    imdr3: string;
    blockingGain: string;
    sensitivity: string;
    noiseFloorDbm: string;
    ip3Dbm: string;
  };
  transmit: {
    imd3Db: string;
    spuriousDbc: string;
    notes: string;
  };
};

function createDefaultCustomForm(): CustomRadioForm {
  return {
    displayName: "",
    manufacturer: "",
    model: "",
    tier: "midrange",
    releaseYear: "",
    maxPower: "100",
    minPower: "5",
    bands: new Set(["20m", "40m"]),
    modes: new Set(["SSB", "CW", "FT8"]),
    receiver: {
      rmdr: "85",
      imdr3: "95",
      blockingGain: "120",
      sensitivity: "0.16",
      noiseFloorDbm: "",
      ip3Dbm: "",
    },
    transmit: {
      imd3Db: "",
      spuriousDbc: "",
      notes: "",
    },
  };
}

function getEffectivePreferTested(params: {
  globalPreferTested: boolean;
  specPreference?: "global" | "factory" | "tested";
}): boolean {
  const { globalPreferTested, specPreference } = params;
  if (specPreference === "factory") {
    return false;
  }
  if (specPreference === "tested") {
    return true;
  }
  return globalPreferTested;
}

/** Summarize band coverage as a short string, e.g., "HF+6m" or "HF/VHF/UHF" */
function summarizeBands(bands: string[]): string {
  const hasHF = bands.some((b) =>
    [
      "160m",
      "80m",
      "60m",
      "40m",
      "30m",
      "20m",
      "17m",
      "15m",
      "12m",
      "10m",
    ].includes(b),
  );
  const has6m = bands.includes("6m");
  const has2m = bands.includes("2m");
  const hasUHF = bands.some((b) => ["70cm", "23cm"].includes(b));

  const parts: string[] = [];
  if (hasHF) parts.push("HF");
  if (has6m) parts.push("6m");
  if (has2m) parts.push("VHF");
  if (hasUHF) parts.push("UHF");
  if (parts.length === 0) return `${bands.length} bands`;
  return parts.join("+");
}

/** Format power in watts for display */
function formatPowerDisplay(watts: number): string {
  if (watts >= 1000) return `${(watts / 1000).toFixed(1)}kW`;
  return `${Math.round(watts)}W`;
}

/** Map RadioTier to EquipmentTier (they use the same values) */
function mapTier(
  tier: RadioTier,
): "entry" | "midrange" | "highend" | "flagship" {
  return tier;
}

/** Build stats array for a radio */
function buildRadioStats(
  equipment: RadioEquipment,
  effectiveReceiver: {
    rmdr: number;
    imdr3: number;
    blockingGain: number;
    sensitivity: number;
  },
  customPowerLimit?: number,
): EquipmentCardStat[] {
  const stats: EquipmentCardStat[] = [];

  const power =
    typeof customPowerLimit === "number"
      ? customPowerLimit
      : equipment.maxPower;
  stats.push({
    icon: "power",
    label: "Power",
    value: formatPowerDisplay(power),
  });

  stats.push({
    icon: "bands",
    label: "Bands",
    value: summarizeBands(equipment.bands),
  });

  stats.push({
    icon: "score",
    label: "RX Score",
    value: String(calculateReceiverScore(effectiveReceiver)),
  });

  stats.push({
    icon: "impedance",
    label: "Impedance",
    value: "50\u03A9",
  });

  return stats;
}

/** Build badges for a radio */
function buildRadioBadges(
  equipment: RadioEquipment,
  specPreference?: "global" | "factory" | "tested",
): EquipmentCardBadge[] {
  const badges: EquipmentCardBadge[] = [];

  if (hasTestedSpecs(equipment)) {
    badges.push({ label: "Tested", color: "green" });
  }

  if (specPreference && specPreference !== "global") {
    badges.push({
      label: `Specs: ${specPreference}`,
      color: specPreference === "tested" ? "green" : "blue",
    });
  }

  badges.push({
    label: getTierLabel(equipment.tier),
    color:
      equipment.tier === "flagship"
        ? "orange"
        : equipment.tier === "highend"
          ? "blue"
          : equipment.tier === "midrange"
            ? "green"
            : "gray",
  });

  return badges;
}

/** Build detail fields for EquipmentDetailModal */
function buildRadioDetailFields(
  equipment: RadioEquipment,
  effectiveReceiver: {
    rmdr: number;
    imdr3: number;
    blockingGain: number;
    sensitivity: number;
    noiseFloorDbm?: number;
    ip3Dbm?: number;
  },
  userRadioFields?: {
    nickname?: string;
    customPowerLimit?: number;
    purchaseDate?: string;
    purchaseLocation?: string;
    firmwareRevision?: string;
    wiringConfiguration?: string;
    notes?: string;
    specPreference?: "global" | "factory" | "tested";
  },
): EquipmentDetailField[] {
  const fields: EquipmentDetailField[] = [];

  fields.push({ label: "Manufacturer", value: equipment.manufacturer });
  fields.push({ label: "Model", value: equipment.model });
  fields.push({ label: "Tier", value: getTierLabel(equipment.tier) });
  if (equipment.releaseYear) {
    fields.push({ label: "Release Year", value: equipment.releaseYear });
  }
  fields.push({ label: "Max Power", value: equipment.maxPower, unit: "W" });
  fields.push({ label: "Min Power", value: equipment.minPower, unit: "W" });
  fields.push({ label: "Bands", value: equipment.bands.join(", ") });
  fields.push({ label: "Modes", value: equipment.modes.join(", ") });

  // Receiver specs
  fields.push({ label: "RMDR", value: effectiveReceiver.rmdr, unit: "dB" });
  fields.push({ label: "IMDR3", value: effectiveReceiver.imdr3, unit: "dB" });
  fields.push({
    label: "Blocking",
    value: effectiveReceiver.blockingGain,
    unit: "dB",
  });
  fields.push({
    label: "Sensitivity",
    value: effectiveReceiver.sensitivity,
    unit: "\u00B5V",
  });
  fields.push({
    label: "RX Score",
    value: calculateReceiverScore(effectiveReceiver),
  });

  if (typeof effectiveReceiver.noiseFloorDbm === "number") {
    fields.push({
      label: "Noise Floor",
      value: effectiveReceiver.noiseFloorDbm,
      unit: "dBm",
    });
  }
  if (typeof effectiveReceiver.ip3Dbm === "number") {
    fields.push({ label: "IP3", value: effectiveReceiver.ip3Dbm, unit: "dBm" });
  }

  // Transmit specs
  if (equipment.transmit) {
    if (typeof equipment.transmit.imd3Db === "number") {
      fields.push({
        label: "TX IMD3",
        value: equipment.transmit.imd3Db,
        unit: "dB",
      });
    }
    if (typeof equipment.transmit.spuriousDbc === "number") {
      fields.push({
        label: "Spurious",
        value: equipment.transmit.spuriousDbc,
        unit: "dBc",
      });
    }
    if (equipment.transmit.notes) {
      fields.push({ label: "TX Notes", value: equipment.transmit.notes });
    }
  }

  if (hasTestedSpecs(equipment)) {
    fields.push({ label: "Tested Specs", value: "Available (Sherwood)" });
  }

  // User instance fields
  if (userRadioFields) {
    if (userRadioFields.nickname) {
      fields.push({ label: "Nickname", value: userRadioFields.nickname });
    }
    if (typeof userRadioFields.customPowerLimit === "number") {
      fields.push({
        label: "Power Limit",
        value: userRadioFields.customPowerLimit,
        unit: "W",
      });
    }
    if (userRadioFields.purchaseDate) {
      fields.push({
        label: "Purchase Date",
        value: userRadioFields.purchaseDate,
      });
    }
    if (userRadioFields.purchaseLocation) {
      fields.push({
        label: "Purchase Location",
        value: userRadioFields.purchaseLocation,
      });
    }
    if (userRadioFields.firmwareRevision) {
      fields.push({
        label: "Firmware",
        value: userRadioFields.firmwareRevision,
      });
    }
    if (
      userRadioFields.specPreference &&
      userRadioFields.specPreference !== "global"
    ) {
      fields.push({
        label: "Spec Preference",
        value: userRadioFields.specPreference,
      });
    }
    if (userRadioFields.wiringConfiguration) {
      fields.push({
        label: "Wiring",
        value: userRadioFields.wiringConfiguration,
      });
    }
    if (userRadioFields.notes) {
      fields.push({ label: "Notes", value: userRadioFields.notes });
    }
  }

  return fields;
}

/** Build capability pills (bands + modes) for EquipmentCard */
function buildRadioCapabilities(
  equipment: RadioEquipment,
): EquipmentCardCapability[] {
  const caps: EquipmentCardCapability[] = [];
  for (const band of equipment.bands) {
    caps.push({ label: band, category: "band" });
  }
  for (const mode of equipment.modes) {
    caps.push({ label: mode, category: "mode" });
  }
  return caps;
}

/** Build grouped fields for EquipmentDetailModal */
function buildRadioDetailGroups(
  equipment: RadioEquipment,
  effectiveReceiver: {
    rmdr: number;
    imdr3: number;
    blockingGain: number;
    sensitivity: number;
    noiseFloorDbm?: number;
    ip3Dbm?: number;
  },
  userRadioFields?: {
    nickname?: string;
    customPowerLimit?: number;
    purchaseDate?: string;
    purchaseLocation?: string;
    firmwareRevision?: string;
    wiringConfiguration?: string;
    notes?: string;
    specPreference?: "global" | "factory" | "tested";
  },
): EquipmentDetailGroup[] {
  const groups: EquipmentDetailGroup[] = [];

  // Group 1: Identity
  groups.push({
    heading: "Identity",
    fields: [
      { label: "Manufacturer", value: equipment.manufacturer },
      { label: "Model", value: equipment.model },
      { label: "Tier", value: getTierLabel(equipment.tier) },
      { label: "Release Year", value: equipment.releaseYear },
    ].filter((f) => f.value != null),
  });

  // Group 2: Performance
  groups.push({
    heading: "Performance",
    fields: [
      { label: "Max Power", value: equipment.maxPower, unit: "W" },
      { label: "Min Power", value: equipment.minPower, unit: "W" },
      { label: "Bands", value: equipment.bands.join(", ") },
      { label: "Modes", value: equipment.modes.join(", ") },
      { label: "Impedance", value: 50, unit: "\u03A9" },
    ].filter((f) => f.value != null),
  });

  // Group 3: Receiver
  const rxFields: EquipmentDetailField[] = [
    { label: "RX Score", value: calculateReceiverScore(effectiveReceiver) },
    { label: "RMDR", value: effectiveReceiver.rmdr, unit: "dB" },
    { label: "IMD3", value: effectiveReceiver.imdr3, unit: "dB" },
    { label: "Blocking", value: effectiveReceiver.blockingGain, unit: "dB" },
    {
      label: "Sensitivity",
      value: effectiveReceiver.sensitivity,
      unit: "\u00B5V",
    },
  ];
  if (typeof effectiveReceiver.noiseFloorDbm === "number") {
    rxFields.push({
      label: "Noise Floor",
      value: effectiveReceiver.noiseFloorDbm,
      unit: "dBm",
    });
  }
  if (typeof effectiveReceiver.ip3Dbm === "number") {
    rxFields.push({
      label: "IP3",
      value: effectiveReceiver.ip3Dbm,
      unit: "dBm",
    });
  }
  groups.push({ heading: "Receiver", fields: rxFields });

  // Group 4: Transmit (if data exists)
  if (equipment.transmit) {
    const txFields: EquipmentDetailField[] = [];
    if (typeof equipment.transmit.imd3Db === "number") {
      txFields.push({
        label: "TX IMD3",
        value: equipment.transmit.imd3Db,
        unit: "dB",
      });
    }
    if (typeof equipment.transmit.spuriousDbc === "number") {
      txFields.push({
        label: "Spurious",
        value: equipment.transmit.spuriousDbc,
        unit: "dBc",
      });
    }
    if (equipment.transmit.notes) {
      txFields.push({ label: "TX Notes", value: equipment.transmit.notes });
    }
    if (txFields.length > 0) {
      groups.push({ heading: "Transmit", fields: txFields });
    }
  }

  if (hasTestedSpecs(equipment)) {
    groups.push({
      heading: "Data Source",
      fields: [{ label: "Tested Specs", value: "Available (Sherwood)" }],
    });
  }

  // Group 5: Configuration (user instance fields)
  if (userRadioFields) {
    const configFields: EquipmentDetailField[] = [];
    if (userRadioFields.nickname) {
      configFields.push({ label: "Nickname", value: userRadioFields.nickname });
    }
    if (typeof userRadioFields.customPowerLimit === "number") {
      configFields.push({
        label: "Power Limit",
        value: userRadioFields.customPowerLimit,
        unit: "W",
      });
    }
    if (userRadioFields.purchaseDate) {
      configFields.push({
        label: "Purchase Date",
        value: userRadioFields.purchaseDate,
      });
    }
    if (userRadioFields.purchaseLocation) {
      configFields.push({
        label: "Purchase Location",
        value: userRadioFields.purchaseLocation,
      });
    }
    if (userRadioFields.firmwareRevision) {
      configFields.push({
        label: "Firmware",
        value: userRadioFields.firmwareRevision,
      });
    }
    if (
      userRadioFields.specPreference &&
      userRadioFields.specPreference !== "global"
    ) {
      configFields.push({
        label: "Spec Preference",
        value: userRadioFields.specPreference,
      });
    }
    if (userRadioFields.wiringConfiguration) {
      configFields.push({
        label: "Wiring",
        value: userRadioFields.wiringConfiguration,
      });
    }
    if (userRadioFields.notes) {
      configFields.push({ label: "Notes", value: userRadioFields.notes });
    }
    if (configFields.length > 0) {
      groups.push({ heading: "Configuration", fields: configFields });
    }
  }

  return groups.filter((g) => g.fields.length > 0);
}

/**
 * Radio Manager - Add, remove, and select radios
 */
export function RadioManager({
  compact = false,
  modalZIndexClassName,
  sectionLabel,
  sectionCount,
}: RadioManagerProps) {
  const {
    addRadio,
    addRadioInstance,
    removeRadio,
    setActiveRadio,
    updateRadioInstance,
    addCustomRadio,
    updateCustomRadio,
    removeCustomRadio,
    preferences,
  } = useUserStore();
  const userRadios = useUserRadios();
  const preferTested = usePreferTestedSpecs();
  const customRadios = useMemo(
    () => preferences.customRadios ?? [],
    [preferences.customRadios],
  );

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedManufacturer, setSelectedManufacturer] = useState<
    string | null
  >(null);

  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customModalError, setCustomModalError] = useState<string | null>(null);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customForm, setCustomForm] = useState<CustomRadioForm>(() =>
    createDefaultCustomForm(),
  );
  const [customBaseQuery, setCustomBaseQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [removeRadioTarget, setRemoveRadioTarget] = useState<string | null>(
    null,
  );

  const [instanceModalOpen, setInstanceModalOpen] = useState(false);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(
    null,
  );
  const [instanceModalError, setInstanceModalError] = useState<string | null>(
    null,
  );
  const [instanceForm, setInstanceForm] = useState<{
    nickname: string;
    customPowerLimit: string;
    purchaseDate: string;
    purchaseLocation: string;
    firmwareRevision: string;
    wiringConfiguration: string;
    notes: string;
    specPreference: "global" | "factory" | "tested";
  }>({
    nickname: "",
    customPowerLimit: "",
    purchaseDate: "",
    purchaseLocation: "",
    firmwareRevision: "",
    wiringConfiguration: "",
    notes: "",
    specPreference: "global",
  });

  // Detail modal state
  const [viewRadioId, setViewRadioId] = useState<string | null>(null);

  const instanceCountByEquipment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of preferences.radios || []) {
      counts.set(r.equipmentId, (counts.get(r.equipmentId) ?? 0) + 1);
    }
    return counts;
  }, [preferences.radios]);

  // Filtered radios for the add modal
  const filteredRadios = useMemo(() => {
    if (selectedManufacturer === "Custom") {
      return [];
    }
    if (searchQuery.trim()) {
      return searchRadios(searchQuery);
    }
    if (selectedManufacturer) {
      return RADIO_DATABASE.filter(
        (r) => r.manufacturer === selectedManufacturer,
      );
    }
    return RADIO_DATABASE;
  }, [searchQuery, selectedManufacturer]);

  // Filtered custom radios for the add modal
  const filteredCustomRadios = useMemo(() => {
    if (selectedManufacturer && selectedManufacturer !== "Custom") {
      // When a specific manufacturer is selected, show matching custom radios
      return customRadios.filter(
        (r) =>
          r.manufacturer.toLowerCase() === selectedManufacturer.toLowerCase(),
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return customRadios.filter(
        (r) =>
          r.displayName?.toLowerCase().includes(q) ||
          r.manufacturer.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q),
      );
    }
    // "All" or "Custom" — show all custom radios
    return customRadios;
  }, [searchQuery, selectedManufacturer, customRadios]);

  // Group radios by manufacturer for display
  const radiosByManufacturer = useMemo(() => getRadiosByManufacturer(), []);
  const manufacturers = useMemo(
    () => Object.keys(radiosByManufacturer).sort(),
    [radiosByManufacturer],
  );

  // Resolve the viewed radio for detail modal
  const viewedRadioData = useMemo(() => {
    if (!viewRadioId) return null;

    // Check user radio instances first
    const instanceMatch = userRadios.find(
      (r) => r.userRadio.id === viewRadioId,
    );
    if (instanceMatch && instanceMatch.equipment) {
      return {
        type: "instance" as const,
        userRadio: instanceMatch.userRadio,
        equipment: instanceMatch.equipment,
      };
    }

    // Check custom radios
    const customMatch = customRadios.find((r) => r.id === viewRadioId);
    if (customMatch) {
      return {
        type: "custom" as const,
        equipment: customMatch,
      };
    }

    return null;
  }, [viewRadioId, userRadios, customRadios]);

  const handleAddRadio = (radio: RadioEquipment) => {
    const id = addRadioInstance(radio.id);
    if (id) {
      setActiveRadio(id);
      openEditInstance(id);
    }
    setShowAddModal(false);
    setSearchQuery("");
    setSelectedManufacturer(null);
  };

  const handleRemoveRadio = (radioInstanceId: string) => {
    setRemoveRadioTarget(radioInstanceId);
  };

  const confirmRemoveRadio = () => {
    if (removeRadioTarget) {
      removeRadio(removeRadioTarget);
    }
    setRemoveRadioTarget(null);
  };

  const handleSetActiveEquipment = (equipmentId: string) => {
    const existing =
      (preferences.radios || []).find((r) => r.equipmentId === equipmentId) ??
      null;
    if (existing) {
      setActiveRadio(existing.id);
      return;
    }
    const id = addRadio(equipmentId);
    if (id) {
      setActiveRadio(id);
    }
  };

  const openEditInstance = (instanceId: string) => {
    const instance =
      (useUserStore.getState().preferences.radios || []).find(
        (r) => r.id === instanceId,
      ) ?? null;
    if (!instance) {
      return;
    }
    setEditingInstanceId(instanceId);
    setInstanceModalError(null);
    setInstanceForm({
      nickname: instance.nickname ?? "",
      customPowerLimit:
        typeof instance.customPowerLimit === "number"
          ? String(instance.customPowerLimit)
          : "",
      purchaseDate: instance.purchaseDate ?? "",
      purchaseLocation: instance.purchaseLocation ?? "",
      firmwareRevision: instance.firmwareRevision ?? "",
      wiringConfiguration: instance.wiringConfiguration ?? "",
      notes: instance.notes ?? "",
      specPreference: instance.specPreference ?? "global",
    });
    setInstanceModalOpen(true);
  };

  const saveInstance = () => {
    if (!editingInstanceId) {
      return;
    }
    setInstanceModalError(null);

    const limit =
      instanceForm.customPowerLimit.trim() === ""
        ? undefined
        : Number.parseFloat(instanceForm.customPowerLimit);
    if (typeof limit === "number" && (!Number.isFinite(limit) || limit <= 0)) {
      setInstanceModalError("Power limit must be a positive number");
      return;
    }

    const res = updateRadioInstance(editingInstanceId, {
      nickname: instanceForm.nickname.trim() || undefined,
      customPowerLimit: limit,
      purchaseDate: instanceForm.purchaseDate.trim() || undefined,
      purchaseLocation: instanceForm.purchaseLocation.trim() || undefined,
      firmwareRevision: instanceForm.firmwareRevision.trim() || undefined,
      wiringConfiguration: instanceForm.wiringConfiguration.trim() || undefined,
      notes: instanceForm.notes.trim() || undefined,
      specPreference: instanceForm.specPreference,
    });
    if (!res.ok) {
      setInstanceModalError(res.error);
      return;
    }
    setInstanceModalOpen(false);
    setEditingInstanceId(null);
  };

  const openNewCustomRadio = () => {
    setEditingCustomId(null);
    setCustomForm(createDefaultCustomForm());
    setCustomBaseQuery("");
    setCustomModalError(null);
    setCustomModalOpen(true);
  };

  const openEditCustomRadio = (radio: RadioEquipment) => {
    setEditingCustomId(radio.id);
    setCustomBaseQuery("");
    setCustomForm({
      displayName: radio.displayName?.trim() || "",
      manufacturer: radio.manufacturer || "",
      model: radio.model || "",
      tier: radio.tier,
      releaseYear: radio.releaseYear ? String(radio.releaseYear) : "",
      maxPower: String(radio.maxPower),
      minPower: String(radio.minPower),
      bands: new Set(radio.bands || []),
      modes: new Set(radio.modes || []),
      receiver: {
        rmdr: String(radio.receiver.rmdr),
        imdr3: String(radio.receiver.imdr3),
        blockingGain: String(radio.receiver.blockingGain),
        sensitivity: String(radio.receiver.sensitivity),
        noiseFloorDbm:
          typeof radio.receiver.noiseFloorDbm === "number"
            ? String(radio.receiver.noiseFloorDbm)
            : "",
        ip3Dbm:
          typeof radio.receiver.ip3Dbm === "number"
            ? String(radio.receiver.ip3Dbm)
            : "",
      },
      transmit: {
        imd3Db:
          typeof radio.transmit?.imd3Db === "number"
            ? String(radio.transmit.imd3Db)
            : "",
        spuriousDbc:
          typeof radio.transmit?.spuriousDbc === "number"
            ? String(radio.transmit.spuriousDbc)
            : "",
        notes: radio.transmit?.notes || "",
      },
    });
    setCustomModalError(null);
    setCustomModalOpen(true);
  };

  const handleDeleteCustomRadio = (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    if (deleteTarget) removeCustomRadio(deleteTarget);
    setDeleteTarget(null);
  };

  const validateCustomRadioForm = (): string | null => {
    const name = customForm.displayName.trim();
    if (!name) {
      return "Custom radio name is required.";
    }
    if (!customForm.manufacturer.trim()) {
      return "Manufacturer is required.";
    }
    if (!customForm.model.trim()) {
      return "Model is required.";
    }

    const maxPower = Number.parseFloat(customForm.maxPower);
    const minPower = Number.parseFloat(customForm.minPower);
    if (!Number.isFinite(maxPower) || maxPower <= 0) {
      return "Max power must be a positive number.";
    }
    if (!Number.isFinite(minPower) || minPower < 0) {
      return "Min power must be 0 or greater.";
    }
    if (minPower > maxPower) {
      return "Min power cannot exceed max power.";
    }
    if (customForm.bands.size === 0) {
      return "Select at least one band.";
    }
    if (customForm.modes.size === 0) {
      return "Select at least one mode.";
    }

    const rmdr = Number.parseFloat(customForm.receiver.rmdr);
    const imdr3 = Number.parseFloat(customForm.receiver.imdr3);
    const blockingGain = Number.parseFloat(customForm.receiver.blockingGain);
    const sensitivity = Number.parseFloat(customForm.receiver.sensitivity);
    if (!Number.isFinite(rmdr) || rmdr <= 0) {
      return "RMDR must be a number > 0.";
    }
    if (!Number.isFinite(imdr3) || imdr3 <= 0) {
      return "IMDR3 must be a number > 0.";
    }
    if (!Number.isFinite(blockingGain) || blockingGain <= 0) {
      return "Blocking gain must be a number > 0.";
    }
    if (!Number.isFinite(sensitivity) || sensitivity <= 0) {
      return "Sensitivity must be a number > 0.";
    }

    const optionalNumbers: Array<{ label: string; value: string }> = [
      { label: "Noise floor", value: customForm.receiver.noiseFloorDbm },
      { label: "IP3", value: customForm.receiver.ip3Dbm },
      { label: "TX IMD3", value: customForm.transmit.imd3Db },
      { label: "Spurious", value: customForm.transmit.spuriousDbc },
    ];
    for (const field of optionalNumbers) {
      const trimmed = field.value.trim();
      if (!trimmed) {
        continue;
      }
      const parsed = Number.parseFloat(trimmed);
      if (!Number.isFinite(parsed)) {
        return `${field.label} must be a valid number or left blank.`;
      }
    }

    const year = customForm.releaseYear.trim();
    if (year) {
      const parsed = Number.parseInt(year, 10);
      if (!Number.isFinite(parsed) || parsed < 1960 || parsed > 2100) {
        return "Release year must be a valid year (1960\u20132100) or blank.";
      }
    }

    return null;
  };

  const saveCustomRadio = () => {
    const validationError = validateCustomRadioForm();
    if (validationError) {
      setCustomModalError(validationError);
      return;
    }

    const maxPower = Number.parseFloat(customForm.maxPower);
    const minPower = Number.parseFloat(customForm.minPower);

    const payload: Omit<RadioEquipment, "id"> = {
      displayName: customForm.displayName.trim(),
      manufacturer: customForm.manufacturer.trim(),
      model: customForm.model.trim(),
      tier: customForm.tier,
      releaseYear: customForm.releaseYear.trim()
        ? Number.parseInt(customForm.releaseYear.trim(), 10)
        : undefined,
      maxPower,
      minPower,
      bands: Array.from(customForm.bands),
      modes: Array.from(customForm.modes),
      receiver: {
        rmdr: Number.parseFloat(customForm.receiver.rmdr),
        imdr3: Number.parseFloat(customForm.receiver.imdr3),
        blockingGain: Number.parseFloat(customForm.receiver.blockingGain),
        sensitivity: Number.parseFloat(customForm.receiver.sensitivity),
        noiseFloorDbm: customForm.receiver.noiseFloorDbm.trim()
          ? Number.parseFloat(customForm.receiver.noiseFloorDbm)
          : undefined,
        ip3Dbm: customForm.receiver.ip3Dbm.trim()
          ? Number.parseFloat(customForm.receiver.ip3Dbm)
          : undefined,
      },
      transmit:
        customForm.transmit.imd3Db.trim() ||
        customForm.transmit.spuriousDbc.trim() ||
        customForm.transmit.notes.trim()
          ? {
              imd3Db: customForm.transmit.imd3Db.trim()
                ? Number.parseFloat(customForm.transmit.imd3Db)
                : undefined,
              spuriousDbc: customForm.transmit.spuriousDbc.trim()
                ? Number.parseFloat(customForm.transmit.spuriousDbc)
                : undefined,
              notes: customForm.transmit.notes.trim() || undefined,
            }
          : undefined,
    };

    if (!editingCustomId) {
      const res = addCustomRadio(payload);
      if (!res.ok) {
        setCustomModalError(res.error);
        return;
      }
      setCustomModalOpen(false);
      setCustomModalError(null);
      return;
    }

    const res = updateCustomRadio(editingCustomId, payload);
    if (!res.ok) {
      setCustomModalError(res.error);
      return;
    }
    setCustomModalOpen(false);
    setCustomModalError(null);
  };

  const baseResults = useMemo(() => {
    if (!customBaseQuery.trim()) {
      return [];
    }
    return searchRadios(customBaseQuery).slice(0, 8);
  }, [customBaseQuery]);

  const importFromDatabase = (
    base: RadioEquipment,
    mode: "factory" | "tested",
  ) => {
    const receiver =
      mode === "tested" && base.testedSpecs ? base.testedSpecs : base.receiver;
    setCustomForm((prev) => ({
      ...prev,
      displayName:
        prev.displayName.trim() ||
        `${base.manufacturer} ${base.model} (Custom)`,
      manufacturer: base.manufacturer,
      model: base.model,
      tier: base.tier,
      releaseYear: base.releaseYear ? String(base.releaseYear) : "",
      maxPower: String(base.maxPower),
      minPower: String(base.minPower),
      bands: new Set(base.bands),
      modes: new Set(base.modes),
      receiver: {
        ...prev.receiver,
        rmdr: String(receiver.rmdr),
        imdr3: String(receiver.imdr3),
        blockingGain: String(receiver.blockingGain),
        sensitivity: String(receiver.sensitivity),
        noiseFloorDbm:
          typeof receiver.noiseFloorDbm === "number"
            ? String(receiver.noiseFloorDbm)
            : "",
        ip3Dbm:
          typeof receiver.ip3Dbm === "number" ? String(receiver.ip3Dbm) : "",
      },
      transmit: {
        ...prev.transmit,
        imd3Db:
          typeof base.transmit?.imd3Db === "number"
            ? String(base.transmit.imd3Db)
            : prev.transmit.imd3Db,
        spuriousDbc:
          typeof base.transmit?.spuriousDbc === "number"
            ? String(base.transmit.spuriousDbc)
            : prev.transmit.spuriousDbc,
        notes: base.transmit?.notes ?? prev.transmit.notes,
      },
    }));
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          {sectionLabel ?? "RADIOS"}
        </h2>
        <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
          {sectionCount ?? userRadios.length + customRadios.length}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1 text-sm bg-plasma-orange/20 border border-plasma-orange/50
                     text-plasma-orange rounded-lg hover:bg-plasma-orange/30 transition-colors"
        >
          + Add Radio
        </button>
      </div>

      {/* Radio cards grid — instance radios + custom radios merged */}
      {userRadios.length > 0 || customRadios.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {userRadios.map(({ userRadio, equipment }) => {
            if (!equipment) {
              return null;
            }
            const isActive = preferences.activeRadioId === userRadio.id;
            const effectivePreferTested = getEffectivePreferTested({
              globalPreferTested: preferTested,
              specPreference: userRadio.specPreference,
            });
            const effectiveReceiver = getEffectiveReceiverSpecs(
              equipment,
              effectivePreferTested,
            );
            const title = getRadioDisplayLabel(equipment, userRadio.nickname);
            const subtitle = equipment.displayName?.trim()
              ? equipment.manufacturer
              : equipment.model;

            return (
              <EquipmentCard
                key={userRadio.id}
                title={title}
                subtitle={subtitle}
                equipmentType="radio"
                typeLabel="TRANSCEIVER"
                tier={mapTier(equipment.tier)}
                isActive={isActive}
                onToggleActive={() =>
                  setActiveRadio(isActive ? null : userRadio.id)
                }
                badges={buildRadioBadges(equipment, userRadio.specPreference)}
                stats={buildRadioStats(
                  equipment,
                  effectiveReceiver,
                  userRadio.customPowerLimit,
                )}
                capabilities={buildRadioCapabilities(equipment)}
                imageId={userRadio.imageId}
                galleryImageIds={userRadio.galleryImageIds}
                onClick={() => setViewRadioId(userRadio.id)}
                onEdit={() => openEditInstance(userRadio.id)}
                onDelete={() => handleRemoveRadio(userRadio.id)}
              />
            );
          })}
          {customRadios.map((radio) => {
            const activeInstance =
              (preferences.radios || []).find(
                (r) => r.id === preferences.activeRadioId,
              ) ?? null;
            const isActive = activeInstance?.equipmentId === radio.id;
            const count = instanceCountByEquipment.get(radio.id) ?? 0;
            const effectivePreferTestedCustom = getEffectivePreferTested({
              globalPreferTested: preferTested,
              specPreference: undefined,
            });
            const effectiveReceiver = getEffectiveReceiverSpecs(
              radio,
              effectivePreferTestedCustom,
            );
            const title = getRadioDisplayLabel(radio);
            const subtitle = `${radio.manufacturer} ${radio.model}`;

            const badges: EquipmentCardBadge[] = [
              { label: "Custom", color: "gray" },
              ...buildRadioBadges(radio),
            ];
            if (count > 0) {
              badges.push({ label: `x${count} instances`, color: "gray" });
            }

            return (
              <EquipmentCard
                key={radio.id}
                title={title}
                subtitle={subtitle}
                equipmentType="radio"
                typeLabel="TRANSCEIVER"
                tier={mapTier(radio.tier)}
                isActive={isActive}
                onToggleActive={() => handleSetActiveEquipment(radio.id)}
                badges={badges}
                stats={buildRadioStats(radio, effectiveReceiver)}
                capabilities={buildRadioCapabilities(radio)}
                onClick={() => setViewRadioId(radio.id)}
                onEdit={() => openEditCustomRadio(radio)}
                onDelete={() => handleDeleteCustomRadio(radio.id)}
                onDuplicate={() => {
                  const id = addRadioInstance(radio.id);
                  if (id) {
                    setActiveRadio(id);
                    openEditInstance(id);
                  }
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className="p-4 text-center text-gray-500 text-sm bg-nebula-blue rounded-lg border border-white/10">
          No radios added yet. Click "+ Add Radio" to get started.
        </div>
      )}

      {/* Detail Modal */}
      {viewedRadioData &&
        (() => {
          const detailReceiver = getEffectiveReceiverSpecs(
            viewedRadioData.equipment,
            getEffectivePreferTested({
              globalPreferTested: preferTested,
              specPreference:
                viewedRadioData.type === "instance"
                  ? viewedRadioData.userRadio.specPreference
                  : undefined,
            }),
          );
          const detailUserFields =
            viewedRadioData.type === "instance"
              ? viewedRadioData.userRadio
              : undefined;
          const tierColor = getTierColor(viewedRadioData.equipment.tier);
          const tierLabel = getTierLabel(viewedRadioData.equipment.tier);

          return (
            <EquipmentHeroCard
              open={viewRadioId != null}
              onClose={() => setViewRadioId(null)}
              title={
                viewedRadioData.type === "instance"
                  ? getRadioDisplayLabel(
                      viewedRadioData.equipment,
                      viewedRadioData.userRadio.nickname,
                    )
                  : getRadioDisplayLabel(viewedRadioData.equipment)
              }
              subtitle={`${viewedRadioData.equipment.manufacturer} ${viewedRadioData.equipment.model}`}
              equipmentType="radio"
              typeLabel="TRANSCEIVER"
              tier={mapTier(viewedRadioData.equipment.tier)}
              stats={buildRadioStats(
                viewedRadioData.equipment,
                detailReceiver,
                detailUserFields?.customPowerLimit,
              )}
              capabilities={buildRadioCapabilities(viewedRadioData.equipment)}
              fields={buildRadioDetailFields(
                viewedRadioData.equipment,
                detailReceiver,
                detailUserFields,
              )}
              groups={buildRadioDetailGroups(
                viewedRadioData.equipment,
                detailReceiver,
                detailUserFields,
              )}
              badges={[
                { label: "Radio", color: "#F97316" },
                { label: tierLabel, color: tierColor },
              ]}
              onEdit={() => {
                if (viewedRadioData.type === "instance") {
                  openEditInstance(viewedRadioData.userRadio.id);
                } else {
                  openEditCustomRadio(viewedRadioData.equipment);
                }
                setViewRadioId(null);
              }}
              onDelete={() => {
                if (viewedRadioData.type === "instance") {
                  handleRemoveRadio(viewedRadioData.userRadio.id);
                } else {
                  handleDeleteCustomRadio(viewedRadioData.equipment.id);
                }
                setViewRadioId(null);
              }}
              onSetActive={() => {
                if (viewedRadioData.type === "instance") {
                  const isActive =
                    preferences.activeRadioId === viewedRadioData.userRadio.id;
                  setActiveRadio(
                    isActive ? null : viewedRadioData.userRadio.id,
                  );
                } else {
                  handleSetActiveEquipment(viewedRadioData.equipment.id);
                }
              }}
              imageId={
                viewedRadioData.type === "instance"
                  ? viewedRadioData.userRadio.imageId
                  : undefined
              }
              onImageChange={
                viewedRadioData.type === "instance"
                  ? (newImageId) => {
                      if (newImageId) {
                        useShackStore
                          .getState()
                          .setEquipmentImage(
                            "radio",
                            viewedRadioData.userRadio.id,
                            newImageId,
                          );
                      } else {
                        useShackStore
                          .getState()
                          .clearEquipmentImage(
                            "radio",
                            viewedRadioData.userRadio.id,
                          );
                      }
                    }
                  : undefined
              }
              galleryImageIds={
                viewedRadioData.type === "instance"
                  ? viewedRadioData.userRadio.galleryImageIds
                  : undefined
              }
              onGalleryAdd={
                viewedRadioData.type === "instance"
                  ? (imgId) =>
                      useShackStore
                        .getState()
                        .addGalleryImage(
                          "radio",
                          viewedRadioData.userRadio.id,
                          imgId,
                        )
                  : undefined
              }
              onGalleryRemove={
                viewedRadioData.type === "instance"
                  ? (imgId) =>
                      useShackStore
                        .getState()
                        .removeGalleryImage(
                          "radio",
                          viewedRadioData.userRadio.id,
                          imgId,
                        )
                  : undefined
              }
              maxGalleryImages={5}
              isActive={
                viewedRadioData.type === "instance"
                  ? preferences.activeRadioId === viewedRadioData.userRadio.id
                  : (() => {
                      const activeInst =
                        (preferences.radios || []).find(
                          (r) => r.id === preferences.activeRadioId,
                        ) ?? null;
                      return (
                        activeInst?.equipmentId === viewedRadioData.equipment.id
                      );
                    })()
              }
            />
          );
        })()}

      {/* Add Radio Modal */}
      <DetailModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setSearchQuery("");
          setSelectedManufacturer(null);
        }}
        title="Add Radio"
        subtitle="Add a radio from the database or your custom collection."
        size="lg"
        zIndexClassName={modalZIndexClassName ?? "z-[450]"}
      >
        <div className="space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedManufacturer(null);
            }}
            placeholder="Search radios..."
            className="w-full px-3 py-2 bg-nebula-blue border border-white/10 rounded-lg
                       text-white placeholder-gray-500
                       focus:outline-none focus:border-plasma-orange/50"
          />

          {!searchQuery && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedManufacturer(null)}
                className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                  !selectedManufacturer
                    ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                    : "bg-nebula-blue text-gray-300 border border-white/10"
                }`}
              >
                All
              </button>
              {manufacturers.map((mfr) => (
                <button
                  key={mfr}
                  type="button"
                  onClick={() => setSelectedManufacturer(mfr)}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                    selectedManufacturer === mfr
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10"
                  }`}
                >
                  {mfr}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedManufacturer("Custom")}
                className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                  selectedManufacturer === "Custom"
                    ? "bg-plasma-orange/20 text-plasma-orange border border-dashed border-plasma-orange/50"
                    : "bg-nebula-blue text-gray-300 border border-dashed border-white/10"
                }`}
              >
                Custom
              </button>
            </div>
          )}

          <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
            {/* Create New Custom Radio CTA — shown when Custom filter or searching */}
            {(selectedManufacturer === "Custom" || searchQuery.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  openNewCustomRadio();
                }}
                className="flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-white/10 hover:border-plasma-orange/30 hover:bg-white/5 transition-colors w-full text-left"
              >
                <span className="text-2xl text-gray-500">+</span>
                <div>
                  <div className="text-sm font-medium text-gray-200">
                    Create Custom Radio
                  </div>
                  <div className="text-xs text-gray-500">
                    Add a radio not in our database
                  </div>
                </div>
              </button>
            )}

            {/* Custom radios in results */}
            {filteredCustomRadios.map((radio) => {
              const count = instanceCountByEquipment.get(radio.id) ?? 0;
              return (
                <div
                  key={`custom-${radio.id}`}
                  className="p-3 rounded-lg border transition-colors bg-nebula-blue border-white/10 hover:border-plasma-orange/50 cursor-pointer"
                  onClick={() => handleAddRadio(radio)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-white font-medium truncate">
                        {radio.displayName ||
                          `${radio.manufacturer} ${radio.model}`}
                      </span>
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-white/10 text-gray-300 border border-white/10">
                        Custom
                      </span>
                      {count > 0 && (
                        <span className="text-xs text-gray-500">
                          ({count} in profile)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddModal(false);
                          openEditCustomRadio(radio);
                        }}
                        className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        title="Edit custom radio"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomRadio(radio.id);
                        }}
                        className="p-1 rounded hover:bg-alert-red/20 text-gray-400 hover:text-alert-red transition-colors"
                        title="Delete custom radio"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                      <span
                        className="px-1.5 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: getTierColor(radio.tier) + "20",
                          color: getTierColor(radio.tier),
                        }}
                      >
                        {getTierLabel(radio.tier)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                    <span>{radio.maxPower}W</span>
                    <span>|</span>
                    <span>{radio.bands.join(", ")}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {(() => {
                      const rx = getEffectiveReceiverSpecs(radio, preferTested);
                      return (
                        <>
                          RX Score: {calculateReceiverScore(rx)} | RMDR:{" "}
                          {rx.rmdr}dB
                          {" | "}IMD3: {rx.imdr3}dB
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}

            {/* Database radios */}
            {filteredRadios.map((radio) => {
              const count = instanceCountByEquipment.get(radio.id) ?? 0;
              return (
                <div
                  key={radio.id}
                  className="p-3 rounded-lg border transition-colors bg-nebula-blue border-white/10 hover:border-plasma-orange/50 cursor-pointer"
                  onClick={() => handleAddRadio(radio)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white font-medium">
                        {radio.manufacturer} {radio.model}
                      </span>
                      {count > 0 && (
                        <span className="ml-2 text-xs text-gray-500">
                          ({count} in profile)
                        </span>
                      )}
                    </div>
                    <span
                      className="px-1.5 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: getTierColor(radio.tier) + "20",
                        color: getTierColor(radio.tier),
                      }}
                    >
                      {getTierLabel(radio.tier)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                    <span>{radio.maxPower}W</span>
                    <span>|</span>
                    <span>{radio.bands.join(", ")}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {(() => {
                      const rx = getEffectiveReceiverSpecs(radio, preferTested);
                      return (
                        <>
                          RX Score: {calculateReceiverScore(rx)} | RMDR:{" "}
                          {rx.rmdr}dB
                          {" | "}IMD3: {rx.imdr3}dB
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
            {filteredRadios.length === 0 &&
              filteredCustomRadios.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  {selectedManufacturer === "Custom"
                    ? "No custom radios yet. Create one above."
                    : `No radios found matching "${searchQuery}"`}
                </div>
              )}
          </div>
        </div>
      </DetailModal>

      <DetailModal
        isOpen={instanceModalOpen}
        onClose={() => {
          setInstanceModalOpen(false);
          setEditingInstanceId(null);
          setInstanceModalError(null);
        }}
        title="Radio Instance"
        subtitle="Edit details for this specific radio you own."
        size="lg"
        zIndexClassName={modalZIndexClassName ?? "z-[450]"}
      >
        <div className="space-y-5">
          {instanceModalError && (
            <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
              {instanceModalError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Nickname (optional)
              </label>
              <input
                value={instanceForm.nickname}
                onChange={(e) =>
                  setInstanceForm((prev) => ({
                    ...prev,
                    nickname: e.target.value,
                  }))
                }
                placeholder="e.g., Portable, Shack #1"
                className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                           text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                TX power limit (W)
              </label>
              <input
                inputMode="decimal"
                value={instanceForm.customPowerLimit}
                onChange={(e) =>
                  setInstanceForm((prev) => ({
                    ...prev,
                    customPowerLimit: e.target.value,
                  }))
                }
                placeholder="(optional)"
                className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                           text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Purchase date
              </label>
              <input
                type="date"
                value={instanceForm.purchaseDate}
                onChange={(e) =>
                  setInstanceForm((prev) => ({
                    ...prev,
                    purchaseDate: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                           text-white focus:outline-none focus:border-plasma-orange/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Purchase location
              </label>
              <input
                value={instanceForm.purchaseLocation}
                onChange={(e) =>
                  setInstanceForm((prev) => ({
                    ...prev,
                    purchaseLocation: e.target.value,
                  }))
                }
                placeholder="e.g., HRO, Hamvention"
                className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                           text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Firmware revision
              </label>
              <input
                value={instanceForm.firmwareRevision}
                onChange={(e) =>
                  setInstanceForm((prev) => ({
                    ...prev,
                    firmwareRevision: e.target.value,
                  }))
                }
                placeholder="e.g., 1.42"
                className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                           text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Receiver specs source
              </label>
              <select
                value={instanceForm.specPreference}
                onChange={(e) =>
                  setInstanceForm((prev) => ({
                    ...prev,
                    specPreference: e.target.value as
                      | "global"
                      | "factory"
                      | "tested",
                  }))
                }
                className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                           text-white focus:outline-none focus:border-plasma-orange/50"
              >
                <option value="global">Use global preference</option>
                <option value="tested">Prefer tested (Sherwood)</option>
                <option value="factory">Use factory specs</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Wiring configuration
            </label>
            <textarea
              value={instanceForm.wiringConfiguration}
              onChange={(e) =>
                setInstanceForm((prev) => ({
                  ...prev,
                  wiringConfiguration: e.target.value,
                }))
              }
              rows={3}
              placeholder="CAT interface, audio chain, PTT, filters, etc."
              className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Notes
            </label>
            <textarea
              value={instanceForm.notes}
              onChange={(e) =>
                setInstanceForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              rows={3}
              placeholder="Maintenance history, mods, quirks..."
              className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setInstanceModalOpen(false);
                setEditingInstanceId(null);
              }}
              className="flex-1 px-4 py-2 bg-nebula-blue/60 border border-white/10 rounded-lg
                         text-gray-200 hover:text-white hover:border-white/20 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveInstance}
              className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </DetailModal>

      <DetailModal
        isOpen={customModalOpen}
        onClose={() => setCustomModalOpen(false)}
        title={editingCustomId ? "Edit Custom Radio" : "New Custom Radio"}
        subtitle="Saved to your profile for use in tools and DX Wizard."
        size="lg"
        zIndexClassName={modalZIndexClassName ?? "z-[450]"}
      >
        <div className="space-y-6">
          {customModalError && (
            <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
              {customModalError}
            </div>
          )}

          <div className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
            <div className="text-sm font-semibold text-white">
              Start from database (optional)
            </div>
            <div className="text-xs text-gray-400">
              Import a base radio from the built-in database, then tweak specs
              as needed.
            </div>
            <input
              value={customBaseQuery}
              onChange={(e) => setCustomBaseQuery(e.target.value)}
              placeholder="Search database (e.g., IC-7300, FT-891, K3S)..."
              className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
            />
            {baseResults.length > 0 && (
              <div className="space-y-2">
                {baseResults.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-nebula-blue/40 border border-white/10"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {r.manufacturer} {r.model}
                        {hasTestedSpecs(r) && (
                          <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                            Tested
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {r.maxPower}W &bull; Tier: {r.tier} &bull; Bands:{" "}
                        {r.bands.slice(0, 4).join(", ")}
                        {r.bands.length > 4 ? "\u2026" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => importFromDatabase(r, "factory")}
                        className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition-colors"
                      >
                        Import factory
                      </button>
                      <button
                        type="button"
                        disabled={!hasTestedSpecs(r)}
                        onClick={() => importFromDatabase(r, "tested")}
                        className="text-[10px] px-2 py-1 rounded bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Import tested
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">
                  Custom name
                </label>
                <input
                  value={customForm.displayName}
                  onChange={(e) =>
                    setCustomForm((prev) => ({
                      ...prev,
                      displayName: e.target.value,
                    }))
                  }
                  placeholder="e.g., Portable HF Rig"
                  className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                             text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Manufacturer
                  </label>
                  <input
                    value={customForm.manufacturer}
                    onChange={(e) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        manufacturer: e.target.value,
                      }))
                    }
                    placeholder="Icom"
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Model
                  </label>
                  <input
                    value={customForm.model}
                    onChange={(e) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        model: e.target.value,
                      }))
                    }
                    placeholder="IC-7300"
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Tier
                  </label>
                  <select
                    value={customForm.tier}
                    onChange={(e) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        tier: e.target.value as RadioTier,
                      }))
                    }
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white focus:outline-none focus:border-plasma-orange/50"
                  >
                    {CUSTOM_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {getTierLabel(tier)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Max W
                  </label>
                  <input
                    inputMode="decimal"
                    value={customForm.maxPower}
                    onChange={(e) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        maxPower: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white focus:outline-none focus:border-plasma-orange/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Min W
                  </label>
                  <input
                    inputMode="decimal"
                    value={customForm.minPower}
                    onChange={(e) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        minPower: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white focus:outline-none focus:border-plasma-orange/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Bands
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CUSTOM_BANDS.map((band) => {
                    const checked = customForm.bands.has(band);
                    return (
                      <label
                        key={band}
                        className="flex items-center gap-2 text-xs text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCustomForm((prev) => {
                              const next = new Set(prev.bands);
                              if (next.has(band)) {
                                next.delete(band);
                              } else next.add(band);
                              return { ...prev, bands: next };
                            })
                          }
                          className="accent-plasma-orange"
                        />
                        {band}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Modes
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CUSTOM_MODES.map((mode) => {
                    const checked = customForm.modes.has(mode);
                    return (
                      <label
                        key={mode}
                        className="flex items-center gap-2 text-xs text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setCustomForm((prev) => {
                              const next = new Set(prev.modes);
                              if (next.has(mode)) {
                                next.delete(mode);
                              } else next.add(mode);
                              return { ...prev, modes: next };
                            })
                          }
                          className="accent-plasma-orange"
                        />
                        {mode}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">
                  Release year (optional)
                </label>
                <input
                  inputMode="numeric"
                  value={customForm.releaseYear}
                  onChange={(e) =>
                    setCustomForm((prev) => ({
                      ...prev,
                      releaseYear: e.target.value,
                    }))
                  }
                  placeholder="2019"
                  className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                             text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-white mb-2">
                  Receiver metrics (required)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { key: "rmdr", label: "RMDR (dB)" },
                      { key: "imdr3", label: "IMDR3 (dB)" },
                      { key: "blockingGain", label: "Blocking (dB)" },
                      { key: "sensitivity", label: "Sens (\u00B5V)" },
                    ] as const
                  ).map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        {field.label}
                      </label>
                      <input
                        inputMode="decimal"
                        value={customForm.receiver[field.key]}
                        onChange={(e) =>
                          setCustomForm((prev) => ({
                            ...prev,
                            receiver: {
                              ...prev.receiver,
                              [field.key]: e.target.value,
                            },
                          }))
                        }
                        className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                                   text-white focus:outline-none focus:border-plasma-orange/50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-white mb-2">
                  Optional RX/TX details
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Noise floor (dBm)
                    </label>
                    <input
                      inputMode="decimal"
                      value={customForm.receiver.noiseFloorDbm}
                      onChange={(e) =>
                        setCustomForm((prev) => ({
                          ...prev,
                          receiver: {
                            ...prev.receiver,
                            noiseFloorDbm: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                                 text-white focus:outline-none focus:border-plasma-orange/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      IP3 (dBm)
                    </label>
                    <input
                      inputMode="decimal"
                      value={customForm.receiver.ip3Dbm}
                      onChange={(e) =>
                        setCustomForm((prev) => ({
                          ...prev,
                          receiver: {
                            ...prev.receiver,
                            ip3Dbm: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                                 text-white focus:outline-none focus:border-plasma-orange/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      TX IMD3 (dB)
                    </label>
                    <input
                      inputMode="decimal"
                      value={customForm.transmit.imd3Db}
                      onChange={(e) =>
                        setCustomForm((prev) => ({
                          ...prev,
                          transmit: {
                            ...prev.transmit,
                            imd3Db: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                                 text-white focus:outline-none focus:border-plasma-orange/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Spurious (dBc)
                    </label>
                    <input
                      inputMode="decimal"
                      value={customForm.transmit.spuriousDbc}
                      onChange={(e) =>
                        setCustomForm((prev) => ({
                          ...prev,
                          transmit: {
                            ...prev.transmit,
                            spuriousDbc: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                                 text-white focus:outline-none focus:border-plasma-orange/50"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={customForm.transmit.notes}
                    onChange={(e) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        transmit: { ...prev.transmit, notes: e.target.value },
                      }))
                    }
                    rows={4}
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
                    placeholder="Anything about filters, ALC behavior, settings, etc."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCustomModalOpen(false)}
              className="flex-1 px-4 py-2 bg-nebula-blue/60 border border-white/10 rounded-lg
                         text-gray-200 hover:text-white hover:border-white/20
                         transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveCustomRadio}
              className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30
                         transition-colors font-medium text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </DetailModal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Custom Radio"
        message="Are you sure you want to delete this custom radio? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
      />

      <ConfirmDialog
        open={removeRadioTarget !== null}
        title="Remove Radio"
        message="Are you sure you want to remove this radio from your shack? This cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={confirmRemoveRadio}
        onCancel={() => setRemoveRadioTarget(null)}
      />
    </div>
  );
}
