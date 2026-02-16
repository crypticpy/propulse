/**
 * FateSkin — Root layout for the Fate (F8) FT8/FT4 skin.
 *
 * Purpose-built for FT8 digital-mode operation: the decode table is
 * front-and-center, with directed messages in a fixed-width sidebar,
 * a compact audio waterfall strip, and a dense status bar.
 *
 * Auto-starts the FT8 decoder on mount and restores state on unmount.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useQSOStore } from "@/stores/qsoStore";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { useLogbook } from "@/hooks/useLogbook";
import { useFateDecodes } from "./useFateDecodes";
import { useFateDxcc } from "./useFateDxcc";
import { useFateKeyboard } from "./useFateKeyboard";
import { useFateSnrTrend } from "./useFateSnrTrend";
import { useFateQsoTracker } from "./useFateQsoTracker";
import { FateTopBar } from "./FateTopBar";
import { FateAudioMeter } from "./FateAudioMeter";
import { FateBandActivity } from "./FateBandActivity";
import { FateDirectedMessages } from "./FateDirectedMessages";
import { FateWaterfallStrip } from "./FateWaterfallStrip";
import { FateBottomBar } from "./FateBottomBar";
import type { SdrSkinProps } from "../types";
import type { WaterfallView } from "@/components/sdr/waterfallPalette";

// ─── Audio analyser hook ──────────────────────────────────────────────────────
// Creates an AnalyserNode from the same audio device the FT8 decoder uses.
// Opens a *separate* getUserMedia stream so we don't interfere with the decoder.
// The stream is lightweight — we only read time-domain data for level metering.

function useAudioAnalyser(enabled: boolean): AnalyserNode | null {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const deviceId = useSettingsStore((s) => s.sdrFt8AudioDeviceId);

  useEffect(() => {
    if (!enabled) {
      // Tear down
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => undefined);
        ctxRef.current = null;
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
      setAnalyser(null);
      return;
    }

    let cancelled = false;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const node = ctx.createAnalyser();
        node.fftSize = 2048;
        node.smoothingTimeConstant = 0.4;
        source.connect(node);

        // Connect to a silent destination to keep the graph alive
        // (required in some browsers to keep the source node active)
        const silentGain = ctx.createGain();
        silentGain.gain.value = 0;
        node.connect(silentGain);
        silentGain.connect(ctx.destination);

        ctxRef.current = ctx;
        streamRef.current = stream;
        setAnalyser(node);
      } catch {
        // getUserMedia denied or unavailable — degrade gracefully
        if (stream) {
          for (const track of stream.getTracks()) track.stop();
        }
        if (ctx) {
          ctx.close().catch(() => undefined);
        }
        setAnalyser(null);
      }
    })();

    return () => {
      cancelled = true;
      if (ctx) {
        ctx.close().catch(() => undefined);
        ctxRef.current = null;
      }
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
      }
      setAnalyser(null);
    };
  }, [enabled, deviceId]);

  return analyser;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FateSkin(props: SdrSkinProps) {
  const {
    daemonConnected,
    effectiveState,

    // FFT
    lastFftFrame,
    audioFftFrame,
    waterfallView,
    tuningOverlay,
    waterfallOverlays,
    waterfallPalette,
    waterfallMinDb,
    waterfallMaxDb,
    waterfallSpeed,
    waterfallInterpolation,
    waterfallGamma,
    waterfallRowHeight,

    // FT8 decoder
    ft8DecoderEnabled,
    ft8DecoderMode,
    ft8CycleProgress,
    ft8DecoderStats,
    ft8Error,
    onFt8Toggle,
    onFt8ModeChange,

    // Data
    wsjtxDecodes,

    // Callbacks
    onPickFrequencyHz,
    onWheelTune,
  } = props;

  // ── Operator info from profile ──────────────────────────────────────────
  const station = useProfileStore((s) => s.station);
  const myCallsign = station?.callsign ?? null;
  const myGrid = station?.grid ?? null;

  // ── Enriched decode data ────────────────────────────────────────────────
  const { enriched, directed, stats } = useFateDecodes(
    wsjtxDecodes,
    myCallsign,
    myGrid,
  );

  // ── DXCC entity resolution ────────────────────────────────────────────
  const { isWorked, getWorkedBands } = useLogbook();
  const dxccData = useFateDxcc(enriched, isWorked, getWorkedBands);

  // ── QSO sequence tracking ──────────────────────────────────────────
  const qsoTracker = useFateQsoTracker(directed, myCallsign);

  // ── Auto-start decoder on mount ─────────────────────────────────────────
  // Only auto-stop on unmount if we were the ones who started it.

  const weStartedDecoderRef = useRef(false);
  const ft8EnabledRef = useRef(ft8DecoderEnabled);
  ft8EnabledRef.current = ft8DecoderEnabled;
  const onFt8ToggleRef = useRef(onFt8Toggle);
  onFt8ToggleRef.current = onFt8Toggle;

  useEffect(() => {
    if (ft8EnabledRef.current) return; // already running

    const id = window.setTimeout(() => {
      onFt8ToggleRef.current();
      weStartedDecoderRef.current = true;
    }, 300);

    return () => window.clearTimeout(id);
  }, []);

  // Auto-stop on unmount (only if we started it)
  useEffect(() => {
    return () => {
      if (weStartedDecoderRef.current && ft8EnabledRef.current) {
        onFt8ToggleRef.current();
      }
    };
  }, []);

  // ── Waterfall frame selection ───────────────────────────────────────────
  // Prefer audio-derived FFT when available (higher resolution for FT8 signals).
  // Fall back to radio FFT.
  const waterfallFrame = audioFftFrame ?? lastFftFrame;

  // Compute an effective view for the waterfall strip.
  // When using audio FFT, lock the view to the audio span.
  const effectiveWaterfallView: WaterfallView | null = useMemo(() => {
    if (audioFftFrame) {
      return {
        centerHz: audioFftFrame.centerHz,
        spanHz: audioFftFrame.spanHz,
      };
    }
    return waterfallView;
  }, [audioFftFrame, waterfallView]);

  // ── Derived values ──────────────────────────────────────────────────────
  const radioName =
    props.selectedDevice?.name ?? props.selectedDevice?.device_id ?? null;
  const freqHz = effectiveState?.freq ?? null;
  const vfo = effectiveState?.vfo ?? null;
  const activeBand = freqHz ? (bandFromFreq(freqHz / 1000) ?? null) : null;
  const ptt = effectiveState?.ptt ?? false;

  // ── SNR trend tracking ──────────────────────────────────────────────
  const snrTrend = useFateSnrTrend(enriched, activeBand);

  // ── CQ filter state ───────────────────────────────────────────────────
  const [showCqOnly, setShowCqOnly] = useState(false);
  const handleCqFilterChange = useCallback((value: boolean) => {
    setShowCqOnly(value);
  }, []);

  // ── Audio level meter ─────────────────────────────────────────────────
  // Tap the same audio device the FT8 decoder uses to show input levels.
  const audioAnalyser = useAudioAnalyser(ft8DecoderEnabled);

  // ── Keyboard quick-log handler ─────────────────────────────────────────
  // Used by the keyboard hook's Space key to log the last CQ callsign.
  const handleKeyboardQuickLog = useCallback(
    (callsign: string) => {
      useQSOStore.getState().quickLog(callsign, {
        mode: ft8DecoderMode,
        band: activeBand ?? undefined,
        frequency: freqHz ? freqHz / 1000 : undefined,
      });
    },
    [ft8DecoderMode, activeBand, freqHz],
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useFateKeyboard({
    onPickFrequencyHz,
    onFt8Toggle,
    showCqOnly,
    onCqFilterChange: handleCqFilterChange,
    onQuickLog: handleKeyboardQuickLog,
    decodes: enriched,
    enabled: true,
  });

  // ── Band-change clearing ──────────────────────────────────────────────
  // When the operator hops bands (via F-key or radio), toggle the decoder
  // off then back on to clear the stale decode buffer for the new band.
  const prevBandRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevBandRef.current;
    prevBandRef.current = activeBand;

    // Only clear when transitioning between two known bands
    if (prev != null && activeBand != null && prev !== activeBand) {
      if (ft8EnabledRef.current) {
        // Toggle off
        onFt8ToggleRef.current();
        // Toggle back on after a brief delay to let the buffer flush
        const id = window.setTimeout(() => {
          onFt8ToggleRef.current();
        }, 200);
        return () => window.clearTimeout(id);
      }
    }
  }, [activeBand]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full bg-[#080810] text-gray-200 overflow-hidden select-none">
      {/* Row 1: Top Bar */}
      <FateTopBar
        ft8DecoderEnabled={ft8DecoderEnabled}
        ft8DecoderMode={ft8DecoderMode}
        ft8CycleProgress={ft8CycleProgress}
        ft8Error={ft8Error}
        freqHz={freqHz}
        showCqOnly={showCqOnly}
        onCqFilterChange={handleCqFilterChange}
        onFt8Toggle={onFt8Toggle}
        onFt8ModeChange={onFt8ModeChange}
        onPickFrequencyHz={onPickFrequencyHz}
      />

      {/* Audio level meter strip — between top bar and main content */}
      {ft8DecoderEnabled && (
        <div className="flex items-center gap-2 px-3 py-0.5 bg-[#0a0a14] border-b border-white/5 shrink-0">
          <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">
            Audio
          </span>
          <FateAudioMeter analyserNode={audioAnalyser} />
        </div>
      )}

      {/* Row 2: Main content — decode table + directed messages sidebar */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_280px]">
        {/* Left: Primary decode table */}
        <FateBandActivity
          decodes={enriched}
          myCallsign={myCallsign}
          activeBand={activeBand}
          freqHz={freqHz}
          showCqOnly={showCqOnly}
          onCqFilterChange={handleCqFilterChange}
          dxccData={dxccData}
          snrTrend={snrTrend}
        />

        {/* Right: Directed messages + stats */}
        <FateDirectedMessages
          directed={directed}
          myCallsign={myCallsign}
          myGrid={myGrid}
          stats={stats}
          ft8DecoderStats={ft8DecoderStats}
          ft8DecoderEnabled={ft8DecoderEnabled}
          dxccData={dxccData}
          qsoTracker={qsoTracker}
        />
      </div>

      {/* Row 3: Compact waterfall strip */}
      <FateWaterfallStrip
        frame={waterfallFrame}
        view={effectiveWaterfallView}
        palette={waterfallPalette}
        tuning={tuningOverlay}
        minDb={waterfallMinDb}
        maxDb={waterfallMaxDb}
        speed={waterfallSpeed}
        overlays={waterfallOverlays}
        onPickFrequencyHz={onPickFrequencyHz}
        onWheelTune={onWheelTune}
        interpolation={waterfallInterpolation}
        gamma={waterfallGamma}
        rowHeight={waterfallRowHeight}
      />

      {/* Row 4: Bottom status bar */}
      <FateBottomBar
        daemonConnected={daemonConnected}
        radioName={radioName}
        freqHz={freqHz}
        vfo={vfo}
        activeBand={activeBand}
        ptt={ptt}
        ft8DecoderEnabled={ft8DecoderEnabled}
        ft8DecoderStats={ft8DecoderStats}
      />
    </div>
  );
}
