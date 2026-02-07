/**
 * PresetBuilder — Card-list CRUD for station presets.
 *
 * Shows expandable preset cards with linked equipment, band capability strip,
 * and activate/edit/delete controls. Create/edit via DetailModal form.
 */

import { useState, useCallback } from "react";
import {
  useShackStore,
  useStationPresets,
  useUserAntennas,
  useUserFeedlines,
  useUserAccessories,
  useUserRadios,
} from "@/stores/shackStore";
import type { StationPreset } from "@/types/shack";
import { MAX_PRESETS } from "@/types/shack";
import { useStationPerformance } from "@/hooks/useStationPerformance";
import { BandCapabilityStrip } from "./BandCapabilityStrip";
import { DetailModal } from "@/components/ui/DetailModal";

// ─── Form state ──────────────────────────────────────────────────────────────

interface PresetForm {
  name: string;
  radioId: string;
  antennaId: string;
  feedlineId: string;
  accessoryIds: Set<string>;
  operatingPowerWatts: string;
  notes: string;
}

function createDefaultForm(): PresetForm {
  return {
    name: "",
    radioId: "",
    antennaId: "",
    feedlineId: "",
    accessoryIds: new Set(),
    operatingPowerWatts: "100",
    notes: "",
  };
}

function formFromPreset(p: StationPreset): PresetForm {
  return {
    name: p.name,
    radioId: p.radioId,
    antennaId: p.antennaId,
    feedlineId: p.feedlineId ?? "",
    accessoryIds: new Set(p.accessoryIds),
    operatingPowerWatts: String(p.operatingPowerWatts),
    notes: p.notes ?? "",
  };
}

// ─── Preset card sub-component ───────────────────────────────────────────────

