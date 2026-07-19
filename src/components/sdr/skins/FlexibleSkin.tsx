/**
 * Flexible skin for the SDR Console.
 *
 * A FlexRadio SmartSDR-inspired full-viewport layout with:
 *   - Large VFO frequency display overlaid on the spectrum/waterfall (with S-meter readout)
 *   - Seamless spectrum → frequency axis → waterfall flow (no gaps)
 *   - Frequency axis ticks pointing UP toward the spectrum (SmartSDR style)
 *   - dB scale overlay on the spectrum, time axis overlay on the waterfall
 *   - Left button bar with antenna cycling and placeholders
 *   - Right sidebar with full radio controls
 *   - Bottom status bar with UTC clock and daemon info
 *
 * Desktop only — SdrConsole forces Classic on mobile.
 */

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { SpectrumScope } from "@/components/sdr/SpectrumScope";
import { Waterfall } from "@/components/sdr/Waterfall";
import { BandScope } from "@/components/sdr/BandScope";
import { FlexVfoDisplay } from "./flexible/FlexVfoDisplay";
import { FlexFreqAxis } from "./flexible/FlexFreqAxis";
import { FlexBottomBar } from "./flexible/FlexBottomBar";
import { PassbandDetail } from "@/components/sdr/PassbandDetail";
import { FlexSideControls } from "./flexible/FlexSideControls";
import { FlexDbScale } from "./flexible/FlexDbScale";
import { FlexTimeAxis } from "./flexible/FlexTimeAxis";
import { FlexInfoTabs } from "./flexible/FlexInfoTabs";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { BandPlanOverlay, SpotTagOverlay } from "@/components/sdr/overlays";
import { EqBandContextMenu } from "@/components/sdr/EqBandContextMenu";
import { EqBandPanel } from "@/components/sdr/EqBandPanel";
import type { EqBand } from "@/lib/audio/eqTypes";
import type { GainStage } from "@/lib/radio/protocol";
import { useSettingsStore } from "@/stores/settingsStore";
import { DEFAULT_FFT_STREAM_FPS } from "@/lib/sdr/fftStreamParams";
import { dedupeModeTokens } from "@/lib/sdr/modeTokens";
import { computePassbandHz } from "@/components/sdr/waterfallPalette";
import type { SdrSkinProps } from "./types";

/** RX gain stage names — constant, lives outside the component to avoid re-creation. */
const TX_GAIN_STAGE_KEYS = [
  "RFPOWER",
  "MICGAIN",
  "COMP",
  "VOXGAIN",
  "MONITOR",
] as const;

/** Stable empty-array fallback — avoids a fresh [] identity every render. */
const EMPTY_ANTENNAS: string[] = [];

function normalizeToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function stageToken(stage: GainStage): string {
  return normalizeToken(`${stage.name} ${stage.label ?? ""}`);
}

function isTxGainStage(stage: GainStage): boolean {
  const token = stageToken(stage);
  return TX_GAIN_STAGE_KEYS.some((name) =>
    token.includes(normalizeToken(name)),
  );
}

function isRxGainStage(stage: GainStage): boolean {
  if (isTxGainStage(stage)) return false;
  const token = stageToken(stage);
  return (
    token.includes("RFGAIN") ||
    token === "RF" ||
    token.includes("SQL") ||
    token.includes("SQUELCH") ||
    token.includes("PREAMP") ||
    token === "PRE" ||
    token.includes("ATTEN") ||
    token === "ATT"
  );
}

function buildSliceModes(modes: string[]): string[] {
  return dedupeModeTokens(modes).map((entry) => entry.raw.toUpperCase());
}

