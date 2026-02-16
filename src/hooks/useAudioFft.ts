/**
 * useAudioFft — Derives high-resolution FFT frames from raw PCM audio samples.
 *
 * Computes a radix-2 FFT on accumulated audio samples and packages the
 * frequency data as an FftFrame with proper RF coordinates based on mode.
 *
 * Resolution: fftSize=4096 at 48 kHz → 2048 bins, ~11.7 Hz/bin — roughly 90×
 * better than the radio's CI-V scope data (~1050 Hz/bin across 500 kHz).
 *
 * This operates on the raw PCM samples (pre-notch), so interference remains
 * visible in the zoom waterfall for accurate notch placement.
 */

import { useEffect, useRef, useState } from "react";
import type { TuningOverlay } from "@/components/sdr/waterfallPalette";
import type { RadioBinaryFrame } from "@/lib/radio/protocol";

type FftFrame = Extract<RadioBinaryFrame, { kind: "fft" }>;

const FFT_SIZE = 4096;
const HALF = FFT_SIZE / 2;

/** Minimum interval between FFT computations in ms (~20 fps). */
const FRAME_INTERVAL_MS = 50;

// ── Pre-computed Hann window ────────────────────────────────────────────────
const hannWindow = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
}

// ── Radix-2 Cooley-Tukey FFT (in-place) ────────────────────────────────────
function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      let tmp = re[i];
      re[i] = re[j];
      re[j] = tmp;
      tmp = im[i];
      im[i] = im[j];
      im[j] = tmp;
    }
  }

  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const a = i + j;
        const b = a + halfLen;
        const tRe = curRe * re[b] - curIm * im[b];
        const tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

interface AudioFrameData {
  sampleRate: number;
  samples: Int16Array;
}

interface UseAudioFftOptions {
  /** Whether audio streaming is active. */
  enabled: boolean;
  /** The latest raw PCM audio frame from the radio. */
  audioFrame: AudioFrameData | null;
  /** Current tuning overlay for RF coordinate mapping. */
  tuning: TuningOverlay | null;
}

export function useAudioFft({
  enabled,
  audioFrame,
  tuning,
}: UseAudioFftOptions): FftFrame | null {
  const [frame, setFrame] = useState<FftFrame | null>(null);

  // Ring buffer to accumulate samples
  const ringRef = useRef(new Float32Array(FFT_SIZE));
  const writePos = useRef(0);
  const hasFullBuffer = useRef(false);
  const lastComputeTime = useRef(0);

  // Keep tuning ref current without re-triggering the effect
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;

  // Accumulate samples and compute FFT
  useEffect(() => {
    if (!enabled || !audioFrame || audioFrame.samples.length === 0) {
      if (!enabled) {
        setFrame(null);
        hasFullBuffer.current = false;
        writePos.current = 0;
      }
      return;
    }

    const ring = ringRef.current;
    const samples = audioFrame.samples;
    const sampleRate = audioFrame.sampleRate;

    // Copy new samples into ring buffer (convert i16 → float)
    for (let i = 0; i < samples.length; i++) {
      ring[writePos.current] = samples[i] / 32768;
      writePos.current = (writePos.current + 1) % FFT_SIZE;
      if (writePos.current === 0) hasFullBuffer.current = true;
    }

    // Throttle FFT computation
    const now = performance.now();
    if (now - lastComputeTime.current < FRAME_INTERVAL_MS) return;
    if (!hasFullBuffer.current) return;
    lastComputeTime.current = now;

    const t = tuningRef.current;
    if (!t) return;

    // Build windowed input from ring buffer (read from writePos = oldest sample)
    const re = new Float32Array(FFT_SIZE);
    const im = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = (writePos.current + i) % FFT_SIZE;
      re[i] = ring[idx] * hannWindow[i];
    }

    // Compute FFT
    fftInPlace(re, im);

    // Compute magnitude spectrum in dB (first half only = positive frequencies)
    const nyquist = sampleRate / 2;
    const bins = new Float32Array(HALF);
    const norm = 1 / FFT_SIZE;
    for (let k = 0; k < HALF; k++) {
      const magSq = re[k] * re[k] + im[k] * im[k];
      // 10 * log10(magSq * norm^2) = 20 * log10(mag * norm)
      bins[k] = 10 * Math.log10(Math.max(1e-20, magSq * norm * norm));
    }

    // Map audio bins to RF coordinates
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
  }, [enabled, audioFrame]);

  return frame;
}