function PresetCard({
  preset,
  isActive,
  onActivate,
  onEdit,
  onDelete,
}: {
  preset: StationPreset;
  isActive: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const perf = useStationPerformance(preset.id);
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();

  const radio = radios.find((r) => r.userRadio.id === preset.radioId);
  const antenna = antennas.find((a) => a.id === preset.antennaId);
  const feedline = feedlines.find((f) => f.id === preset.feedlineId);
  const presetAccessories = accessories.filter((a) =>
    preset.accessoryIds.includes(a.id),
  );

  const radioLabel = radio?.equipment
    ? (radio.equipment.displayName ??
      `${radio.equipment.manufacturer} ${radio.equipment.model}`)
    : (radio?.userRadio.nickname ?? "Unknown radio");

  const bandLossData = perf.bands.map((b) => ({
    band: b.band,
    lossDb: b.feedlineLossDb,
  }));

  return (
    <div
      className={`bg-panel/30 backdrop-blur-sm border rounded-2xl p-4 space-y-3 transition-colors ${
        isActive
          ? "border-plasma-orange/50 shadow-[0_0_12px_rgba(255,140,50,0.1)]"
          : "border-white/5"
      }`}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium truncate">
              {preset.name}
            </span>
            {isActive && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30 uppercase tracking-wider">
                Active
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{radioLabel}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isActive && (
            <button
              type="button"
              onClick={onActivate}
              className="px-2 py-1 text-[10px] rounded bg-plasma-orange/10 border border-plasma-orange/30 text-plasma-orange hover:bg-plasma-orange/20 transition-colors"
            >
              Activate
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="px-2 py-1 text-[10px] rounded bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="px-2 py-1 text-[10px] rounded bg-alert-red/10 border border-alert-red/30 text-alert-red hover:bg-alert-red/20 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Equipment summary */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        {antenna && <span>{antenna.name}</span>}
        {feedline && (
          <>
            <span className="text-white/20">|</span>
            <span>{feedline.name}</span>
          </>
        )}
        {presetAccessories.length > 0 && (
          <>
            <span className="text-white/20">|</span>
            <span>
              {presetAccessories.length} accessor
              {presetAccessories.length === 1 ? "y" : "ies"}
            </span>
          </>
        )}
        <span className="text-white/20">|</span>
        <span>{preset.operatingPowerWatts}W</span>
      </div>

      {/* Band capability strip */}
      <BandCapabilityStrip bands={bandLossData} />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PresetBuilder() {
  const presets = useStationPresets();
  const activePresetId = useShackStore((s) => s.activePresetId);
  const { addPreset, updatePreset, removePreset, setActivePreset } =
    useShackStore();
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PresetForm>(createDefaultForm);
  const [error, setError] = useState<string | null>(null);

  const hasEquipment =
    radios.length > 0 || antennas.length > 0 || feedlines.length > 0;

  // ─── Handlers ────────────────────────────────────────────────────────

  const openAdd = useCallback(() => {
    if (presets.length >= MAX_PRESETS) {
      setError(`Maximum of ${MAX_PRESETS} presets reached.`);
      return;
    }
    setEditingId(null);
    setForm(createDefaultForm());
    setError(null);
    setModalOpen(true);
  }, [presets.length]);

  const openEdit = useCallback((preset: StationPreset) => {
    setEditingId(preset.id);
    setForm(formFromPreset(preset));
    setError(null);
    setModalOpen(true);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (!window.confirm("Delete this preset?")) return;
      removePreset(id);
    },
    [removePreset],
  );

  const handleActivate = useCallback(
    (id: string) => {
      setActivePreset(id);
    },
    [setActivePreset],
  );

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required.";
    if (!form.radioId) return "Select a radio.";
    if (!form.antennaId) return "Select an antenna.";
    const power = Number.parseFloat(form.operatingPowerWatts);
    if (!Number.isFinite(power) || power <= 0)
      return "Operating power must be a positive number.";
    return null;
  };

  const save = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload: Omit<StationPreset, "id" | "createdAt"> = {
      name: form.name.trim(),
      radioId: form.radioId,
      antennaId: form.antennaId,
      feedlineId: form.feedlineId || undefined,
      accessoryIds: Array.from(form.accessoryIds),
      operatingPowerWatts: Number.parseFloat(form.operatingPowerWatts),
      notes: form.notes.trim() || undefined,
    };

    if (editingId) {
      const res = updatePreset(editingId, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
    } else {
      const id = addPreset(payload);
      if (!id) {
        setError(`Maximum of ${MAX_PRESETS} presets reached.`);
        return;
      }
    }

    setModalOpen(false);
    setEditingId(null);
    setError(null);
  };

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setError(null);
  }, []);

  // ─── Live preview ────────────────────────────────────────────────────

  // Build a temporary preview of the band capability for the current form
  const previewBandLossData = (() => {
    const antenna = antennas.find((a) => a.id === form.antennaId);
    if (!antenna) return [];
    // Simple preview — just feedline loss per band without full performance calc
    return antenna.bands.map((band) => ({ band, lossDb: 0 })).filter(Boolean);
  })();

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Station Presets
        </h3>
        <button
          onClick={openAdd}
          disabled={!hasEquipment}
          className="px-3 py-1 text-sm bg-plasma-orange/20 border border-plasma-orange/50
                     text-plasma-orange rounded-lg hover:bg-plasma-orange/30 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Create Preset
        </button>
      </div>

      {/* Preset list */}
      {presets.length > 0 ? (
        <div className="space-y-3">
          {presets.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              isActive={p.id === activePresetId}
              onActivate={() => handleActivate(p.id)}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      ) : !hasEquipment ? (
        <div className="p-6 text-center text-gray-500 text-sm bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl">
          Add equipment first
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500 text-sm bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl">
          Create a preset to combine your equipment
        </div>
      )}

      {/* Error display outside modal */}
      {error && !modalOpen && (
        <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
          {error}
        </div>
      )}

      {/* Add / Edit Modal */}
      <DetailModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit Preset" : "Create Station Preset"}
        subtitle="Combine your equipment into a station configuration"
        size="lg"
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
              placeholder="e.g., Contest Station, Portable Setup"
              className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Radio */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Radio
              </label>
              <select
                value={form.radioId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, radioId: e.target.value }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              >
                <option value="">Select a radio...</option>
                {radios.map(({ userRadio, equipment }) => (
                  <option key={userRadio.id} value={userRadio.id}>
                    {equipment
                      ? (equipment.displayName ??
                        `${equipment.manufacturer} ${equipment.model}`)
                      : (userRadio.nickname ?? userRadio.id)}
                  </option>
                ))}
              </select>
            </div>

            {/* Antenna */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Antenna
              </label>
              <select
                value={form.antennaId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, antennaId: e.target.value }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              >
                <option value="">Select an antenna...</option>
                {antennas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Feedline (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Feedline (optional)
              </label>
              <select
                value={form.feedlineId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, feedlineId: e.target.value }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              >
                <option value="">None</option>
                {feedlines.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Operating Power */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Operating Power (watts)
              </label>
              <input
                inputMode="decimal"
                value={form.operatingPowerWatts}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    operatingPowerWatts: e.target.value,
                  }))
                }
                placeholder="e.g., 100"
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Accessories */}
          {accessories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                Accessories
              </label>
              <div className="space-y-1.5">
                {accessories.map((acc) => {
                  const checked = form.accessoryIds.has(acc.id);
                  return (
                    <label
                      key={acc.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((p) => {
                            const next = new Set(p.accessoryIds);
                            if (next.has(acc.id)) next.delete(acc.id);
                            else next.add(acc.id);
                            return { ...p, accessoryIds: next };
                          })
                        }
                        className="accent-plasma-orange"
                      />
                      <span className="text-sm text-gray-200">
                        {acc.name}
                        <span className="text-gray-500 ml-1.5">
                          ({acc.category})
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
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
              placeholder="Setup notes, contest config, etc."
              className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
            />
          </div>

          {/* Live preview */}
          {form.antennaId && previewBandLossData.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                Band Preview
              </label>
              <BandCapabilityStrip bands={previewBandLossData} />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={closeModal}
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
              {editingId ? "Save Changes" : "Create Preset"}
            </button>
          </div>
        </div>
      </DetailModal>
    </div>
  );
}
