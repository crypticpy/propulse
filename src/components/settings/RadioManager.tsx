/**
 * RadioManager Component
 *
 * Allows users to manage their radio equipment collection.
 * Supports adding radios from a predefined database and selecting the active radio.
 */

import { useMemo, useState } from "react";
import {
  useUserStore,
  useUserRadios,
  useActiveRadio,
  usePreferTestedSpecs,
} from "@/stores/userStore";
import {
  RADIO_DATABASE,
  getRadiosByManufacturer,
  searchRadios,
  hasTestedSpecs,
} from "@/lib/data/radios";
import { DetailModal } from "@/components/ui/DetailModal";
import {
  calculateReceiverScore,
  getTierLabel,
  getTierColor,
} from "@/types/radio";
import type { RadioEquipment, RadioMode, RadioTier } from "@/types/radio";

interface RadioManagerProps {
  /** Compact mode for embedding in other UIs */
  compact?: boolean;
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

/**
 * Spec Source Toggle - Choose between factory and tested specs
 */
function SpecSourceToggle() {
  const preferTested = usePreferTestedSpecs();
  const updatePreferences = useUserStore((s) => s.updatePreferences);

  return (
    <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">
            Receiver Specifications
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {preferTested
              ? "Using lab-tested specs (Sherwood) when available"
              : "Using manufacturer factory specs"}
          </div>
        </div>
        <div className="flex gap-1 p-0.5 bg-white/5 rounded-md">
          <button
            type="button"
            onClick={() => updatePreferences({ preferTestedSpecs: false })}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              !preferTested
                ? "bg-plasma-orange text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Factory
          </button>
          <button
            type="button"
            onClick={() => updatePreferences({ preferTestedSpecs: true })}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              preferTested
                ? "bg-plasma-orange text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Tested
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Radio Manager - Add, remove, and select radios
 */
export function RadioManager({ compact = false }: RadioManagerProps) {
  const {
    addRadio,
    removeRadio,
    setActiveRadio,
    addCustomRadio,
    updateCustomRadio,
    removeCustomRadio,
    preferences,
  } = useUserStore();
  const userRadios = useUserRadios();
  const activeRadio = useActiveRadio();
  const customRadios = preferences.customRadios || [];

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

  // Get list of user's radio IDs for checking if already added
  const userRadioIds = useMemo(
    () => new Set((preferences.radios || []).map((r) => r.radioId)),
    [preferences.radios],
  );

  // Filtered radios for the add modal
  const filteredRadios = useMemo(() => {
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

  // Group radios by manufacturer for display
  const radiosByManufacturer = useMemo(() => getRadiosByManufacturer(), []);
  const manufacturers = useMemo(
    () => Object.keys(radiosByManufacturer).sort(),
    [radiosByManufacturer],
  );

  const handleAddRadio = (radio: RadioEquipment) => {
    addRadio(radio.id);
    setShowAddModal(false);
    setSearchQuery("");
    setSelectedManufacturer(null);
  };

  const handleRemoveRadio = (radioId: string) => {
    removeRadio(radioId);
  };

  const handleSetActive = (radioId: string) => {
    setActiveRadio(radioId);
  };

  const openNewCustomRadio = () => {
    setEditingCustomId(null);
    setCustomForm(createDefaultCustomForm());
    setCustomModalError(null);
    setCustomModalOpen(true);
  };

  const openEditCustomRadio = (radio: RadioEquipment) => {
    setEditingCustomId(radio.id);
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
    if (!window.confirm("Delete this custom radio?")) return;
    removeCustomRadio(id);
  };

  const validateCustomRadioForm = (): string | null => {
    const name = customForm.displayName.trim();
    if (!name) return "Custom radio name is required.";
    if (!customForm.manufacturer.trim()) return "Manufacturer is required.";
    if (!customForm.model.trim()) return "Model is required.";

    const maxPower = Number.parseFloat(customForm.maxPower);
    const minPower = Number.parseFloat(customForm.minPower);
    if (!Number.isFinite(maxPower) || maxPower <= 0) {
      return "Max power must be a positive number.";
    }
    if (!Number.isFinite(minPower) || minPower < 0) {
      return "Min power must be 0 or greater.";
    }
    if (minPower > maxPower) return "Min power cannot exceed max power.";
    if (customForm.bands.size === 0) return "Select at least one band.";
    if (customForm.modes.size === 0) return "Select at least one mode.";

    const rmdr = Number.parseFloat(customForm.receiver.rmdr);
    const imdr3 = Number.parseFloat(customForm.receiver.imdr3);
    const blockingGain = Number.parseFloat(customForm.receiver.blockingGain);
    const sensitivity = Number.parseFloat(customForm.receiver.sensitivity);
    if (!Number.isFinite(rmdr) || rmdr <= 0)
      return "RMDR must be a number > 0.";
    if (!Number.isFinite(imdr3) || imdr3 <= 0)
      return "IMDR3 must be a number > 0.";
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
      if (!trimmed) continue;
      const parsed = Number.parseFloat(trimmed);
      if (!Number.isFinite(parsed)) {
        return `${field.label} must be a valid number or left blank.`;
      }
    }

    const year = customForm.releaseYear.trim();
    if (year) {
      const parsed = Number.parseInt(year, 10);
      if (!Number.isFinite(parsed) || parsed < 1960 || parsed > 2100) {
        return "Release year must be a valid year (1960–2100) or blank.";
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

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Radio Equipment
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1 text-sm bg-plasma-orange/20 border border-plasma-orange/50
                     text-plasma-orange rounded-lg hover:bg-plasma-orange/30 transition-colors"
        >
          + Add Radio
        </button>
      </div>

      {/* Active radio display */}
      {activeRadio && (
        <div className="p-3 bg-plasma-orange/10 border border-plasma-orange/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-plasma-orange font-medium uppercase">
                Active
              </span>
              <span className="text-white font-medium">
                {getRadioDisplayLabel(activeRadio)}
              </span>
            </div>
            <div className="text-xs text-gray-400">
              {activeRadio.maxPower}W max
            </div>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: getTierColor(activeRadio.tier) + "20",
                color: getTierColor(activeRadio.tier),
              }}
            >
              {getTierLabel(activeRadio.tier)}
            </span>
            <span>
              RX Score: {calculateReceiverScore(activeRadio.receiver)}
            </span>
          </div>
        </div>
      )}

      {/* Spec source toggle */}
      <SpecSourceToggle />

      {/* Radio list */}
      {userRadios.length > 0 ? (
        <div className="space-y-2">
          {userRadios.map(({ userRadio, equipment }) => {
            if (!equipment) return null;
            const isActive = preferences.activeRadioId === userRadio.radioId;
            const hasTested = hasTestedSpecs(equipment);
            return (
              <div
                key={userRadio.radioId}
                className={`
                  p-3 rounded-lg border transition-colors cursor-pointer
                  ${
                    isActive
                      ? "bg-plasma-orange/5 border-plasma-orange/30"
                      : "bg-nebula-blue border-white/10 hover:border-white/20"
                  }
                `}
                onClick={() => handleSetActive(userRadio.radioId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-plasma-orange" />
                    )}
                    <span className="text-white font-medium">
                      {getRadioDisplayLabel(equipment, userRadio.nickname)}
                    </span>
                    {hasTested && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                        Tested
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRadio(userRadio.radioId);
                    }}
                    className="p-1 text-gray-500 hover:text-alert-red transition-colors"
                    title="Remove radio"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                  <span>{equipment.maxPower}W</span>
                  <span>|</span>
                  <span>{equipment.bands.length} bands</span>
                  <span>|</span>
                  <span>RX: {calculateReceiverScore(equipment.receiver)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 text-center text-gray-500 text-sm bg-nebula-blue rounded-lg border border-white/10">
          No radios added yet. Click "Add Radio" to get started.
        </div>
      )}

      {/* Custom radios */}
      <div className="pt-2 border-t border-white/10">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Custom Radios
          </h4>
          <button
            onClick={openNewCustomRadio}
            className="px-3 py-1 text-sm bg-white/5 border border-white/10
                     text-gray-200 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
          >
            + Custom
          </button>
        </div>

        <div className="mt-2 space-y-2">
          {customRadios.length > 0 ? (
            customRadios.map((radio) => {
              const isActive = preferences.activeRadioId === radio.id;
              return (
                <div
                  key={radio.id}
                  className={`
                    p-3 rounded-lg border transition-colors cursor-pointer
                    ${
                      isActive
                        ? "bg-plasma-orange/5 border-plasma-orange/30"
                        : "bg-nebula-blue border-white/10 hover:border-white/20"
                    }
                  `}
                  onClick={() => handleSetActive(radio.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-plasma-orange flex-shrink-0" />
                        )}
                        <span className="text-white font-medium truncate">
                          {getRadioDisplayLabel(radio)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-400 truncate">
                        {radio.manufacturer} {radio.model}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditCustomRadio(radio);
                        }}
                        className="px-2 py-1 text-[10px] rounded bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomRadio(radio.id);
                        }}
                        className="px-2 py-1 text-[10px] rounded bg-alert-red/10 border border-alert-red/30 text-alert-red hover:bg-alert-red/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                    <span>{radio.maxPower}W</span>
                    <span>|</span>
                    <span>{radio.bands.length} bands</span>
                    <span>|</span>
                    <span>RX: {calculateReceiverScore(radio.receiver)}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm bg-nebula-blue rounded-lg border border-white/10">
              No custom radios yet. Click “+ Custom” to create one.
            </div>
          )}
        </div>
      </div>

      {/* Add Radio Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowAddModal(false);
              setSearchQuery("");
              setSelectedManufacturer(null);
            }}
          />
          <div className="relative z-10 w-full max-w-lg bg-deep-space border border-white/10 rounded-xl p-6 max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-orbitron text-lg font-bold text-gradient-orange">
                Add Radio
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchQuery("");
                  setSelectedManufacturer(null);
                }}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="mb-4">
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
            </div>

            {/* Manufacturer filter chips */}
            {!searchQuery && (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
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
              </div>
            )}

            {/* Radio list */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {filteredRadios.map((radio) => {
                const alreadyAdded = userRadioIds.has(radio.id);
                return (
                  <div
                    key={radio.id}
                    className={`
                      p-3 rounded-lg border transition-colors
                      ${
                        alreadyAdded
                          ? "bg-nebula-blue/50 border-white/5 opacity-50 cursor-not-allowed"
                          : "bg-nebula-blue border-white/10 hover:border-plasma-orange/50 cursor-pointer"
                      }
                    `}
                    onClick={() => !alreadyAdded && handleAddRadio(radio)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-white font-medium">
                          {radio.manufacturer} {radio.model}
                        </span>
                        {alreadyAdded && (
                          <span className="ml-2 text-xs text-gray-500">
                            (Added)
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
                      RX Score: {calculateReceiverScore(radio.receiver)} | RMDR:{" "}
                      {radio.receiver.rmdr}dB | IMD3: {radio.receiver.imdr3}dB
                    </div>
                  </div>
                );
              })}
              {filteredRadios.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No radios found matching "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <DetailModal
        isOpen={customModalOpen}
        onClose={() => setCustomModalOpen(false)}
        title={editingCustomId ? "Edit Custom Radio" : "New Custom Radio"}
        subtitle="Saved to your profile for use in tools and DX Wizard."
        size="lg"
      >
        <div className="space-y-6">
          {customModalError && (
            <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
              {customModalError}
            </div>
          )}

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
                              if (next.has(band)) next.delete(band);
                              else next.add(band);
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
                              if (next.has(mode)) next.delete(mode);
                              else next.add(mode);
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
                      { key: "sensitivity", label: "Sens (µV)" },
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
    </div>
  );
}
