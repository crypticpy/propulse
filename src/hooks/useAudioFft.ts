/**
 * useAudioFft — Derives high-resolution FFT frames from raw PCM audio samples.
 *
 * Computes a radix-2 FFT on accumulated audio samples and packages the
 * frequency data as an FftFrame with proper RF coordinates based on mode.
 *
 * Resolution: fftSize=4096 at 48 kHz → 2048 bins, ~11.7 Hz/bin — roughly 90×
 * better than the radio's CI-V scope data (~1050 Hz/bin across 500 kHz).
 *
 * FFT computation is offloaded to a Web Worker to keep the main thread free.
 * Audio frames are pushed imperatively via `pushAudioFrame`, which avoids
 * rerendering React at raw audio chunk rate.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { TuningOverlay } from "@/components/sdr/waterfallPalette";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";
import {
  createAudioFftWorker,
  disposeAudioFftWorker,
} from "@/lib/audio/audioFftWorker";

type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

const HALF = 4096 / 2; // Must match FFT_SIZE / 2 in the worker

export interface AudioFrameData {
  sampleRate: number;
  samples: Int16Array;
}

interface UseAudioFftOptions {
  /** Whether audio streaming is active. */
  enabled: boolean;
  /** Current tuning overlay for RF coordinate mapping. */
  tuning: TuningOverlay | null;
  /** Max UI update rate for audio FFT output. */
  maxFps?: number;
}

interface UseAudioFftResult {
  frame: FftFrame | null;
  pushAudioFrame: (audioFrame: AudioFrameData) => void;
}

export function useAudioFft({
  enabled,
  tuning,
  maxFps = 20,
}: UseAudioFftOptions): UseAudioFftResult {
  const [frame, setFrame] = useState<FftFrame | null>(null);

  // Keep refs current without re-triggering effects
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const maxFpsRef = useRef(maxFps);
  maxFpsRef.current = maxFps;

  // Worker ref — managed by lifecycle effect
  const workerRef = useRef<Worker | null>(null);

  // Pre-allocated conversion buffer for Int16→Float32 (reused every frame)
  const convBufRef = useRef<Float32Array | null>(null);
  const convBufLenRef = useRef(0);

  // Throttle UI updates to avoid high-rate rerenders
  const lastEmitMsRef = useRef(0);

  // ── Worker message handler (stable ref) ─────────────────────────────────
  const onWorkerMessage = useCallback((e: MessageEvent) => {
    const msg = e.data;
    if (msg.type !== "fft") return;

    const now = performance.now();
    const minIntervalMs = 1000 / Math.max(1, maxFpsRef.current);
    if (now - lastEmitMsRef.current < minIntervalMs) return;
    lastEmitMsRef.current = now;

    const bins: Float32Array = msg.bins; // transferred from Worker
    const sampleRate: number = msg.sampleRate;

    const t = tuningRef.current;
    if (!t) return;

    const nyquist = sampleRate / 2;
    const mode = (t.mode ?? "USB").toUpperCase();
    const isLsb = mode === "LSB" || mode === "CWR";

    let centerHz: number;
    let rfBins: Float32Array;

    if (isLsb) {
      // LSB: audio freq X → RF = carrier - X
      // Reverse bins so frame goes low RF → high RF
      centerHz = t.freqHz - nyquist / 2;
      rfBins = new Float32Array(HALF);
      for (let i = 0; i < HALF; i++) {
        rfBins[i] = bins[HALF - 1 - i];
      }
    } else {
      // USB/CW/AM/FM: audio freq X → RF = carrier + X
      centerHz = t.freqHz + nyquist / 2;
      rfBins = bins;
    }

    setFrame({
      kind: "fft",
      devIdx: -1, // sentinel: audio-derived, not from radio
      centerHz,
      spanHz: nyquist,
      bins: rfBins,
    });
  }, []);

  // ── Worker lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      // Tear down worker when disabled
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      setFrame(null);
      return;
    }

    // Create worker
    const worker = createAudioFftWorker();
    worker.onmessage = onWorkerMessage;
    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
      disposeAudioFftWorker();
    };
  }, [enabled, onWorkerMessage]);

  // ── Imperative audio frame push (no React state updates) ───────────────
  const pushAudioFrame = useCallback((audioFrame: AudioFrameData) => {
    if (!enabledRef.current) return;
    if (!audioFrame || audioFrame.samples.length === 0) return;

    const worker = workerRef.current;
    if (!worker) return;

    const src = audioFrame.samples;
    const len = src.length;

    // Reallocate conversion buffer only when size changes
    if (len !== convBufLenRef.current) {
      convBufRef.current = new Float32Array(len);
      convBufLenRef.current = len;
    }
    const f32 = convBufRef.current!;

    // Convert Int16 → Float32 in the pre-allocated buffer
    for (let i = 0; i < len; i++) {
      f32[i] = src[i] / 32768;
    }

    // Structured clone (no transfer list) — ~4 KB copy is negligible,
    // and lets us reuse convBufRef every frame without reallocation.
    worker.postMessage({
      type: "audio",
      samples: f32,
      sampleRate: audioFrame.sampleRate,
    });
  }, []);

  return { frame, pushAudioFrame };
}
