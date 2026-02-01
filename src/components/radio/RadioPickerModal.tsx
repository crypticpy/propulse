import { useMemo, useState } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { useActiveRadio, useUserRadios, useUserStore } from "@/stores/userStore";
import { RADIO_DATABASE, searchRadios } from "@/lib/data/radios";
import { searchSherwoodReceivers, SHERWOOD_RECEIVERS } from "@/lib/data/sherwood";
import type { RadioDataSource, RadioEquipment, RadioMode, RadioTier } from "@/types/radio";
import type { SherwoodReceiverEntry } from "@/types/sherwood";

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

const WIZARD_BANDS: string[] = [
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

const WIZARD_MODES: RadioMode[] = [
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

const SHERWOOD_SOURCE: RadioDataSource = {
  name: "Sherwood Engineering Receiver Test Data",
  url: "http://www.sherweng.com/table.html",
  notes:
    "Receiver metrics imported from the Sherwood table. Verify model variant and measurement conditions.",
};

function getSherwoodLabel(entry: SherwoodReceiverEntry): string {
  return `${entry.manufacturer} ${entry.model}`;
}

export function RadioPickerModal({
  isOpen,
  onClose,
  value,
  onChange,
  title = "Select Radio Profile",
}: RadioPickerModalProps) {
  const activeRadioId = useUserStore((s) => s.preferences.activeRadioId ?? null);
  const activeRadio = useActiveRadio();
  const userRadios = useUserRadios();
  const customRadios = useUserStore((s) => s.preferences.customRadios || []);
  const addCustomRadio = useUserStore((s) => s.addCustomRadio);

  const [tab, setTab] = useState<
    "profile" | "database" | "sherwood" | "custom"
  >("profile");
  const [query, setQuery] = useState("");

  const databaseResults = useMemo(() => {
    if (!query.trim()) return RADIO_DATABASE;
    return searchRadios(query);
  }, [query]);

  const sherwoodResults = useMemo(() => {
    if (!query.trim()) return SHERWOOD_RECEIVERS;
    return searchSherwoodReceivers(query);
  }, [query]);

  const [sherwoodDraft, setSherwoodDraft] = useState<{
    entry: SherwoodReceiverEntry;
    displayName: string;
    maxPower: string;
    minPower: string;
    tier: RadioTier;
    bands: Set<string>;
    modes: Set<RadioMode>;
  } | null>(null);
  const [sherwoodCreateError, setSherwoodCreateError] = useState<string | null>(
    null,
  );

  const selectedLabel = useMemo(() => {
    if (value.radioId === null) {
      return activeRadio ? `Active: ${getDisplayLabel(activeRadio)}` : "Active: none";
    }
    const fromProfile =
      userRadios.find((r) => r.userRadio.radioId === value.radioId)?.equipment ??
      undefined;
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
              { id: "sherwood", label: "Sherwood" },
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
          {(tab === "database" || tab === "sherwood") && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "sherwood"
                  ? "Search Sherwood (e.g., IC-7610, FTdx-101, K4)..."
                  : "Search database (e.g., IC-7610, Flex, K3)..."
              }
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
                {activeRadio ? getDisplayLabel(activeRadio) : "No active radio set in Settings"}
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
                  No radios in your profile yet. Add radios in Settings → Radio Equipment.
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
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          Tier: {radio.tier} • Bands: {radio.bands.slice(0, 4).join(", ")}
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

        {tab === "sherwood" && (
          <div className="space-y-3">
            <div className="text-xs text-gray-400">
              Sherwood entries include receiver metrics only. Select one to create a custom radio profile (you’ll provide TX/band coverage).
            </div>

            {SHERWOOD_RECEIVERS.length === 0 && (
              <div className="p-3 rounded-lg border border-white/10 bg-white/5 text-gray-300 text-sm">
                Sherwood list is not populated in this build. Run{" "}
                <span className="font-mono text-gray-200">npm run import:sherwood</span>{" "}
                to generate it locally.
              </div>
            )}

            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {sherwoodResults.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => {
                    setSherwoodCreateError(null);
                    setSherwoodDraft({
                      entry,
                      displayName: getSherwoodLabel(entry),
                      maxPower: "100",
                      minPower: "5",
                      tier: "midrange",
                      bands: new Set(["160m", "80m", "40m", "20m", "15m", "10m"]),
                      modes: new Set(["SSB", "CW", "FT8"]),
                    });
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg border transition-colors bg-white/5 border-white/10 hover:border-white/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {getSherwoodLabel(entry)}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        DR (narrow):{" "}
                        {entry.dynamicRangeNarrowDb !== undefined
                          ? `${entry.dynamicRangeNarrowDb} dB`
                          : "—"}
                        {entry.narrowSpacingKhz !== undefined
                          ? ` @${entry.narrowSpacingKhz}kHz`
                          : ""}
                        {" • "}
                        Blocking:{" "}
                        {entry.blockingDb !== undefined
                          ? `${entry.blockingDb} dB`
                          : "—"}
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-300 font-mono flex-shrink-0">
                      Create →
                    </div>
                  </div>
                </button>
              ))}
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

      <DetailModal
        isOpen={sherwoodDraft !== null}
        onClose={() => setSherwoodDraft(null)}
        title="Create Radio Profile"
        subtitle="Based on Sherwood receiver test data."
        zIndexClassName="z-[360]"
        size="lg"
      >
        {sherwoodDraft && (
          <div className="space-y-5">
            {sherwoodCreateError && (
              <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
                {sherwoodCreateError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Custom name
                  </label>
                  <input
                    value={sherwoodDraft.displayName}
                    onChange={(e) =>
                      setSherwoodDraft((prev) =>
                        prev
                          ? { ...prev, displayName: e.target.value }
                          : prev,
                      )
                    }
                    className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                               text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
                  />
                  <div className="mt-1 text-[10px] text-gray-400">
                    Manufacturer/model stay as imported; this is your profile label.
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">
                      Max W
                    </label>
                    <input
                      inputMode="decimal"
                      value={sherwoodDraft.maxPower}
                      onChange={(e) =>
                        setSherwoodDraft((prev) =>
                          prev ? { ...prev, maxPower: e.target.value } : prev,
                        )
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
                      value={sherwoodDraft.minPower}
                      onChange={(e) =>
                        setSherwoodDraft((prev) =>
                          prev ? { ...prev, minPower: e.target.value } : prev,
                        )
                      }
                      className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                                 text-white focus:outline-none focus:border-plasma-orange/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">
                      Tier
                    </label>
                    <select
                      value={sherwoodDraft.tier}
                      onChange={(e) =>
                        setSherwoodDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                tier: e.target.value as RadioTier,
                              }
                            : prev,
                        )
                      }
                      className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                                 text-white focus:outline-none focus:border-plasma-orange/50"
                    >
                      {(["entry", "midrange", "highend", "flagship"] as const).map(
                        (tier) => (
                          <option key={tier} value={tier}>
                            {tier}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-white mb-2">
                    Bands
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {WIZARD_BANDS.map((band) => (
                      <label
                        key={band}
                        className="flex items-center gap-2 text-xs text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={sherwoodDraft.bands.has(band)}
                          onChange={() =>
                            setSherwoodDraft((prev) => {
                              if (!prev) return prev;
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
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-sm font-semibold text-white mb-2">
                    Modes
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {WIZARD_MODES.map((mode) => (
                      <label
                        key={mode}
                        className="flex items-center gap-2 text-xs text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={sherwoodDraft.modes.has(mode)}
                          onChange={() =>
                            setSherwoodDraft((prev) => {
                              if (!prev) return prev;
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
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-white/10 bg-white/5">
                  <div className="text-xs text-gray-400 mb-1">
                    Imported receiver metrics
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-gray-400">DR wide:</span>
                      <span className="text-white">
                        {sherwoodDraft.entry.dynamicRangeWideDb ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">DR narrow:</span>
                      <span className="text-white">
                        {sherwoodDraft.entry.dynamicRangeNarrowDb ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Blocking:</span>
                      <span className="text-white">
                        {sherwoodDraft.entry.blockingDb ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Sens (uV):</span>
                      <span className="text-white">
                        {sherwoodDraft.entry.sensitivityUv ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Noise (dBm):</span>
                      <span className="text-white">
                        {sherwoodDraft.entry.noiseFloorDbm ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Added:</span>
                      <span className="text-white">
                        {sherwoodDraft.entry.addedDate ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-gray-400">
                  This creates a custom radio profile stored locally. You can further edit it in Settings → Radio Equipment.
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSherwoodDraft(null)}
                className="flex-1 px-4 py-2 bg-nebula-blue/60 border border-white/10 rounded-lg
                           text-gray-200 hover:text-white hover:border-white/20
                           transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const name = sherwoodDraft.displayName.trim();
                  if (!name) {
                    setSherwoodCreateError("Custom name is required.");
                    return;
                  }
                  const maxPower = Number.parseFloat(sherwoodDraft.maxPower);
                  const minPower = Number.parseFloat(sherwoodDraft.minPower);
                  if (!Number.isFinite(maxPower) || maxPower <= 0) {
                    setSherwoodCreateError("Max power must be a positive number.");
                    return;
                  }
                  if (!Number.isFinite(minPower) || minPower < 0) {
                    setSherwoodCreateError("Min power must be 0 or greater.");
                    return;
                  }
                  if (minPower > maxPower) {
                    setSherwoodCreateError("Min power cannot exceed max power.");
                    return;
                  }
                  if (sherwoodDraft.bands.size === 0) {
                    setSherwoodCreateError("Select at least one band.");
                    return;
                  }
                  if (sherwoodDraft.modes.size === 0) {
                    setSherwoodCreateError("Select at least one mode.");
                    return;
                  }

                  const { entry } = sherwoodDraft;
                  const rmdr = entry.dynamicRangeNarrowDb;
                  const imdr3 = entry.dynamicRangeWideDb;
                  const blockingGain = entry.blockingDb;
                  const sensitivity = entry.sensitivityUv;
                  if (
                    rmdr === undefined ||
                    imdr3 === undefined ||
                    blockingGain === undefined ||
                    sensitivity === undefined
                  ) {
                    setSherwoodCreateError(
                      "This Sherwood row is missing required receiver metrics; pick another entry.",
                    );
                    return;
                  }

                  const res = addCustomRadio({
                    displayName: name,
                    manufacturer: entry.manufacturer,
                    model: entry.model,
                    receiver: {
                      rmdr,
                      imdr3,
                      blockingGain,
                      sensitivity,
                      noiseFloorDbm: entry.noiseFloorDbm,
                    },
                    maxPower,
                    minPower,
                    modes: Array.from(sherwoodDraft.modes),
                    bands: Array.from(sherwoodDraft.bands),
                    tier: sherwoodDraft.tier,
                    sources: [SHERWOOD_SOURCE],
                  });

                  if (!res.ok) {
                    setSherwoodCreateError(res.error);
                    return;
                  }

                  onChange({ radioId: res.id });
                  setSherwoodDraft(null);
                  onClose();
                }}
                className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                           text-plasma-orange hover:bg-plasma-orange/30
                           transition-colors font-medium text-sm"
              >
                Create & Select
              </button>
            </div>
          </div>
        )}
      </DetailModal>
    </DetailModal>
  );
}

export default RadioPickerModal;
