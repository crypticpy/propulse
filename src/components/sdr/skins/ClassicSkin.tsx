/**
 * Classic skin for the SDR Console.
 * This is the original 2-column layout extracted from SdrConsole.tsx.
 * All panel content is delegated to shared components in `../shared/`.
 */

import { useState } from "react";
import {
  RadioControlsCard,
  RadioStatusCard,
  WaterfallPanel,
  DecodesPanel,
} from "@/components/sdr/shared";
import { Ft8DecoderPanel } from "@/components/sdr/Ft8DecoderPanel";
import type { SdrSkinProps } from "./types";
import { formatHz } from "./types";

export function ClassicSkin(props: SdrSkinProps) {
  const {
    daemonConnected,
    daemonError,
    lastResponseError,
    effectiveState,
    isMobile,
  } = props;

  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  const leftControls = (
    <div className="space-y-6">
      <RadioControlsCard
        effectiveState={effectiveState}
        selectedDevice={props.selectedDevice}
        canControlConnected={props.canControlConnected}
        smeterDbm={props.smeterDbm}
        canStreamFft={props.canStreamFft}
        canStreamAudio={props.canStreamAudio}
        fftEnabled={props.fftEnabled}
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
      />

      <RadioStatusCard effectiveState={effectiveState} />
    </div>
  );

  const rightPanels = (
    <div className="space-y-6">
      <WaterfallPanel
        effectiveState={effectiveState}
        canStreamFft={props.canStreamFft}
        fftEnabled={props.fftEnabled}
        lastFftFrame={props.lastFftFrame}
        waterfallView={props.waterfallView}
        tuningOverlay={props.tuningOverlay}
        waterfallOverlays={props.waterfallOverlays}
        waterfallPalette={props.waterfallPalette}
        waterfallMinDb={props.waterfallMinDb}
        waterfallMaxDb={props.waterfallMaxDb}
        waterfallSpeed={props.waterfallSpeed}
        spectrumPeakHold={props.spectrumPeakHold}
        spectrumGradientFill={props.spectrumGradientFill}
        spectrumBgColor={props.spectrumBgColor}
        spectrumGridLines={props.spectrumGridLines}
        spectrumVerticalGridLines={props.spectrumVerticalGridLines}
        spectrumGridOpacity={props.spectrumGridOpacity}
        spectrumSmoothing={props.spectrumSmoothing}
        spectrumLineColor={props.spectrumLineColor}
        spectrumLineWidth={props.spectrumLineWidth}
        spectrumFillOpacity={props.spectrumFillOpacity}
        spectrumLineShadow={props.spectrumLineShadow}
        spectrumLineShadowBlur={props.spectrumLineShadowBlur}
        tuningLineColor={props.tuningLineColor}
        tuningArrowColor={props.tuningArrowColor}
        notchFilters={props.notchFilters}
        onFilterChange={props.onFilterChange}
        onAddNotch={props.onAddNotch}
        onUpdateNotch={props.onUpdateNotch}
        onRemoveNotch={props.onRemoveNotch}
        passbandBlendMode={props.passbandBlendMode}
        passbandOpacity={props.passbandOpacity}
        waterfallInterpolation={props.waterfallInterpolation}
        waterfallGamma={props.waterfallGamma}
        waterfallRowHeight={props.waterfallRowHeight}
        clusterSpots={props.clusterSpots}
        onWaterfallViewChange={props.onWaterfallViewChange}
        onPickFrequencyHz={props.onPickFrequencyHz}
        onSelectRangeHz={props.onSelectRangeHz}
      />

      <DecodesPanel
        wsjtxStatus={props.wsjtxStatus}
        wsjtxDecodes={props.wsjtxDecodes}
        clusterSpots={props.clusterSpots}
      />

      <Ft8DecoderPanel
        enabled={props.ft8DecoderEnabled}
        mode={props.ft8DecoderMode}
        cycleProgress={props.ft8CycleProgress}
        stats={props.ft8DecoderStats}
        error={props.ft8Error}
        onToggle={props.onFt8Toggle}
        onModeChange={props.onFt8ModeChange}
      />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">SDR Console</h2>
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
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="SDR display settings"
              title="Display settings"
            >
              <svg
                className="w-4 h-4"
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
          <p className="text-sm text-gray-500">
            Connect to the local Propulse Radio Daemon for SDR/radio control and
            waterfall streaming.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md text-xs bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10"
              onClick={onOpenDevicePicker}
            >
              Change Daemon
            </button>
            <Link
              to="/sdr/setup"
              className="px-3 py-1.5 rounded-md text-xs bg-cosmic-cyan/10 border border-cosmic-cyan/20 text-cosmic-cyan hover:bg-cosmic-cyan/15"
            >
              Setup Help
            </Link>
            <div className="text-[11px] text-gray-500 font-mono truncate max-w-[min(520px,70vw)]">
              {daemonUrl}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-500">Daemon</div>
          <div className="text-sm text-gray-200 font-medium">
            {daemonConnected
              ? "Connected"
              : daemonConnecting
                ? "Connecting\u2026"
                : "Offline"}
          </div>
          {lastDaemonStatus && (
            <div className="text-[11px] text-gray-500 font-mono">
              {lastDaemonStatus.platform} &bull;{" "}
              {lastDaemonStatus.cpu_percent.toFixed(1)}% CPU &bull;{" "}
              {lastDaemonStatus.memory_mb} MB
            </div>
          )}
        </div>
      </div>

      {(daemonError || lastResponseError) && (
        <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
          {daemonError ?? lastResponseError}
        </div>
      )}

      {!daemonConnected && (
        <div className="p-4 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-gray-300">
          <div className="font-semibold text-gray-200 mb-1">
            No Daemon Connected
          </div>
          <div className="text-gray-400">
            Start the daemon on the machine connected to your radio, then use{" "}
            <span className="text-gray-200">Change Daemon</span> to connect.
          </div>
          <div className="mt-2 text-[11px] text-gray-500 font-mono">
            Local dev:{" "}
            <span className="text-gray-400">
              cd daemon &amp;&amp; cargo run -p propulse-daemon
            </span>
          </div>
        </div>
      )}

      {isMobile ? (
        <>
          {rightPanels}

          <button
            type="button"
            onClick={() => setMobileControlsOpen(true)}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-3 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-sm text-gray-100 hover:bg-white/15"
            style={{ minHeight: 44 }}
          >
            Controls
          </button>

          {mobileControlsOpen ? (
            <div
              className="fixed inset-0 z-[130] flex flex-col justify-end"
              role="dialog"
              aria-modal="true"
              aria-label="SDR controls"
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === "Escape") setMobileControlsOpen(false);
              }}
            >
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setMobileControlsOpen(false)}
              />

              <div className="relative w-full max-h-[75dvh] bg-deep-space/95 backdrop-blur-md border-t border-white/10 rounded-t-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      Radio Controls
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono truncate">
                      {effectiveState
                        ? formatHz(effectiveState.freq)
                        : "\u2014"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileControlsOpen(false)}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10"
                    style={{ minHeight: 44 }}
                  >
                    Close
                  </button>
                </div>
                <div className="p-4 overflow-y-auto">{leftControls}</div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {leftControls}
          {rightPanels}
        </div>
      )}
    </div>
  );
}
