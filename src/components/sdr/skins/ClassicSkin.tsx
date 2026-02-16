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
            <span className="text-gray-200">Daemon</span> in the header to
            connect.
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