export function FlexibleSkin(props: SdrSkinProps) {
  const {
    radio,
    fft,
    spectrum,
    waterfall: wf,
    ft8,
    decodes,
    controls,
    dsp,
    interaction,
    lastDaemonStatus,
  } = props;
  const {
    daemonConnected,
    daemonError,
    lastResponseError,
    effectiveState,
    canStreamFft,
    fftEnabled,
    smeterDbm,
  } = radio;

  const { lastFftFrame, waterfallView, tuningOverlay, waterfallOverlays } = fft;

  const {
    waterfallPalette,
    waterfallMinDb,
    waterfallMaxDb,
    waterfallSpeed,
    waterfallInterpolation,
    waterfallGamma,
    waterfallRowHeight,
    sliceBgColor,
  } = wf;

  const {
    onWaterfallViewChange,
    onPickFrequencyHz,
    onSelectRangeHz,
    onWheelTune,
  } = interaction;

  const { clusterSpots } = decodes;
  const eqBands = dsp.eqBands;
  const removeEqBand = dsp.onRemoveEqBand;
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);
  const onAgcModeChange = controls.onAgcModeChange;
  const onGainChange = controls.onGainChange;
  const onNbChange = controls.onNbChange;
  const onNrChange = controls.onNrChange;
  const onAgcToggle = controls.onAgcToggle;
  const onAnfToggle = controls.onAnfToggle;
  const onQskToggle = controls.onQskToggle;
  const onVoxToggle = controls.onVoxToggle;
  const onModeChange = controls.onModeChange;
  const onFilterChange = controls.onFilterChange;
  const onAntennaChange = controls.onAntennaChange;
  const onRitToggle = controls.onRitToggle;
  const onRitOffset = controls.onRitOffset;
  const onXitToggle = controls.onXitToggle;
  const onXitOffset = controls.onXitOffset;
  const onSplitToggle = controls.onSplitToggle;
  const onIfShift = controls.onIfShift;
  const onCwSpeed = controls.onCwSpeed;
  const onVfoChange = controls.onVfoChange;

  const hasRadio = !!radio.connectedDeviceId;
  const hasFft = canStreamFft && fftEnabled && !!lastFftFrame;
  const radioName =
    radio.selectedDevice?.name ?? radio.selectedDevice?.device_id ?? null;

  // ── Gain stage groupings for slice panels ────────────────────────

  const slicePanels = useMemo(() => {
    const allStages = radio.selectedDevice?.capabilities.gain_stages ?? [];
    const gains = effectiveState?.gains ?? {};
    const modes = buildSliceModes(
      radio.selectedDevice?.capabilities.modes ?? [],
    );
    const antennas = radio.selectedDevice?.capabilities.antennas ?? [];
    const currentAntenna = effectiveState?.antenna ?? antennas[0] ?? null;

    return radio.canControlConnected
      ? {
          canControl: true,
          commands: radio.selectedDevice?.capabilities.commands,
          // DSP
          nbEnabled: !!effectiveState?.nb?.enabled,
          nrEnabled: !!effectiveState?.nr?.enabled,
          agcEnabled: !!effectiveState?.agc,
          anfEnabled: !!effectiveState?.anf,
          agcMode: effectiveState?.agcMode ?? 0,
          squelchLevel: effectiveState?.squelch ?? 0,
          onAgcModeChange,
          onSquelchChange: (level: number) => onGainChange("SQL", level),
          onNbToggle: () =>
            onNbChange(
              !effectiveState?.nb?.enabled,
              effectiveState?.nb?.threshold ?? 50,
            ),
          onNrToggle: () =>
            onNrChange(
              !effectiveState?.nr?.enabled,
              effectiveState?.nr?.level ?? 5,
            ),
          onAgcToggle: () => onAgcToggle(!effectiveState?.agc),
          onAnfToggle,
          qskEnabled: !!effectiveState?.qsk,
          voxEnabled: !!effectiveState?.vox,
          onQskToggle,
          onVoxToggle,
          // Filter / Mode
          availableModes: modes,
          currentMode: effectiveState?.mode ?? "USB",
          filterLow: effectiveState?.filter?.low ?? 300,
          filterHigh: effectiveState?.filter?.high ?? 2700,
          onModeChange,
          onFilterChange,
          // RX gains
          rxGainStages: allStages.filter((s) => isRxGainStage(s)),
          antennas,
          currentAntenna,
          onAntennaChange,
          gains,
          onGainChange,
          // Audio
          audioEnabled: radio.audioEnabled,
          afGainStage: allStages.find((s) => s.name === "AF") ?? null,
          noiseGateEnabled: dsp.noiseGateEnabled,
          noiseGateThreshold: dsp.noiseGateThreshold,
          clientNrEnabled: dsp.clientNrEnabled,
          clientNrLevel: dsp.clientNrLevel,
          onNoiseGateToggle: dsp.onNoiseGateToggle,
          onNoiseGateThresholdChange: dsp.onNoiseGateThresholdChange,
          onClientNrToggle: dsp.onClientNrToggle,
          onClientNrLevelChange: dsp.onClientNrLevelChange,
          sweetenEnabled: dsp.sweetenEnabled,
          sweetenAmount: dsp.sweetenAmount,
          onSweetenToggle: dsp.onSweetenToggle,
          onSweetenAmountChange: dsp.onSweetenAmountChange,
          expanderEnabled: dsp.expanderEnabled,
          expanderThreshold: dsp.expanderThreshold,
          expanderRatio: dsp.expanderRatio,
          expanderAttackMs: dsp.expanderAttackMs,
          expanderReleaseMs: dsp.expanderReleaseMs,
          expanderRangeDb: dsp.expanderRangeDb,
          onExpanderToggle: dsp.onExpanderToggle,
          onExpanderThresholdChange: dsp.onExpanderThresholdChange,
          onExpanderRatioChange: dsp.onExpanderRatioChange,
          onExpanderAttackMsChange: dsp.onExpanderAttackMsChange,
          onExpanderReleaseMsChange: dsp.onExpanderReleaseMsChange,
          onExpanderRangeDbChange: dsp.onExpanderRangeDbChange,
          compressorEnabled: dsp.compressorEnabled,
          compressorThreshold: dsp.compressorThreshold,
          compressorRatio: dsp.compressorRatio,
          compressorAttackMs: dsp.compressorAttackMs,
          compressorReleaseMs: dsp.compressorReleaseMs,
          compressorKnee: dsp.compressorKnee,
          compressorMakeupDb: dsp.compressorMakeupDb,
          onCompressorToggle: dsp.onCompressorToggle,
          onCompressorThresholdChange: dsp.onCompressorThresholdChange,
          onCompressorRatioChange: dsp.onCompressorRatioChange,
          onCompressorAttackMsChange: dsp.onCompressorAttackMsChange,
          onCompressorReleaseMsChange: dsp.onCompressorReleaseMsChange,
          onCompressorKneeChange: dsp.onCompressorKneeChange,
          onCompressorMakeupDbChange: dsp.onCompressorMakeupDbChange,
          // Spectral Taming
          spectralTamingEnabled: dsp.spectralTamingEnabled,
          spectralTamingTameAmount: dsp.spectralTamingTameAmount,
          spectralTamingRecoverAmount: dsp.spectralTamingRecoverAmount,
          spectralTamingSpeed: dsp.spectralTamingSpeed,
          onSpectralTamingToggle: dsp.onSpectralTamingToggle,
          onSpectralTamingTameAmountChange:
            dsp.onSpectralTamingTameAmountChange,
          onSpectralTamingRecoverAmountChange:
            dsp.onSpectralTamingRecoverAmountChange,
          onSpectralTamingSpeedChange: dsp.onSpectralTamingSpeedChange,
          // Leveler
          levelerEnabled: dsp.levelerEnabled,
          levelerTargetLevel: dsp.levelerTargetLevel,
          levelerSpeed: dsp.levelerSpeed,
          levelerMaxGainDb: dsp.levelerMaxGainDb,
          onLevelerToggle: dsp.onLevelerToggle,
          onLevelerTargetLevelChange: dsp.onLevelerTargetLevelChange,
          onLevelerSpeedChange: dsp.onLevelerSpeedChange,
          onLevelerMaxGainDbChange: dsp.onLevelerMaxGainDbChange,
          // X/RIT
          rit: effectiveState?.rit,
          xit: effectiveState?.xit,
          split: effectiveState?.split ?? false,
          ifShift: effectiveState?.ifShift ?? 0,
          cwSpeed: effectiveState?.cwSpeed ?? 20,
          currentMode2: effectiveState?.mode ?? "USB",
          onRitToggle,
          onRitOffset,
          onXitToggle,
          onXitOffset,
          onSplitToggle,
          onIfShift,
          onCwSpeed,
        }
      : undefined;
  }, [
    radio.canControlConnected,
    radio.selectedDevice?.capabilities.gain_stages,
    radio.selectedDevice?.capabilities.antennas,
    radio.selectedDevice?.capabilities.modes,
    radio.selectedDevice?.capabilities.commands,
    radio.audioEnabled,
    effectiveState?.nb?.enabled,
    effectiveState?.nb?.threshold,
    effectiveState?.nr?.enabled,
    effectiveState?.nr?.level,
    effectiveState?.agc,
    effectiveState?.anf,
    effectiveState?.agcMode,
    effectiveState?.gains,
    effectiveState?.squelch,
    effectiveState?.mode,
    effectiveState?.filter?.low,
    effectiveState?.filter?.high,
    effectiveState?.rit,
    effectiveState?.xit,
    effectiveState?.split,
    effectiveState?.ifShift,
    effectiveState?.cwSpeed,
    effectiveState?.qsk,
    effectiveState?.vox,
    effectiveState?.antenna,
    onAgcModeChange,
    onGainChange,
    onNbChange,
    onNrChange,
    onAgcToggle,
    onAnfToggle,
    onQskToggle,
    onVoxToggle,
    onModeChange,
    onFilterChange,
    onAntennaChange,
    onRitToggle,
    onRitOffset,
    onXitToggle,
    onXitOffset,
    onSplitToggle,
    onIfShift,
    onCwSpeed,
    dsp.noiseGateEnabled,
    dsp.noiseGateThreshold,
    dsp.clientNrEnabled,
    dsp.clientNrLevel,
    dsp.onNoiseGateToggle,
    dsp.onNoiseGateThresholdChange,
    dsp.onClientNrToggle,
    dsp.onClientNrLevelChange,
    dsp.sweetenEnabled,
    dsp.sweetenAmount,
    dsp.onSweetenToggle,
    dsp.onSweetenAmountChange,
    dsp.expanderEnabled,
    dsp.expanderThreshold,
    dsp.expanderRatio,
    dsp.expanderAttackMs,
    dsp.expanderReleaseMs,
    dsp.expanderRangeDb,
    dsp.onExpanderToggle,
    dsp.onExpanderThresholdChange,
    dsp.onExpanderRatioChange,
    dsp.onExpanderAttackMsChange,
    dsp.onExpanderReleaseMsChange,
    dsp.onExpanderRangeDbChange,
    dsp.compressorEnabled,
    dsp.compressorThreshold,
    dsp.compressorRatio,
    dsp.compressorAttackMs,
    dsp.compressorReleaseMs,
    dsp.compressorKnee,
    dsp.compressorMakeupDb,
    dsp.onCompressorToggle,
    dsp.onCompressorThresholdChange,
    dsp.onCompressorRatioChange,
    dsp.onCompressorAttackMsChange,
    dsp.onCompressorReleaseMsChange,
    dsp.onCompressorKneeChange,
    dsp.onCompressorMakeupDbChange,
    dsp.spectralTamingEnabled,
    dsp.spectralTamingTameAmount,
    dsp.spectralTamingRecoverAmount,
    dsp.spectralTamingSpeed,
    dsp.onSpectralTamingToggle,
    dsp.onSpectralTamingTameAmountChange,
    dsp.onSpectralTamingRecoverAmountChange,
    dsp.onSpectralTamingSpeedChange,
    dsp.levelerEnabled,
    dsp.levelerTargetLevel,
    dsp.levelerSpeed,
    dsp.levelerMaxGainDb,
    dsp.onLevelerToggle,
    dsp.onLevelerTargetLevelChange,
    dsp.onLevelerSpeedChange,
    dsp.onLevelerMaxGainDbChange,
  ]);

  // EQ band hover state (used by PassbandDetail interaction + EQ panel)
  const [, setHoveredEqBandId] = useState<string | null>(null);

  // EQ band context menu state
  const [eqMenu, setEqMenu] = useState<{
    x: number;
    y: number;
    audioHz: number;
    band?: EqBand;
  } | null>(null);

  const handleEqContextMenu = useCallback(
    (e: {
      screenX: number;
      screenY: number;
      audioHz: number;
      band?: EqBand;
    }) => {
      setEqPanel(null); // close panel if open
      setEqMenu({
        x: e.screenX,
        y: e.screenY,
        audioHz: e.audioHz,
        band: e.band,
      });
    },
    [],
  );

  const handleEqMenuClose = useCallback(() => setEqMenu(null), []);

  // EQ band floating control panel state (opened by click/right-click on a dot)
  const [eqPanel, setEqPanel] = useState<{
    bandId: string;
    anchorX: number;
    anchorY: number;
  } | null>(null);

  const handleEqBandSelect = useCallback(
    (band: EqBand, screenX: number, screenY: number) => {
      setEqMenu(null); // close context menu if open
      setEqPanel({ bandId: band.id, anchorX: screenX, anchorY: screenY });
    },
    [],
  );

  const notchBandCount = useMemo(
    () => eqBands.filter((band) => band.category === "notch").length,
    [eqBands],
  );
  const totalEqBandCount = eqBands.length;
  const passbandHighlightEnabled = wf.passbandBlendMode !== "none";
  const passbandFillOpacity = passbandHighlightEnabled ? wf.passbandOpacity : 0;
  const topSpectrumContainerRef = useRef<HTMLDivElement>(null);
  const topSpectrumPointerRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    pointerId: number | null;
  }>({ active: false, startX: 0, startY: 0, pointerId: null });

  // Track waterfall container height for FlexTimeAxis
  const waterfallContainerRef = useRef<HTMLDivElement>(null);
  const [waterfallHeight, setWaterfallHeight] = useState(400);

  const handleClearEqBands = useCallback(
    (target: EqBand["category"] | "all") => {
      const ids = eqBands
        .filter((band) => target === "all" || band.category === target)
        .map((band) => band.id);
      if (ids.length === 0) return;

      setEqMenu(null);
      setEqPanel((current) =>
        current && ids.includes(current.bandId) ? null : current,
      );
      setHoveredEqBandId((current) =>
        current && ids.includes(current) ? null : current,
      );

      for (const id of ids) {
        removeEqBand(id);
      }
    },
    [eqBands, removeEqBand],
  );

  const handleTogglePassbandHighlight = useCallback(() => {
    updatePreferences({
      sdrPassbandBlendMode: passbandHighlightEnabled ? "none" : "screen",
    });
  }, [passbandHighlightEnabled, updatePreferences]);

  const handlePassbandOpacityChange = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(0.3, value));
      updatePreferences({
        sdrPassbandOpacity: clamped,
        ...(wf.passbandBlendMode === "none" && clamped > 0
          ? { sdrPassbandBlendMode: "screen" }
          : {}),
      });
    },
    [updatePreferences, wf.passbandBlendMode],
  );

  const topScopeHzAtX = useCallback(
    (clientX: number): number | null => {
      if (!waterfallView) return null;
      const el = topSpectrumContainerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const frac = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, frac));
      const viewStart = waterfallView.centerHz - waterfallView.spanHz / 2;
      return viewStart + clamped * waterfallView.spanHz;
    },
    [waterfallView],
  );

  const handleTopSpectrumPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const el = topSpectrumContainerRef.current;
      if (!el) return;
      topSpectrumPointerRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failures from browsers that reject pointer capture.
      }
    },
    [],
  );

  const finishTopSpectrumPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = topSpectrumContainerRef.current;
      if (!el) return;
      try {
        if (el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release failures.
      }

      const state = topSpectrumPointerRef.current;
      if (!state.active || state.pointerId !== e.pointerId) return;
      topSpectrumPointerRef.current = {
        active: false,
        startX: 0,
        startY: 0,
        pointerId: null,
      };

      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (Math.hypot(dx, dy) >= 4) return;

      const hz = topScopeHzAtX(e.clientX);
      if (hz == null) return;
      onPickFrequencyHz(Math.round(hz));
    },
    [onPickFrequencyHz, topScopeHzAtX],
  );

  useEffect(() => {
    const el = topSpectrumContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
      if (direction !== 0) {
        onWheelTune(direction);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // hasFft gates whether topSpectrumContainerRef's element is mounted —
    // re-run once it mounts so the listener actually attaches.
  }, [onWheelTune, hasFft]);

  const measureWaterfall = useCallback(() => {
    if (waterfallContainerRef.current) {
      const h = waterfallContainerRef.current.getBoundingClientRect().height;
      if (h > 0) setWaterfallHeight(h);
    }
  }, []);

  useEffect(() => {
    measureWaterfall();
    const ro = new ResizeObserver(measureWaterfall);
    if (waterfallContainerRef.current)
      ro.observe(waterfallContainerRef.current);
    return () => ro.disconnect();
    // hasFft gates whether waterfallContainerRef's element is mounted —
    // re-run once it mounts so the observer actually attaches.
  }, [measureWaterfall, hasFft]);

  // Track center column width for slice flag positioning
  const centerColRef = useRef<HTMLDivElement>(null);
  const [centerWidth, setCenterWidth] = useState(800);

  useEffect(() => {
    const el = centerColRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setCenterWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute slice flag horizontal position — anchored to passband right edge
  // by default; flips to the left side when too close to the container right edge.
  const sliceFlagLeft = useMemo(() => {
    if (!waterfallView || !effectiveState?.freq) return 12;
    const viewStart = waterfallView.centerHz - waterfallView.spanHz / 2;
    const hzPerPx = waterfallView.spanHz / centerWidth;

    const { startHz: pbStartHz, endHz: pbEndHz } = computePassbandHz({
      freqHz: effectiveState.freq,
      filterLowHz: effectiveState.filter?.low ?? 300,
      filterHighHz: effectiveState.filter?.high ?? 2700,
      mode: effectiveState.mode ?? "USB",
    });

    const pbEndX = (pbEndHz - viewStart) / hzPerPx;
    const pbStartX = (pbStartHz - viewStart) / hzPerPx;

    // If both edges are offscreen, fall back to default
    if (pbEndX < -100 || pbStartX > centerWidth + 100) return 12;

    const flagWidth = 280;
    const pad = 6; // gap between passband edge and flag

    // Default: flag sits LEFT of passband — right edge at passband left edge
    const leftAnchorLeft = pbStartX - pad - flagWidth;

    // Flip: flag sits RIGHT of passband — left edge at passband right edge
    const rightAnchorLeft = pbEndX + pad;

    // Use left-side anchor unless it would go off the left edge
    const leftFits = leftAnchorLeft >= 4;
    const raw = leftFits ? leftAnchorLeft : rightAnchorLeft;

    // Final clamp to keep flag inside container
    return Math.max(4, Math.min(centerWidth - flagWidth - 4, raw));
  }, [
    waterfallView,
    effectiveState?.freq,
    effectiveState?.mode,
    effectiveState?.filter?.low,
    effectiveState?.filter?.high,
    centerWidth,
  ]);

  // ── Stable handlers for FlexVfoDisplay (memoized; re-rendered at the FFT
  // frame rate, so these must not be recreated as inline arrows) ──────────
  const vfoSwapSupported =
    radio.canControlConnected &&
    radio.selectedDevice?.capabilities.commands?.vfo === true;
  const currentVfo = effectiveState?.vfo;

  const handleVfoSwap = useCallback(() => {
    onVfoChange(currentVfo === "B" ? "A" : "B");
  }, [onVfoChange, currentVfo]);

  const nbEnabled = effectiveState?.nb?.enabled;
  const nbThreshold = effectiveState?.nb?.threshold;
  const handleNbToggle = useCallback(() => {
    onNbChange(!nbEnabled, nbThreshold ?? 50);
  }, [onNbChange, nbEnabled, nbThreshold]);

  const nrEnabled = effectiveState?.nr?.enabled;
  const nrLevel = effectiveState?.nr?.level;
  const handleNrToggle = useCallback(() => {
    onNrChange(!nrEnabled, nrLevel ?? 5);
  }, [onNrChange, nrEnabled, nrLevel]);

  const agcEnabled = effectiveState?.agc;
  const handleAgcToggle = useCallback(() => {
    onAgcToggle(!agcEnabled);
  }, [onAgcToggle, agcEnabled]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] overflow-hidden">
      {/* ── Error banner ─────────────────────────────────────────────── */}
      {(daemonError || lastResponseError) && (
        <div className="px-3 py-1.5 bg-alert-red/10 border-b border-alert-red/30 text-alert-red text-xs">
          {daemonError ?? lastResponseError}
        </div>
      )}

      {/* ── Main content area ────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-[1fr_280px] grid-rows-[1fr] min-h-0">
        {/* ── Center: Spectrum + Zoom + Freq axis + Waterfall ──────── */}
        <div ref={centerColRef} className="relative flex flex-col min-h-0">
          {/* VFO overlay — floating slice flag, anchored to passband position */}
          <div
            className="absolute top-3 z-10 transition-[left] duration-100 ease-out pointer-events-none"
            style={{ left: sliceFlagLeft }}
          >
            <FlexVfoDisplay
              freqHz={effectiveState?.freq ?? null}
              mode={effectiveState?.mode ?? null}
              ptt={effectiveState?.ptt ?? false}
              antenna={effectiveState?.antenna ?? null}
              filterLow={effectiveState?.filter?.low ?? null}
              filterHigh={effectiveState?.filter?.high ?? null}
              smeterDbm={smeterDbm}
              nrEnabled={effectiveState?.nr?.enabled}
              nbEnabled={effectiveState?.nb?.enabled}
              agcEnabled={effectiveState?.agc}
              vfo={effectiveState?.vfo}
              bgColor={sliceBgColor}
              rit={effectiveState?.rit}
              xit={effectiveState?.xit}
              split={effectiveState?.split}
              lock={effectiveState?.lock}
              anf={effectiveState?.anf}
              qsk={effectiveState?.qsk}
              vox={effectiveState?.vox}
              txAntenna={effectiveState?.txAntenna}
              txMeter={effectiveState?.txMeter}
              cwSpeed={effectiveState?.cwSpeed}
              ifShift={effectiveState?.ifShift}
              onVfoSwap={vfoSwapSupported ? handleVfoSwap : undefined}
              onNbToggle={
                radio.canControlConnected ? handleNbToggle : undefined
              }
              onNrToggle={
                radio.canControlConnected ? handleNrToggle : undefined
              }
              onAgcToggle={
                radio.canControlConnected ? handleAgcToggle : undefined
              }
              onLockToggle={
                radio.canControlConnected ? controls.onLockToggle : undefined
              }
              slicePanels={slicePanels}
            />
          </div>

          {hasFft ? (
            <>
              {/* Spectrum scope — 30% of center height */}
              <div
                ref={topSpectrumContainerRef}
                className="relative h-[30%] min-h-[80px] touch-none cursor-crosshair"
                onPointerDown={handleTopSpectrumPointerDown}
                onPointerUp={finishTopSpectrumPointer}
                onPointerCancel={finishTopSpectrumPointer}
              >
                <SpectrumScope
                  frame={lastFftFrame}
                  view={waterfallView}
                  palette={waterfallPalette}
                  tuning={tuningOverlay}
                  passbandFillOpacity={passbandFillOpacity}
                  minDb={waterfallMinDb}
                  maxDb={waterfallMaxDb}
                  showPeakHold={spectrum.spectrumPeakHold}
                  showGradientFill={spectrum.spectrumGradientFill}
                  overlays={waterfallOverlays}
                  bgColor={spectrum.spectrumBgColor}
                  gridLines={spectrum.spectrumGridLines}
                  verticalGridLines={spectrum.spectrumVerticalGridLines}
                  gridOpacity={spectrum.spectrumGridOpacity}
                  smoothing={Math.max(
                    0,
                    Math.min(4, spectrum.spectrumSmoothing),
                  )}
                  lineColor={spectrum.spectrumLineColor}
                  lineWidth={spectrum.spectrumLineWidth}
                  fillOpacity={spectrum.spectrumFillOpacity}
                  lineShadow={spectrum.spectrumLineShadow}
                  lineShadowBlur={spectrum.spectrumLineShadowBlur}
                  tuningLineColor={spectrum.tuningLineColor}
                  tuningArrowColor={spectrum.tuningArrowColor}
                  className="rounded-none border-0"
                />
                {/* Band plan segments overlay on spectrum */}
                {waterfallView && (
                  <BandPlanOverlay
                    centerHz={waterfallView.centerHz}
                    spanHz={waterfallView.spanHz}
                    position="full"
                    showLabels
                  />
                )}
                <FlexDbScale minDb={waterfallMinDb} maxDb={waterfallMaxDb} />
              </div>

              {/* Passband detail zoom scope */}
              <div className="relative">
                <PassbandDetail
                  frame={lastFftFrame}
                  audioFftFrame={fft.audioFftFrame}
                  tuning={tuningOverlay}
                  minDb={waterfallMinDb}
                  maxDb={waterfallMaxDb}
                  palette={waterfallPalette}
                  gamma={waterfallGamma}
                  passbandFillOpacity={passbandFillOpacity}
                  notchFilters={[]}
                  eqBands={dsp.eqBands}
                  onFilterChange={controls.onFilterChange}
                  onAddEqBand={dsp.onAddEqBand}
                  onUpdateEqBand={dsp.onUpdateEqBand}
                  onRemoveEqBand={dsp.onRemoveEqBand}
                  onEqBandHover={setHoveredEqBandId}
                  onEqBandQChange={dsp.onEqBandQChange}
                  onEqContextMenu={handleEqContextMenu}
                  onEqBandSelect={handleEqBandSelect}
                  onPickFrequencyHz={onPickFrequencyHz}
                  onWheelTune={onWheelTune}
                />
                <div className="pointer-events-none absolute right-2 top-1 z-20 flex items-center gap-1">
                  <button
                    type="button"
                    className="pointer-events-auto rounded border border-plasma-orange/40 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-plasma-orange disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => handleClearEqBands("notch")}
                    disabled={notchBandCount === 0}
                    title="Remove all notch points"
                  >
                    Clear Notches ({notchBandCount})
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto rounded border border-cosmic-cyan/40 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-cosmic-cyan disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => handleClearEqBands("all")}
                    disabled={totalEqBandCount === 0}
                    title="Remove all EQ and notch points"
                  >
                    Clear All ({totalEqBandCount})
                  </button>
                </div>
              </div>

              {/* Frequency axis — ticks point up toward spectrum */}
              <FlexFreqAxis
                centerHz={waterfallView?.centerHz ?? lastFftFrame.centerHz}
                spanHz={waterfallView?.spanHz ?? lastFftFrame.spanHz}
                orientation="up"
              />

              {/* Waterfall — fills remaining space */}
              <div
                ref={waterfallContainerRef}
                className="relative flex-1 min-h-[100px]"
              >
                <Waterfall
                  frame={lastFftFrame}
                  view={waterfallView}
                  onViewChange={onWaterfallViewChange}
                  palette={waterfallPalette}
                  tuning={tuningOverlay}
                  minDb={waterfallMinDb}
                  maxDb={waterfallMaxDb}
                  speed={waterfallSpeed}
                  overlays={waterfallOverlays}
                  onPickFrequencyHz={onPickFrequencyHz}
                  onSelectRangeHz={onSelectRangeHz}
                  onWheelTune={onWheelTune}
                  passbandBlendMode={
                    wf.passbandBlendMode as
                      | "screen"
                      | "overlay"
                      | "color-dodge"
                      | "color-burn"
                      | "soft-light"
                      | "none"
                  }
                  passbandOpacity={wf.passbandOpacity}
                  interpolation={waterfallInterpolation}
                  gamma={waterfallGamma}
                  rowHeight={waterfallRowHeight}
                  // Do not crossfade in the high-res audio FFT on the main
                  // bottom waterfall (it belongs in the zoom view above).
                  className="rounded-none border-0"
                />
                <div className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-2 rounded border border-white/15 bg-black/60 px-2 py-1">
                  <button
                    type="button"
                    className={`pointer-events-auto rounded px-2 py-0.5 text-[10px] font-medium ${
                      passbandHighlightEnabled
                        ? "border border-cosmic-cyan/40 text-cosmic-cyan"
                        : "border border-white/20 text-gray-300"
                    }`}
                    onClick={handleTogglePassbandHighlight}
                    title="Toggle passband highlight in waterfall"
                  >
                    Passband {passbandHighlightEnabled ? "On" : "Off"}
                  </button>
                  <label className="pointer-events-auto flex items-center gap-1 text-[10px] text-gray-300">
                    <span>Opacity</span>
                    <input
                      type="range"
                      min={0}
                      max={0.3}
                      step={0.01}
                      value={wf.passbandOpacity}
                      onChange={(e) =>
                        handlePassbandOpacityChange(Number(e.target.value))
                      }
                      disabled={!passbandHighlightEnabled}
                      className="h-1 w-24 accent-cosmic-cyan disabled:opacity-40"
                    />
                    <span className="w-8 text-right font-mono text-[9px] text-gray-400">
                      {wf.passbandOpacity.toFixed(2)}
                    </span>
                  </label>
                </div>
                {/* Spot tags overlay on waterfall — click-to-tune */}
                {waterfallView && (
                  <SpotTagOverlay
                    spots={clusterSpots}
                    centerHz={waterfallView.centerHz}
                    spanHz={waterfallView.spanHz}
                    maxSpots={30}
                    onPickFrequencyHz={onPickFrequencyHz}
                    position="top"
                  />
                )}
                {/* Band plan overlay on waterfall (subtle) */}
                {waterfallView && (
                  <BandPlanOverlay
                    centerHz={waterfallView.centerHz}
                    spanHz={waterfallView.spanHz}
                    position="full"
                    showLabels={false}
                  />
                )}
                <FlexTimeAxis
                  speed={waterfallSpeed}
                  fps={DEFAULT_FFT_STREAM_FPS}
                  rowHeight={waterfallRowHeight}
                  containerHeight={waterfallHeight}
                />
              </div>
            </>
          ) : !daemonConnected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
              <div className="text-lg font-semibold text-gray-300">
                No Daemon Connected
              </div>
              <div className="text-sm text-gray-500 text-center max-w-md">
                Start the daemon on the machine connected to your radio, then
                click <span className="text-gray-300">Daemon</span> to connect.
              </div>
              <div className="text-[11px] font-mono text-gray-600">
                cd daemon &amp;&amp; cargo run -p propulse-daemon
              </div>
            </div>
          ) : !hasRadio ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
              Select and connect a radio to begin.
            </div>
          ) : canStreamFft && !fftEnabled ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
              Start FFT streaming to show the spectrum and waterfall.
            </div>
          ) : effectiveState ? (
            <div className="flex-1 min-h-0">
              <BandScope
                frequencyHz={effectiveState.freq}
                spots={clusterSpots}
                onPickFrequencyHz={onPickFrequencyHz}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
              Waiting for radio state&hellip;
            </div>
          )}
        </div>

        {/* ── Right sidebar ──────────────────────────────────────────── */}
        <div className="flex flex-col min-h-0 border-l border-white/10 bg-[#0d0d14]">
          <FlexSideControls
            effectiveState={effectiveState}
            selectedDevice={radio.selectedDevice}
            canControlConnected={radio.canControlConnected}
            tuningLocked={effectiveState?.lock === true}
            canStreamFft={canStreamFft}
            canStreamAudio={radio.canStreamAudio}
            fftEnabled={fftEnabled}
            audioEnabled={radio.audioEnabled}
            freqInput={controls.freqInput}
            freqUnit={controls.freqUnit}
            tuningStepHz={dsp.tuningStepHz}
            onTuningStepChange={dsp.onTuningStepChange}
            onTune={controls.onTune}
            onFreqInputChange={controls.onFreqInputChange}
            onFreqUnitChange={controls.onFreqUnitChange}
            onAntennaChange={controls.onAntennaChange}
            onGainChange={controls.onGainChange}
            onToggleFft={controls.onToggleFft}
            onToggleAudio={controls.onToggleAudio}
            vfo={effectiveState?.vfo}
            onVfoChange={
              radio.selectedDevice?.capabilities.commands?.vfo === true
                ? controls.onVfoChange
                : undefined
            }
            freqHz={effectiveState?.freq ?? null}
            onBandSelect={onPickFrequencyHz}
            hasMultipleAntennas={
              (radio.selectedDevice?.capabilities.antennas.length ?? 0) > 1
            }
            antennas={radio.selectedDevice?.capabilities.antennas ?? EMPTY_ANTENNAS}
            ft8DecoderEnabled={ft8.ft8DecoderEnabled}
            ft8DecoderMode={ft8.ft8DecoderMode}
            ft8CycleProgress={ft8.ft8CycleProgress}
            ft8DecoderStats={ft8.ft8DecoderStats}
            ft8Error={ft8.ft8Error}
            onFt8Toggle={ft8.onFt8Toggle}
            onFt8ModeChange={ft8.onFt8ModeChange}
            isRecording={dsp.isRecording}
            recordingDurationSec={dsp.recordingDurationSec}
            recordingEstimatedBytes={dsp.recordingEstimatedBytes}
            hasRecording={dsp.hasRecording}
            onStartRecording={dsp.onStartRecording}
            onStopRecording={dsp.onStopRecording}
            onExportRecording={dsp.onExportRecording}
            onDiscardRecording={dsp.onDiscardRecording}
          />
          <FlexInfoTabs
            wsjtxStatus={decodes.wsjtxStatus}
            wsjtxDecodes={decodes.wsjtxDecodes}
            clusterSpots={clusterSpots}
            ft8DecoderEnabled={ft8.ft8DecoderEnabled}
          />
        </div>
      </div>

      {/* ── Bottom status bar ────────────────────────────────────────── */}
      <FlexBottomBar
        daemonConnected={daemonConnected}
        radioName={radioName}
        ptt={effectiveState?.ptt ?? false}
        fftEnabled={fftEnabled}
        cpuPercent={lastDaemonStatus?.cpu_percent ?? null}
        memoryMb={lastDaemonStatus?.memory_mb ?? null}
        vfo={effectiveState?.vfo ?? null}
        activeBand={
          effectiveState?.freq ? bandFromFreq(effectiveState.freq / 1000) : null
        }
      />

      {eqMenu && (
        <EqBandContextMenu
          x={eqMenu.x}
          y={eqMenu.y}
          onClose={handleEqMenuClose}
          onAddBand={(category) => {
            dsp.onAddEqBand(eqMenu.audioHz, 0, category);
            handleEqMenuClose();
          }}
        />
      )}

      {eqPanel &&
        (() => {
          const band = dsp.eqBands.find((b) => b.id === eqPanel.bandId);
          if (!band) return null;
          return (
            <EqBandPanel
              band={band}
              anchorX={eqPanel.anchorX}
              anchorY={eqPanel.anchorY}
              onClose={() => setEqPanel(null)}
              onUpdateBand={dsp.onUpdateEqBand}
              onChangeType={dsp.onUpdateEqBandType}
              onChangeSlope={dsp.onUpdateEqBandSlope}
              onToggle={dsp.onToggleEqBand}
              onRemove={(id) => {
                dsp.onRemoveEqBand(id);
                setEqPanel(null);
              }}
            />
          );
        })()}
    </div>
  );
}
