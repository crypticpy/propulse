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
import type { SdrSkinProps } from "./types";

/** RX gain stage names — constant, lives outside the component to avoid re-creation. */
const RX_STAGES = ["RF", "SQL", "PREAMP", "ATT"];

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

  const { spectrumPeakHold, spectrumGradientFill } = spectrum;

  const { onWaterfallViewChange, onPickFrequencyHz, onSelectRangeHz } =
    interaction;

  const { clusterSpots } = decodes;

  const hasRadio = !!radio.connectedDeviceId;
  const hasFft = canStreamFft && fftEnabled && !!lastFftFrame;
  const radioName =
    radio.selectedDevice?.name ?? radio.selectedDevice?.device_id ?? null;

  // ── Gain stage groupings for slice panels ────────────────────────

  const slicePanels = useMemo(() => {
    const allStages = radio.selectedDevice?.capabilities.gain_stages ?? [];
    const gains = effectiveState?.gains ?? {};

    return radio.canControlConnected
      ? {
          canControl: true,
          // DSP
          nbEnabled: !!effectiveState?.nb?.enabled,
          nrEnabled: !!effectiveState?.nr?.enabled,
          agcEnabled: !!effectiveState?.agc,
          anfEnabled: !!effectiveState?.anf,
          onNbToggle: () =>
            controls.onNbChange(
              !effectiveState?.nb?.enabled,
              effectiveState?.nb?.threshold ?? 50,
            ),
          onNrToggle: () =>
            controls.onNrChange(
              !effectiveState?.nr?.enabled,
              effectiveState?.nr?.level ?? 5,
            ),
          onAgcToggle: () => controls.onAgcToggle(!effectiveState?.agc),
          onAnfToggle: controls.onAnfToggle,
          // Filter / Mode
          availableModes: radio.selectedDevice?.capabilities.modes ?? [],
          currentMode: effectiveState?.mode ?? "USB",
          filterLow: effectiveState?.filter?.low ?? 300,
          filterHigh: effectiveState?.filter?.high ?? 2700,
          onModeChange: controls.onModeChange,
          onFilterChange: controls.onFilterChange,
          // RX gains
          rxGainStages: allStages.filter((s) => RX_STAGES.includes(s.name)),
          gains,
          onGainChange: controls.onGainChange,
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
          // X/RIT
          rit: effectiveState?.rit,
          xit: effectiveState?.xit,
          split: effectiveState?.split ?? false,
          ifShift: effectiveState?.ifShift ?? 0,
          cwSpeed: effectiveState?.cwSpeed ?? 20,
          currentMode2: effectiveState?.mode ?? "USB",
          onRitToggle: controls.onRitToggle,
          onRitOffset: controls.onRitOffset,
          onXitToggle: controls.onXitToggle,
          onXitOffset: controls.onXitOffset,
          onSplitToggle: controls.onSplitToggle,
          onIfShift: controls.onIfShift,
          onCwSpeed: controls.onCwSpeed,
        }
      : undefined;
  }, [
    radio.canControlConnected,
    radio.selectedDevice?.capabilities.modes,
    radio.selectedDevice?.capabilities.gain_stages,
    radio.audioEnabled,
    effectiveState?.nb?.enabled,
    effectiveState?.nb?.threshold,
    effectiveState?.nr?.enabled,
    effectiveState?.nr?.level,
    effectiveState?.agc,
    effectiveState?.anf,
    effectiveState?.gains,
    effectiveState?.mode,
    effectiveState?.filter?.low,
    effectiveState?.filter?.high,
    effectiveState?.rit,
    effectiveState?.xit,
    effectiveState?.split,
    effectiveState?.ifShift,
    effectiveState?.cwSpeed,
    controls,
    dsp.noiseGateEnabled,
    dsp.noiseGateThreshold,
    dsp.clientNrEnabled,
    dsp.clientNrLevel,
    dsp.onNoiseGateToggle,
    dsp.onNoiseGateThresholdChange,
    dsp.onClientNrToggle,
    dsp.onClientNrLevelChange,
  ]);

  // EQ band hover state (shared between SpectrumScope and PassbandDetail)
  const [hoveredEqBandId, setHoveredEqBandId] = useState<string | null>(null);

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
              onVfoSwap={
                radio.canControlConnected
                  ? () =>
                      controls.onVfoChange(
                        effectiveState?.vfo === "B" ? "A" : "B",
                      )
                  : undefined
              }
              onNbToggle={
                radio.canControlConnected
                  ? () =>
                      controls.onNbChange(
                        !effectiveState?.nb?.enabled,
                        effectiveState?.nb?.threshold ?? 50,
                      )
                  : undefined
              }
              onNrToggle={
                radio.canControlConnected
                  ? () =>
                      controls.onNrChange(
                        !effectiveState?.nr?.enabled,
                        effectiveState?.nr?.level ?? 5,
                      )
                  : undefined
              }
              onAgcToggle={
                radio.canControlConnected
                  ? () => controls.onAgcToggle(!effectiveState?.agc)
                  : undefined
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
              <div className="relative h-[30%] min-h-[80px]">
                <SpectrumScope
                  frame={lastFftFrame}
                  audioFrame={fft.audioFftFrame}
                  view={waterfallView}
                  palette={waterfallPalette}
                  tuning={tuningOverlay}
                  minDb={waterfallMinDb}
                  maxDb={waterfallMaxDb}
                  showPeakHold={spectrumPeakHold}
                  showGradientFill={spectrumGradientFill}
                  overlays={waterfallOverlays}
                  bgColor={spectrum.spectrumBgColor}
                  gridLines={spectrum.spectrumGridLines}
                  verticalGridLines={spectrum.spectrumVerticalGridLines}
                  gridOpacity={spectrum.spectrumGridOpacity}
                  smoothing={spectrum.spectrumSmoothing}
                  lineColor={spectrum.spectrumLineColor}
                  lineWidth={spectrum.spectrumLineWidth}
                  fillOpacity={spectrum.spectrumFillOpacity}
                  lineShadow={spectrum.spectrumLineShadow}
                  lineShadowBlur={spectrum.spectrumLineShadowBlur}
                  tuningLineColor={spectrum.tuningLineColor}
                  tuningArrowColor={spectrum.tuningArrowColor}
                  eqBands={dsp.eqBands}
                  hoveredEqBandId={hoveredEqBandId}
                  onFilterChange={controls.onFilterChange}
                  onAddEqBand={dsp.onAddEqBand}
                  onUpdateEqBand={dsp.onUpdateEqBand}
                  onRemoveEqBand={dsp.onRemoveEqBand}
                  onEqBandHover={setHoveredEqBandId}
                  onEqBandQChange={dsp.onEqBandQChange}
                  onPickFrequencyHz={onPickFrequencyHz}
                  onWheelTune={interaction.onWheelTune}
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
              <PassbandDetail
                frame={lastFftFrame}
                audioFftFrame={fft.audioFftFrame}
                tuning={tuningOverlay}
                minDb={waterfallMinDb}
                maxDb={waterfallMaxDb}
                palette={waterfallPalette}
                gamma={waterfallGamma}
                notchFilters={[]}
                eqBands={dsp.eqBands}
                onFilterChange={controls.onFilterChange}
                onAddEqBand={dsp.onAddEqBand}
                onUpdateEqBand={dsp.onUpdateEqBand}
                onRemoveEqBand={dsp.onRemoveEqBand}
                onEqBandHover={setHoveredEqBandId}
                onEqBandQChange={dsp.onEqBandQChange}
                onPickFrequencyHz={onPickFrequencyHz}
                onWheelTune={interaction.onWheelTune}
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
                  audioFrame={fft.audioFftFrame}
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
                  onWheelTune={interaction.onWheelTune}
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
                  className="rounded-none border-0"
                />
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
            canStreamFft={canStreamFft}
            canStreamAudio={radio.canStreamAudio}
            fftEnabled={fftEnabled}
            audioEnabled={radio.audioEnabled}
            freqInput={controls.freqInput}
            freqUnit={controls.freqUnit}
            eqBands={dsp.eqBands}
            tuningStepHz={dsp.tuningStepHz}
            onTuningStepChange={dsp.onTuningStepChange}
            onAddEqBand={dsp.onAddEqBand}
            onRemoveEqBand={dsp.onRemoveEqBand}
            onUpdateEqBand={dsp.onUpdateEqBand}
            onUpdateEqBandType={dsp.onUpdateEqBandType}
            onToggleEqBand={dsp.onToggleEqBand}
            onEqBandQChange={dsp.onEqBandQChange}
            onTune={controls.onTune}
            onFreqInputChange={controls.onFreqInputChange}
            onFreqUnitChange={controls.onFreqUnitChange}
            onAntennaChange={controls.onAntennaChange}
            onGainChange={controls.onGainChange}
            onToggleFft={controls.onToggleFft}
            onToggleAudio={controls.onToggleAudio}
            vfo={effectiveState?.vfo}
            onVfoChange={controls.onVfoChange}
            freqHz={effectiveState?.freq ?? null}
            onBandSelect={onPickFrequencyHz}
            hasMultipleAntennas={
              (radio.selectedDevice?.capabilities.antennas.length ?? 0) > 1
            }
            antennas={radio.selectedDevice?.capabilities.antennas ?? []}
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
        audioEnabled={radio.audioEnabled}
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
