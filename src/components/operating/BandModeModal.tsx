/**
 * BandModeModal — Centered modal for selecting band and mode on mobile.
 *
 * Triggered by tapping the BandModePill. Uses createPortal to render into
 * document.body with backdrop blur, body scroll lock, and escape-to-close.
 *
 * Reads hidden bands from settingsStore to dim unavailable selections.
 * Source indicator at bottom shows CAT/WSJT-X follow state with override controls.
 *
 * Enhanced features:
 * - Propagation-aware band tinting via useBandConditionsTint
 * - Radio capability filtering (grays out unsupported bands/modes)
 * - Band/mode history ring (quick recall of recent selections)
 * - User-defined QSY presets with inline add/remove
 * - Contest lock toggle when a contest session is active
 * - Sub-band segment indicator
 * - Watched bands eye-icon toggle on each band button
 */

import { useEffect, useCallback, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useOperatingStore } from "@/stores/operatingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useActiveRadio } from "@/stores/shackStore";
import { ALL_BANDS, type BandId } from "@/types/user";
import { ALL_UI_MODES, type UIMode } from "@/lib/utils/modeNormalize";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import { useBandConditionsTint } from "@/hooks/useBandConditionsTint";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BandModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BandModeModal({ isOpen, onClose }: BandModeModalProps) {
  const activeBand = useOperatingStore((s) => s.activeBand);
  const activeMode = useOperatingStore((s) => s.activeMode);
  const activeSource = useOperatingStore((s) => s.activeSource);
  const catOverridden = useOperatingStore((s) => s.catOverridden);
  const bandModeHistory = useOperatingStore((s) => s.bandModeHistory);
  const presets = useOperatingStore((s) => s.presets);
  const watchedBands = useOperatingStore((s) => s.watchedBands);
  const contestLocked = useOperatingStore((s) => s.contestLocked);
  const contestSessionId = useOperatingStore((s) => s.contestSessionId);
  const subBandSegment = useOperatingStore((s) => s.subBandSegment);
  const hiddenBands = useSettingsStore((s) => s.favoredBands?.hidden ?? []);

  const activeRadio = useActiveRadio();
  const { tints, statuses } = useBandConditionsTint();

  // Inline preset creation state
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const presetInputRef = useRef<HTMLInputElement>(null);

  // ── Escape key ───────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // ── Body scroll lock ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Focus preset input when it appears
  useEffect(() => {
    if (isAddingPreset && presetInputRef.current) {
      presetInputRef.current.focus();
    }
  }, [isAddingPreset]);

  // Reset preset input when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsAddingPreset(false);
      setPresetName("");
    }
  }, [isOpen]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleBandSelect = (band: BandId) => {
    useOperatingStore.getState().setManualBand(band);
  };

  const handleModeSelect = (mode: UIMode) => {
    useOperatingStore.getState().setManualMode(mode);
  };

  const handleResumeCat = () => {
    useOperatingStore.getState().resumeCATFollow();
  };

  const handleOverrideCat = () => {
    useOperatingStore.getState().setManualBandMode(activeBand, activeMode);
  };

  const handleHistorySelect = (band: BandId, mode: UIMode) => {
    useOperatingStore.getState().setManualBandMode(band, mode);
    onClose();
  };

  const handlePresetApply = (presetId: string) => {
    useOperatingStore.getState().applyPreset(presetId);
    onClose();
  };

  const handlePresetAdd = () => {
    const name = presetName.trim();
    if (!name) return;
    useOperatingStore.getState().addPreset(name, activeBand, activeMode);
    setPresetName("");
    setIsAddingPreset(false);
  };

  const handlePresetRemove = (id: string) => {
    useOperatingStore.getState().removePreset(id);
  };

  const handleContestLockToggle = () => {
    useOperatingStore.getState().setContestLocked(!contestLocked);
  };

  const handleWatchToggle = (band: BandId, e: React.MouseEvent) => {
    e.stopPropagation();
    if (watchedBands.includes(band)) {
      useOperatingStore.getState().removeWatchedBand(band);
    } else {
      useOperatingStore.getState().addWatchedBand(band);
    }
  };

  // ── Radio capability helpers ─────────────────────────────────────────────
  const radioBands = activeRadio?.bands ?? null;
  const radioModes = activeRadio?.modes ?? null;

  const isBandSupported = (band: BandId): boolean => {
    if (!radioBands) return true;
    return radioBands.includes(band);
  };

  const isModeSupported = (mode: UIMode): boolean => {
    if (!radioModes) return true;
    // RadioMode and UIMode overlap for most values; check direct match
    return (radioModes as string[]).includes(mode);
  };

  // ── Deduplicated history ─────────────────────────────────────────────────
  const uniqueHistory = bandModeHistory
    .filter(
      (entry, idx, arr) =>
        arr.findIndex((e) => e.band === entry.band && e.mode === entry.mode) ===
        idx,
    )
    .slice(0, 5);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Select Band and Mode"
    >
      {/* Modal card */}
      <div
        className="bg-void-black border border-white/10 rounded-2xl shadow-2xl max-w-sm w-[calc(100%-2rem)] p-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-100 tracking-wide uppercase">
            Select Band &amp; Mode
          </h2>
          <div className="flex items-center gap-2">
            {/* Contest lock toggle */}
            {contestSessionId && (
              <button
                onClick={handleContestLockToggle}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                  contestLocked
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
                aria-label={
                  contestLocked ? "Unlock band/mode" : "Lock band/mode"
                }
              >
                {/* Lock/unlock icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  {contestLocked ? (
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  ) : (
                    <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                  )}
                </svg>
                {contestLocked ? "Locked" : "Lock"}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* History ring */}
        {uniqueHistory.length > 0 && (
          <div className="mb-3">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
              Recent
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {uniqueHistory.map((entry, i) => (
                <button
                  key={`${entry.band}-${entry.mode}-${i}`}
                  onClick={() => handleHistorySelect(entry.band, entry.mode)}
                  className="px-2 py-1 rounded-full bg-white/5 text-[10px] font-mono text-gray-300 hover:bg-white/10 transition-colors"
                >
                  {entry.band} {entry.mode}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Presets section */}
        <div className="mb-3">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            Quick QSY
          </span>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {presets.map((preset) => (
              <div key={preset.id} className="group relative flex items-center">
                <button
                  onClick={() => handlePresetApply(preset.id)}
                  className="px-2 py-1 rounded-full bg-white/5 text-[10px] font-mono text-gray-300 hover:bg-white/10 transition-colors pr-5"
                >
                  {preset.name} · {preset.band} {preset.mode}
                </button>
                <button
                  onClick={() => handlePresetRemove(preset.id)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center rounded-full text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove preset ${preset.name}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-2.5 w-2.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))}
            {/* Add preset button / inline input */}
            {isAddingPreset ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePresetAdd();
                }}
                className="flex items-center gap-1"
              >
                <input
                  ref={presetInputRef}
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Name..."
                  className="w-20 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-gray-200 placeholder:text-gray-600 outline-none focus:border-white/20"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsAddingPreset(false);
                      setPresetName("");
                    }
                  }}
                  onBlur={() => {
                    if (!presetName.trim()) {
                      setIsAddingPreset(false);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!presetName.trim()}
                  className="px-1.5 py-1 rounded-full bg-white/5 text-[10px] text-gray-400 hover:bg-white/10 disabled:opacity-30 transition-colors"
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsAddingPreset(true)}
                className="px-2 py-1 rounded-full bg-white/5 text-[10px] text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors"
                aria-label="Add new preset"
              >
                +
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 my-3" />

        {/* Band section */}
        <div
          className={`mb-3 ${contestLocked ? "opacity-40 pointer-events-none" : ""}`}
        >
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            Band
          </span>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {ALL_BANDS.map((band) => {
              const isActive = activeBand === band;
              const isHidden = hiddenBands.includes(band);
              const bandColor = BAND_COLORS[band] ?? BAND_COLORS.default;
              const bandSupported = isBandSupported(band);
              const tintBg = tints[band];
              const status = statuses[band];
              const isWatched = watchedBands.includes(band);

              return (
                <button
                  key={band}
                  onClick={() => handleBandSelect(band)}
                  className={`
                    relative px-3 py-2.5 rounded-lg text-sm font-medium border-l-2 transition-all group
                    ${isHidden ? "opacity-40" : ""}
                    ${!bandSupported ? "opacity-30 pointer-events-none" : ""}
                    ${
                      isActive
                        ? "text-white"
                        : "text-gray-300 bg-white/5 hover:bg-white/10"
                    }
                  `}
                  style={{
                    borderLeftColor: bandColor,
                    ...(isActive
                      ? { backgroundColor: `${bandColor}30`, color: "#fff" }
                      : tintBg
                        ? { backgroundColor: tintBg }
                        : {}),
                  }}
                  disabled={!bandSupported}
                >
                  {band}
                  {/* Status dot */}
                  {status && (
                    <span
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{
                        backgroundColor:
                          status === "excellent"
                            ? "#22c55e"
                            : status === "good"
                              ? "#eab308"
                              : status === "fair"
                                ? "#f97316"
                                : status === "poor"
                                  ? "#ef4444"
                                  : "#6b7280",
                      }}
                    />
                  )}
                  {/* Watched band eye icon */}
                  <span
                    className={`absolute top-0.5 right-0.5 w-3 h-3 flex items-center justify-center cursor-pointer ${
                      isWatched
                        ? "text-cyan-400"
                        : "text-gray-600 opacity-0 group-hover:opacity-100"
                    } transition-opacity`}
                    onClick={(e) => handleWatchToggle(band, e)}
                    role="button"
                    aria-label={isWatched ? `Unwatch ${band}` : `Watch ${band}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-3 h-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      {isWatched ? (
                        // Filled eye
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      ) : (
                        // Empty eye outline (simplified)
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      )}
                      <path
                        fillRule="evenodd"
                        d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                        clipRule="evenodd"
                        opacity={isWatched ? 1 : 0.5}
                      />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-band segment indicator */}
        {subBandSegment && (
          <div className="mb-1 -mt-1">
            <span className="text-[10px] text-gray-500">
              Current segment: {subBandSegment}
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-white/10 my-3" />

        {/* Mode section */}
        <div
          className={`mb-3 ${contestLocked ? "opacity-40 pointer-events-none" : ""}`}
        >
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            Mode
          </span>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {ALL_UI_MODES.map((mode) => {
              const isActive = activeMode === mode;
              const modeSupported = isModeSupported(mode);

              return (
                <button
                  key={mode}
                  onClick={() => handleModeSelect(mode)}
                  className={`
                    px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                    ${!modeSupported ? "opacity-30 pointer-events-none" : ""}
                    ${
                      isActive
                        ? "bg-plasma-orange/20 text-plasma-orange"
                        : "text-gray-300 bg-white/5 hover:bg-white/10"
                    }
                  `}
                  disabled={!modeSupported}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>

        {/* Radio capability filter label */}
        {activeRadio && (
          <div className="mb-2">
            <span className="text-[10px] text-gray-500">
              Filtered by {activeRadio.manufacturer} {activeRadio.model}
            </span>
          </div>
        )}

        {/* Source indicator */}
        <SourceIndicator
          activeSource={activeSource}
          catOverridden={catOverridden}
          onOverride={handleOverrideCat}
          onResume={handleResumeCat}
        />
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Source indicator sub-component
// ---------------------------------------------------------------------------

function SourceIndicator({
  activeSource,
  catOverridden,
  onOverride,
  onResume,
}: {
  activeSource: string;
  catOverridden: boolean;
  onOverride: () => void;
  onResume: () => void;
}) {
  if (catOverridden) {
    return (
      <div className="mt-2 flex items-center justify-center">
        <button
          onClick={onResume}
          className="text-xs text-gray-400 hover:text-green-400 transition-colors"
        >
          Resume CAT Follow &#8617;
        </button>
      </div>
    );
  }

  if (activeSource === "cat") {
    return (
      <div className="mt-2 flex items-center justify-between px-1">
        <span className="text-xs text-green-400 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
          Following CAT
        </span>
        <button
          onClick={onOverride}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          Override
        </button>
      </div>
    );
  }

  if (activeSource === "wsjtx") {
    return (
      <div className="mt-2 flex items-center justify-center px-1">
        <span className="text-xs text-cyan-400 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400" />
          Following WSJT-X
        </span>
      </div>
    );
  }

  // Manual or default — no indicator needed
  return null;
}
