import { useCallback, useEffect, useRef } from "react";

import type { AudioProcessingChain } from "@/lib/audio/audioProcessingChain";
import type { EqBand } from "@/lib/audio/eqTypes";

export type AudioFrame = { sampleRate: number; samples: Int16Array };

interface AudioStreamPlayerOptions {
  /** Whether playback is active. */
  enabled: boolean;
  /**
   * Optional externally-managed AudioContext to use for playback when no DSP
   * chain is provided. This should be created/resumed during a user gesture.
   */
  audioContext?: AudioContext | null;
  /** Optional externally-managed DSP chain to route audio through. */
  processingChain?: AudioProcessingChain | null;
  /** Route playback directly to destination even when a chain is available. */
  forceBypassProcessing?: boolean;
  /** EQ band configs to sync to the processing chain each render. */
  eqBands?: EqBand[];
  /**
   * Optional frame for compatibility with the previous API.
   * Prefer using the returned `pushFrame` callback for high-rate streams.
   */
  frame?: AudioFrame | null;
}

export type PushAudioFrame = (frame: AudioFrame) => void;

const MAX_QUEUE_SEC = 0.25;

export function useAudioStreamPlayer(
  options: AudioStreamPlayerOptions,
): PushAudioFrame;
/**
 * @deprecated Use the options-object overload and returned `pushFrame` callback.
 */
export function useAudioStreamPlayer(
  enabled: boolean,
  frame: AudioFrame | null,
): PushAudioFrame;
export function useAudioStreamPlayer(
  enabledOrOptions: boolean | AudioStreamPlayerOptions,
  frameLegacy?: AudioFrame | null,
): PushAudioFrame {
  // Normalise the two call signatures into a single options shape.
  const opts: AudioStreamPlayerOptions =
    typeof enabledOrOptions === "boolean"
      ? { enabled: enabledOrOptions, frame: frameLegacy ?? null }
      : enabledOrOptions;

  const {
    enabled,
    frame: compatFrame = null,
    audioContext = null,
    processingChain = null,
    forceBypassProcessing = false,
    eqBands,
  } = opts;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextTimeRef = useRef<number>(0);
  const chainConnectedRef = useRef(false);
  const wiredChainRef = useRef<AudioProcessingChain | null>(null);
  const ownsContextRef = useRef(false);
  const resumeCleanupRef = useRef<(() => void) | null>(null);
  const resumeAttemptedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Sync EQ bands to the processing chain whenever they change.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (processingChain && eqBands) {
      processingChain.syncEqBands(eqBands);
    }
  }, [processingChain, eqBands]);

  // ---------------------------------------------------------------------------
  // Audio context lifecycle — create / tear-down based on `enabled` + chain.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      // Tear down everything
      if (resumeCleanupRef.current) {
        resumeCleanupRef.current();
        resumeCleanupRef.current = null;
      }
      if (chainConnectedRef.current && wiredChainRef.current) {
        try {
          wiredChainRef.current.getOutputNode().disconnect();
        } catch {
          /* already disconnected */
        }
        chainConnectedRef.current = false;
      }
      wiredChainRef.current = null;
      if (gainRef.current) {
        try {
          gainRef.current.disconnect();
        } catch {
          /* already disconnected */
        }
      }
      if (ctxRef.current && ownsContextRef.current) {
        ctxRef.current.close().catch(() => undefined);
      }
      ctxRef.current = null;
      gainRef.current = null;
      nextTimeRef.current = 0;
      ownsContextRef.current = false;
      resumeAttemptedRef.current = false;
      return;
    }

    // Nothing to do if graph already built for this chain
    const chainChanged = processingChain !== wiredChainRef.current;
    const contextChanged =
      !processingChain && !!audioContext && ctxRef.current !== audioContext;
    if (ctxRef.current && !chainChanged && !contextChanged) return;

    // --- Tear down old graph ---
    if (resumeCleanupRef.current) {
      resumeCleanupRef.current();
      resumeCleanupRef.current = null;
    }
    if (chainConnectedRef.current && wiredChainRef.current) {
      try {
        wiredChainRef.current.getOutputNode().disconnect();
      } catch {
        /* already disconnected */
      }
      chainConnectedRef.current = false;
    }
    if (gainRef.current) {
      try {
        gainRef.current.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    if (ctxRef.current && ownsContextRef.current) {
      ctxRef.current.close().catch(() => undefined);
    }

    // --- Build new graph ---
    // Prefer the chain's context when present. Otherwise use the provided shared
    // context (created/resumed from a user gesture). Only create a new context
    // as a last resort.
    const ctx = processingChain
      ? processingChain.getAudioContext()
      : audioContext ?? new AudioContext();
    ownsContextRef.current = !processingChain && !audioContext;

    const gain = ctx.createGain();
    gain.gain.value = 0.8;

    const useProcessingChain = !!processingChain && !forceBypassProcessing;
    if (useProcessingChain) {
      gain.connect(processingChain.getInputNode());
      processingChain.getOutputNode().connect(ctx.destination);
      chainConnectedRef.current = true;
    } else {
      gain.connect(ctx.destination);
    }
    wiredChainRef.current = processingChain;

    ctxRef.current = ctx;
    gainRef.current = gain;
    nextTimeRef.current = ctx.currentTime;
    resumeAttemptedRef.current = false;

    // Resume on user gesture if Chrome suspended the context
    if (ctx.state === "suspended") {
      const resume = () => {
        if (ctx.state === "closed") return;
        void ctx.resume().then(() => {
          if (ctx.state === "running" && resumeCleanupRef.current) {
            resumeCleanupRef.current();
            resumeCleanupRef.current = null;
          }
        });
      };
      const eventTypes: Array<keyof DocumentEventMap> = [
        "click",
        "keydown",
        "pointerdown",
        "touchstart",
      ];
      for (const type of eventTypes) {
        document.addEventListener(type, resume, { passive: true });
      }
      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          resume();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      resumeCleanupRef.current = () => {
        for (const type of eventTypes) {
          document.removeEventListener(type, resume);
        }
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
  }, [enabled, audioContext, processingChain, forceBypassProcessing]);

  // ---------------------------------------------------------------------------
  // Imperative frame pusher for high-rate streams (avoids React rerenders).
  // ---------------------------------------------------------------------------
  const pushFrame = useCallback((frame: AudioFrame) => {
    if (!enabledRef.current) return;

    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    if (!frame || frame.samples.length === 0) return;

    if (ctx.state !== "running") {
      const canTryResume =
        !resumeAttemptedRef.current &&
        ctx.state === "suspended" &&
        typeof navigator !== "undefined" &&
        "userActivation" in navigator &&
        !!(
          navigator as Navigator & {
            userActivation?: { hasBeenActive?: boolean };
          }
        ).userActivation?.hasBeenActive;
      if (canTryResume) {
        resumeAttemptedRef.current = true;
        void ctx.resume().catch(() => undefined);
      }
      return;
    }
    resumeAttemptedRef.current = false;

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
    // Keep latency bounded. If we fall behind or build up a large queue,
    // reset scheduling to near-real-time to avoid "silent" long delays.
    if (nextTimeRef.current < now - 0.5 || nextTimeRef.current > now + MAX_QUEUE_SEC) {
      nextTimeRef.current = now;
    }
    const startAt = Math.max(now, nextTimeRef.current);
    src.start(startAt);
    nextTimeRef.current = startAt + buf.duration;
  }, []);

  // Compatibility path for previous frame-driven usage.
  useEffect(() => {
    if (!compatFrame) return;
    pushFrame(compatFrame);
  }, [compatFrame, pushFrame]);

  return pushFrame;
}
