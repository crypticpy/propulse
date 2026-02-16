/**
 * Classic skin for the SDR Console.
 * This is the original 2-column layout extracted from SdrConsole.tsx.
 * All panel content is delegated to shared components in `../shared/`.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { HelpTooltip } from "@/components/help/HelpTooltip";
import {
  RadioDeviceCard,
  RadioControlsCard,
  RadioStatusCard,
  WaterfallPanel,
  DecodesPanel,
} from "@/components/sdr/shared";
import { SkinSwitcher } from "./SkinSwitcher";
import type { SdrSkinProps } from "./types";
import { formatHz } from "./types";

export function ClassicSkin(props: SdrSkinProps) {
  const {
    daemonConnected,
    daemonConnecting,
    daemonError,
    daemonUrl,
    lastResponseError,
    lastDaemonStatus,
    effectiveState,
    isMobile,
    activeSkin,
    onSkinChange,
    onOpenDevicePicker,
  } = props;

  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  const leftControls = (
    <div className="space-y-6">
      <RadioDeviceCard
        devices={props.devices}
        selectedDeviceId={props.selectedDeviceId}
        selectedDevice={props.selectedDevice}
        connectedDeviceId={props.connectedDeviceId}
        daemonConnected={daemonConnected}
        canControlDevice={props.canControlDevice}
        canControlConnected={props.canControlConnected}
        onDeviceSelect={props.onDeviceSelect}
        onConnectRadio={props.onConnectRadio}
        onDisconnectRadio={props.onDisconnectRadio}
      />

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
