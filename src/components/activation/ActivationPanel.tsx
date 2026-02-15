/**
 * ActivationPanel — Main POTA/SOTA activation workflow UI.
 *
 * Combines park/summit search, counter ring, quick-log form, timer,
 * and ADIF export into a single mobile-first panel.
 *
 * States:
 * 1. No activation: shows type selector + park search + start button
 * 2. Active: shows header with ref/timer, counter ring, quick-log, end/export buttons
 */

import { useState, useCallback } from "react";
import { useActivation } from "@/hooks/useActivation";
import type { ActivationType } from "@/hooks/useActivation";
import { ActivationCounter } from "./ActivationCounter";
import { ParkSearch } from "./ParkSearch";
import { QuickLogForm } from "./QuickLogForm";
import { exportActivationADIF } from "@/lib/adif/export";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format seconds as HH:MM:SS */
function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    String(h).padStart(2, "0"),
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
  ].join(":");
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ActivationPanelProps {
  /** Optional class names */
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ActivationPanel({ className = "" }: ActivationPanelProps) {
  const {
    isActive,
    activationType,
    parkRef,
    summitRef,
    activationName,
    qsoCount,
    threshold,
    elapsedTime,
    isThresholdMet,
    startActivation,
    endActivation,
    getActivationEntries,
  } = useActivation();

  // Pre-activation state
  const [selectedType, setSelectedType] = useState<ActivationType>("pota");
  const [selectedRef, setSelectedRef] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const currentRef = activationType === "pota" ? parkRef : summitRef;

  // ── Park/Summit selection ────────────────────────────────────────────────

  const handleParkSelect = useCallback((ref: string, name: string) => {
    setSelectedRef(ref);
    setSelectedName(name);
  }, []);

  // ── Start activation ─────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    if (!selectedRef) return;
    startActivation(selectedType, selectedRef, selectedName);
    // Reset selection state
    setSelectedRef("");
    setSelectedName("");
  }, [selectedType, selectedRef, selectedName, startActivation]);

  // ── End activation ───────────────────────────────────────────────────────

  const handleEnd = useCallback(() => {
    setShowEndConfirm(false);
    endActivation();
  }, [endActivation]);

  // ── ADIF Export ──────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!activationType || !currentRef) return;

    setIsExporting(true);
    try {
      const entries = await getActivationEntries();
      const adif = exportActivationADIF(entries, activationType, currentRef);

      // Trigger download
      const blob = new Blob([adif], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activationType.toUpperCase()}_${currentRef.replace(/[/\\]/g, "-")}_${new Date().toISOString().slice(0, 10)}.adi`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[ActivationPanel] Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [activationType, currentRef, getActivationEntries]);

  // ── Pre-activation view ──────────────────────────────────────────────────

  if (!isActive) {
    return (
      <div
        className={`rounded-xl bg-panel border border-white/5 p-5 space-y-5 ${className}`}
      >
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-white">Start Activation</h2>
          <p className="text-sm text-white/50 mt-1">
            Select POTA or SOTA, find your park or summit, and start logging.
          </p>
        </div>

        {/* Type selector */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelectedType("pota")}
            className={`flex-1 h-12 rounded-lg font-bold text-sm uppercase tracking-wider
                       transition-all duration-150 ${
                         selectedType === "pota"
                           ? "bg-signal-green/20 text-signal-green border-2 border-signal-green/40"
                           : "bg-space-900 text-white/50 border border-white/10 hover:text-white/70"
                       }`}
          >
            POTA
          </button>
          <button
            type="button"
            onClick={() => setSelectedType("sota")}
            className={`flex-1 h-12 rounded-lg font-bold text-sm uppercase tracking-wider
                       transition-all duration-150 ${
                         selectedType === "sota"
                           ? "bg-plasma-orange/20 text-plasma-orange border-2 border-plasma-orange/40"
                           : "bg-space-900 text-white/50 border border-white/10 hover:text-white/70"
                       }`}
          >
            SOTA
          </button>
        </div>

        {/* Park/Summit search */}
        <ParkSearch type={selectedType} onSelect={handleParkSelect} />

        {/* Selected park/summit display */}
        {selectedRef && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-space-900 border border-white/10">
            <div
              className={`w-2 h-2 rounded-full ${
                selectedType === "pota" ? "bg-signal-green" : "bg-plasma-orange"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="font-mono font-bold text-white text-sm">
                {selectedRef}
              </div>
              {selectedName && (
                <div className="text-xs text-white/50 truncate">
                  {selectedName}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Start button */}
        <button
          type="button"
          onClick={handleStart}
          disabled={!selectedRef}
          className={`w-full h-14 rounded-lg font-bold text-base uppercase tracking-wider
                     transition-all duration-150
                     disabled:opacity-30 disabled:cursor-not-allowed ${
                       selectedType === "pota"
                         ? "bg-signal-green text-void-black hover:bg-signal-green/90"
                         : "bg-plasma-orange text-void-black hover:bg-plasma-orange/90"
                     }`}
        >
          Start {selectedType.toUpperCase()} Activation
        </button>
      </div>
    );
  }

  // ── Active activation view ───────────────────────────────────────────────

  const typeBadgeClasses =
    activationType === "pota"
      ? "bg-signal-green/20 text-signal-green"
      : "bg-plasma-orange/20 text-plasma-orange";

  return (
    <div
      className={`rounded-xl bg-panel border border-white/5 overflow-hidden ${className}`}
    >
      {/* Header bar */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Type badge */}
            <span
              className={`flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-bold uppercase ${typeBadgeClasses}`}
            >
              {activationType}
            </span>
            {/* Ref and name */}
            <div className="min-w-0">
              <div className="font-mono font-bold text-white text-sm truncate">
                {currentRef}
              </div>
              {activationName && (
                <div className="text-xs text-white/50 truncate">
                  {activationName}
                </div>
              )}
            </div>
          </div>
          {/* Timer */}
          <div className="flex-shrink-0 font-mono text-white/70 text-sm tabular-nums">
            {formatElapsed(elapsedTime)}
          </div>
        </div>
      </div>

      {/* Counter and form area */}
      <div className="p-5 space-y-5">
        {/* Counter ring — centered */}
        <div className="flex justify-center">
          <ActivationCounter count={qsoCount} threshold={threshold} size={96} />
        </div>

        {/* Threshold status */}
        {isThresholdMet && (
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-signal-green/10 text-signal-green text-xs font-medium">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 7.5l3 3 5-6"
                />
              </svg>
              Valid activation! {qsoCount} QSOs logged
            </span>
          </div>
        )}

        {/* Quick log form */}
        <QuickLogForm />

        {/* Action buttons */}
        <div className="flex gap-2">
          {/* Export ADIF */}
          <button
            type="button"
            onClick={handleExport}
            disabled={qsoCount === 0 || isExporting}
            className="flex-1 h-11 rounded-lg font-medium text-sm
                       bg-nebula-blue/20 text-nebula-blue border border-nebula-blue/20
                       hover:bg-nebula-blue/30 active:scale-[0.98]
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-150"
          >
            {isExporting ? "Exporting..." : "Export ADIF"}
          </button>

          {/* End activation */}
          {!showEndConfirm ? (
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              className="flex-1 h-11 rounded-lg font-medium text-sm
                         bg-alert-red/10 text-alert-red border border-alert-red/20
                         hover:bg-alert-red/20 active:scale-[0.98]
                         transition-all duration-150"
            >
              End Activation
            </button>
          ) : (
            <div className="flex-1 flex gap-1">
              <button
                type="button"
                onClick={handleEnd}
                className="flex-1 h-11 rounded-lg font-bold text-sm
                           bg-alert-red text-white
                           hover:bg-alert-red/90 active:scale-[0.98]
                           transition-all duration-150"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setShowEndConfirm(false)}
                className="h-11 px-3 rounded-lg text-sm
                           bg-space-900 text-white/60 border border-white/10
                           hover:text-white/80
                           transition-all duration-150"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
