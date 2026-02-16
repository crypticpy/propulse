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
      {/* ── Top header bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 h-9 shrink-0 border-b border-white/10 bg-[#0d0d14]">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">SDR Console</h2>
          <HelpTooltip
            section="sdr-console"
            tooltip="Learn more about SDR Console"
          />
          <SkinSwitcher
            activeSkin={activeSkin}
            onSkinChange={onSkinChange}
            isMobile={isMobile}
          />
          <button
            type="button"
            onClick={onOpenSdrSettings}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="SDR display settings"
            title="Display settings"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-2 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
            onClick={onOpenDevicePicker}
          >
            Daemon
          </button>
          <Link
            to="/sdr/setup"
            className="px-2 py-0.5 rounded text-[10px] bg-cosmic-cyan/10 border border-cosmic-cyan/20 text-cosmic-cyan hover:bg-cosmic-cyan/15"
          >
            Setup
          </Link>
          <span className="text-[10px] text-gray-500 font-mono truncate max-w-[200px]">
            {daemonUrl}
          </span>
          <span className="text-[10px] font-medium">
            {daemonConnected ? (
              <span className="text-signal-green">Connected</span>
            ) : daemonConnecting ? (
              <span className="text-caution-amber">Connecting&hellip;</span>
            ) : (
              <span className="text-gray-500">Offline</span>
            )}
          </span>
        </div>
      </div>

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
            onConnectRadio={props.onConnectRadio}
            onDisconnectRadio={props.onDisconnectRadio}
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
