/**
 * RadioManager Component
 *
 * Allows users to manage their radio equipment collection.
 * Supports adding radios from a predefined database and selecting the active radio.
 */

import { useState, useMemo } from "react";
import {
  useUserStore,
  useUserRadios,
  useActiveRadio,
} from "@/stores/userStore";
import {
  RADIO_DATABASE,
  getRadiosByManufacturer,
  searchRadios,
} from "@/lib/data/radios";
import {
  calculateReceiverScore,
  getTierLabel,
  getTierColor,
} from "@/types/radio";
import type { RadioEquipment } from "@/types/radio";

interface RadioManagerProps {
  /** Compact mode for embedding in other UIs */
  compact?: boolean;
}

/**
 * Radio Manager - Add, remove, and select radios
 */
export function RadioManager({ compact = false }: RadioManagerProps) {
  const { addRadio, removeRadio, setActiveRadio, preferences } = useUserStore();
  const userRadios = useUserRadios();
  const activeRadio = useActiveRadio();

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedManufacturer, setSelectedManufacturer] = useState<
    string | null
  >(null);

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
                {activeRadio.manufacturer} {activeRadio.model}
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

      {/* Radio list */}
      {userRadios.length > 0 ? (
        <div className="space-y-2">
          {userRadios.map(({ userRadio, equipment }) => {
            if (!equipment) return null;
            const isActive = preferences.activeRadioId === userRadio.radioId;
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
                      {equipment.manufacturer} {equipment.model}
                    </span>
                    {userRadio.nickname && (
                      <span className="text-gray-500 text-sm">
                        ({userRadio.nickname})
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
    </div>
  );
}
