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

import { useRef, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { HelpTooltip } from "@/components/help/HelpTooltip";
import { SpectrumScope } from "@/components/sdr/SpectrumScope";
import { Waterfall } from "@/components/sdr/Waterfall";
import { BandScope } from "@/components/sdr/BandScope";
import { SkinSwitcher } from "./SkinSwitcher";
import { FlexVfoDisplay } from "./flexible/FlexVfoDisplay";
import { FlexFreqAxis } from "./flexible/FlexFreqAxis";
import { FlexBottomBar } from "./flexible/FlexBottomBar";
import { FlexButtonBar } from "./flexible/FlexButtonBar";
import { FlexSideControls } from "./flexible/FlexSideControls";
import { FlexDbScale } from "./flexible/FlexDbScale";
import { FlexTimeAxis } from "./flexible/FlexTimeAxis";
import { FlexInfoTabs } from "./flexible/FlexInfoTabs";
import type { SdrSkinProps } from "./types";

// ─── S-meter readout formatting ───────────────────────────────────────────────

function formatSmeterReadout(dbm: number | undefined): string | null {
  if (dbm === undefined) return null;
  const S9_DBM = -73;
  const S1_DBM = -121;
  if (dbm < S1_DBM) return `${Math.round(dbm)} dBm`;
  if (dbm <= S9_DBM) {
    const sUnit = Math.max(1, Math.min(9, Math.round((dbm - S1_DBM) / 6) + 1));
    return `S${sUnit}`;
  }
  const over = Math.max(5, Math.round((dbm - S9_DBM) / 5) * 5);
  return `S9+${over}`;
}

export function FlexibleSkin(props: SdrSkinProps) {
  const {
    daemonConnected,
    daemonConnecting,
    daemonError,
    daemonUrl,
    lastResponseError,
    lastDaemonStatus,
    effectiveState,
    activeSkin,
    onSkinChange,
    isMobile,
    onOpenDevicePicker,

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

    // Data
    clusterSpots,
    smeterDbm,

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

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#0a0a0f] overflow-hidden">
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
      <div className="flex-1 grid grid-cols-[48px_1fr_280px] grid-rows-[1fr] min-h-0">
        {/* ── Left button bar ────────────────────────────────────────── */}
        <FlexButtonBar
          hasMultipleAntennas={
            (props.selectedDevice?.capabilities.antennas.length ?? 0) > 1
          }
          antenna={effectiveState?.antenna ?? null}
          antennas={props.selectedDevice?.capabilities.antennas ?? []}
          onAntennaChange={props.onAntennaChange}
          canStreamFft={canStreamFft}
          fftEnabled={fftEnabled}
          onToggleFft={props.onToggleFft}
          hasRadio={hasRadio}
        />

        {/* ── Center: Spectrum + Freq axis + Waterfall ────────────── */}
        <div className="relative flex flex-col min-h-0">
          {/* VFO overlay */}
          <FlexVfoDisplay
            freqHz={effectiveState?.freq ?? null}
            mode={effectiveState?.mode ?? null}
            ptt={effectiveState?.ptt ?? false}
            antenna={effectiveState?.antenna ?? null}
            filterLow={effectiveState?.filter?.low ?? null}
            filterHigh={effectiveState?.filter?.high ?? null}
            smeterReadout={formatSmeterReadout(smeterDbm)}
          />

          {hasFft ? (
            <>
              {/* Spectrum scope — 30% of center height */}
              <div className="relative h-[30%] min-h-[80px]">
                <SpectrumScope
                  frame={lastFftFrame}
                  view={waterfallView}
                  palette={waterfallPalette}
                  tuning={tuningOverlay}
                  minDb={waterfallMinDb}
                  maxDb={waterfallMaxDb}
                  showPeakHold={spectrumPeakHold}
                  showGradientFill={spectrumGradientFill}
                  overlays={waterfallOverlays}
                  className="rounded-none border-0"
                />
                <FlexDbScale minDb={waterfallMinDb} maxDb={waterfallMaxDb} />
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
            onConnectRadio={props.onConnectRadio}
            onDisconnectRadio={props.onDisconnectRadio}
          />
          <FlexInfoTabs
            wsjtxStatus={props.wsjtxStatus}
            wsjtxDecodes={props.wsjtxDecodes}
            clusterSpots={clusterSpots}
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
      />
    </div>
  );
}
