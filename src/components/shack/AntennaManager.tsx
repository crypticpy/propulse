/**
 * AntennaManager — Card-grid CRUD for user antennas.
 *
 * Displays antenna cards with name, type, bands, height, mounting, and polarization.
 * Add/edit via DetailModal form; delete with confirmation.
 */

import { useState } from "react";
import { useShackStore, useUserAntennas } from "@/stores/shackStore";
import type {
  UserAntenna,
  UserAntennaType,
  AntennaPolarization,
  AntennaMounting,
} from "@/types/shack";
import {
  MAX_ANTENNAS,
  ANTENNA_TYPE_LABELS,
  ANTENNA_TYPE_TO_PATTERN,
} from "@/types/shack";
import { DetailModal } from "@/components/ui/DetailModal";
import { ALL_BANDS } from "@/types/user";

// ─── Labels ──────────────────────────────────────────────────────────────────

// ANTENNA_TYPE_LABELS imported from @/types/shack

const POLARIZATION_LABELS: Record<AntennaPolarization, string> = {
  horizontal: "Horizontal",
  vertical: "Vertical",
  circular: "Circular",
  mixed: "Mixed",
};

const MOUNTING_LABELS: Record<AntennaMounting, string> = {
  tower: "Tower",
  roof: "Roof",
  mast: "Mast",
  ground: "Ground",
  tree: "Tree",
  portable: "Portable",
  mobile: "Mobile",
  attic: "Attic",
  balcony: "Balcony",
  other: "Other",
};

const ALL_ANTENNA_TYPES = Object.keys(ANTENNA_TYPE_LABELS) as UserAntennaType[];
const ALL_POLARIZATIONS = Object.keys(
  POLARIZATION_LABELS,
) as AntennaPolarization[];
const ALL_MOUNTINGS = Object.keys(MOUNTING_LABELS) as AntennaMounting[];

// ─── Form state ──────────────────────────────────────────────────────────────

interface AntennaForm {
  name: string;
  antennaType: UserAntennaType;
  bands: Set<string>;
  heightMeters: string;
  azimuthDeg: string;
  isRotatable: boolean;
  polarization: AntennaPolarization;
  mounting: AntennaMounting;
  notes: string;
}

function createDefaultForm(): AntennaForm {
  return {
    name: "",
    antennaType: "dipole",
    bands: new Set<string>(),
    heightMeters: "10",
    azimuthDeg: "",
    isRotatable: false,
    polarization: "horizontal",
    mounting: "mast",
    notes: "",
  };
}

