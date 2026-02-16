/**
 * useAudioDspChain — Manages the AudioProcessingChain lifecycle.
 *
 * Replaces the useMemo + useEffect pattern in SdrConsole with a proper
 * useEffect-based lifecycle:
 *   1. Creates AudioProcessingChain when audioEnabled becomes true
 *   2. Disposes it when audioEnabled becomes false or on unmount
 *   3. Syncs noise gate settings via a separate effect
 *   4. Syncs spectral NR settings via a separate effect
 *   5. Returns the chain (or null) for downstream consumers
 */

import { useEffect, useRef, useState } from "react";
import { AudioProcessingChain } from "@/lib/audio/audioProcessingChain";

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseAudioDspChainOptions {
  audioEnabled: boolean;
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
  clientNrEnabled: boolean;
  clientNrLevel: number;
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
  } = opts;

  const chainRef = useRef<AudioProcessingChain | null>(null);
  const [chain, setChain] = useState<AudioProcessingChain | null>(null);

  // Create / dispose the chain based on audioEnabled
  useEffect(() => {
    if (audioEnabled) {
      if (!chainRef.current) {
        chainRef.current = new AudioProcessingChain(new AudioContext());
      }
      setChain(chainRef.current);
    } else {
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

  // Sync spectral NR settings to chain
  useEffect(() => {
    if (!chain) return;
    chain.setSpectralNr(clientNrEnabled, {
      nrLevel: clientNrLevel,
    });
  }, [chain, clientNrEnabled, clientNrLevel]);

  return chain;
}
