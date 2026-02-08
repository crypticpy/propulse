/**
 * AccessoryManager — Grouped-card CRUD for station accessories.
 *
 * Groups accessories by category with section headers.
 * Category-specific form fields adapt based on selected category.
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
} from "@/types/shack";
import { MAX_ACCESSORIES } from "@/types/shack";
import { DetailModal } from "@/components/ui/DetailModal";
import { AccessoryCategoryFields } from "./AccessoryCategoryFields";

// ─── Labels ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<AccessoryCategory, string> = {
  amplifier: "Amplifiers",
  tuner: "Tuners",
  filter: "Filters",
  switch: "Switches",
  power_supply: "Power Supplies",
  grounding: "Grounding",
};

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
  }

  return base;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AccessoryManager() {
  const accessories = useUserAccessories();
  const { addAccessory, updateAccessory, removeAccessory } = useShackStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccessoryForm>(createDefaultForm);
  const [error, setError] = useState<string | null>(null);

  // Group by category
  const grouped = ALL_CATEGORIES.reduce(
    (acc, cat) => {
      const items = accessories.filter((a) => a.category === cat);
      if (items.length > 0) acc.push({ category: cat, items });
      return acc;
    },
    [] as Array<{ category: AccessoryCategory; items: UserAccessory[] }>,
  );

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
    if (!window.confirm("Delete this accessory?")) return;
    removeAccessory(id);
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

  // ─── Category-specific summary ───────────────────────────────────────

  function accessorySummary(a: UserAccessory): string {
    switch (a.category) {
      case "amplifier":
        return `${a.maxPowerWatts}W / +${a.gainDb} dB`;
      case "tuner":
        return `${a.type} / ${a.maxPowerWatts}W${a.insertionLossDb != null ? ` / ${a.insertionLossDb} dB loss` : ""}`;
      case "filter":
        return `${FILTER_TYPE_LABELS[a.filterType]} / ${a.insertionLossDb} dB loss`;
      case "switch":
        return `${a.ports} ports / ${a.insertionLossDb} dB loss`;
      case "power_supply":
        return `${a.voltageOutput}V / ${a.maxCurrentAmps}A`;
      case "grounding":
        return `${GROUND_TYPE_LABELS[a.groundType] ?? a.groundType}${a.radialCount != null ? ` / ${a.radialCount} radials` : ""}`;
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Accessories
        </h3>
        <button
          onClick={openAdd}
          className="px-3 py-1 text-sm bg-plasma-orange/20 border border-plasma-orange/50
                     text-plasma-orange rounded-lg hover:bg-plasma-orange/30 transition-colors"
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
              <div className="space-y-2">
                {items.map((a) => (
                  <div
                    key={a.id}
                    className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">
                          {a.name}
                        </div>
                        {(a.manufacturer || a.modelNumber) && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate">
                            {[a.manufacturer, a.modelNumber]
                              .filter(Boolean)
                              .join(" ")}
                          </div>
                        )}
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
                    <div className="mt-1 text-xs text-gray-400">
                      {accessorySummary(a)}
                    </div>
                  </div>
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
    </div>
  );
}
