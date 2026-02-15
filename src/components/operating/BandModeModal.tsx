/**
 * BandModeModal — Centered modal for selecting band and mode on mobile.
 *
 * Triggered by tapping the BandModePill. Uses createPortal to render into
 * document.body with backdrop blur, body scroll lock, and escape-to-close.
 *
 * Reads hidden bands from settingsStore to dim unavailable selections.
 * Source indicator at bottom shows CAT/WSJT-X follow state with override controls.
 */

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useOperatingStore } from "@/stores/operatingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ALL_BANDS, type BandId } from "@/types/user";
import { ALL_UI_MODES, type UIMode } from "@/lib/utils/modeNormalize";
import { BAND_COLORS } from "@/lib/utils/spotColors";

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
  const hiddenBands = useSettingsStore((s) => s.favoredBands?.hidden ?? []);

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
    // Setting manual band/mode triggers override
    useOperatingStore.getState().setManualBandMode(activeBand, activeMode);
  };

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
        className="bg-void-black border border-white/10 rounded-2xl shadow-2xl max-w-sm w-[calc(100%-2rem)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-100 tracking-wide uppercase">
            Select Band &amp; Mode
          </h2>
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

        {/* Band section */}
        <div className="mb-3">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            Band
          </span>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {ALL_BANDS.map((band) => {
              const isActive = activeBand === band;
              const isHidden = hiddenBands.includes(band);
              const bandColor = BAND_COLORS[band] ?? BAND_COLORS.default;

              return (
                <button
                  key={band}
                  onClick={() => handleBandSelect(band)}
                  className={`
                    px-3 py-2.5 rounded-lg text-sm font-medium border-l-2 transition-all
                    ${isHidden ? "opacity-40" : ""}
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
                      : {}),
                  }}
                >
                  {band}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 my-3" />

        {/* Mode section */}
        <div className="mb-3">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            Mode
          </span>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {ALL_UI_MODES.map((mode) => {
              const isActive = activeMode === mode;

              return (
                <button
                  key={mode}
                  onClick={() => handleModeSelect(mode)}
                  className={`
                    px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                    ${
                      isActive
                        ? "bg-plasma-orange/20 text-plasma-orange"
                        : "text-gray-300 bg-white/5 hover:bg-white/10"
                    }
                  `}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>

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
