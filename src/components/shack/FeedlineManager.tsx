/**
 * FeedlineManager — Card-list CRUD for user feedlines with inline loss display.
 *
 * Displays feedline cards with type, length, connectors, condition, and
 * calculated loss at 14.1 MHz (20m center freq). Add/edit via DetailModal.
 */

import { useState } from "react";
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
import { DetailModal } from "@/components/ui/DetailModal";

// ─── Labels ──────────────────────────────────────────────────────────────────

// Use CONNECTOR_TYPE_LABELS from @/types/shack
const CONNECTOR_LABELS = CONNECTOR_TYPE_LABELS;

const CONDITION_LABELS: Record<FeedlineCondition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
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

// ─── Component ───────────────────────────────────────────────────────────────

export function FeedlineManager() {
  const feedlines = useUserFeedlines();
  const { addFeedline, updateFeedline, removeFeedline } = useShackStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FeedlineForm>(createDefaultForm);
  const [error, setError] = useState<string | null>(null);

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
    setEditingId(f.id);
    setForm(formFromFeedline(f));
    setError(null);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this feedline?")) return;
    removeFeedline(id);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Feedlines
        </h3>
        <button
          onClick={openAdd}
          className="px-3 py-1 text-sm bg-plasma-orange/20 border border-plasma-orange/50
                     text-plasma-orange rounded-lg hover:bg-plasma-orange/30 transition-colors"
        >
          + Add Feedline
        </button>
      </div>

      {/* Card list */}
      {feedlines.length > 0 ? (
        <div className="space-y-3">
          {feedlines.map((f) => {
            const loss = calculateTotalFeedlineLoss(f, 14.1);
            return (
              <div
                key={f.id}
                className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">
                      {f.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {FEEDLINE_TYPE_NAMES[f.feedlineType]} &middot;{" "}
                      {f.lengthFeet} ft
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(f)}
                      className="px-2 py-1 text-[10px] rounded bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(f.id)}
                      className="px-2 py-1 text-[10px] rounded bg-alert-red/10 border border-alert-red/30 text-alert-red hover:bg-alert-red/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                  <span>
                    {f.connectorCount}x {CONNECTOR_LABELS[f.connectorType]}
                  </span>
                  <span>Condition: {CONDITION_LABELS[f.condition]}</span>
                  <span className="text-caution-amber font-medium">
                    Loss @ 20m: {loss.toFixed(2)} dB
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500 text-sm bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl">
          No feedlines added yet. Add your first feedline to calculate signal
          chain loss.
        </div>
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
    </div>
  );
}
