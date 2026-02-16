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
    radio,
    fft,
    spectrum,
    waterfall,
    ft8,
    decodes,
    controls,
    dsp,
    interaction,
    isMobile,
  } = props;
  const { daemonConnected, daemonError, lastResponseError, effectiveState } =
    radio;

  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [hoveredEqBandId, setHoveredEqBandId] = useState<string | null>(null);

  const leftControls = (
    <div className="space-y-6">
      <RadioControlsCard
        effectiveState={effectiveState}
        selectedDevice={radio.selectedDevice}
        canControlConnected={radio.canControlConnected}
        smeterDbm={radio.smeterDbm}
        canStreamFft={radio.canStreamFft}
        canStreamAudio={radio.canStreamAudio}
        fftEnabled={radio.fftEnabled}
        audioEnabled={radio.audioEnabled}
        freqInput={controls.freqInput}
        freqUnit={controls.freqUnit}
        onTune={controls.onTune}
        onFreqInputChange={controls.onFreqInputChange}
        onFreqUnitChange={controls.onFreqUnitChange}
        onModeChange={controls.onModeChange}
        onPttChange={controls.onPttChange}
        onAgcToggle={controls.onAgcToggle}
        onAntennaChange={controls.onAntennaChange}
        onGainChange={controls.onGainChange}
        onFilterChange={controls.onFilterChange}
        onNrChange={controls.onNrChange}
        onNbChange={controls.onNbChange}
        onToggleFft={controls.onToggleFft}
        onToggleAudio={controls.onToggleAudio}
      />

      <RadioStatusCard effectiveState={effectiveState} />
    </div>
  );

  const rightPanels = (
    <div className="space-y-6">
      <WaterfallPanel
        effectiveState={effectiveState}
        canStreamFft={radio.canStreamFft}
        fftEnabled={radio.fftEnabled}
        lastFftFrame={fft.lastFftFrame}
        waterfallView={fft.waterfallView}
        tuningOverlay={fft.tuningOverlay}
        waterfallOverlays={fft.waterfallOverlays}
        waterfallPalette={waterfall.waterfallPalette}
        waterfallMinDb={waterfall.waterfallMinDb}
        waterfallMaxDb={waterfall.waterfallMaxDb}
        waterfallSpeed={waterfall.waterfallSpeed}
        spectrumPeakHold={spectrum.spectrumPeakHold}
        spectrumGradientFill={spectrum.spectrumGradientFill}
        spectrumBgColor={spectrum.spectrumBgColor}
        spectrumGridLines={spectrum.spectrumGridLines}
        spectrumVerticalGridLines={spectrum.spectrumVerticalGridLines}
        spectrumGridOpacity={spectrum.spectrumGridOpacity}
        spectrumSmoothing={spectrum.spectrumSmoothing}
        spectrumLineColor={spectrum.spectrumLineColor}
        spectrumLineWidth={spectrum.spectrumLineWidth}
        spectrumFillOpacity={spectrum.spectrumFillOpacity}
        spectrumLineShadow={spectrum.spectrumLineShadow}
        spectrumLineShadowBlur={spectrum.spectrumLineShadowBlur}
        tuningLineColor={spectrum.tuningLineColor}
        tuningArrowColor={spectrum.tuningArrowColor}
        eqBands={dsp.eqBands}
        onFilterChange={controls.onFilterChange}
        onAddEqBand={dsp.onAddEqBand}
        onUpdateEqBand={dsp.onUpdateEqBand}
        onRemoveEqBand={dsp.onRemoveEqBand}
        onEqBandHover={setHoveredEqBandId}
        onEqBandQChange={dsp.onEqBandQChange}
        hoveredEqBandId={hoveredEqBandId}
        onWheelTune={interaction.onWheelTune}
        passbandBlendMode={waterfall.passbandBlendMode}
        passbandOpacity={waterfall.passbandOpacity}
        waterfallInterpolation={waterfall.waterfallInterpolation}
        waterfallGamma={waterfall.waterfallGamma}
        waterfallRowHeight={waterfall.waterfallRowHeight}
        clusterSpots={decodes.clusterSpots}
        onWaterfallViewChange={interaction.onWaterfallViewChange}
        onPickFrequencyHz={interaction.onPickFrequencyHz}
        onSelectRangeHz={interaction.onSelectRangeHz}
      />

      <DecodesPanel
        wsjtxStatus={decodes.wsjtxStatus}
        wsjtxDecodes={decodes.wsjtxDecodes}
        clusterSpots={decodes.clusterSpots}
      />

      <Ft8DecoderPanel
        enabled={ft8.ft8DecoderEnabled}
        mode={ft8.ft8DecoderMode}
        cycleProgress={ft8.ft8CycleProgress}
        stats={ft8.ft8DecoderStats}
        error={ft8.ft8Error}
        onToggle={ft8.onFt8Toggle}
        onModeChange={ft8.onFt8ModeChange}
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
