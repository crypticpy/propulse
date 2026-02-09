/**
 * AntennaManager — Card-grid CRUD for user antennas.
 *
 * Displays antenna cards with name, type, bands, height, mounting, and polarization.
 * Add/edit via DetailModal form; delete with confirmation.
 * Uses EquipmentCard for display and EquipmentDetailModal for detail view.
 */

import { useState, useMemo } from "react";
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAntennaStats(a: UserAntenna): EquipmentCardStat[] {
  const stats: EquipmentCardStat[] = [];

  // Gain — show first per-band override or omit
  const gainEntries = a.gainDbiOverride
    ? Object.entries(a.gainDbiOverride)
    : [];
  if (gainEntries.length > 0) {
    const [band, gain] = gainEntries[0];
    stats.push({
      icon: "gain",
      label: `Gain (${band})`,
      value: `${gain} dBi`,
    });
  }

  // Bands count
  stats.push({
    icon: "bands",
    label: "Bands",
    value: `${a.bands.length} band${a.bands.length !== 1 ? "s" : ""}`,
  });

  // Height
  stats.push({
    icon: "length",
    label: "Height",
    value: `${a.heightMeters} m`,
  });

  // Mounting
  stats.push({
    icon: "impedance",
    label: "Mount",
    value: MOUNTING_LABELS[a.mounting],
  });

  return stats;
}

function buildAntennaDetailFields(a: UserAntenna): EquipmentDetailField[] {
  const fields: EquipmentDetailField[] = [
    { label: "Name", value: a.name },
    {
      label: "Type",
      value: ANTENNA_TYPE_LABELS[a.antennaType] ?? a.antennaType,
    },
    { label: "Bands", value: a.bands.join(", ") },
    { label: "Height", value: a.heightMeters, unit: "m" },
    { label: "Mounting", value: MOUNTING_LABELS[a.mounting] },
    { label: "Polarization", value: POLARIZATION_LABELS[a.polarization] },
    { label: "Rotatable", value: a.isRotatable ?? false },
  ];

  if (a.azimuthDeg != null) {
    fields.push({ label: "Azimuth", value: a.azimuthDeg, unit: "\u00B0" });
  }

  if (a.manufacturer) {
    fields.push({ label: "Manufacturer", value: a.manufacturer });
  }

  if (a.modelNumber) {
    fields.push({ label: "Model", value: a.modelNumber });
  }

  // Gain overrides
  const gainEntries = a.gainDbiOverride
    ? Object.entries(a.gainDbiOverride)
    : [];
  for (const [band, gain] of gainEntries) {
    fields.push({ label: `Gain (${band})`, value: gain, unit: "dBi" });
  }

  // SWR measurements
  const swrEntries = a.swrByBand ? Object.entries(a.swrByBand) : [];
  for (const [band, swr] of swrEntries) {
    fields.push({ label: `SWR (${band})`, value: swr.toFixed(1) });
  }

  if (a.notes) {
    fields.push({ label: "Notes", value: a.notes });
  }

  return fields;
}

/** Build grouped fields for EquipmentDetailModal */
function buildAntennaDetailGroups(a: UserAntenna): EquipmentDetailGroup[] {
  const groups: EquipmentDetailGroup[] = [];

  // Group 1: Specifications
  const specFields: EquipmentDetailField[] = [
    {
      label: "Type",
      value: ANTENNA_TYPE_LABELS[a.antennaType] ?? a.antennaType,
    },
    { label: "Height", value: a.heightMeters, unit: "m" },
    { label: "Polarization", value: POLARIZATION_LABELS[a.polarization] },
    { label: "Mounting", value: MOUNTING_LABELS[a.mounting] },
    { label: "Rotatable", value: a.isRotatable ?? false },
  ];
  if (a.manufacturer) {
    specFields.push({ label: "Manufacturer", value: a.manufacturer });
  }
  if (a.modelNumber) {
    specFields.push({ label: "Model", value: a.modelNumber });
  }
  groups.push({ heading: "Specifications", fields: specFields });

  // Group 2: Coverage
  const coverageFields: EquipmentDetailField[] = [
    { label: "Bands", value: a.bands.join(", ") },
  ];
  if (a.azimuthDeg != null) {
    coverageFields.push({
      label: "Azimuth",
      value: a.azimuthDeg,
      unit: "\u00B0",
    });
  }
  groups.push({ heading: "Coverage", fields: coverageFields });

  // Group 3: Gain (if overrides exist)
  const gainEntries = a.gainDbiOverride
    ? Object.entries(a.gainDbiOverride)
    : [];
  if (gainEntries.length > 0) {
    groups.push({
      heading: "Gain",
      fields: gainEntries.map(([band, gain]) => ({
        label: `Gain (${band})`,
        value: gain,
        unit: "dBi",
      })),
    });
  }

  // Group 4: SWR (if measurements exist)
  const swrEntries = a.swrByBand ? Object.entries(a.swrByBand) : [];
  if (swrEntries.length > 0) {
    groups.push({
      heading: "SWR Measurements",
      fields: swrEntries.map(([band, swr]) => ({
        label: `SWR (${band})`,
        value: swr.toFixed(1),
      })),
    });
  }

  // Group 5: Notes (if present)
  if (a.notes) {
    groups.push({
      heading: "Notes",
      fields: [{ label: "Notes", value: a.notes }],
    });
  }

  return groups.filter((g) => g.fields.length > 0);
}

