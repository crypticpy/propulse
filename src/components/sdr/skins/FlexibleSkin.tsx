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
import type { SdrSkinProps } from "./types";

export function FlexibleSkin(props: SdrSkinProps) {
  const {
    daemonConnected,
    daemonError,
    lastResponseError,
    lastDaemonStatus,
    effectiveState,

    // FFT / Spectrum
    canStreamFft,
    fftEnabled,
    lastFftFrame,
    waterfallView,
    tuningOverlay,
    waterfallOverlays,
    waterfallPalette,
    waterfallMinDb,
    waterfallMaxDb,
    waterfallSpeed,
    spectrumPeakHold,
    spectrumGradientFill,

    // Waterfall fidelity
    waterfallInterpolation,
    waterfallGamma,
    waterfallRowHeight,

    // Data
    clusterSpots,
    smeterDbm,
    sliceBgColor,

    // Callbacks
    onWaterfallViewChange,
    onPickFrequencyHz,
    onSelectRangeHz,
  } = props;

  const hasRadio = !!props.connectedDeviceId;
  const hasFft = canStreamFft && fftEnabled && !!lastFftFrame;
  const radioName =
    props.selectedDevice?.name ?? props.selectedDevice?.device_id ?? null;

  // Track waterfall container height for FlexTimeAxis
  const waterfallContainerRef = useRef<HTMLDivElement>(null);
  const [waterfallHeight, setWaterfallHeight] = useState(400);

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
  }, [measureWaterfall]);

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

    // Compute passband edges (same logic as computePassbandHz)
    const mode = (effectiveState.mode ?? "USB").toUpperCase();
    const filterLow = effectiveState.filter?.low ?? 300;
    const filterHigh = effectiveState.filter?.high ?? 2700;
    let pbStartHz: number;
    let pbEndHz: number;

    if (mode === "LSB") {
      pbStartHz = effectiveState.freq - filterHigh;
      pbEndHz = effectiveState.freq - filterLow;
    } else if (mode === "AM" || mode === "FM" || mode === "WFM") {
      pbStartHz = effectiveState.freq - filterHigh;
      pbEndHz = effectiveState.freq + filterHigh;
    } else if (mode === "CW" || mode === "CWR") {
      const center = (filterLow + filterHigh) / 2;
      const half = (filterHigh - filterLow) / 2;
      pbStartHz = effectiveState.freq + center - half;
      pbEndHz = effectiveState.freq + center + half;
    } else {
      // USB and default
      pbStartHz = effectiveState.freq + filterLow;
      pbEndHz = effectiveState.freq + filterHigh;
    }

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
            className="absolute top-3 z-10 transition-[left] duration-100 ease-out"
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
              onVfoSwap={
                props.canControlConnected
                  ? () =>
                      props.onVfoChange(effectiveState?.vfo === "B" ? "A" : "B")
                  : undefined
              }
              onNbToggle={
                props.canControlConnected
                  ? () =>
                      props.onNbChange(
                        !effectiveState?.nb?.enabled,
                        effectiveState?.nb?.threshold ?? 50,
                      )
                  : undefined
              }
              onNrToggle={
                props.canControlConnected
                  ? () =>
                      props.onNrChange(
                        !effectiveState?.nr?.enabled,
                        effectiveState?.nr?.level ?? 5,
                      )
                  : undefined
              }
              onAgcToggle={
                props.canControlConnected
                  ? () => props.onAgcToggle(!effectiveState?.agc)
                  : undefined
              }
            />
          </div>

          {hasFft ? (
            <>
              {/* Spectrum scope — 30% of center height */}
              <div className="relative h-[30%] min-h-[80px]">
                <SpectrumScope
                  frame={lastFftFrame}
                  audioFrame={props.audioFftFrame}
                  view={waterfallView}
                  palette={waterfallPalette}
                  tuning={tuningOverlay}
                  minDb={waterfallMinDb}
                  maxDb={waterfallMaxDb}
                  showPeakHold={spectrumPeakHold}
                  showGradientFill={spectrumGradientFill}
                  overlays={waterfallOverlays}
                  bgColor={props.spectrumBgColor}
                  gridLines={props.spectrumGridLines}
                  verticalGridLines={props.spectrumVerticalGridLines}
                  gridOpacity={props.spectrumGridOpacity}
                  smoothing={props.spectrumSmoothing}
                  lineColor={props.spectrumLineColor}
                  lineWidth={props.spectrumLineWidth}
                  fillOpacity={props.spectrumFillOpacity}
                  lineShadow={props.spectrumLineShadow}
                  lineShadowBlur={props.spectrumLineShadowBlur}
                  tuningLineColor={props.tuningLineColor}
                  tuningArrowColor={props.tuningArrowColor}
                  notchFilters={props.notchFilters}
                  onFilterChange={props.onFilterChange}
                  onAddNotch={props.onAddNotch}
                  onUpdateNotch={props.onUpdateNotch}
                  onRemoveNotch={props.onRemoveNotch}
                  onPickFrequencyHz={onPickFrequencyHz}
                  onWheelTune={props.onWheelTune}
                  className="rounded-none border-0"
                />
                <FlexDbScale minDb={waterfallMinDb} maxDb={waterfallMaxDb} />
              </div>

              {/* Passband detail zoom scope */}
              <PassbandDetail
                frame={lastFftFrame}
                audioFftFrame={props.audioFftFrame}
                tuning={tuningOverlay}
                minDb={waterfallMinDb}
                maxDb={waterfallMaxDb}
                palette={waterfallPalette}
                gamma={waterfallGamma}
                notchFilters={props.notchFilters}
                onFilterChange={props.onFilterChange}
                onAddNotch={props.onAddNotch}
                onUpdateNotch={props.onUpdateNotch}
                onRemoveNotch={props.onRemoveNotch}
                onPickFrequencyHz={onPickFrequencyHz}
                onWheelTune={props.onWheelTune}
              />

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
                  audioFrame={props.audioFftFrame}
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
                  onWheelTune={props.onWheelTune}
                  passbandBlendMode={
                    props.passbandBlendMode as
                      | "screen"
                      | "overlay"
                      | "color-dodge"
                      | "color-burn"
                      | "soft-light"
                      | "none"
                  }
                  passbandOpacity={props.passbandOpacity}
                  interpolation={waterfallInterpolation}
                  gamma={waterfallGamma}
                  rowHeight={waterfallRowHeight}
                  className="rounded-none border-0"
                />
                <FlexTimeAxis
                  speed={waterfallSpeed}
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
            selectedDevice={props.selectedDevice}
            canControlConnected={props.canControlConnected}
            smeterDbm={smeterDbm}
            canStreamFft={canStreamFft}
            canStreamAudio={props.canStreamAudio}
            fftEnabled={fftEnabled}
            audioEnabled={props.audioEnabled}
            freqInput={props.freqInput}
            freqUnit={props.freqUnit}
            noiseGateEnabled={props.noiseGateEnabled}
            noiseGateThreshold={props.noiseGateThreshold}
            onNoiseGateToggle={props.onNoiseGateToggle}
            onNoiseGateThresholdChange={props.onNoiseGateThresholdChange}
            clientNrEnabled={props.clientNrEnabled}
            clientNrLevel={props.clientNrLevel}
            onClientNrToggle={props.onClientNrToggle}
            onClientNrLevelChange={props.onClientNrLevelChange}
            notchFilters={props.notchFilters}
            tuningStepHz={props.tuningStepHz}
            onTuningStepChange={props.onTuningStepChange}
            onAddNotch={props.onAddNotch}
            onRemoveNotch={props.onRemoveNotch}
            onUpdateNotch={props.onUpdateNotch}
            onToggleNotch={props.onToggleNotch}
            onTune={props.onTune}
            onFreqInputChange={props.onFreqInputChange}
            onFreqUnitChange={props.onFreqUnitChange}
            onModeChange={props.onModeChange}
            onPttChange={props.onPttChange}
            onAgcToggle={props.onAgcToggle}
            onAntennaChange={props.onAntennaChange}
            onGainChange={props.onGainChange}
            onFilterChange={props.onFilterChange}
            onNrChange={props.onNrChange}
            onNbChange={props.onNbChange}
            onToggleFft={props.onToggleFft}
            onToggleAudio={props.onToggleAudio}
            vfo={effectiveState?.vfo}
            onVfoChange={props.onVfoChange}
            freqHz={effectiveState?.freq ?? null}
            onBandSelect={onPickFrequencyHz}
            hasMultipleAntennas={
              (props.selectedDevice?.capabilities.antennas.length ?? 0) > 1
            }
            antennas={props.selectedDevice?.capabilities.antennas ?? []}
            ft8DecoderEnabled={props.ft8DecoderEnabled}
            ft8DecoderMode={props.ft8DecoderMode}
            ft8CycleProgress={props.ft8CycleProgress}
            ft8DecoderStats={props.ft8DecoderStats}
            ft8Error={props.ft8Error}
            onFt8Toggle={props.onFt8Toggle}
            onFt8ModeChange={props.onFt8ModeChange}
          />
          <FlexInfoTabs
            wsjtxStatus={props.wsjtxStatus}
            wsjtxDecodes={props.wsjtxDecodes}
            clusterSpots={clusterSpots}
            ft8DecoderEnabled={props.ft8DecoderEnabled}
          />
        </div>
      </div>

      {/* ── Bottom status bar ────────────────────────────────────────── */}
      <FlexBottomBar
        daemonConnected={daemonConnected}
        radioName={radioName}
        ptt={effectiveState?.ptt ?? false}
        fftEnabled={fftEnabled}
        audioEnabled={props.audioEnabled}
        cpuPercent={lastDaemonStatus?.cpu_percent ?? null}
        memoryMb={lastDaemonStatus?.memory_mb ?? null}
        vfo={effectiveState?.vfo ?? null}
        activeBand={
          effectiveState?.freq ? bandFromFreq(effectiveState.freq / 1000) : null
        }
      />
    </div>
  );
}
