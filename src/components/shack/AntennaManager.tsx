/**
 * AntennaManager — Card-grid CRUD for user antennas.
 *
 * Displays antenna cards with name, type, bands, height, mounting, and polarization.
 * Add/edit via the station design system form; delete with confirmation.
 * Uses EquipmentCard for display and EquipmentHeroCard for detail and gallery.
 */

import { useState, useMemo, useId } from "react";
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
import {
  Button,
  Checkbox,
  Dialog,
  Section,
  StationProvider,
  TextField,
  SelectField,
  TextAreaField,
} from "@/components/station-ui";
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
  manufacturer: string;
  modelNumber: string;
  swrByBand: Record<string, string>;
  gainDbiOverride: Record<string, string>;
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
    manufacturer: "",
    modelNumber: "",
    swrByBand: {},
    gainDbiOverride: {},
    notes: "",
  };
}

function recordToStringMap(
  values?: Record<string, number>,
): Record<string, string> {
  if (!values) return {};
  return Object.fromEntries(
    Object.entries(values).map(([band, value]) => [band, String(value)]),
  );
}

function parseOptionalNumberMap(
  values: Record<string, string>,
  bands: Set<string>,
): Record<string, number> | undefined {
  const parsed: Record<string, number> = {};
  for (const band of bands) {
    const raw = values[band]?.trim();
    if (!raw) continue;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) continue;
    parsed[band] = value;
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
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
    manufacturer: a.manufacturer ?? "",
    modelNumber: a.modelNumber ?? "",
    swrByBand: recordToStringMap(a.swrByBand),
    gainDbiOverride: recordToStringMap(a.gainDbiOverride),
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

  const formId = useId();
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
      manufacturer: form.manufacturer.trim() || undefined,
      modelNumber: form.modelNumber.trim() || undefined,
      swrByBand: parseOptionalNumberMap(form.swrByBand, form.bands),
      gainDbiOverride: parseOptionalNumberMap(form.gainDbiOverride, form.bands),
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              instanceId={a.id}
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
      <StationProvider>
        <Dialog
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingId(null);
            setError(null);
          }}
          title={editingId ? "Edit antenna" : "Add an antenna"}
          description="Start with the antenna and its bands, then describe how you have installed it."
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
                {editingId ? "Save changes" : "Add antenna"}
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
                label="Antenna name"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                maxLength={100}
                placeholder="e.g., 20m Yagi on Tower"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Antenna Type */}
              <div>
                <SelectField
                  label="Antenna Type"
                  value={form.antennaType}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      antennaType: e.target.value as UserAntennaType,
                    }))
                  }
                >
                  {ALL_ANTENNA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ANTENNA_TYPE_LABELS[t]}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>

            <fieldset className="su-stack">
              <legend className="font-semibold">Operating bands</legend>
              <p className="su-hint">
                Select every band this antenna supports. You can add SWR and
                gain values for each band below.
              </p>
              <div className="su-inline">
                {ALL_BANDS.map((band) => (
                  <Button
                    key={band}
                    aria-pressed={form.bands.has(band)}
                    variant={form.bands.has(band) ? "primary" : "secondary"}
                    onClick={() =>
                      setForm((previous) => {
                        const next = new Set(previous.bands);
                        if (next.has(band)) next.delete(band);
                        else next.add(band);
                        return { ...previous, bands: next };
                      })
                    }
                  >
                    {band}
                  </Button>
                ))}
              </div>
            </fieldset>

            <Section
              title="Installation"
              description="Describe this antenna's position and mounting in your setup."
            >
              <div className="su-stack">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Height */}
                  <div>
                    <TextField
                      label="Height (meters)"
                      inputMode="decimal"
                      value={form.heightMeters}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, heightMeters: e.target.value }))
                      }
                    />
                  </div>

                  {/* Azimuth */}
                  <div>
                    <TextField
                      label="Azimuth (0-360, optional)"
                      inputMode="decimal"
                      value={form.azimuthDeg}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, azimuthDeg: e.target.value }))
                      }
                      placeholder="e.g., 45"
                    />
                  </div>

                  <Checkbox
                    label="This antenna can rotate"
                    checked={form.isRotatable}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        isRotatable: event.target.checked,
                      }))
                    }
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Polarization */}
                  <div>
                    <SelectField
                      label="Polarization"
                      value={form.polarization}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          polarization: e.target.value as AntennaPolarization,
                        }))
                      }
                    >
                      {ALL_POLARIZATIONS.map((pol) => (
                        <option key={pol} value={pol}>
                          {POLARIZATION_LABELS[pol]}
                        </option>
                      ))}
                    </SelectField>
                  </div>

                  {/* Mounting */}
                  <div>
                    <SelectField
                      label="Mounting"
                      value={form.mounting}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          mounting: e.target.value as AntennaMounting,
                        }))
                      }
                    >
                      {ALL_MOUNTINGS.map((m) => (
                        <option key={m} value={m}>
                          {MOUNTING_LABELS[m]}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </div>
              </div>
            </Section>

            <Section
              title="Manufacturer and model"
              description="Optional · Catalog or custom equipment details."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <TextField
                    label="Manufacturer"
                    type="text"
                    value={form.manufacturer}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, manufacturer: e.target.value }))
                    }
                    placeholder="DX Engineering"
                  />
                </div>
                <div>
                  <TextField
                    label="Model"
                    type="text"
                    value={form.modelNumber}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, modelNumber: e.target.value }))
                    }
                    placeholder="EFHW-8010"
                  />
                </div>
              </div>
            </Section>

            {form.bands.size > 0 && (
              <Section
                title="SWR and gain by band"
                description="Optional · Leave a field blank when you do not have a value. Gain is expressed in dBi."
              >
                <div className="su-stack">
                  {Array.from(form.bands).map((band) => (
                    <div
                      key={band}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                    >
                      <TextField
                        label={`${band} SWR`}
                        type="number"
                        min={1}
                        max={10}
                        step={0.1}
                        value={form.swrByBand[band] ?? ""}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            swrByBand: {
                              ...previous.swrByBand,
                              [band]: event.target.value,
                            },
                          }))
                        }
                      />
                      <TextField
                        label={`${band} gain override`}
                        suffix="dBi"
                        type="number"
                        step={0.1}
                        value={form.gainDbiOverride[band] ?? ""}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            gainDbiOverride: {
                              ...previous.gainDbiOverride,
                              [band]: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </Section>
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
                placeholder="Construction notes, SWR observations, etc."
              />
            </div>
          </form>
        </Dialog>
      </StationProvider>

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
