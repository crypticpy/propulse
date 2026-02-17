/**
 * useAudioRecorder — Client-side audio recording from the SDR DSP chain.
 *
 * Captures audio from the processing chain's output node using a
 * ScriptProcessorNode (for raw sample accumulation) and encodes
 * to WAV on export. Supports:
 * - Start/stop recording
 * - Duration tracking
 * - WAV file export with auto-generated filename
 * - Configurable max duration (circular buffer trim)
 */

import { useCallback, useRef, useState } from "react";
import type { AudioProcessingChain } from "@/lib/audio/audioProcessingChain";
import { encodeWav, downloadBlob } from "@/lib/audio/wavEncoder";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AudioRecorderState {
  /** Whether currently recording */
  isRecording: boolean;
  /** Recording duration in seconds */
  durationSec: number;
  /** Estimated file size in bytes (uncompressed WAV) */
  estimatedBytes: number;
  /** Whether there are recorded samples available for export */
  hasRecording: boolean;
}

export interface AudioRecorderActions {
  /** Start recording from the processing chain output */
  startRecording: (chain: AudioProcessingChain, sampleRate?: number) => void;
  /** Stop recording */
  stopRecording: () => void;
  /** Export accumulated recording as WAV file download */
  exportWav: (filenamePrefix?: string) => void;
  /** Discard the current recording buffer */
  discardRecording: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** ScriptProcessor buffer size — 4096 samples at 48kHz ≈ 85ms */
const BUFFER_SIZE = 4096;

/** Maximum recording duration (30 minutes at 48kHz mono) */
const MAX_SAMPLES = 48000 * 60 * 30; // ~86M samples ≈ 172 MB

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAudioRecorder(): [AudioRecorderState, AudioRecorderActions] {
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);

  // Recording state refs (not reactive — only accessed in callbacks)
  const samplesRef = useRef<Float32Array[]>([]);
  const totalSamplesRef = useRef(0);
  const sampleRateRef = useRef(48000);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const chainRef = useRef<AudioProcessingChain | null>(null);

  const startRecording = useCallback(
    (chain: AudioProcessingChain, sampleRate = 48000) => {
      if (isRecording) return;

      // Reset buffer
      samplesRef.current = [];
      totalSamplesRef.current = 0;
      sampleRateRef.current = sampleRate;
      chainRef.current = chain;
      setDurationSec(0);
      setHasRecording(false);

      // Create ScriptProcessorNode for sample capture
      // (Using ScriptProcessor because it gives direct Float32Array access —
      // AudioWorklet would require message-passing overhead for recording)
      const ctx = chain.getOutputNode().context as AudioContext;
      const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const input = e.inputBuffer.getChannelData(0);
        // Copy samples (input buffer is reused by Web Audio)
        const copy = new Float32Array(input.length);
        copy.set(input);
        samplesRef.current.push(copy);
        totalSamplesRef.current += copy.length;

        // Trim if exceeding max duration
        while (
          totalSamplesRef.current > MAX_SAMPLES &&
          samplesRef.current.length > 1
        ) {
          const removed = samplesRef.current.shift()!;
          totalSamplesRef.current -= removed.length;
        }
      };

      // Connect: chain output → processor → (silent output to keep alive)
      chain.getOutputNode().connect(processor);
      processor.connect(ctx.destination); // Must be connected to keep processing

      processorRef.current = processor;
      setIsRecording(true);

      // Duration timer
      const startTime = performance.now();
      timerRef.current = window.setInterval(() => {
        setDurationSec((performance.now() - startTime) / 1000);
      }, 500);
    },
    [isRecording],
  );

  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    // Disconnect and clean up processor
    if (processorRef.current && chainRef.current) {
      chainRef.current.getOutputNode().disconnect(processorRef.current);
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    chainRef.current = null;
    setIsRecording(false);
    setHasRecording(totalSamplesRef.current > 0);
  }, [isRecording]);

  const exportWav = useCallback((filenamePrefix = "propulse-recording") => {
    if (totalSamplesRef.current === 0) return;

    // Concatenate all chunks into a single Float32Array
    const totalLen = totalSamplesRef.current;
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of samplesRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const blob = encodeWav(merged, sampleRateRef.current);

    // Generate filename with timestamp
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `${filenamePrefix}-${ts}.wav`;

    downloadBlob(blob, filename);
  }, []);

  const discardRecording = useCallback(() => {
    if (isRecording) return; // Can't discard while recording
    samplesRef.current = [];
    totalSamplesRef.current = 0;
    setDurationSec(0);
    setHasRecording(false);
  }, [isRecording]);

  const estimatedBytes = totalSamplesRef.current * 2 + 44; // 16-bit PCM + WAV header

  return [
    { isRecording, durationSec, estimatedBytes, hasRecording },
    { startRecording, stopRecording, exportWav, discardRecording },
  ];
}
