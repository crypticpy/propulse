/**
 * useFt8Decoder — Orchestrates the native FT8/FT4 decoder pipeline.
 *
 * Settings (settingsStore) → Audio source → Decoder Worker → WsjtxDecode[]
 */

import { useCallback, useEffect, useRef } from "react";
import type { WsjtxDecode } from "@/lib/radio/protocol";
import { Ft8DecoderBridge } from "@/lib/ft8/ft8Bridge";
import { createGetUserMediaSource } from "@/lib/ft8/getUserMediaSource";
import type { AudioSourceHandle } from "@/lib/ft8/audioSource";
import { useFt8DecoderStore } from "@/stores/ft8DecoderStore";
import { useSettingsStore } from "@/stores/settingsStore";

interface UseFt8DecoderOptions {
  /** Called when new decodes arrive from the native decoder. */
  onDecodes: (decodes: WsjtxDecode[]) => void;
}

export function useFt8Decoder({ onDecodes }: UseFt8DecoderOptions) {
  const ft8Enabled = useSettingsStore((s) => s.sdrFt8DecoderEnabled);
  const ft8Mode = useSettingsStore((s) => s.sdrFt8Mode);
  const ft8AudioDeviceId = useSettingsStore((s) => s.sdrFt8AudioDeviceId);

  const bridgeRef = useRef<Ft8DecoderBridge | null>(null);
  const audioRef = useRef<AudioSourceHandle | null>(null);
  const onDecodesRef = useRef(onDecodes);
  onDecodesRef.current = onDecodes;

  // Main lifecycle: start/stop decoder when settings change
  useEffect(() => {
    if (!ft8Enabled) {
      // Tear down
      audioRef.current?.stop();
      audioRef.current = null;
      bridgeRef.current?.stop();
      bridgeRef.current = null;
      useFt8DecoderStore.getState().reset();
      return;
    }

    const bridge = new Ft8DecoderBridge();
    bridgeRef.current = bridge;

    const unsubDecode = bridge.onDecode((decodes) => {
      onDecodesRef.current(decodes);
      const s = useFt8DecoderStore.getState();
      s.updateStats({
        totalDecodes: s.stats.totalDecodes + decodes.length,
        lastCycleDecodes: decodes.length,
        cyclesCompleted: s.stats.cyclesCompleted + 1,
      });
    });

    const unsubProgress = bridge.onProgress((progress) => {
      useFt8DecoderStore.getState().setCycleProgress(progress);
    });

    const unsubError = bridge.onError((message) => {
      useFt8DecoderStore.getState().setError(message);
    });

    bridge.start(ft8Mode);
    useFt8DecoderStore.getState().setEnabled(true);
    useFt8DecoderStore.getState().updateStats({ workerReady: true });

    // Audio source — getUserMedia loopback
    const audio = createGetUserMediaSource(ft8AudioDeviceId ?? undefined);
    audioRef.current = audio;

    const unsubAudio = audio.onAudio((samples, sampleRate) => {
      // Copy before transfer (feedAudio transfers the buffer)
      bridge.feedAudio(new Float32Array(samples), sampleRate);
    });

    audio.start().catch((err) => {
      useFt8DecoderStore
        .getState()
        .setError(`Audio: ${err instanceof Error ? err.message : String(err)}`);
    });

    return () => {
      unsubDecode();
      unsubProgress();
      unsubError();
      unsubAudio();
      audio.stop();
      bridge.stop();
      bridgeRef.current = null;
      audioRef.current = null;
      useFt8DecoderStore.getState().reset();
    };
  }, [ft8Enabled, ft8Mode, ft8AudioDeviceId]);

  const toggle = useCallback(() => {
    useSettingsStore.getState().updatePreferences({
      sdrFt8DecoderEnabled: !useSettingsStore.getState().sdrFt8DecoderEnabled,
    });
  }, []);

  const setMode = useCallback((mode: "FT8" | "FT4") => {
    useSettingsStore.getState().updatePreferences({ sdrFt8Mode: mode });
  }, []);

  return {
    enabled: ft8Enabled,
    mode: ft8Mode,
    cycleProgress: useFt8DecoderStore((s) => s.cycleProgress),
    stats: useFt8DecoderStore((s) => s.stats),
    error: useFt8DecoderStore((s) => s.error),
    toggle,
    setMode,
  };
}
