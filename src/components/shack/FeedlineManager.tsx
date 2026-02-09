/**
 * FeedlineManager — Card-grid CRUD for user feedlines with inline loss display.
 *
 * Displays feedline cards with type, length, connectors, condition, and
 * calculated loss at 14.1 MHz (20m center freq). Add/edit via DetailModal.
 * Uses EquipmentCard for display and EquipmentDetailModal for detail view.
 */

import { useState, useMemo } from "react";
import { useShackStore, useUserFeedlines } from "@/stores/shackStore";
import type {
  UserFeedline,
  FeedlineType,
  ConnectorType,
  FeedlineCondition,
} from "@/types/shack";
import { MAX_FEEDLINES, CONNECTOR_TYPE_LABELS } from "@/types/shack";
import {
  FEEDLINE_TYPE_NAMES,
  calculateTotalFeedlineLoss,
} from "@/lib/data/feedlines";
import { FeedlineLossSparkline } from "@/components/shack/FeedlineLossSparkline";
import { DetailModal } from "@/components/ui/DetailModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EquipmentCard } from "@/components/shack/EquipmentCard";
import { EquipmentHeroCard } from "@/components/shack/EquipmentHeroCard";
import type { EquipmentCardStat } from "@/components/shack/EquipmentCard";
import type {
  EquipmentDetailField,
  EquipmentDetailGroup,
} from "@/components/shack/equipmentCardTypes";

// ─── Labels ──────────────────────────────────────────────────────────────────

// Use CONNECTOR_TYPE_LABELS from @/types/shack
const CONNECTOR_LABELS = CONNECTOR_TYPE_LABELS;

const CONDITION_LABELS: Record<FeedlineCondition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

/** Map feedline condition to badge color */
const CONDITION_BADGE_COLOR: Record<
  FeedlineCondition,
  "green" | "blue" | "amber" | "red"
> = {
  new: "blue",
  good: "green",
  fair: "amber",
  poor: "red",
};

const ALL_FEEDLINE_TYPES = Object.keys(FEEDLINE_TYPE_NAMES) as FeedlineType[];
const ALL_CONNECTOR_TYPES = Object.keys(CONNECTOR_LABELS) as ConnectorType[];
const ALL_CONDITIONS: FeedlineCondition[] = ["new", "good", "fair", "poor"];

// ─── Form state ──────────────────────────────────────────────────────────────

interface FeedlineForm {
  name: string;
  feedlineType: FeedlineType;
  lengthFeet: string;
  connectorCount: string;
  connectorType: ConnectorType;
  condition: FeedlineCondition;
  notes: string;
}

function createDefaultForm(): FeedlineForm {
  return {
    name: "",
    feedlineType: "rg213",
    lengthFeet: "50",
    connectorCount: "2",
    connectorType: "pl259",
    condition: "good",
    notes: "",
  };
}

