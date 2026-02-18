/**
 * useFt8Decoder — Orchestrates the native FT8/FT4 decoder pipeline.
 *
 * Settings (settingsStore) → Audio source → Decoder Worker → WsjtxDecode[]
 *
 * Optionally uploads decoded reception reports to PSK Reporter when the
 * `sdrFt8PskReporterEnabled` setting is active and a callsign/grid are
 * configured in the FT8 session store.
 */

import { useCallback, useEffect, useRef } from "react";
import type { WsjtxDecode } from "@/lib/radio/protocol";
import { Ft8DecoderBridge } from "@/lib/ft8/ft8Bridge";
import { createGetUserMediaSource } from "@/lib/ft8/getUserMediaSource";
import type { AudioSourceHandle } from "@/lib/ft8/audioSource";
import { PskReporterUploader } from "@/lib/ft8/pskReporterUploader";
import type { PskReportEntry } from "@/lib/ft8/pskReporterUploader";
import { useFt8DecoderStore } from "@/stores/ft8DecoderStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useFt8SessionStore } from "@/stores/ft8SessionStore";

interface UseFt8DecoderOptions {
  /** Called when new decodes arrive from the native decoder. */
  onDecodes: (decodes: WsjtxDecode[]) => void;
}

export function useFt8Decoder({ onDecodes }: UseFt8DecoderOptions) {
  const ft8Enabled = useSettingsStore((s) => s.sdrFt8DecoderEnabled);
  const ft8Mode = useSettingsStore((s) => s.sdrFt8Mode);
  const ft8AudioDeviceId = useSettingsStore((s) => s.sdrFt8AudioDeviceId);
  const pskReporterEnabled = useSettingsStore(
    (s) => s.sdrFt8PskReporterEnabled,
  );
  const myCallsign = useFt8SessionStore((s) => s.myCallsign);
  const myGrid = useFt8SessionStore((s) => s.myGrid);

  const bridgeRef = useRef<Ft8DecoderBridge | null>(null);
  const audioRef = useRef<AudioSourceHandle | null>(null);
  const uploaderRef = useRef<PskReporterUploader | null>(null);
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
      uploaderRef.current?.stop();
      uploaderRef.current = null;
      useFt8DecoderStore.getState().reset();
      return;
    }

    const bridge = new Ft8DecoderBridge();
    bridgeRef.current = bridge;

    const unsubDecode = bridge.onDecode((decodes) => {
      // Stats are updated by addDecodes() (called via onDecodesRef) in
      // ft8DecoderStore — no separate updateStats call here to avoid
      // double-counting totalDecodes and cyclesCompleted.
      onDecodesRef.current(decodes);

      // Feed decodes to PSK Reporter uploader if active
      const uploader = uploaderRef.current;
      if (uploader) {
        const session = useFt8SessionStore.getState();
        const dialHz = session.currentDialFreqHz ?? 0;
        const sender = session.myCallsign.toUpperCase();
        const senderGrid = session.myGrid.toUpperCase();
        for (const d of decodes) {
          if (!d.callsign) continue;
          const entry: PskReportEntry = {
            senderCallsign: sender,
            senderGrid,
            receiverCallsign: d.callsign,
            receiverGrid: d.grid ?? undefined,
            frequency: dialHz + d.deltaFrequency,
            snr: d.snr,
            mode: d.mode,
            timestamp: new Date(d.time).toISOString(),
          };
          uploader.addDecode(entry);
        }
      }
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
      uploaderRef.current?.stop();
      uploaderRef.current = null;
      useFt8DecoderStore.getState().reset();
    };
  }, [ft8Enabled, ft8Mode, ft8AudioDeviceId]);

  // PSK Reporter uploader lifecycle — separate effect so toggling the
  // setting or changing callsign/grid does not restart the decoder.
  useEffect(() => {
    // Tear down any existing uploader first
    uploaderRef.current?.stop();
    uploaderRef.current = null;

    if (!ft8Enabled || !pskReporterEnabled || !myCallsign || !myGrid) {
      return;
    }

    try {
      const uploader = new PskReporterUploader({
        senderCallsign: myCallsign,
        senderGrid: myGrid,
        programName: "Propulse",
      });
      uploader.start();
      uploaderRef.current = uploader;
    } catch (err) {
      console.warn(
        "[useFt8Decoder] Failed to start PSK Reporter uploader:",
        err,
      );
    }

    return () => {
      uploaderRef.current?.stop();
      uploaderRef.current = null;
    };
  }, [ft8Enabled, pskReporterEnabled, myCallsign, myGrid]);

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