// ─── Component props ─────────────────────────────────────────────────────────

interface AntennaManagerProps {
  /** Override section header label (default: "ANTENNAS") */
  sectionLabel?: string;
  /** Override section item count shown in badge */
  sectionCount?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AntennaManager({
  sectionLabel,
  sectionCount,
}: AntennaManagerProps) {
  const antennas = useUserAntennas();
  const { addAntenna, updateAntenna, removeAntenna } = useShackStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AntennaForm>(createDefaultForm);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [viewAntennaId, setViewAntennaId] = useState<string | null>(null);

  const viewedAntenna = useMemo(
    () =>
      viewAntennaId
        ? (antennas.find((a) => a.id === viewAntennaId) ?? null)
        : null,
    [viewAntennaId, antennas],
  );

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
    setViewAntennaId(null);
    setEditingId(a.id);
    setForm(formFromAntenna(a));
    setError(null);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setViewAntennaId(null);
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    if (deleteTarget) removeAntenna(deleteTarget);
    setDeleteTarget(null);
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
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          {sectionLabel ?? "ANTENNAS"}
        </h2>
        <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
          {sectionCount ?? antennas.length}
        </span>
        <div className="flex-1" />
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
            <EquipmentCard
              key={a.id}
              title={a.name}
              subtitle={ANTENNA_TYPE_LABELS[a.antennaType] ?? a.antennaType}
              equipmentType="antenna"
              typeLabel={(
                ANTENNA_TYPE_LABELS[a.antennaType] ?? a.antennaType
              ).toUpperCase()}
              stats={buildAntennaStats(a)}
              capabilities={a.bands.map(
                (b): EquipmentCardCapability => ({
                  label: b,
                  category: "band" as const,
                }),
              )}
              imageId={a.imageId}
              galleryImageIds={a.galleryImageIds}
              onClick={() => setViewAntennaId(a.id)}
              onEdit={() => openEdit(a)}
              onDelete={() => handleDelete(a.id)}
            />
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500 text-sm bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl">
          No antennas added yet. Add your first antenna to track your station
          setup.
        </div>
      )}

      {/* Detail view modal */}
      {viewedAntenna && (
        <EquipmentHeroCard
          open={viewAntennaId !== null}
          onClose={() => setViewAntennaId(null)}
          title={viewedAntenna.name}
          subtitle={
            ANTENNA_TYPE_LABELS[viewedAntenna.antennaType] ??
            viewedAntenna.antennaType
          }
          equipmentType="antenna"
          typeLabel={(
            ANTENNA_TYPE_LABELS[viewedAntenna.antennaType] ??
            viewedAntenna.antennaType
          ).toUpperCase()}
          stats={buildAntennaStats(viewedAntenna)}
          capabilities={viewedAntenna.bands.map((b) => ({
            label: b,
            category: "band" as const,
          }))}
          fields={buildAntennaDetailFields(viewedAntenna)}
          groups={buildAntennaDetailGroups(viewedAntenna)}
          badges={[
            { label: "Antenna", color: "#3B82F6" },
            {
              label: (
                ANTENNA_TYPE_LABELS[viewedAntenna.antennaType] ??
                viewedAntenna.antennaType
              ).toUpperCase(),
              color: "#6B7280",
            },
          ]}
          imageId={viewedAntenna.imageId}
          onImageChange={(newImageId) => {
            if (newImageId) {
              useShackStore
                .getState()
                .setEquipmentImage("antenna", viewedAntenna.id, newImageId);
            } else {
              useShackStore
                .getState()
                .clearEquipmentImage("antenna", viewedAntenna.id);
            }
          }}
          galleryImageIds={viewedAntenna.galleryImageIds}
          onGalleryAdd={(imgId) =>
            useShackStore
              .getState()
              .addGalleryImage("antenna", viewedAntenna.id, imgId)
          }
          onGalleryRemove={(imgId) =>
            useShackStore
              .getState()
              .removeGalleryImage("antenna", viewedAntenna.id, imgId)
          }
          maxGalleryImages={5}
          onEdit={() => openEdit(viewedAntenna)}
          onDelete={() => handleDelete(viewedAntenna.id)}
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Antenna"
        message="Are you sure you want to delete this antenna? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