function formFromFeedline(f: UserFeedline): FeedlineForm {
  return {
    name: f.name,
    feedlineType: f.feedlineType,
    lengthFeet: String(f.lengthFeet),
    connectorCount: String(f.connectorCount),
    connectorType: f.connectorType,
    condition: f.condition,
    notes: f.notes ?? "",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFeedlineStats(f: UserFeedline): EquipmentCardStat[] {
  const stats: EquipmentCardStat[] = [];
  const loss = calculateTotalFeedlineLoss(f, 14.1);

  stats.push({
    icon: "length",
    label: "Length",
    value: `${f.lengthFeet} ft`,
  });

  stats.push({
    icon: "loss",
    label: "Loss @ 20m",
    value: `${loss.toFixed(2)} dB`,
  });

  stats.push({
    icon: "connector",
    label: "Connectors",
    value: `${f.connectorCount}x ${CONNECTOR_LABELS[f.connectorType]}`,
  });

  if (f.connectorTypeFarEnd && f.connectorTypeFarEnd !== f.connectorType) {
    stats.push({
      icon: "connector",
      label: "Far End",
      value: CONNECTOR_LABELS[f.connectorTypeFarEnd],
    });
  }

  return stats;
}

function buildFeedlineDetailFields(f: UserFeedline): EquipmentDetailField[] {
  const loss = calculateTotalFeedlineLoss(f, 14.1);

  const fields: EquipmentDetailField[] = [
    { label: "Name", value: f.name },
    { label: "Type", value: FEEDLINE_TYPE_NAMES[f.feedlineType] },
    { label: "Length", value: f.lengthFeet, unit: "ft" },
    { label: "Condition", value: CONDITION_LABELS[f.condition] },
    {
      label: "Connectors",
      value: `${f.connectorCount}x ${CONNECTOR_LABELS[f.connectorType]}`,
    },
    { label: "Loss @ 20m", value: loss.toFixed(2), unit: "dB" },
  ];

  if (f.connectorTypeFarEnd && f.connectorTypeFarEnd !== f.connectorType) {
    fields.push({
      label: "Far End Connector",
      value: CONNECTOR_LABELS[f.connectorTypeFarEnd],
    });
  }

  if (f.manufacturer) {
    fields.push({ label: "Manufacturer", value: f.manufacturer });
  }

  if (f.yearInstalled) {
    fields.push({ label: "Year Installed", value: f.yearInstalled });
  }

  if (f.notes) {
    fields.push({ label: "Notes", value: f.notes });
  }

  return fields;
}

function buildFeedlineDetailGroups(f: UserFeedline): EquipmentDetailGroup[] {
  const loss80m = calculateTotalFeedlineLoss(f, 3.5);
  const loss20m = calculateTotalFeedlineLoss(f, 14.1);
  const loss10m = calculateTotalFeedlineLoss(f, 28.5);

  const groups: EquipmentDetailGroup[] = [
    {
      heading: "Specifications",
      fields: [
        { label: "Type", value: FEEDLINE_TYPE_NAMES[f.feedlineType] },
        { label: "Length", value: f.lengthFeet, unit: "ft" },
        { label: "Impedance", value: 50, unit: "\u03A9" },
        { label: "Condition", value: CONDITION_LABELS[f.condition] },
      ].filter((fld) => fld.value != null),
    },
    {
      heading: "Loss",
      fields: [
        { label: "Loss @ 3.5 MHz", value: loss80m.toFixed(2), unit: "dB" },
        { label: "Loss @ 14.1 MHz", value: loss20m.toFixed(2), unit: "dB" },
        { label: "Loss @ 28.5 MHz", value: loss10m.toFixed(2), unit: "dB" },
      ].filter((fld) => fld.value != null),
    },
    {
      heading: "Connectors",
      fields: [
        { label: "Near End", value: CONNECTOR_LABELS[f.connectorType] },
        {
          label: "Far End",
          value: f.connectorTypeFarEnd
            ? CONNECTOR_LABELS[f.connectorTypeFarEnd]
            : undefined,
        },
      ].filter((fld) => fld.value != null),
    },
  ];

  // Configuration group for optional metadata
  const configFields: EquipmentDetailField[] = [];
  if (f.manufacturer)
    configFields.push({ label: "Manufacturer", value: f.manufacturer });
  if (f.yearInstalled)
    configFields.push({ label: "Year Installed", value: f.yearInstalled });
  if (f.notes) configFields.push({ label: "Notes", value: f.notes });
  if (configFields.length > 0) {
    groups.push({ heading: "Configuration", fields: configFields });
  }

  return groups.filter((g) => g.fields.length > 0);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface FeedlineManagerProps {
  sectionLabel?: string;
  sectionCount?: number;
}

export function FeedlineManager({
  sectionLabel,
  sectionCount,
}: FeedlineManagerProps) {
  const feedlines = useUserFeedlines();
  const { addFeedline, updateFeedline, removeFeedline } = useShackStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FeedlineForm>(createDefaultForm);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [viewFeedlineId, setViewFeedlineId] = useState<string | null>(null);

  const viewedFeedline = useMemo(
    () =>
      viewFeedlineId
        ? (feedlines.find((f) => f.id === viewFeedlineId) ?? null)
        : null,
    [viewFeedlineId, feedlines],
  );

  // ─── Handlers ────────────────────────────────────────────────────────

  const openAdd = () => {
    if (feedlines.length >= MAX_FEEDLINES) {
      setError(`Maximum of ${MAX_FEEDLINES} feedlines reached.`);
      return;
    }
    setEditingId(null);
    setForm(createDefaultForm());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (f: UserFeedline) => {
    setViewFeedlineId(null);
    setEditingId(f.id);
    setForm(formFromFeedline(f));
    setError(null);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setViewFeedlineId(null);
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    if (deleteTarget) removeFeedline(deleteTarget);
    setDeleteTarget(null);
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required.";
    const length = Number.parseFloat(form.lengthFeet);
    if (!Number.isFinite(length) || length <= 0)
      return "Length must be a positive number.";
    const count = Number.parseInt(form.connectorCount, 10);
    if (!Number.isFinite(count) || count < 0 || count > 10)
      return "Connector count must be 0-10.";
    return null;
  };

  const save = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload: Omit<UserFeedline, "id" | "addedAt"> = {
      name: form.name.trim(),
      feedlineType: form.feedlineType,
      lengthFeet: Number.parseFloat(form.lengthFeet),
      connectorCount: Number.parseInt(form.connectorCount, 10),
      connectorType: form.connectorType,
      condition: form.condition,
      notes: form.notes.trim() || undefined,
    };

    if (editingId) {
      const res = updateFeedline(editingId, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
    } else {
      const id = addFeedline(payload);
      if (!id) {
        setError(`Maximum of ${MAX_FEEDLINES} feedlines reached.`);
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
          {sectionLabel ?? "Feedlines"}
        </h2>
        <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
          {sectionCount ?? feedlines.length}
        </span>
        <div className="flex-1" />
        <button
          onClick={openAdd}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-plasma-orange/20 border border-plasma-orange/50 text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
        >
          + Add Feedline
        </button>
      </div>

      {/* Card grid */}
      {feedlines.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {feedlines.map((f) => (
            <EquipmentCard
              key={f.id}
              title={f.name}
              subtitle={`${FEEDLINE_TYPE_NAMES[f.feedlineType]} \u00B7 ${f.lengthFeet} ft`}
              equipmentType="feedline"
              typeLabel={
                FEEDLINE_TYPE_NAMES[f.feedlineType]?.toUpperCase() ?? "FEEDLINE"
              }
              stats={buildFeedlineStats(f)}
              badges={[
                {
                  label: CONDITION_LABELS[f.condition],
                  color: CONDITION_BADGE_COLOR[f.condition],
                },
              ]}
              visualization={
                <FeedlineLossSparkline
                  feedlineId={f.id}
                  height={48}
                  width={160}
                />
              }
              imageId={f.imageId}
              onClick={() => setViewFeedlineId(f.id)}
              onEdit={() => openEdit(f)}
              onDelete={() => handleDelete(f.id)}
            />
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500 text-sm bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl">
          No feedlines added yet. Add your first feedline to calculate signal
          chain loss.
        </div>
      )}

      {/* Detail view modal */}
      {viewedFeedline && (
        <EquipmentHeroCard
          open={viewFeedlineId !== null}
          onClose={() => setViewFeedlineId(null)}
          title={viewedFeedline.name}
          subtitle={`${FEEDLINE_TYPE_NAMES[viewedFeedline.feedlineType]} \u00B7 ${viewedFeedline.lengthFeet} ft`}
          equipmentType="feedline"
          typeLabel={
            FEEDLINE_TYPE_NAMES[viewedFeedline.feedlineType]?.toUpperCase() ??
            "FEEDLINE"
          }
          stats={buildFeedlineStats(viewedFeedline)}
          fields={buildFeedlineDetailFields(viewedFeedline)}
          groups={buildFeedlineDetailGroups(viewedFeedline)}
          badges={[
            { label: "Feedline", color: "#14B8A6" },
            { label: CONDITION_LABELS[viewedFeedline.condition] },
          ]}
          visualization={
            <FeedlineLossSparkline
              feedlineId={viewedFeedline.id}
              height={48}
              width={240}
            />
          }
          imageId={viewedFeedline.imageId}
          onImageChange={(newImageId) => {
            if (newImageId) {
              useShackStore
                .getState()
                .setEquipmentImage("feedline", viewedFeedline.id, newImageId);
            } else {
              useShackStore
                .getState()
                .clearEquipmentImage("feedline", viewedFeedline.id);
            }
          }}
          onEdit={() => openEdit(viewedFeedline)}
          onDelete={() => handleDelete(viewedFeedline.id)}
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
        title={editingId ? "Edit Feedline" : "Add Feedline"}
        subtitle="Configure your feedline details"
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
              placeholder="e.g., Main run to tower"
              className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Feedline Type */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Type
              </label>
              <select
                value={form.feedlineType}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    feedlineType: e.target.value as FeedlineType,
                  }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              >
                {ALL_FEEDLINE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FEEDLINE_TYPE_NAMES[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Length */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Length (feet)
              </label>
              <input
                inputMode="decimal"
                value={form.lengthFeet}
                onChange={(e) =>
                  setForm((p) => ({ ...p, lengthFeet: e.target.value }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Connector Count */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Connector Count (0-10)
              </label>
              <input
                inputMode="numeric"
                value={form.connectorCount}
                onChange={(e) =>
                  setForm((p) => ({ ...p, connectorCount: e.target.value }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>

            {/* Connector Type */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Connector Type
              </label>
              <select
                value={form.connectorType}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    connectorType: e.target.value as ConnectorType,
                  }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              >
                {ALL_CONNECTOR_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {CONNECTOR_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Condition
            </label>
            <select
              value={form.condition}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  condition: e.target.value as FeedlineCondition,
                }))
              }
              className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
            >
              {ALL_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

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
              placeholder="Installation details, routing notes..."
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
              {editingId ? "Save Changes" : "Add Feedline"}
            </button>
          </div>
        </div>
      </DetailModal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Feedline"
        message="Are you sure you want to delete this feedline? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
