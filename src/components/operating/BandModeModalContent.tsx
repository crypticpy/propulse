/**
 * BandModeModal — Premium centered modal for selecting band and mode.
 *
 * Triggered by tapping the BandModePill. Uses createPortal to render into
 * document.body with backdrop blur, body scroll lock, and escape-to-close.
 *
 * Reads hidden bands from settingsStore to dim unavailable selections.
 * Source indicator shows CAT/WSJT-X follow state with override controls.
 *
 * Enhanced features:
 * - Propagation-aware band tinting via useBandConditionsTint
 * - Radio capability filtering (grays out unsupported bands/modes)
 * - Band/mode history ring (quick recall of recent selections)
 * - User-defined QSY presets with inline add/remove
 * - Contest lock toggle when a contest session is active
 * - Sub-band segment indicator
 * - Watched bands indicator on each band button
 * - MODE_COLORS for per-mode accent when active
 */

import { useEffect, useCallback, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useOperatingStore, SOURCE_DISPLAY } from "@/stores/operatingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useActiveRadio } from "@/stores/shackStore";
import { ALL_BANDS, type BandId } from "@/types/user";
import { ALL_UI_MODES, type UIMode } from "@/lib/utils/modeNormalize";
import { BAND_COLORS, MODE_COLORS } from "@/lib/utils/spotColors";
import { useBandConditionsTint } from "@/hooks/useBandConditionsTint";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRelativeTime(timestamp: number): string {
  const mins = Math.round((Date.now() - timestamp) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// Propagation status display lookup — color, label, and signal bar count
const STATUS_DISPLAY: Record<
  string,
  { color: string; label: string; bars: number }
> = {
  excellent: { color: "#22c55e", label: "EXCL", bars: 4 },
  good: { color: "#eab308", label: "GOOD", bars: 3 },
  fair: { color: "#f97316", label: "FAIR", bars: 2 },
  poor: { color: "#ef4444", label: "POOR", bars: 1 },
  closed: { color: "#6b7280", label: "CLSD", bars: 0 },
};

/** Compact 4-bar signal strength icon — reuses the PredictionsCard pattern */
function SignalBars({
  bars,
  color,
  className = "",
}: {
  bars: number;
  color: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ color }}
    >
      <rect
        x="2"
        y="16"
        width="4"
        height="6"
        rx="1"
        opacity={bars >= 1 ? 1 : 0.2}
      />
      <rect
        x="8"
        y="12"
        width="4"
        height="10"
        rx="1"
        opacity={bars >= 2 ? 1 : 0.2}
      />
      <rect
        x="14"
        y="8"
        width="4"
        height="14"
        rx="1"
        opacity={bars >= 3 ? 1 : 0.2}
      />
      <rect
        x="20"
        y="4"
        width="4"
        height="18"
        rx="1"
        opacity={bars >= 4 ? 1 : 0.2}
      />
    </svg>
  );
}

function SectionLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-[3px] h-3 rounded-full bg-plasma-orange" />
      <span className="text-xs font-semibold text-gray-300">{children}</span>
      {hint && <span className="text-[10px] text-gray-600 ml-0">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BandModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BandModeModal({ isOpen, onClose }: BandModeModalProps) {
  const navigate = useNavigate();
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
  const { statuses } = useBandConditionsTint();

  // Inline preset creation state
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const presetInputRef = useRef<HTMLInputElement>(null);

  // Accordion disclosure state
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // No-radio warning dismiss (session-scoped)
  const [radioWarningDismissed, setRadioWarningDismissed] = useState(false);

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

  // ── Derived colors ───────────────────────────────────────────────────────
  const bandColor = BAND_COLORS[activeBand] ?? BAND_COLORS.default;
  const sourceInfo = SOURCE_DISPLAY[activeSource];
  const sourceColor = sourceInfo?.color ?? "#888888";
  const sourceLabel = sourceInfo?.label ?? "Manual";

  return createPortal(
    <div
      className="fixed inset-0 z-[350] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Select Band and Mode"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal card */}
      <div
        className="relative z-10 bg-black/85 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl max-w-md w-full max-h-[calc(100vh-2rem)] overflow-hidden animate-in zoom-in-95 fade-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between p-5 pb-0 flex-shrink-0">
          <div>
            <h2 className="font-orbitron text-lg font-bold text-gradient-orange">
              Band &amp; Mode
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Choose your operating band and mode{" "}
              <span className="text-gray-600">
                (<kbd className="font-mono">B</kbd> /{" "}
                <kbd className="font-mono">M</kbd> keys)
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            {/* Contest lock toggle */}
            {contestSessionId && (
              <button
                onClick={handleContestLockToggle}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                  contestLocked
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
                aria-label={
                  contestLocked ? "Unlock band/mode" : "Lock band/mode"
                }
              >
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
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
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
        </div>

        {/* ── Scrollable content ────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 min-h-0 p-5 pt-4 space-y-4">
          {/* ── 1. Current State — live confirmation receipt ──────── */}
          <div
            className="rounded-xl px-4 py-3 border transition-colors duration-300"
            style={{
              borderColor: `${bandColor}40`,
              backgroundColor: `${bandColor}12`,
              boxShadow: `0 0 20px ${bandColor}08`,
            }}
          >
            <p className="text-[15px] text-gray-100 leading-snug">
              You&apos;re operating on{" "}
              <span
                className="font-bold font-mono text-base"
                style={{ color: bandColor }}
              >
                {activeBand}
              </span>{" "}
              in <span className="font-semibold text-white">{activeMode}</span>{" "}
              mode
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: sourceColor }}
              />
              <span
                className="text-[11px] font-medium"
                style={{ color: sourceColor }}
              >
                {activeSource === "cat"
                  ? "via CAT"
                  : activeSource === "wsjtx"
                    ? "via WSJT-X"
                    : activeSource === "manual"
                      ? "manually selected"
                      : "default"}
              </span>
              {subBandSegment && (
                <>
                  <span className="text-gray-600">&middot;</span>
                  <span className="text-[11px] text-gray-400">
                    {subBandSegment} segment
                  </span>
                </>
              )}
            </div>
          </div>

          {/* ── Gradient divider ───────────────────────────────────── */}
          <div
            className="h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 70%, transparent)",
            }}
          />

          {/* ── 2. Band Grid ─────────────────────────────────────── */}
          {(() => {
            const supportedBands = ALL_BANDS.filter((b) => isBandSupported(b));
            const unsupportedCount = ALL_BANDS.length - supportedBands.length;
            const visibleBands = radioBands ? supportedBands : ALL_BANDS;

            return (
              <div
                className={
                  contestLocked ? "opacity-40 pointer-events-none" : ""
                }
              >
                <SectionLabel hint="press B">Select a band</SectionLabel>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {visibleBands.map((band) => {
                    const isActive = activeBand === band;
                    const isHidden = hiddenBands.includes(band);
                    const bColor = BAND_COLORS[band] ?? BAND_COLORS.default;
                    const status = statuses[band];
                    const isWatched = watchedBands.includes(band);
                    const statusInfo = status ? STATUS_DISPLAY[status] : null;
                    const statusColor = statusInfo?.color ?? "#6b7280";

                    return (
                      <button
                        key={band}
                        onClick={() => handleBandSelect(band)}
                        className={`
                          relative rounded-lg overflow-hidden transition-all duration-150 group
                          active:scale-90 active:brightness-125 cursor-pointer
                          ${isHidden ? "opacity-40" : ""}
                          ${isActive ? "ring-[3px] ring-white scale-[1.08] z-10" : ""}
                        `}
                        style={{
                          ...(isActive
                            ? {
                                boxShadow: `0 0 20px ${bColor}70, 0 0 40px ${bColor}30`,
                                outline: `2px solid ${bColor}`,
                                outlineOffset: "3px",
                              }
                            : {}),
                        }}
                      >
                        {/* Top strip — band color identity */}
                        <div
                          className="relative px-2 py-1.5 text-center"
                          style={{ backgroundColor: bColor }}
                        >
                          {!isActive && (
                            <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-150 pointer-events-none" />
                          )}
                          <div className="relative text-sm font-black font-mono text-black leading-none">
                            {band}
                          </div>
                        </div>

                        {/* Bottom panel — dark with signal bars + status */}
                        <div
                          className="relative px-1.5 py-1.5 flex items-center justify-center gap-1"
                          style={{
                            backgroundColor: isActive
                              ? `${bColor}18`
                              : "rgba(0,0,0,0.75)",
                          }}
                        >
                          {!isActive && (
                            <div className="absolute inset-0 group-hover:bg-white/[0.04] transition-colors duration-150 pointer-events-none" />
                          )}
                          {statusInfo ? (
                            <>
                              <SignalBars
                                bars={statusInfo.bars}
                                color={statusColor}
                                className="w-3 h-3 flex-shrink-0 relative"
                              />
                              <span
                                className="text-[8px] font-bold uppercase tracking-wider relative"
                                style={{ color: statusColor }}
                              >
                                {statusInfo.label}
                              </span>
                            </>
                          ) : (
                            <span className="text-[8px] text-gray-600 relative">
                              --
                            </span>
                          )}
                        </div>

                        {/* Watched indicator */}
                        <button
                          type="button"
                          className={`absolute top-0.5 right-0.5 z-10 transition-opacity p-0 bg-transparent border-none cursor-pointer ${
                            isWatched
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-60"
                          }`}
                          onClick={(e) => handleWatchToggle(band, e)}
                          aria-label={
                            isWatched ? `Unwatch ${band}` : `Watch ${band}`
                          }
                        >
                          {isWatched ? (
                            <span className="block w-2 h-2 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                          ) : (
                            <span className="block w-2 h-2 rounded-full border border-black/30" />
                          )}
                        </button>
                      </button>
                    );
                  })}
                </div>
                {unsupportedCount > 0 && radioBands && (
                  <p className="text-[10px] text-gray-600 mt-2 flex items-center gap-1.5">
                    <svg
                      className="w-3 h-3 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {unsupportedCount} band
                    {unsupportedCount > 1 ? "s" : ""} not shown (not supported
                    by your radio)
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── Gradient divider ───────────────────────────────────── */}
          <div
            className="h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 70%, transparent)",
            }}
          />

          {/* ── 3. Mode Grid ─────────────────────────────────────── */}
          {(() => {
            const supportedModes = ALL_UI_MODES.filter((m) =>
              isModeSupported(m),
            );
            const unsupportedModeCount =
              ALL_UI_MODES.length - supportedModes.length;
            const visibleModes = radioModes ? supportedModes : ALL_UI_MODES;

            return (
              <div
                className={
                  contestLocked ? "opacity-40 pointer-events-none" : ""
                }
              >
                <SectionLabel hint="press M">Select a mode</SectionLabel>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {visibleModes.map((mode) => {
                    const isActive = activeMode === mode;
                    const mColor = MODE_COLORS[mode] ?? MODE_COLORS.default;

                    return (
                      <button
                        key={mode}
                        onClick={() => handleModeSelect(mode)}
                        className={`
                          relative px-3 py-2.5 rounded-lg text-sm font-bold transition-all duration-150
                          active:scale-90 active:brightness-125 cursor-pointer
                          ${isActive ? "ring-[3px] ring-white scale-[1.08] z-10 text-black" : "text-gray-400 hover:text-gray-200"}
                        `}
                        style={
                          isActive
                            ? {
                                backgroundColor: mColor,
                                boxShadow: `0 0 16px ${mColor}60, 0 0 32px ${mColor}25`,
                                outline: `2px solid ${mColor}`,
                                outlineOffset: "3px",
                              }
                            : {
                                backgroundColor: `${mColor}12`,
                                borderWidth: "1px",
                                borderColor: `${mColor}20`,
                              }
                        }
                      >
                        {/* Inactive hover overlay */}
                        {!isActive && (
                          <div
                            className="absolute inset-0 rounded-lg opacity-0 hover:opacity-100 transition-opacity duration-150 pointer-events-none"
                            style={{ backgroundColor: `${mColor}15` }}
                          />
                        )}
                        <span className="relative">{mode}</span>
                      </button>
                    );
                  })}
                </div>
                {unsupportedModeCount > 0 && radioModes && (
                  <p className="text-[10px] text-gray-600 mt-2 flex items-center gap-1.5">
                    <svg
                      className="w-3 h-3 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {unsupportedModeCount} mode
                    {unsupportedModeCount > 1 ? "s" : ""} not shown (not
                    supported by your radio)
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── Gradient divider ───────────────────────────────────── */}
          <div
            className="h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 70%, transparent)",
            }}
          />

          {/* ── 4. Radio Profile Section ──────────────────────────── */}
          {activeRadio ? (
            <div>
              <SectionLabel>Your active radio</SectionLabel>
              <div className="mt-2 flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <svg
                  className="w-4 h-4 text-plasma-orange flex-shrink-0 mt-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <polyline points="17 2 12 7 7 2" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200">
                    {activeRadio.manufacturer} {activeRadio.model}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {activeRadio.maxPower && (
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono text-gray-400 border border-white/5">
                        {activeRadio.maxPower}W
                      </span>
                    )}
                    <span className="text-[10px] text-gray-500">
                      {activeRadio.bands?.length ?? 0} bands supported
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 italic mt-1.5">
                    Band and mode grids are filtered to your radio's
                    capabilities
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  navigate("/shack");
                  onClose();
                }}
                className="mt-2 text-[11px] text-plasma-orange hover:text-plasma-orange/80 transition-colors"
              >
                Change radio &rarr;
              </button>
            </div>
          ) : !radioWarningDismissed ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
              <div className="flex items-start gap-2.5">
                <svg
                  className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <polyline points="17 2 12 7 7 2" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-400">
                    No radio profile configured
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Without a radio profile, band filtering and power limits
                    won't be personalized to your station.
                  </p>
                  <div className="flex items-center gap-3 mt-2.5">
                    <button
                      onClick={() => {
                        navigate("/shack");
                        onClose();
                      }}
                      className="bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    >
                      Configure in Shack &rarr;
                    </button>
                    <button
                      onClick={() => setRadioWarningDismissed(true)}
                      className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
                    >
                      Continue with defaults
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Gradient divider ───────────────────────────────────── */}
          <div
            className="h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 70%, transparent)",
            }}
          />

          {/* ── 5. Presets — collapsible accordion ──────────────── */}
          <div>
            <button
              onClick={() => setPresetsOpen((v) => !v)}
              className="flex items-center gap-2 w-full text-left group"
            >
              <svg
                className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${presetsOpen ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span className="text-xs font-semibold text-gray-300 group-hover:text-gray-200 transition-colors">
                Presets
              </span>
              {presets.length > 0 && (
                <span className="text-[10px] text-gray-600">
                  ({presets.length} saved)
                </span>
              )}
            </button>

            {presetsOpen && (
              <div className="mt-2.5 space-y-2.5">
                {/* Save this as preset */}
                <div>
                  {isAddingPreset ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handlePresetAdd();
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        ref={presetInputRef}
                        type="text"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Name this preset..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] font-mono text-gray-200 placeholder:text-gray-600 outline-none focus:border-white/20 transition-colors"
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
                      <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">
                        {activeBand} {activeMode}
                      </span>
                      <button
                        type="submit"
                        disabled={!presetName.trim()}
                        className="px-2.5 py-1.5 rounded-lg bg-plasma-orange/15 text-[10px] font-semibold text-plasma-orange hover:bg-plasma-orange/25 disabled:opacity-30 transition-colors"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setIsAddingPreset(true)}
                      disabled={presets.length >= 8}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.03] text-[11px] text-gray-500 hover:bg-white/[0.06] hover:text-gray-400 transition-colors border border-white/5 border-dashed disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      + Save this as preset
                      {presets.length >= 8 && (
                        <span className="ml-1 text-[9px] text-gray-600">
                          (max 8)
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Saved presets display */}
                {presets.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {presets.map((preset) => {
                      const presetBandColor =
                        BAND_COLORS[preset.band] ?? BAND_COLORS.default;
                      const isCurrentPreset =
                        preset.band === activeBand &&
                        preset.mode === activeMode;
                      return (
                        <div
                          key={preset.id}
                          className="group relative flex items-center"
                        >
                          <button
                            onClick={() => handlePresetApply(preset.id)}
                            className={`flex items-center gap-1.5 rounded-lg transition-colors border ${
                              isCurrentPreset
                                ? "bg-white/[0.08] border-white/15"
                                : "bg-white/[0.04] hover:bg-white/[0.08] border-white/5"
                            }`}
                          >
                            <div
                              className="w-1 h-full min-h-[32px] rounded-l-lg flex-shrink-0"
                              style={{ backgroundColor: presetBandColor }}
                            />
                            <div className="text-left pr-2.5 py-1.5">
                              <div className="text-[11px] font-medium text-gray-300">
                                {preset.name}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="text-[9px] font-bold font-mono"
                                  style={{ color: presetBandColor }}
                                >
                                  {preset.band}
                                </span>
                                <span className="text-[9px] text-gray-500">
                                  {preset.mode}
                                </span>
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={() => handlePresetRemove(preset.id)}
                            className="absolute -right-1 -top-1 w-4 h-4 flex items-center justify-center rounded-full bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
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
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-600 italic">
                    No presets saved yet. Save your current band and mode for
                    quick recall.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── 6. Recent History — collapsible accordion ───────── */}
          {uniqueHistory.length > 0 && (
            <div>
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center gap-2 w-full text-left group"
              >
                <svg
                  className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${historyOpen ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                <span className="text-xs font-semibold text-gray-300 group-hover:text-gray-200 transition-colors">
                  Recent
                </span>
                <span className="text-[10px] text-gray-600">
                  ({uniqueHistory.length})
                </span>
              </button>

              {historyOpen && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {uniqueHistory.map((entry, i) => {
                    const hColor =
                      BAND_COLORS[entry.band] ?? BAND_COLORS.default;
                    const timeAgo = getRelativeTime(entry.timestamp);
                    return (
                      <button
                        key={`${entry.band}-${entry.mode}-${i}`}
                        onClick={() =>
                          handleHistorySelect(entry.band, entry.mode)
                        }
                        className="flex items-center gap-1.5 pl-0 pr-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors border border-white/5"
                      >
                        <div
                          className="w-[3px] h-4 rounded-r-full"
                          style={{ backgroundColor: hColor }}
                        />
                        <span className="text-[11px] font-mono text-gray-300">
                          {entry.band}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {entry.mode}
                        </span>
                        <span className="text-[9px] text-gray-600">
                          {timeAgo}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── 7. Source Status Footer ───────────────────────────── */}
          {(activeSource === "cat" ||
            activeSource === "wsjtx" ||
            catOverridden) && (
            <div
              className="flex items-center justify-between px-3 py-2.5 rounded-lg border"
              style={{
                backgroundColor: `${sourceColor}08`,
                borderColor: `${sourceColor}20`,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: sourceColor }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: sourceColor }}
                >
                  {catOverridden ? "CAT Override" : `Following ${sourceLabel}`}
                </span>
              </div>
              {catOverridden ? (
                <button
                  onClick={handleResumeCat}
                  className="text-xs text-gray-400 hover:text-green-400 transition-colors"
                >
                  Resume &#8617;
                </button>
              ) : activeSource === "cat" ? (
                <button
                  onClick={handleOverrideCat}
                  className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Override
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Fixed Done footer — always visible, explicit close ── */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-white/10 bg-black/60">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{
              backgroundColor: bandColor,
              color: "#000",
              boxShadow: `0 0 16px ${bandColor}30`,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
