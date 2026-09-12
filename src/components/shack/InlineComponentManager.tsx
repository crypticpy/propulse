/**
 * InlineComponentManager — Card-list CRUD for inline signal chain components
 * (adapters, pigtails, chokes, baluns, ferrites).
 *
 * Uses EquipmentCard for display and EquipmentHeroCard for detail view.
 * Add/edit/duplicate via the station design system Dialog, delete via ConfirmDialog.
 */

import { useState, useId } from "react";
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
import {
  Button,
  Dialog,
  StationProvider,
  TextField,
  SelectField,
  TextAreaField,
} from "@/components/station-ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EquipmentCard } from "@/components/shack/EquipmentCard";
import { EquipmentHeroCard } from "@/components/shack/EquipmentHeroCard";
import type { EquipmentCardStat } from "@/components/shack/EquipmentCard";
import type {
  EquipmentDetailField,
  EquipmentDetailGroup,
} from "@/components/shack/equipmentCardTypes";
import {
  buildInlineComponentPayload,
  createDefaultInlineComponentForm,
  inlineComponentFormFromComponent,
  type ComponentForm,
} from "./inlineComponentFormMapper";

// ─── Constants ────────────────────────────────────────────────────────────────

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
  { value: "6:1", label: "6:1" },
  { value: "9:1", label: "9:1" },
] as const;

