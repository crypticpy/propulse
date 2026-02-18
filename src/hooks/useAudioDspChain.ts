/**
 * useAudioDspChain — Manages the AudioProcessingChain lifecycle.
 *
 * Creates the AudioProcessingChain when audioEnabled becomes true.
 * If Chrome's autoplay policy suspends the AudioContext, registers a
 * one-time gesture listener to resume it.
 */

import { useEffect, useRef, useState } from "react";
import { AudioProcessingChain } from "@/lib/audio/audioProcessingChain";

let sharedAudioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

/** Prime/resume the shared audio context from a direct user gesture. */
export function primeAudioContextForPlayback(): void {
  const ctx = getSharedAudioContext();
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}

export function isSharedAudioContextRunning(): boolean {
  return !!sharedAudioContext && sharedAudioContext.state === "running";
}

/** Close and recreate the shared audio context on next use. */
export function resetSharedAudioContext(): void {
  const ctx = sharedAudioContext;
  sharedAudioContext = null;
  if (ctx && ctx.state !== "closed") {
    void ctx.close().catch(() => undefined);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseAudioDspChainOptions {
  audioEnabled: boolean;
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
  clientNrEnabled: boolean;
  clientNrLevel: number;
  sweetenEnabled: boolean;
  sweetenAmount: number;
  expanderEnabled: boolean;
  expanderThreshold: number;
  expanderRatio: number;
  expanderAttackMs: number;
  expanderReleaseMs: number;
  expanderRangeDb: number;
  compressorEnabled: boolean;
  compressorThreshold: number;
  compressorRatio: number;
  compressorAttackMs: number;
  compressorReleaseMs: number;
  compressorKnee: number;
  compressorMakeupDb: number;
  spectralTamingEnabled: boolean;
  spectralTamingTameAmount: number;
  spectralTamingRecoverAmount: number;
  spectralTamingSpeed: number;
  levelerEnabled: boolean;
  levelerTargetLevel: number;
  levelerSpeed: number;
  levelerMaxGainDb: number;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAudioDspChain(
  opts: UseAudioDspChainOptions,
): AudioProcessingChain | null {
  const {
    audioEnabled,
    noiseGateEnabled,
    noiseGateThreshold,
    clientNrEnabled,
    clientNrLevel,
    sweetenEnabled,
    sweetenAmount,
    expanderEnabled,
    expanderThreshold,
    expanderRatio,
    expanderAttackMs,
    expanderReleaseMs,
    expanderRangeDb,
    compressorEnabled,
    compressorThreshold,
    compressorRatio,
    compressorAttackMs,
    compressorReleaseMs,
    compressorKnee,
    compressorMakeupDb,
    spectralTamingEnabled,
    spectralTamingTameAmount,
    spectralTamingRecoverAmount,
    spectralTamingSpeed,
    levelerEnabled,
    levelerTargetLevel,
    levelerSpeed,
    levelerMaxGainDb,
  } = opts;

  const chainRef = useRef<AudioProcessingChain | null>(null);
  const [chain, setChain] = useState<AudioProcessingChain | null>(null);
  const resumeCleanupRef = useRef<(() => void) | null>(null);

  // Create / dispose the chain based on audioEnabled
  useEffect(() => {
    if (audioEnabled) {
      if (!chainRef.current) {
        const ctx = getSharedAudioContext();
        chainRef.current = new AudioProcessingChain(ctx);
        setChain(chainRef.current);

        // If Chrome suspended the context, resume on next user gesture
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
      }
    } else {
      if (resumeCleanupRef.current) {
        resumeCleanupRef.current();
        resumeCleanupRef.current = null;
      }
      if (chainRef.current) {
        chainRef.current.dispose();
        chainRef.current = null;
      }
      setChain(null);
    }
  }, [audioEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (resumeCleanupRef.current) {
        resumeCleanupRef.current();
        resumeCleanupRef.current = null;
      }
      chainRef.current?.dispose();
      chainRef.current = null;
    };
  }, []);

  // Sync noise gate settings to chain
  useEffect(() => {
    if (!chain) return;
    chain.setNoiseGate(noiseGateEnabled, {
      threshold: noiseGateThreshold,
    });
  }, [chain, noiseGateEnabled, noiseGateThreshold]);

  // Sync sweetener settings to chain
  useEffect(() => {
    if (!chain) return;
    chain.setSweetener(sweetenEnabled, { amount: sweetenAmount });
  }, [chain, sweetenEnabled, sweetenAmount]);

  // Sync expander settings to chain
  useEffect(() => {
    if (!chain) return;
    void chain.setExpander(expanderEnabled, {
      threshold: expanderThreshold,
      ratio: expanderRatio,
      attack: expanderAttackMs,
      release: expanderReleaseMs,
      rangeDb: expanderRangeDb,
    });
  }, [
    chain,
    expanderEnabled,
    expanderThreshold,
    expanderRatio,
    expanderAttackMs,
    expanderReleaseMs,
    expanderRangeDb,
  ]);

  // Sync spectral NR settings to chain
  useEffect(() => {
    if (!chain) return;
    chain.setSpectralNr(clientNrEnabled, {
      nrLevel: clientNrLevel,
    });
  }, [chain, clientNrEnabled, clientNrLevel]);

  // Sync compressor settings to chain
  useEffect(() => {
    if (!chain) return;
    chain.setCompressor(compressorEnabled, {
      threshold: compressorThreshold,
      ratio: compressorRatio,
      attackMs: compressorAttackMs,
      releaseMs: compressorReleaseMs,
      knee: compressorKnee,
      makeupDb: compressorMakeupDb,
    });
  }, [
    chain,
    compressorEnabled,
    compressorThreshold,
    compressorRatio,
    compressorAttackMs,
    compressorReleaseMs,
    compressorKnee,
    compressorMakeupDb,
  ]);

  // Sync spectral taming settings to chain
  useEffect(() => {
    if (!chain) return;
    void chain.setSpectralTaming(spectralTamingEnabled, {
      tameAmount: spectralTamingTameAmount,
      recoverAmount: spectralTamingRecoverAmount,
      speed: spectralTamingSpeed,
    });
  }, [
    chain,
    spectralTamingEnabled,
    spectralTamingTameAmount,
    spectralTamingRecoverAmount,
    spectralTamingSpeed,
  ]);

  // Sync psychoacoustic leveler settings to chain
  useEffect(() => {
    if (!chain) return;
    void chain.setPsychoacousticLeveler(levelerEnabled, {
      targetLevel: levelerTargetLevel,
      speed: levelerSpeed,
      maxGainDb: levelerMaxGainDb,
    });
  }, [
    chain,
    levelerEnabled,
    levelerTargetLevel,
    levelerSpeed,
    levelerMaxGainDb,
  ]);

  return chain;
}
