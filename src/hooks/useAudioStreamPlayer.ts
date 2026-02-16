import { useEffect, useRef } from "react";

import type {
  AudioProcessingChain,
  NotchFilterConfig,
} from "@/lib/audio/audioProcessingChain";

type AudioFrame = { sampleRate: number; samples: Int16Array };

interface AudioStreamPlayerOptions {
  /** Whether playback is active. */
  enabled: boolean;
  /** The current PCM audio frame to play. */
  frame: AudioFrame | null;
  /** Optional externally-managed DSP chain to route audio through. */
  processingChain?: AudioProcessingChain | null;
  /** Notch filter configs to sync to the processing chain each render. */
  notchFilters?: NotchFilterConfig[];
}

export function useAudioStreamPlayer(options: AudioStreamPlayerOptions): void;
/**
 * @deprecated Use the options-object overload instead.
 */
export function useAudioStreamPlayer(
  enabled: boolean,
  frame: AudioFrame | null,
): void;
export function useAudioStreamPlayer(
  enabledOrOptions: boolean | AudioStreamPlayerOptions,
  frameLegacy?: AudioFrame | null,
): void {
  // Normalise the two call signatures into a single options shape.
  const opts: AudioStreamPlayerOptions =
    typeof enabledOrOptions === "boolean"
      ? { enabled: enabledOrOptions, frame: frameLegacy ?? null }
      : enabledOrOptions;

  const { enabled, frame, processingChain = null, notchFilters } = opts;

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextTimeRef = useRef<number>(0);
  /** Track whether we have wired the chain into the audio graph. */
  const chainConnectedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Sync notch filters to the processing chain whenever they change.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (processingChain && notchFilters) {
      processingChain.syncNotchFilters(notchFilters);
    }
  }, [processingChain, notchFilters]);

  // ---------------------------------------------------------------------------
  // Audio context lifecycle — create / tear-down based on `enabled`.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      // Disconnect chain output (if connected) before closing context.
      if (chainConnectedRef.current && processingChain) {
        try {
          processingChain.getOutputNode().disconnect();
        } catch {
          // Already disconnected — safe to ignore.
        }
        chainConnectedRef.current = false;
      }

      // Only close the AudioContext if we created it (no chain).
      // When a chain is present, it owns the context — SdrConsole disposes it.
      if (ctxRef.current && !processingChain) {
        ctxRef.current.close().catch(() => undefined);
      }
      ctxRef.current = null;
      gainRef.current = null;
      nextTimeRef.current = 0;
      return;
    }

    if (!ctxRef.current) {
      // Use the chain's AudioContext if available to avoid cross-context errors,
      // otherwise create a new one.
      const ctx = processingChain
        ? processingChain.getAudioContext()
        : new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0.8;

      if (processingChain) {
        // Route: gain → chain input … chain output → destination
        gain.connect(processingChain.getInputNode());
        processingChain.getOutputNode().connect(ctx.destination);
        chainConnectedRef.current = true;
      } else {
        // Direct path: gain → destination
        gain.connect(ctx.destination);
      }

      ctxRef.current = ctx;
      gainRef.current = gain;
      nextTimeRef.current = ctx.currentTime;
    }
  }, [enabled, processingChain]);

  // ---------------------------------------------------------------------------
  // Schedule PCM frames for playback.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain || !frame) return;

    // Ensure audio context is running (autoplay policies may suspend it until user gesture).
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }

    // Convert PCM i16 -> float32
    const float = new Float32Array(frame.samples.length);
    for (let i = 0; i < frame.samples.length; i++) {
      float[i] = frame.samples[i] / 32768;
    }

    const buf = ctx.createBuffer(1, float.length, frame.sampleRate);
    buf.copyToChannel(float, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextTimeRef.current);
    src.start(startAt);
    nextTimeRef.current = startAt + buf.duration;
  }, [enabled, frame]);
}