function formFromAntenna(a: UserAntenna): AntennaForm {
  return {
    name: a.name,
    antennaType: a.antennaType,
    bands: new Set(a.bands),
    heightMeters: String(a.heightMeters),
    azimuthDeg: a.azimuthDeg != null ? String(a.azimuthDeg) : "",
    isRotatable: a.isRotatable ?? false,
    polarization: a.polarization,
    mounting: a.mounting,
    notes: a.notes ?? "",
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AntennaManager() {
  const antennas = useUserAntennas();
  const { addAntenna, updateAntenna, removeAntenna } = useShackStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AntennaForm>(createDefaultForm);
  const [error, setError] = useState<string | null>(null);

  // ─── Handlers ────────────────────────────────────────────────────────

  const openAdd = () => {
    if (antennas.length >= MAX_ANTENNAS) {
      setError(`Maximum of ${MAX_ANTENNAS} antennas reached.`);
      return;
    }
    setEditingId(null);
    setForm(createDefaultForm());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (a: UserAntenna) => {
    setEditingId(a.id);
    setForm(formFromAntenna(a));
    setError(null);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this antenna?")) return;
    removeAntenna(id);
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required.";
    const height = Number.parseFloat(form.heightMeters);
    if (!Number.isFinite(height) || height < 0)
      return "Height must be a non-negative number.";
    if (form.azimuthDeg.trim()) {
      const az = Number.parseFloat(form.azimuthDeg);
      if (!Number.isFinite(az) || az < 0 || az > 360)
        return "Azimuth must be 0-360 degrees.";
    }
    if (form.bands.size === 0) return "Select at least one band.";
    return null;
  };

  const save = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload: Omit<UserAntenna, "id" | "addedAt"> = {
      name: form.name.trim(),
      antennaType: form.antennaType,
      gainPatternType: ANTENNA_TYPE_TO_PATTERN[form.antennaType],
      bands: Array.from(form.bands),
      heightMeters: Number.parseFloat(form.heightMeters),
      azimuthDeg: form.azimuthDeg.trim()
        ? Number.parseFloat(form.azimuthDeg)
        : undefined,
      isRotatable: form.isRotatable,
      polarization: form.polarization,
      mounting: form.mounting,
      notes: form.notes.trim() || undefined,
    };

    if (editingId) {
      const res = updateAntenna(editingId, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
    } else {
      const id = addAntenna(payload);
      if (!id) {
        setError(`Maximum of ${MAX_ANTENNAS} antennas reached.`);
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
          Antennas
        </h3>
        <button
          onClick={openAdd}
          className="px-3 py-1 text-sm bg-plasma-orange/20 border border-plasma-orange/50
                     text-plasma-orange rounded-lg hover:bg-plasma-orange/30 transition-colors"
        >
          + Add Antenna
        </button>
      </div>

      {/* Card grid */}
      {antennas.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {antennas.map((a) => (
            <div
              key={a.id}
              className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4 space-y-3"
            >
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-white font-medium truncate">
                    {a.name}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {ANTENNA_TYPE_LABELS[a.antennaType] ?? a.antennaType}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className="px-2 py-1 text-[10px] rounded bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    className="px-2 py-1 text-[10px] rounded bg-alert-red/10 border border-alert-red/30 text-alert-red hover:bg-alert-red/20 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Band chips */}
              <div className="flex flex-wrap gap-1">
                {a.bands.map((b) => (
                  <span
                    key={b}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-plasma-orange/15 text-plasma-orange"
                  >
                    {b}
                  </span>
                ))}
              </div>

              {/* Details row */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                <span>{a.heightMeters}m height</span>
                <span>{MOUNTING_LABELS[a.mounting]}</span>
                <span>{POLARIZATION_LABELS[a.polarization]}</span>
                {a.isRotatable && (
                  <span className="text-signal-green">Rotatable</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500 text-sm bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl">
          No antennas added yet. Add your first antenna to track your station
          setup.
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
        title={editingId ? "Edit Antenna" : "Add Antenna"}
        subtitle="Configure your antenna details"
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
              maxLength={100}
              placeholder="e.g., 20m Yagi on Tower"
              className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Antenna Type */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Antenna Type
              </label>
              <select
                value={form.antennaType}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    antennaType: e.target.value as UserAntennaType,
                  }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              >
                {ALL_ANTENNA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ANTENNA_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bands */}
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Bands
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_BANDS.map((band) => {
                const selected = form.bands.has(band);
                return (
                  <button
                    key={band}
                    type="button"
                    onClick={() =>
                      setForm((p) => {
                        const next = new Set(p.bands);
                        if (next.has(band)) next.delete(band);
                        else next.add(band);
                        return { ...p, bands: next };
                      })
                    }
                    className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                      selected
                        ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                        : "bg-white/5 text-gray-400 border border-white/10 hover:text-gray-200 hover:bg-white/10"
                    }`}
                  >
                    {band}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Height */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Height (meters)
              </label>
              <input
                inputMode="decimal"
                value={form.heightMeters}
                onChange={(e) =>
                  setForm((p) => ({ ...p, heightMeters: e.target.value }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>

            {/* Azimuth */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Azimuth (0-360, optional)
              </label>
              <input
                inputMode="decimal"
                value={form.azimuthDeg}
                onChange={(e) =>
                  setForm((p) => ({ ...p, azimuthDeg: e.target.value }))
                }
                placeholder="e.g., 45"
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>

            {/* Rotatable toggle */}
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isRotatable}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, isRotatable: e.target.checked }))
                  }
                  className="accent-plasma-orange"
                />
                <span className="text-sm text-gray-200">Rotatable</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Polarization */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Polarization
              </label>
              <select
                value={form.polarization}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    polarization: e.target.value as AntennaPolarization,
                  }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              >
                {ALL_POLARIZATIONS.map((pol) => (
                  <option key={pol} value={pol}>
                    {POLARIZATION_LABELS[pol]}
                  </option>
                ))}
              </select>
            </div>

            {/* Mounting */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Mounting
              </label>
              <select
                value={form.mounting}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    mounting: e.target.value as AntennaMounting,
                  }))
                }
                className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none"
              >
                {ALL_MOUNTINGS.map((m) => (
                  <option key={m} value={m}>
                    {MOUNTING_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
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
              placeholder="Construction notes, SWR observations, etc."
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
              {editingId ? "Save Changes" : "Add Antenna"}
            </button>
          </div>
        </div>
      </DetailModal>
    </div>
  );
}
