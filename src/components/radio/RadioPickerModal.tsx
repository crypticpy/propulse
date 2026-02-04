import { useMemo, useState } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { RadioManager } from "@/components/settings/RadioManager";
import {
  useActiveRadio,
  useUserRadios,
  useUserStore,
} from "@/stores/userStore";
import {
  RADIO_DATABASE,
  searchRadios,
  hasTestedSpecs,
} from "@/lib/data/radios";
import type { RadioEquipment } from "@/types/radio";

export interface RadioPickerValue {
  /** null means "use active profile radio" */
  radioId: string | null;
}

export interface RadioPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: RadioPickerValue;
  onChange: (next: RadioPickerValue) => void;
  /** Optional title override */
  title?: string;
}

function getDisplayLabel(radio: RadioEquipment): string {
  return radio.displayName?.trim() || `${radio.manufacturer} ${radio.model}`;
}

export function RadioPickerModal({
  isOpen,
  onClose,
  value,
  onChange,
  title = "Select Radio Profile",
}: RadioPickerModalProps) {
  const activeRadioId = useUserStore(
    (s) => s.preferences.activeRadioId ?? null,
  );
  const activeRadio = useActiveRadio();
  const userRadios = useUserRadios();
  const customRadios = useUserStore((s) => s.preferences.customRadios || []);
  const radios = useUserStore((s) => s.preferences.radios || []);
  const addRadio = useUserStore((s) => s.addRadio);

  const profileEquipmentIds = useMemo(
    () => new Set(radios.map((r) => r.equipmentId)),
    [radios],
  );
  const [selectedCustomIds, setSelectedCustomIds] = useState<Set<string>>(
    () => new Set(),
  );
  const activeEquipmentId = useMemo(() => {
    if (!activeRadioId) {
      return null;
    }
    const activeInstance = radios.find((r) => r.id === activeRadioId) ?? null;
    return activeInstance?.equipmentId ?? null;
  }, [activeRadioId, radios]);

  const [tab, setTab] = useState<
    "profile" | "database" | "custom" | "manage"
  >("profile");
  const [query, setQuery] = useState("");

  const databaseResults = useMemo(() => {
    if (!query.trim()) {
      return RADIO_DATABASE;
    }
    return searchRadios(query);
  }, [query]);

  const selectedLabel = useMemo(() => {
    if (value.radioId === null) {
      return activeRadio
        ? `Active: ${getDisplayLabel(activeRadio)}`
        : "Active: none";
    }
    const instance = radios.find((r) => r.id === value.radioId) ?? null;
    if (instance) {
      const equipment =
        customRadios.find((r) => r.id === instance.equipmentId) ||
        RADIO_DATABASE.find((r) => r.id === instance.equipmentId) ||
        undefined;
      if (equipment) {
        const base = getDisplayLabel(equipment);
        return instance.nickname?.trim() ? `${instance.nickname} — ${base}` : base;
      }
      return instance.nickname?.trim()
        ? `${instance.nickname} — Unknown (${instance.equipmentId})`
        : `Unknown (${instance.equipmentId})`;
    }
    const fromProfile =
      userRadios.find((r) => r.userRadio.equipmentId === value.radioId)
        ?.equipment ?? undefined;
    const fromCustom = customRadios.find((r) => r.id === value.radioId);
    const fromDb = RADIO_DATABASE.find((r) => r.id === value.radioId);
    const resolved = fromProfile ?? fromCustom ?? fromDb;
    return resolved ? getDisplayLabel(resolved) : `Unknown (${value.radioId})`;
  }, [activeRadio, customRadios, radios, userRadios, value.radioId]);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={selectedLabel}
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex gap-2 p-1 bg-white/5 rounded-lg">
          {(
            [
              { id: "profile", label: "My Profile" },
              { id: "database", label: "Database" },
              { id: "custom", label: "Custom" },
              { id: "manage", label: "Manage" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                tab === t.id
                  ? "bg-plasma-orange text-white"
                  : "text-gray-300 hover:text-white hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {tab === "database" && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search database (e.g., IC-7610, Flex, K3)..."
              className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
            />
          )}
        </div>

        {tab === "profile" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                onChange({ radioId: null });
                onClose();
              }}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                value.radioId === null
                  ? "bg-plasma-orange/10 border-plasma-orange/40"
                  : "bg-white/5 border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">
                  Use active profile radio
                </div>
                <div className="text-[10px] text-gray-400 font-mono">
                  {activeEquipmentId ?? "none"}
                </div>
              </div>
              <div className="text-xs text-gray-300 mt-1">
                {activeRadio
                  ? getDisplayLabel(activeRadio)
                  : "No active radio set in Settings"}
              </div>
            </button>

            <div className="text-xs text-gray-400">My radios</div>
            <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
              {userRadios
                .filter((r) => r.equipment)
                .map(({ userRadio, equipment }) => {
                  const isSelected = value.radioId === userRadio.id;
                  const label = getDisplayLabel(equipment!);
                  return (
                    <button
                      key={userRadio.id}
                      type="button"
                      onClick={() => {
                        onChange({ radioId: userRadio.id });
                        onClose();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                        isSelected
                          ? "bg-plasma-orange/10 border-plasma-orange/40"
                          : "bg-white/5 border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {label}
                          </div>
                          {userRadio.nickname && (
                            <div className="text-xs text-gray-400 truncate">
                              {userRadio.nickname}
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                          {equipment!.maxPower}W
                        </div>
                      </div>
                    </button>
                  );
                })}

              {userRadios.filter((r) => r.equipment).length === 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-gray-400">
                    No radios in your profile yet. Add one now:
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTab("database")}
                      className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition-colors text-xs font-semibold"
                    >
                      Browse database
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("manage")}
                      className="px-3 py-2 rounded-lg bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 transition-colors text-xs font-semibold"
                    >
                      Open manager
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "database" && (
          <div className="space-y-3">
            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {databaseResults.map((radio) => {
                const isSelected =
                  value.radioId !== null &&
                  radios.some(
                    (r) => r.id === value.radioId && r.equipmentId === radio.id,
                  );
                const inProfile = profileEquipmentIds.has(radio.id);
                const hasTested = hasTestedSpecs(radio);
                return (
                  <div
                    key={radio.id}
                    onClick={() => {
                      const instanceId = addRadio(radio.id);
                      if (instanceId) {
                        onChange({ radioId: instanceId });
                        onClose();
                      }
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      isSelected
                        ? "bg-plasma-orange/10 border-plasma-orange/40"
                        : "bg-white/5 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {radio.manufacturer} {radio.model}
                          {hasTested && (
                            <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                              Tested
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          Tier: {radio.tier} • Bands:{" "}
                          {radio.bands.slice(0, 4).join(", ")}
                          {radio.bands.length > 4 ? "…" : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {inProfile ? (
                          <div className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">
                            In profile
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addRadio(radio.id);
                            }}
                            className="text-[10px] px-2 py-1 rounded bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
                            title="Add this radio to your profile"
                          >
                            Add
                          </button>
                        )}
                        <div className="text-[10px] text-gray-400 font-mono">
                          {radio.maxPower}W
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "custom" && (
          <div className="space-y-3">
            <div className="text-sm text-gray-300">
              Create and edit custom radios in the Manage tab.
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-gray-400">
                Selected: {selectedCustomIds.size}
              </div>
              <div className="flex items-center gap-2">
                {selectedCustomIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCustomIds(new Set())}
                    className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  disabled={selectedCustomIds.size === 0}
                  onClick={() => {
                    for (const id of selectedCustomIds) addRadio(id);
                    setSelectedCustomIds(new Set());
                  }}
                  className="text-[10px] px-2 py-1 rounded bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Add selected custom radios to your profile"
                >
                  Add selected
                </button>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {customRadios.map((radio) => {
                const isSelected =
                  value.radioId !== null &&
                  radios.some(
                    (r) => r.id === value.radioId && r.equipmentId === radio.id,
                  );
                const inProfile = profileEquipmentIds.has(radio.id);
                const isChecked = selectedCustomIds.has(radio.id);
                return (
                  <div
                    key={radio.id}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      isSelected
                        ? "bg-plasma-orange/10 border-plasma-orange/40"
                        : "bg-white/5 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setSelectedCustomIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(radio.id)) {
                                next.delete(radio.id);
                              } else next.add(radio.id);
                              return next;
                            })
                          }
                          className="accent-plasma-orange"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {getDisplayLabel(radio)}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">
                            {radio.manufacturer} {radio.model} • {radio.maxPower}W
                          </div>
                        </div>
                      </label>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {inProfile ? (
                          <div className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">
                            In profile
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addRadio(radio.id)}
                            className="text-[10px] px-2 py-1 rounded bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
                          >
                            Add
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const instanceId = addRadio(radio.id);
                            if (instanceId) {
                              onChange({ radioId: instanceId });
                              onClose();
                            }
                          }}
                          className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition-colors"
                          title="Use this radio for this tool"
                        >
                          Use
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {customRadios.length === 0 && (
                <div className="text-sm text-gray-400">
                  No custom radios yet.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "manage" && (
          <div className="space-y-3">
            <RadioManager compact modalZIndexClassName="z-[450]" />
          </div>
        )}
      </div>
    </DetailModal>
  );
}

export default RadioPickerModal;
