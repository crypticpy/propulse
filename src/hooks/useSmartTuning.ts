/**
 * useSmartTuning — FFT-based smart frequency snapping and tuning handlers.
 *
 * Extracts smartSnap (FFT centroid analysis), click-to-tune, scroll-wheel
 * tuning, and tuning step change from SdrConsole.
 */

import { useCallback } from "react";
import type { RadioState, RadioBinaryFrame } from "@/lib/radio/protocol";
import { useSettingsStore } from "@/stores/settingsStore";

// ── Types ────────────────────────────────────────────────────────────────────

/** The FFT frame shape (extracted from RadioBinaryFrame). */
type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

export interface UseSmartTuningOptions {
  connectedDeviceId: string | null;
  daemonSendCommand: (cmd: string, params?: Record<string, unknown>) => void;
  lastFftFrame: FftFrame | null;
  tuningStepHz: number;
  effectiveState: RadioState | null;
  freqUnit: "MHz" | "kHz" | "Hz";
  setDraftState: React.Dispatch<React.SetStateAction<RadioState | null>>;
  setFreqInput: (v: string) => void;
}

export interface SmartTuningHandlers {
  handlePickFrequencyHz: (hz: number) => void;
  handleWheelTune: (direction: number) => void;
  handleTuningStepChange: (stepHz: number) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSmartTuning(
  opts: UseSmartTuningOptions,
): SmartTuningHandlers {
  const {
    connectedDeviceId,
    daemonSendCommand,
    lastFftFrame,
    tuningStepHz,
    effectiveState,
    freqUnit,
    setDraftState,
    setFreqInput,
  } = opts;

  // ── Internal: smart snap via FFT centroid analysis ──────────────────────

  /**
   * Smart snap: find the center of a signal near clickedHz using FFT data.
   * Returns the centroid frequency if a signal is found above noise floor,
   * or null to fall back to step-size snapping.
   */
  const smartSnap = useCallback(
    (clickedHz: number): number | null => {
      const frame = lastFftFrame;
      if (!frame || frame.bins.length < 4) return null;

      const bins = frame.bins;
      const startHz = frame.centerHz - frame.spanHz / 2;
      const hzPerBin = frame.spanHz / bins.length;

      // Search window: +/- half the step size (min 2 kHz, max 10 kHz)
      const searchWindowHz = Math.max(2000, Math.min(10000, tuningStepHz * 3));
      const searchStartBin = Math.max(
        0,
        Math.floor((clickedHz - searchWindowHz - startHz) / hzPerBin),
      );
      const searchEndBin = Math.min(
        bins.length - 1,
        Math.ceil((clickedHz + searchWindowHz - startHz) / hzPerBin),
      );
      if (searchEndBin <= searchStartBin) return null;

      // Compute noise floor as the median of the search window
      const windowVals: number[] = [];
      for (let i = searchStartBin; i <= searchEndBin; i++) {
        windowVals.push(bins[i]);
      }
      windowVals.sort((a, b) => a - b);
      const noiseFloor = windowVals[Math.floor(windowVals.length / 2)];

      // Find the strongest bin above noise floor + threshold
      const threshold = 6; // dB above noise floor to count as a signal
      let peakBin = -1;
      let peakDb = -Infinity;
      for (let i = searchStartBin; i <= searchEndBin; i++) {
        if (bins[i] > peakDb && bins[i] > noiseFloor + threshold) {
          peakDb = bins[i];
          peakBin = i;
        }
      }
      if (peakBin === -1) return null; // No signal found

      // Refine center using power-weighted centroid around peak
      const refineBins = Math.max(2, Math.round(1500 / hzPerBin)); // ~1.5 kHz radius
      const lo = Math.max(0, peakBin - refineBins);
      const hi = Math.min(bins.length - 1, peakBin + refineBins);
      let weightedSum = 0;
      let weightSum = 0;
      for (let i = lo; i <= hi; i++) {
        // Convert dB to linear power for weighting; floor at noise level
        const dbAboveNoise = Math.max(0, bins[i] - noiseFloor);
        const linear = Math.pow(10, dbAboveNoise / 10);
        weightedSum += linear * i;
        weightSum += linear;
      }
      if (weightSum <= 0) return null;

      const centroidBin = weightedSum / weightSum;
      return startHz + centroidBin * hzPerBin;
    },
    [lastFftFrame, tuningStepHz],
  );

  // ── Frequency display helper ───────────────────────────────────────────

  const updateFreqDisplay = useCallback(
    (hz: number) => {
      const base =
        freqUnit === "MHz"
          ? hz / 1_000_000
          : freqUnit === "kHz"
            ? hz / 1_000
            : hz;
      const text =
        freqUnit === "MHz"
          ? base.toFixed(6)
          : freqUnit === "kHz"
            ? base.toFixed(3)
            : Math.round(base).toString();
      setFreqInput(text);
    },
    [freqUnit, setFreqInput],
  );

  // ── Click-to-tune with smart snap ──────────────────────────────────────

  const handlePickFrequencyHz = useCallback(
    (hz: number) => {
      if (!connectedDeviceId) return;

      // Smart snap: try to find signal center, fall back to step-size snap
      let snappedHz: number;
      const signalCenter = smartSnap(hz);
      if (signalCenter !== null) {
        // Snap the signal center to the step grid for clean frequency
        snappedHz = Math.round(signalCenter / tuningStepHz) * tuningStepHz;
      } else {
        // No signal detected -- snap to nearest step
        snappedHz = Math.round(hz / tuningStepHz) * tuningStepHz;
      }

      daemonSendCommand("radio:tune", {
        device_id: connectedDeviceId,
        freq: snappedHz,
      });
      setDraftState((s) => (s ? { ...s, freq: snappedHz } : s));
      updateFreqDisplay(snappedHz);
    },
    [
      connectedDeviceId,
      daemonSendCommand,
      smartSnap,
      tuningStepHz,
      setDraftState,
      updateFreqDisplay,
    ],
  );

  // ── Scroll-wheel tuning with smart snap ────────────────────────────────

  const handleWheelTune = useCallback(
    (direction: number) => {
      if (!connectedDeviceId || !effectiveState) return;
      const currentHz = effectiveState.freq;
      const stepHz = tuningStepHz;
      const candidateHz = currentHz + direction * stepHz;

      // Smart snap: look for a signal near the candidate, but ONLY accept
      // results that are in the same direction as travel (or at least not
      // behind the current frequency). This prevents the oscillation where
      // a strong signal behind you keeps pulling you backwards.
      let snappedHz: number;
      const signalCenter = smartSnap(candidateHz);
      if (signalCenter !== null) {
        const signalSnapped = Math.round(signalCenter / stepHz) * stepHz;
        // Accept the snap only if it moves in the intended direction
        const movedCorrectDirection =
          direction > 0 ? signalSnapped > currentHz : signalSnapped < currentHz;
        snappedHz = movedCorrectDirection
          ? signalSnapped
          : Math.round(candidateHz / stepHz) * stepHz;
      } else {
        snappedHz = Math.round(candidateHz / stepHz) * stepHz;
      }

      // Guard: if snapping somehow didn't move at all, force one step
      if (snappedHz === currentHz) {
        snappedHz = currentHz + direction * stepHz;
      }

      daemonSendCommand("radio:tune", {
        device_id: connectedDeviceId,
        freq: snappedHz,
      });
      setDraftState((s) => (s ? { ...s, freq: snappedHz } : s));
      updateFreqDisplay(snappedHz);
    },
    [
      connectedDeviceId,
      daemonSendCommand,
      effectiveState,
      smartSnap,
      tuningStepHz,
      setDraftState,
      updateFreqDisplay,
    ],
  );

  // ── Tuning step change ─────────────────────────────────────────────────

  const handleTuningStepChange = useCallback((stepHz: number) => {
    useSettingsStore.getState().updatePreferences({ sdrTuningStepHz: stepHz });
  }, []);

  return {
    handlePickFrequencyHz,
    handleWheelTune,
    handleTuningStepChange,
  };
}
