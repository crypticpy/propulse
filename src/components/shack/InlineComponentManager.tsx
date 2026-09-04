/**
 * InlineComponentManager — Card-list CRUD for inline signal chain components
 * (adapters, pigtails, chokes, baluns, ferrites).
 *
 * Uses EquipmentCard for display and EquipmentDetailModal for detail view.
 * Add/edit/duplicate via DetailModal, delete via ConfirmDialog.
 */

import { useState } from "react";
import { useShackStore, useInlineComponents } from "@/stores/shackStore";
import type {
  InlineComponent,
  InlineComponentType,
  ConnectorType,
  AdapterComponent,
  PigtailComponent,
  ChokeComponent,
  BalunComponent,
  FerriteComponent,
} from "@/types/shack";
import {
  MAX_INLINE_COMPONENTS,
  INLINE_COMPONENT_LABELS,
  CONNECTOR_TYPE_LABELS,
} from "@/types/shack";
import { DetailModal } from "@/components/ui/DetailModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EquipmentCard } from "@/components/shack/EquipmentCard";
import { EquipmentHeroCard } from "@/components/shack/EquipmentHeroCard";
import type { EquipmentCardStat } from "@/components/shack/EquipmentCard";
import type {
  EquipmentDetailField,
  EquipmentDetailGroup,
} from "@/components/shack/equipmentCardTypes";

// ─── Constants ────────────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none";

const ALL_COMPONENT_TYPES = Object.keys(
  INLINE_COMPONENT_LABELS,
) as InlineComponentType[];

const ALL_CONNECTOR_TYPES = Object.keys(
  CONNECTOR_TYPE_LABELS,
) as ConnectorType[];

const CHOKE_MATERIALS = [
  { value: "ferrite_core", label: "Ferrite Core" },
  { value: "air_wound", label: "Air Wound" },
  { value: "snap_on", label: "Snap-On" },
] as const;

const BALUN_RATIOS = [
  { value: "1:1", label: "1:1" },
  { value: "4:1", label: "4:1" },
  { value: "9:1", label: "9:1" },
  { value: "other", label: "Other" },
] as const;

const BALUN_TYPES = [
  { value: "current", label: "Current Balun" },
  { value: "voltage", label: "Voltage Balun" },
] as const;

const CHOKE_TYPE_LABELS: Record<string, string> = {
  common_mode: "Common Mode",
  line_isolator: "Line Isolator",
  feed_through: "Feed-Through",
};

const FERRITE_TYPE_LABELS: Record<string, string> = {
  snap_on: "Snap-On",
  toroid: "Toroid",
  bead: "Bead",
};

const TYPE_BADGE_COLOR: Record<
  InlineComponentType,
  "orange" | "green" | "amber" | "red" | "blue" | "gray"
> = {
  adapter: "gray",
  pigtail: "blue",
  choke: "amber",
  balun: "orange",
  ferrite: "green",
};

const TYPE_BADGE_HEX: Record<InlineComponentType, string> = {
  adapter: "#9CA3AF",
  pigtail: "#3B82F6",
  choke: "#F59E0B",
  balun: "#F97316",
  ferrite: "#22C55E",
};

// ─── Form state ───────────────────────────────────────────────────────────────

interface ComponentForm {
  name: string;
  componentType: InlineComponentType;
  insertionLossDb: string;
  notes: string;
  // adapter / pigtail
  fromConnector: ConnectorType;
  toConnector: ConnectorType;
  // pigtail
  lengthInches: string;
  // choke
  chokeMaterial: "ferrite_core" | "air_wound" | "snap_on";
  chokeTurns: string;
  chokeImpedanceOhms: string;
  chokeFrequencyRangeMHz: string;
  // balun
  balunRatio: "1:1" | "4:1" | "9:1" | "other";
  balunType: "current" | "voltage";
  balunPowerRatingWatts: string;
  // ferrite
  ferriteMaterial: string;
  ferriteTurns: string;
  ferriteImpedanceOhms: string;
}

function createDefaultForm(): ComponentForm {
  return {
    name: "",
    componentType: "adapter",
    insertionLossDb: "0.1",
    notes: "",
    fromConnector: "pl259",
    toConnector: "n_type",
    lengthInches: "12",
    chokeMaterial: "ferrite_core",
    chokeTurns: "6",
    chokeImpedanceOhms: "",
    chokeFrequencyRangeMHz: "1.8-30",
    balunRatio: "1:1",
    balunType: "current",
    balunPowerRatingWatts: "",
    ferriteMaterial: "Type 31",
    ferriteTurns: "1",
    ferriteImpedanceOhms: "",
  };
}

