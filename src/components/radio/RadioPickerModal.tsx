import { useMemo, useState } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
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

  const [tab, setTab] = useState<"profile" | "database" | "custom">("profile");
  const [query, setQuery] = useState("");

  const databaseResults = useMemo(() => {
    if (!query.trim()) return RADIO_DATABASE;
    return searchRadios(query);
  }, [query]);

  const selectedLabel = useMemo(() => {
    if (value.radioId === null) {
      return activeRadio
        ? `Active: ${getDisplayLabel(activeRadio)}`
        : "Active: none";
    }
    const fromProfile =
      userRadios.find((r) => r.userRadio.radioId === value.radioId)
        ?.equipment ?? undefined;
    const fromCustom = customRadios.find((r) => r.id === value.radioId);
    const fromDb = RADIO_DATABASE.find((r) => r.id === value.radioId);
    const resolved = fromProfile ?? fromCustom ?? fromDb;
    return resolved ? getDisplayLabel(resolved) : `Unknown (${value.radioId})`;
  }, [activeRadio, customRadios, userRadios, value.radioId]);

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
                  {activeRadioId ?? "none"}
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
                  const isSelected = value.radioId === userRadio.radioId;
                  const label = getDisplayLabel(equipment!);
                  return (
                    <button
                      key={userRadio.radioId}
                      type="button"
                      onClick={() => {
                        onChange({ radioId: userRadio.radioId });
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
                <div className="text-sm text-gray-400">
                  No radios in your profile yet. Add radios in Settings → Radio
                  Equipment.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "database" && (
          <div className="space-y-3">
            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {databaseResults.map((radio) => {
                const isSelected = value.radioId === radio.id;
                const hasTested = hasTestedSpecs(radio);
                return (
                  <button
                    key={radio.id}
                    type="button"
                    onClick={() => {
                      onChange({ radioId: radio.id });
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
                      <div className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                        {radio.maxPower}W
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === "custom" && (
          <div className="space-y-3">
            <div className="text-sm text-gray-300">
              Custom radios are created in Settings → Radio Equipment.
            </div>
            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {customRadios.map((radio) => {
                const isSelected = value.radioId === radio.id;
                return (
                  <button
                    key={radio.id}
                    type="button"
                    onClick={() => {
                      onChange({ radioId: radio.id });
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
                          {getDisplayLabel(radio)}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {radio.manufacturer} {radio.model} • {radio.maxPower}W
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                        {radio.id.replace("custom-", "custom:")}
                      </div>
                    </div>
                  </button>
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
      </div>
    </DetailModal>
  );
}

export default RadioPickerModal;