const FERRITE_TYPES = [
  { value: "snap_on", label: "Snap-On" },
  { value: "toroid", label: "Toroid" },
  { value: "bead", label: "Bead" },
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

  const formId = useId();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ComponentForm>(
    createDefaultInlineComponentForm,
  );
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
    setForm(createDefaultInlineComponentForm());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: InlineComponent) => {
    setEditingId(c.id);
    setForm(inlineComponentFormFromComponent(c));
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
        if (!/^[1-9]\d*$/.test(form.ferriteCount.trim())) {
          return "Count must be a positive integer.";
        }
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

    const payload = buildInlineComponentPayload(form);

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
        <h2 className="text-sm font-semibold text-su-muted uppercase tracking-wider">
          {sectionLabel ?? "Inline Components"}
        </h2>
        <span className="text-xs text-su-muted bg-su-line/10 px-2 py-0.5 rounded-full">
          {sectionCount ?? components.length}
        </span>
        <div className="flex-1" />
        <button
          onClick={openAdd}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-plasma-orange/15 border border-plasma-orange/50 text-su-text hover:bg-plasma-orange/20 transition-colors"
        >
          + Add Inline Component
        </button>
      </div>

      {/* Card grid */}
      {components.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="p-6 text-center text-su-muted text-sm bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl">
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
      <StationProvider>
        <Dialog
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingId(null);
            setError(null);
          }}
          title={
            editingId ? "Edit inline component" : "Add an inline component"
          }
          description="Describe the component and its connections. Your type-specific details stay with this physical item."
          footer={
            <div className="su-inline">
              <Button
                onClick={() => {
                  setModalOpen(false);
                  setEditingId(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" form={formId}>
                {editingId ? "Save changes" : "Add component"}
              </Button>
            </div>
          }
        >
          <form
            id={formId}
            className="su-stack"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            {error && (
              <div className="su-field-error" role="alert">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <TextField
                label="Component name"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                maxLength={100}
                placeholder="e.g., PL-259 to N-Type adapter"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Component Type */}
              <div>
                <SelectField
                  label="Type"
                  value={form.componentType}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      componentType: e.target.value as InlineComponentType,
                    }))
                  }
                >
                  {ALL_COMPONENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {INLINE_COMPONENT_LABELS[t]}
                    </option>
                  ))}
                </SelectField>
              </div>

              {/* Insertion Loss */}
              <div>
                <TextField
                  label="Insertion Loss (dB)"
                  inputMode="decimal"
                  value={form.insertionLossDb}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, insertionLossDb: e.target.value }))
                  }
                  placeholder="0.1"
                />
              </div>
            </div>

            <h3 className="font-semibold">
              {INLINE_COMPONENT_LABELS[form.componentType]} details
            </h3>

            {/* ── Adapter / Pigtail fields ─────────────────────────────────── */}
            {(form.componentType === "adapter" ||
              form.componentType === "pigtail") && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <SelectField
                      label="From Connector"
                      value={form.fromConnector}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          fromConnector: e.target.value as ConnectorType,
                        }))
                      }
                    >
                      {ALL_CONNECTOR_TYPES.map((c) => (
                        <option key={c} value={c}>
                          {CONNECTOR_TYPE_LABELS[c]}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div>
                    <SelectField
                      label="To Connector"
                      value={form.toConnector}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          toConnector: e.target.value as ConnectorType,
                        }))
                      }
                    >
                      {ALL_CONNECTOR_TYPES.map((c) => (
                        <option key={c} value={c}>
                          {CONNECTOR_TYPE_LABELS[c]}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </div>

                {form.componentType === "pigtail" && (
                  <div>
                    <TextField
                      label="Length (inches)"
                      inputMode="decimal"
                      value={form.lengthInches}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, lengthInches: e.target.value }))
                      }
                      placeholder="12"
                    />
                  </div>
                )}
              </>
            )}

            {/* ── Choke fields ─────────────────────────────────────────────── */}
            {form.componentType === "choke" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <SelectField
                      label="Material"
                      value={form.chokeMaterial}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          chokeMaterial: e.target
                            .value as ComponentForm["chokeMaterial"],
                        }))
                      }
                    >
                      {CHOKE_MATERIALS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div>
                    <TextField
                      label="Turns"
                      inputMode="numeric"
                      value={form.chokeTurns}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, chokeTurns: e.target.value }))
                      }
                      placeholder="6"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <TextField
                      label="Impedance (ohms)"
                      inputMode="decimal"
                      value={form.chokeImpedanceOhms}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          chokeImpedanceOhms: e.target.value,
                        }))
                      }
                      placeholder="5000"
                    />
                  </div>
                  <div>
                    <TextField
                      label="Frequency Range (MHz)"
                      value={form.chokeFrequencyRangeMHz}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          chokeFrequencyRangeMHz: e.target.value,
                        }))
                      }
                      placeholder="1.8-30"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── Balun fields ─────────────────────────────────────────────── */}
            {form.componentType === "balun" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <SelectField
                      label="Ratio"
                      value={form.balunRatio}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          balunRatio: e.target
                            .value as ComponentForm["balunRatio"],
                        }))
                      }
                    >
                      {BALUN_RATIOS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div>
                    <SelectField
                      label="Balun Type"
                      value={form.balunType}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          balunType: e.target
                            .value as ComponentForm["balunType"],
                        }))
                      }
                    >
                      {BALUN_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </div>
                <div>
                  <TextField
                    label="Power Rating (watts)"
                    inputMode="decimal"
                    value={form.balunPowerRatingWatts}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        balunPowerRatingWatts: e.target.value,
                      }))
                    }
                    placeholder="1500"
                  />
                </div>
              </>
            )}

            {/* ── Ferrite fields ───────────────────────────────────────────── */}
            {form.componentType === "ferrite" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <SelectField
                      label="Ferrite style"
                      value={form.ferriteType}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          ferriteType: e.target
                            .value as FerriteComponent["ferriteType"],
                        }))
                      }
                    >
                      {FERRITE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div>
                    <TextField
                      label="Count"
                      inputMode="numeric"
                      value={form.ferriteCount}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, ferriteCount: e.target.value }))
                      }
                      placeholder="1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <TextField
                      label="Material"
                      value={form.ferriteMaterial}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          ferriteMaterial: e.target.value,
                        }))
                      }
                      placeholder="31"
                    />
                  </div>
                  <div>
                    <TextField
                      label="Turns"
                      inputMode="numeric"
                      value={form.ferriteTurns}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, ferriteTurns: e.target.value }))
                      }
                      placeholder="1"
                    />
                  </div>
                </div>
                <div>
                  <TextField
                    label="Impedance (ohms)"
                    inputMode="decimal"
                    value={form.ferriteImpedanceOhms}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        ferriteImpedanceOhms: e.target.value,
                      }))
                    }
                    placeholder="2500"
                  />
                </div>
              </>
            )}

            {/* Notes */}
            <div>
              <TextAreaField
                label="Notes (optional)"
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                rows={3}
                placeholder="Installation details, performance notes..."
              />
            </div>
          </form>
        </Dialog>
      </StationProvider>

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