function formFromComponent(c: InlineComponent): ComponentForm {
  const base: ComponentForm = {
    ...createDefaultForm(),
    name: c.name,
    componentType: c.componentType,
    insertionLossDb: String(c.insertionLossDb),
    notes: c.notes ?? "",
  };

  switch (c.componentType) {
    case "adapter": {
      const a = c as AdapterComponent;
      base.fromConnector = a.connectorFrom;
      base.toConnector = a.connectorTo;
      break;
    }
    case "pigtail": {
      const p = c as PigtailComponent;
      base.fromConnector = p.connectorFrom;
      base.toConnector = p.connectorTo;
      base.lengthInches = String(p.lengthInches);
      break;
    }
    case "choke": {
      const ch = c as ChokeComponent;
      base.chokeMaterial =
        ch.chokeType === "common_mode"
          ? "ferrite_core"
          : ch.chokeType === "line_isolator"
            ? "air_wound"
            : "snap_on";
      base.chokeTurns = ch.turns !== undefined ? String(ch.turns) : "";
      base.chokeImpedanceOhms =
        ch.impedance !== undefined ? String(ch.impedance) : "";
      base.chokeFrequencyRangeMHz = ch.bands?.join(", ") ?? "";
      break;
    }
    case "balun": {
      const b = c as BalunComponent;
      // Map ratio string to our select options
      const ratioMap: Record<string, ComponentForm["balunRatio"]> = {
        "1:1": "1:1",
        "4:1": "4:1",
        "9:1": "9:1",
        "1:1_current": "1:1",
        "4:1_current": "4:1",
        "6:1": "other",
      };
      base.balunRatio = ratioMap[b.ratio] ?? "other";
      // Determine balun type from ratio suffix
      base.balunType = b.ratio.includes("current") ? "current" : "voltage";
      base.balunPowerRatingWatts =
        b.maxPowerWatts !== undefined ? String(b.maxPowerWatts) : "";
      break;
    }
    case "ferrite": {
      const f = c as FerriteComponent;
      base.ferriteMaterial = f.material ?? "";
      base.ferriteTurns = f.turns !== undefined ? String(f.turns) : "1";
      base.ferriteImpedanceOhms =
        f.impedanceOhms !== undefined ? String(f.impedanceOhms) : "";
      break;
    }
  }

  return base;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Distributed Omit for discriminated unions */
type OmitFromUnion<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** Build the store-compatible payload from form state */
function buildPayload(
  form: ComponentForm,
): OmitFromUnion<InlineComponent, "id" | "addedAt"> {
  const base = {
    name: form.name.trim(),
    insertionLossDb: Number.parseFloat(form.insertionLossDb) || 0,
    notes: form.notes.trim() || undefined,
  };

  switch (form.componentType) {
    case "adapter":
      return {
        ...base,
        componentType: "adapter" as const,
        connectorFrom: form.fromConnector,
        connectorTo: form.toConnector,
      } as Omit<AdapterComponent, "id" | "addedAt">;
    case "pigtail":
      return {
        ...base,
        componentType: "pigtail" as const,
        connectorFrom: form.fromConnector,
        connectorTo: form.toConnector,
        lengthInches: Number.parseFloat(form.lengthInches) || 0,
      } as Omit<PigtailComponent, "id" | "addedAt">;
    case "choke": {
      const chokeTypeMap: Record<string, ChokeComponent["chokeType"]> = {
        ferrite_core: "common_mode",
        air_wound: "line_isolator",
        snap_on: "feed_through",
      };
      return {
        ...base,
        componentType: "choke" as const,
        chokeType: chokeTypeMap[form.chokeMaterial] ?? "common_mode",
        impedance: form.chokeImpedanceOhms
          ? Number.parseFloat(form.chokeImpedanceOhms)
          : undefined,
        turns: form.chokeTurns
          ? Number.parseInt(form.chokeTurns, 10)
          : undefined,
        bands: form.chokeFrequencyRangeMHz.trim()
          ? [form.chokeFrequencyRangeMHz.trim()]
          : undefined,
      } as Omit<ChokeComponent, "id" | "addedAt">;
    }
    case "balun": {
      // Build ratio value compatible with BalunComponent type
      const ratio = form.balunRatio === "other" ? "1:1" : form.balunRatio;
      const isCurrent = form.balunType === "current";
      const storeRatio =
        isCurrent && (ratio === "1:1" || ratio === "4:1")
          ? (`${ratio}_current` as BalunComponent["ratio"])
          : (ratio as BalunComponent["ratio"]);

      return {
        ...base,
        componentType: "balun" as const,
        ratio: storeRatio,
        maxPowerWatts: form.balunPowerRatingWatts
          ? Number.parseFloat(form.balunPowerRatingWatts)
          : undefined,
      } as Omit<BalunComponent, "id" | "addedAt">;
    }
    case "ferrite":
      return {
        ...base,
        componentType: "ferrite" as const,
        ferriteType: "snap_on" as const,
        material: (form.ferriteMaterial.trim() || undefined) as
          | FerriteComponent["material"]
          | undefined,
        count: 1,
        turns: form.ferriteTurns
          ? Number.parseInt(form.ferriteTurns, 10)
          : undefined,
        impedanceOhms: form.ferriteImpedanceOhms
          ? Number.parseFloat(form.ferriteImpedanceOhms)
          : undefined,
      } as Omit<FerriteComponent, "id" | "addedAt">;
  }
}

// ─── Card helpers ─────────────────────────────────────────────────────────────

function getInlineStats(c: InlineComponent): EquipmentCardStat[] {
  const stats: EquipmentCardStat[] = [];

  // Common: insertion loss
  stats.push({
    icon: "loss",
    label: "Loss",
    value: `${c.insertionLossDb.toFixed(2)} dB`,
  });

  switch (c.componentType) {
    case "adapter": {
      const a = c as AdapterComponent;
      stats.push({
        icon: "connector",
        label: "From",
        value: CONNECTOR_TYPE_LABELS[a.connectorFrom],
      });
      stats.push({
        icon: "connector",
        label: "To",
        value: CONNECTOR_TYPE_LABELS[a.connectorTo],
      });
      break;
    }
    case "pigtail": {
      const p = c as PigtailComponent;
      stats.push({
        icon: "connector",
        label: "From",
        value: CONNECTOR_TYPE_LABELS[p.connectorFrom],
      });
      stats.push({
        icon: "connector",
        label: "To",
        value: CONNECTOR_TYPE_LABELS[p.connectorTo],
      });
      stats.push({
        icon: "length",
        label: "Length",
        value: `${p.lengthInches}"`,
      });
      break;
    }
    case "choke": {
      const ch = c as ChokeComponent;
      stats.push({
        icon: "score",
        label: "Type",
        value: CHOKE_TYPE_LABELS[ch.chokeType] ?? ch.chokeType,
      });
      if (ch.impedance != null)
        stats.push({
          icon: "impedance",
          label: "Impedance",
          value: `${ch.impedance} \u03A9`,
        });
      if (ch.turns != null)
        stats.push({
          icon: "score",
          label: "Turns",
          value: String(ch.turns),
        });
      if (ch.bands && ch.bands.length > 0)
        stats.push({
          icon: "frequency",
          label: "Range",
          value: ch.bands.join(", "),
        });
      break;
    }
    case "balun": {
      const b = c as BalunComponent;
      stats.push({
        icon: "impedance",
        label: "Ratio",
        value: b.ratio.replace(/_current$/, ""),
      });
      if (b.maxPowerWatts != null)
        stats.push({
          icon: "power",
          label: "Max Power",
          value: `${b.maxPowerWatts}W`,
        });
      break;
    }
    case "ferrite": {
      const f = c as FerriteComponent;
      stats.push({
        icon: "score",
        label: "Style",
        value: FERRITE_TYPE_LABELS[f.ferriteType] ?? f.ferriteType,
      });
      if (f.material)
        stats.push({
          icon: "score",
          label: "Material",
          value: `Type ${f.material}`,
        });
      if (f.impedanceOhms != null)
        stats.push({
          icon: "impedance",
          label: "Impedance",
          value: `${f.impedanceOhms} \u03A9`,
        });
      if (f.turns != null && f.turns > 1)
        stats.push({
          icon: "score",
          label: "Turns",
          value: String(f.turns),
        });
      break;
    }
  }

  return stats;
}

function getInlineDetailFields(c: InlineComponent): EquipmentDetailField[] {
  const fields: EquipmentDetailField[] = [
    { label: "Name", value: c.name },
    { label: "Type", value: INLINE_COMPONENT_LABELS[c.componentType] },
    { label: "Insertion Loss", value: c.insertionLossDb, unit: "dB" },
  ];

  if (c.manufacturer)
    fields.push({ label: "Manufacturer", value: c.manufacturer });

  switch (c.componentType) {
    case "adapter": {
      const a = c as AdapterComponent;
      fields.push({
        label: "From Connector",
        value: CONNECTOR_TYPE_LABELS[a.connectorFrom],
      });
      fields.push({
        label: "To Connector",
        value: CONNECTOR_TYPE_LABELS[a.connectorTo],
      });
      break;
    }
    case "pigtail": {
      const p = c as PigtailComponent;
      fields.push({
        label: "From Connector",
        value: CONNECTOR_TYPE_LABELS[p.connectorFrom],
      });
      fields.push({
        label: "To Connector",
        value: CONNECTOR_TYPE_LABELS[p.connectorTo],
      });
      fields.push({ label: "Length", value: p.lengthInches, unit: "inches" });
      if (p.cableType) fields.push({ label: "Cable Type", value: p.cableType });
      break;
    }
    case "choke": {
      const ch = c as ChokeComponent;
      fields.push({
        label: "Choke Type",
        value: CHOKE_TYPE_LABELS[ch.chokeType] ?? ch.chokeType,
      });
      if (ch.impedance != null)
        fields.push({
          label: "Impedance",
          value: ch.impedance,
          unit: "\u03A9",
        });
      if (ch.turns != null) fields.push({ label: "Turns", value: ch.turns });
      if (ch.bands && ch.bands.length > 0)
        fields.push({ label: "Frequency Range", value: ch.bands.join(", ") });
      break;
    }
    case "balun": {
      const b = c as BalunComponent;
      fields.push({ label: "Ratio", value: b.ratio.replace(/_current$/, "") });
      fields.push({
        label: "Balun Type",
        value: b.ratio.includes("current") ? "Current" : "Voltage",
      });
      if (b.maxPowerWatts != null)
        fields.push({ label: "Max Power", value: b.maxPowerWatts, unit: "W" });
      if (b.bands && b.bands.length > 0)
        fields.push({ label: "Bands", value: b.bands.join(", ") });
      break;
    }
    case "ferrite": {
      const f = c as FerriteComponent;
      fields.push({
        label: "Ferrite Style",
        value: FERRITE_TYPE_LABELS[f.ferriteType] ?? f.ferriteType,
      });
      if (f.material)
        fields.push({ label: "Material", value: `Type ${f.material}` });
      fields.push({ label: "Count", value: f.count });
      if (f.turns != null) fields.push({ label: "Turns", value: f.turns });
      if (f.impedanceOhms != null)
        fields.push({
          label: "Impedance",
          value: f.impedanceOhms,
          unit: "\u03A9",
        });
      break;
    }
  }

  if (c.notes) fields.push({ label: "Notes", value: c.notes });

  return fields;
}

function buildInlineDetailGroups(c: InlineComponent): EquipmentDetailGroup[] {
  const groups: EquipmentDetailGroup[] = [];

  // Common specs
  const specFields: EquipmentDetailField[] = [
    { label: "Type", value: INLINE_COMPONENT_LABELS[c.componentType] },
    { label: "Insertion Loss", value: c.insertionLossDb, unit: "dB" },
  ];
  if (c.manufacturer) {
    specFields.push({ label: "Manufacturer", value: c.manufacturer });
  }

  // Type-specific specs
  switch (c.componentType) {
    case "adapter": {
      const a = c as AdapterComponent;
      specFields.push({
        label: "From Connector",
        value: CONNECTOR_TYPE_LABELS[a.connectorFrom],
      });
      specFields.push({
        label: "To Connector",
        value: CONNECTOR_TYPE_LABELS[a.connectorTo],
      });
      break;
    }
    case "pigtail": {
      const p = c as PigtailComponent;
      specFields.push({
        label: "From Connector",
        value: CONNECTOR_TYPE_LABELS[p.connectorFrom],
      });
      specFields.push({
        label: "To Connector",
        value: CONNECTOR_TYPE_LABELS[p.connectorTo],
      });
      specFields.push({
        label: "Length",
        value: p.lengthInches,
        unit: "inches",
      });
      if (p.cableType)
        specFields.push({ label: "Cable Type", value: p.cableType });
      break;
    }
    case "choke": {
      const ch = c as ChokeComponent;
      specFields.push({
        label: "Choke Type",
        value: CHOKE_TYPE_LABELS[ch.chokeType] ?? ch.chokeType,
      });
      if (ch.impedance != null)
        specFields.push({
          label: "Impedance",
          value: ch.impedance,
          unit: "\u03A9",
        });
      if (ch.turns != null)
        specFields.push({ label: "Turns", value: ch.turns });
      if (ch.bands && ch.bands.length > 0)
        specFields.push({
          label: "Frequency Range",
          value: ch.bands.join(", "),
        });
      break;
    }
    case "balun": {
      const b = c as BalunComponent;
      specFields.push({
        label: "Ratio",
        value: b.ratio.replace(/_current$/, ""),
      });
      specFields.push({
        label: "Balun Type",
        value: b.ratio.includes("current") ? "Current" : "Voltage",
      });
      if (b.maxPowerWatts != null)
        specFields.push({
          label: "Max Power",
          value: b.maxPowerWatts,
          unit: "W",
        });
      if (b.bands && b.bands.length > 0)
        specFields.push({ label: "Bands", value: b.bands.join(", ") });
      break;
    }
    case "ferrite": {
      const f = c as FerriteComponent;
      specFields.push({
        label: "Ferrite Style",
        value: FERRITE_TYPE_LABELS[f.ferriteType] ?? f.ferriteType,
      });
      if (f.material)
        specFields.push({ label: "Material", value: `Type ${f.material}` });
      specFields.push({ label: "Count", value: f.count });
      if (f.turns != null) specFields.push({ label: "Turns", value: f.turns });
      if (f.impedanceOhms != null)
        specFields.push({
          label: "Impedance",
          value: f.impedanceOhms,
          unit: "\u03A9",
        });
      break;
    }
  }

  groups.push({
    heading: "Specifications",
    fields: specFields.filter((fld) => fld.value != null),
  });

  // Notes group
  if (c.notes) {
    groups.push({
      heading: "Notes",
      fields: [{ label: "Notes", value: c.notes }],
    });
  }

  return groups.filter((g) => g.fields.length > 0);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface InlineComponentManagerProps {
  sectionLabel?: string;
  sectionCount?: number;
}

export function InlineComponentManager({
  sectionLabel,
  sectionCount,
}: InlineComponentManagerProps) {
  const components = useInlineComponents();
  const {
    addInlineComponent,
    updateInlineComponent,
    removeInlineComponent,
    duplicateInlineComponent,
  } = useShackStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ComponentForm>(createDefaultForm);
  const [error, setError] = useState<string | null>(null);
  const [viewInlineId, setViewInlineId] = useState<string | null>(null);

  // ConfirmDialog state
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const viewedComponent = viewInlineId
    ? (components.find((c) => c.id === viewInlineId) ?? null)
    : null;

  // ─── Handlers ──────────────────────────────────────────────────────────

  const openAdd = () => {
    if (components.length >= MAX_INLINE_COMPONENTS) {
      setError(
        `Maximum of ${MAX_INLINE_COMPONENTS} inline components reached.`,
      );
      return;
    }
    setEditingId(null);
    setForm(createDefaultForm());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: InlineComponent) => {
    setEditingId(c.id);
    setForm(formFromComponent(c));
    setError(null);
    setModalOpen(true);
  };

  const requestDelete = (c: InlineComponent) => {
    setDeleteTarget({ id: c.id, name: c.name });
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      removeInlineComponent(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleDuplicate = (id: string) => {
    duplicateInlineComponent(id);
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required.";
    const loss = Number.parseFloat(form.insertionLossDb);
    if (!Number.isFinite(loss) || loss < 0)
      return "Insertion loss must be a non-negative number.";

    switch (form.componentType) {
      case "pigtail": {
        const len = Number.parseFloat(form.lengthInches);
        if (!Number.isFinite(len) || len <= 0)
          return "Pigtail length must be a positive number.";
        break;
      }
      case "choke": {
        if (form.chokeTurns) {
          const turns = Number.parseInt(form.chokeTurns, 10);
          if (!Number.isFinite(turns) || turns < 0)
            return "Turns must be a non-negative integer.";
        }
        if (form.chokeImpedanceOhms) {
          const imp = Number.parseFloat(form.chokeImpedanceOhms);
          if (!Number.isFinite(imp) || imp < 0)
            return "Impedance must be a non-negative number.";
        }
        break;
      }
      case "balun": {
        if (form.balunPowerRatingWatts) {
          const pwr = Number.parseFloat(form.balunPowerRatingWatts);
          if (!Number.isFinite(pwr) || pwr <= 0)
            return "Power rating must be a positive number.";
        }
        break;
      }
      case "ferrite": {
        if (form.ferriteTurns) {
          const turns = Number.parseInt(form.ferriteTurns, 10);
          if (!Number.isFinite(turns) || turns < 0)
            return "Turns must be a non-negative integer.";
        }
        if (form.ferriteImpedanceOhms) {
          const imp = Number.parseFloat(form.ferriteImpedanceOhms);
          if (!Number.isFinite(imp) || imp < 0)
            return "Impedance must be a non-negative number.";
        }
        break;
      }
    }

    return null;
  };

  const save = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = buildPayload(form);

    if (editingId) {
      const res = updateInlineComponent(editingId, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
    } else {
      const id = addInlineComponent(payload);
      if (!id) {
        setError(
          `Maximum of ${MAX_INLINE_COMPONENTS} inline components reached.`,
        );
        return;
      }
    }

    setModalOpen(false);
    setEditingId(null);
    setError(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          {sectionLabel ?? "Inline Components"}
        </h2>
        <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
          {sectionCount ?? components.length}
        </span>
        <div className="flex-1" />
        <button
          onClick={openAdd}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-plasma-orange/20 border border-plasma-orange/50 text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
        >
          + Add Inline Component
        </button>
      </div>

      {/* Card grid */}
      {components.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {components.map((c) => (
            <EquipmentCard
              key={c.id}
              title={c.name}
              subtitle={INLINE_COMPONENT_LABELS[c.componentType]}
              equipmentType="inline"
              typeLabel={
                INLINE_COMPONENT_LABELS[c.componentType]?.toUpperCase() ??
                "INLINE"
              }
              badges={[
                {
                  label: INLINE_COMPONENT_LABELS[c.componentType],
                  color: TYPE_BADGE_COLOR[c.componentType],
                },
              ]}
              stats={getInlineStats(c)}
              imageId={c.imageId}
              instanceId={c.id}
              onClick={() => setViewInlineId(c.id)}
              onEdit={() => openEdit(c)}
              onDelete={() => requestDelete(c)}
              onDuplicate={() => handleDuplicate(c.id)}
            />
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500 text-sm bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl">
          No inline components added yet. Add adapters, pigtails, chokes,
          baluns, or ferrites to track signal chain loss.
        </div>
      )}

      {/* View Detail Modal */}
      {viewedComponent && (
        <EquipmentHeroCard
          open={viewInlineId !== null}
          onClose={() => setViewInlineId(null)}
          title={viewedComponent.name}
          subtitle={INLINE_COMPONENT_LABELS[viewedComponent.componentType]}
          equipmentType="inline"
          typeLabel={
            INLINE_COMPONENT_LABELS[
              viewedComponent.componentType
            ]?.toUpperCase() ?? "INLINE"
          }
          stats={getInlineStats(viewedComponent)}
          fields={getInlineDetailFields(viewedComponent)}
          groups={buildInlineDetailGroups(viewedComponent)}
          badges={[
            {
              label: INLINE_COMPONENT_LABELS[viewedComponent.componentType],
              color: TYPE_BADGE_HEX[viewedComponent.componentType],
            },
          ]}
          imageId={viewedComponent.imageId}
          onImageChange={(newImageId) => {
            if (newImageId) {
              useShackStore
                .getState()
                .setEquipmentImage("inline", viewedComponent.id, newImageId);
            } else {
              useShackStore
                .getState()
                .clearEquipmentImage("inline", viewedComponent.id);
            }
          }}
          onEdit={() => {
            setViewInlineId(null);
            openEdit(viewedComponent);
          }}
          onDelete={() => {
            setViewInlineId(null);
            requestDelete(viewedComponent);
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
        title={editingId ? "Edit Inline Component" : "Add Inline Component"}
        subtitle="Configure your signal chain component"
        size="md"
      >
        <div className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Name
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              maxLength={100}
              placeholder="e.g., PL-259 to N-Type adapter"
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Component Type */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Type
              </label>
              <select
                value={form.componentType}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    componentType: e.target.value as InlineComponentType,
                  }))
                }
                className={INPUT_CLASS}
              >
                {ALL_COMPONENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INLINE_COMPONENT_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Insertion Loss */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Insertion Loss (dB)
              </label>
              <input
                inputMode="decimal"
                value={form.insertionLossDb}
                onChange={(e) =>
                  setForm((p) => ({ ...p, insertionLossDb: e.target.value }))
                }
                placeholder="0.1"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* ── Adapter / Pigtail fields ─────────────────────────────────── */}
          {(form.componentType === "adapter" ||
            form.componentType === "pigtail") && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    From Connector
                  </label>
                  <select
                    value={form.fromConnector}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        fromConnector: e.target.value as ConnectorType,
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    {ALL_CONNECTOR_TYPES.map((c) => (
                      <option key={c} value={c}>
                        {CONNECTOR_TYPE_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    To Connector
                  </label>
                  <select
                    value={form.toConnector}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        toConnector: e.target.value as ConnectorType,
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    {ALL_CONNECTOR_TYPES.map((c) => (
                      <option key={c} value={c}>
                        {CONNECTOR_TYPE_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {form.componentType === "pigtail" && (
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Length (inches)
                  </label>
                  <input
                    inputMode="decimal"
                    value={form.lengthInches}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, lengthInches: e.target.value }))
                    }
                    placeholder="12"
                    className={INPUT_CLASS}
                  />
                </div>
              )}
            </>
          )}

          {/* ── Choke fields ─────────────────────────────────────────────── */}
          {form.componentType === "choke" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Material
                  </label>
                  <select
                    value={form.chokeMaterial}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        chokeMaterial: e.target
                          .value as ComponentForm["chokeMaterial"],
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    {CHOKE_MATERIALS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Turns
                  </label>
                  <input
                    inputMode="numeric"
                    value={form.chokeTurns}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, chokeTurns: e.target.value }))
                    }
                    placeholder="6"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Impedance (ohms)
                  </label>
                  <input
                    inputMode="decimal"
                    value={form.chokeImpedanceOhms}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        chokeImpedanceOhms: e.target.value,
                      }))
                    }
                    placeholder="5000"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Frequency Range (MHz)
                  </label>
                  <input
                    value={form.chokeFrequencyRangeMHz}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        chokeFrequencyRangeMHz: e.target.value,
                      }))
                    }
                    placeholder="1.8-30"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Balun fields ─────────────────────────────────────────────── */}
          {form.componentType === "balun" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Ratio
                  </label>
                  <select
                    value={form.balunRatio}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        balunRatio: e.target
                          .value as ComponentForm["balunRatio"],
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    {BALUN_RATIOS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Balun Type
                  </label>
                  <select
                    value={form.balunType}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        balunType: e.target.value as ComponentForm["balunType"],
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    {BALUN_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">
                  Power Rating (watts)
                </label>
                <input
                  inputMode="decimal"
                  value={form.balunPowerRatingWatts}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      balunPowerRatingWatts: e.target.value,
                    }))
                  }
                  placeholder="1500"
                  className={INPUT_CLASS}
                />
              </div>
            </>
          )}

          {/* ── Ferrite fields ───────────────────────────────────────────── */}
          {form.componentType === "ferrite" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Material
                  </label>
                  <input
                    value={form.ferriteMaterial}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        ferriteMaterial: e.target.value,
                      }))
                    }
                    placeholder="Type 31"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Turns
                  </label>
                  <input
                    inputMode="numeric"
                    value={form.ferriteTurns}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, ferriteTurns: e.target.value }))
                    }
                    placeholder="1"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-1">
                  Impedance (ohms)
                </label>
                <input
                  inputMode="decimal"
                  value={form.ferriteImpedanceOhms}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      ferriteImpedanceOhms: e.target.value,
                    }))
                  }
                  placeholder="2500"
                  className={INPUT_CLASS}
                />
              </div>
            </>
          )}

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
              placeholder="Installation details, performance notes..."
              className={INPUT_CLASS}
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
              {editingId ? "Save Changes" : "Add Component"}
            </button>
          </div>
        </div>
      </DetailModal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Component"
        message={`Are you sure you want to delete "${deleteTarget?.name ?? ""}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
      />
    </div>
  );
}
