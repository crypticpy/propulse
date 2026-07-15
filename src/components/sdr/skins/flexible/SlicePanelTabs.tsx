/**
 * SlicePanelTabs — SmartSDR-style expandable tab panel system for the slice flag.
 *
 * Renders a button row at the bottom of FlexVfoDisplay. Clicking a tab
 * expands a panel below with controls. Only one panel open at a time.
 * Clicking the active tab collapses it.
 */

import {
  memo,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { GainStage, RadioCapabilities } from "@/lib/radio/protocol";
import { GainSlider } from "@/components/sdr/primitives/GainSlider";
import { SlicePanelDsp } from "./SlicePanelDsp";
import { SlicePanelFilter } from "./SlicePanelFilter";
import { SlicePanelAud } from "./SlicePanelAud";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SlicePanelId = "dsp" | "filter" | "rx" | "audio" | "xrit";

export interface SlicePanelControlProps {
  canControl: boolean;
  commands: RadioCapabilities["commands"];

  // DSP
  nbEnabled: boolean;
  nrEnabled: boolean;
  agcEnabled: boolean;
  agcMode: number;
  anfEnabled: boolean;
  qskEnabled: boolean;
  voxEnabled: boolean;
  squelchLevel: number;
  onNbToggle: () => void;
  onNrToggle: () => void;
  onAgcToggle: () => void;
  onAgcModeChange: (mode: number) => void;
  onAnfToggle: () => void;
  onQskToggle: () => void;
  onVoxToggle: () => void;
  onSquelchChange: (level: number) => void;

  // Filter / Mode
  availableModes: string[];
  currentMode: string;
  filterLow: number;
  filterHigh: number;
  onModeChange: (mode: string) => void;
  onFilterChange: (low: number, high: number) => void;

  // RX gains
  rxGainStages: GainStage[];
  antennas: string[];
  currentAntenna: string | null;
  onAntennaChange: (port: string) => void;
  gains: Record<string, number>;
  onGainChange: (stage: string, value: number) => void;

  // Audio
  audioEnabled: boolean;
  afGainStage: GainStage | null;
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
  clientNrEnabled: boolean;
  clientNrLevel: number;
  onNoiseGateToggle: (enabled: boolean) => void;
  onNoiseGateThresholdChange: (threshold: number) => void;
  onClientNrToggle: (enabled: boolean) => void;
  onClientNrLevelChange: (level: number) => void;
  sweetenEnabled: boolean;
  sweetenAmount: number;
  onSweetenToggle: (enabled: boolean) => void;
  onSweetenAmountChange: (amount: number) => void;
  expanderEnabled: boolean;
  expanderThreshold: number;
  expanderRatio: number;
  expanderAttackMs: number;
  expanderReleaseMs: number;
  expanderRangeDb: number;
  onExpanderToggle: (enabled: boolean) => void;
  onExpanderThresholdChange: (threshold: number) => void;
  onExpanderRatioChange: (ratio: number) => void;
  onExpanderAttackMsChange: (attackMs: number) => void;
  onExpanderReleaseMsChange: (releaseMs: number) => void;
  onExpanderRangeDbChange: (rangeDb: number) => void;
  compressorEnabled: boolean;
  compressorThreshold: number;
  compressorRatio: number;
  compressorAttackMs: number;
  compressorReleaseMs: number;
  compressorKnee: number;
  compressorMakeupDb: number;
  onCompressorToggle: (enabled: boolean) => void;
  onCompressorThresholdChange: (threshold: number) => void;
  onCompressorRatioChange: (ratio: number) => void;
  onCompressorAttackMsChange: (attackMs: number) => void;
  onCompressorReleaseMsChange: (releaseMs: number) => void;
  onCompressorKneeChange: (knee: number) => void;
  onCompressorMakeupDbChange: (makeupDb: number) => void;

  // Spectral Taming
  spectralTamingEnabled: boolean;
  spectralTamingTameAmount: number;
  spectralTamingRecoverAmount: number;
  spectralTamingSpeed: number;
  onSpectralTamingToggle: (enabled: boolean) => void;
  onSpectralTamingTameAmountChange: (amount: number) => void;
  onSpectralTamingRecoverAmountChange: (amount: number) => void;
  onSpectralTamingSpeedChange: (speed: number) => void;
  // Psychoacoustic Leveler
  levelerEnabled: boolean;
  levelerTargetLevel: number;
  levelerSpeed: number;
  levelerMaxGainDb: number;
  onLevelerToggle: (enabled: boolean) => void;
  onLevelerTargetLevelChange: (level: number) => void;
  onLevelerSpeedChange: (speed: number) => void;
  onLevelerMaxGainDbChange: (maxGainDb: number) => void;

  // X/RIT
  rit: { enabled: boolean; offsetHz: number } | undefined;
  xit: { enabled: boolean; offsetHz: number } | undefined;
  split: boolean;
  ifShift: number;
  cwSpeed: number;
  currentMode2: string; // for CW speed visibility
  onRitToggle: (enabled: boolean) => void;
  onRitOffset: (offsetHz: number) => void;
  onXitToggle: (enabled: boolean) => void;
  onXitOffset: (offsetHz: number) => void;
  onSplitToggle: (enabled: boolean) => void;
  onIfShift: (hz: number) => void;
  onCwSpeed: (wpm: number) => void;
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS: { id: SlicePanelId; label: string }[] = [
  { id: "dsp", label: "DSP" },
  { id: "filter", label: "FILT" },
  { id: "rx", label: "RX" },
  { id: "audio", label: "AUD" },
  { id: "xrit", label: "X/RIT" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export const SlicePanelTabs = memo(function SlicePanelTabs({
  controls,
}: {
  controls: SlicePanelControlProps;
}) {
  const [activePanel, setActivePanel] = useState<SlicePanelId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabs = useMemo(() => {
    const commands = controls.commands;
    const supportsAny = (
      names: Array<keyof NonNullable<RadioCapabilities["commands"]>>,
      legacy = true,
    ) =>
      commands
        ? names.some((command) => commands[command] === true)
        : legacy;

    return TABS.filter((tab) => {
      if (tab.id === "dsp") {
        return supportsAny(["nb", "nr", "agc", "anf", "qsk", "vox", "squelch"]);
      }
      if (tab.id === "filter") {
        return supportsAny(["mode", "filter"]);
      }
      if (tab.id === "rx") {
        return controls.rxGainStages.length > 0 || controls.antennas.length > 1;
      }
      if (tab.id === "xrit") {
        return supportsAny(["rit", "xit", "split", "if_shift", "cw_speed"], false);
      }
      return true;
    });
  }, [
    controls.antennas.length,
    controls.commands,
    controls.rxGainStages.length,
  ]);

  const toggle = useCallback(
    (id: SlicePanelId) => setActivePanel((prev) => (prev === id ? null : id)),
    [],
  );

  // Escape closes the active panel; 1-5 keys toggle panels when
  // the slice flag is focused (or a child element has focus).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle when the slice flag area (or its children) has focus
      if (
        !containerRef.current?.contains(document.activeElement) &&
        document.activeElement !== document.body
      )
        return;

      if (e.key === "Escape" && activePanel) {
        e.preventDefault();
        setActivePanel(null);
        return;
      }

      // Number keys 1-5 toggle the tabs (only when no input is focused)
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < tabs.length) {
        e.preventDefault();
        toggle(tabs[idx].id);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activePanel, tabs, toggle]);

  useEffect(() => {
    if (activePanel && !tabs.some((tab) => tab.id === activePanel)) {
      setActivePanel(null);
    }
  }, [activePanel, tabs]);

  let panelContent: ReactNode = null;
  if (activePanel === "dsp") {
    panelContent = (
      <SlicePanelDsp
        nbEnabled={controls.nbEnabled}
        nrEnabled={controls.nrEnabled}
        agcEnabled={controls.agcEnabled}
        agcMode={controls.agcMode}
        anfEnabled={controls.anfEnabled}
        qskEnabled={controls.qskEnabled}
        voxEnabled={controls.voxEnabled}
        squelchLevel={controls.squelchLevel}
        onNbToggle={controls.onNbToggle}
        onNrToggle={controls.onNrToggle}
        onAgcToggle={controls.onAgcToggle}
        onAgcModeChange={controls.onAgcModeChange}
        onAnfToggle={controls.onAnfToggle}
        onQskToggle={controls.onQskToggle}
        onVoxToggle={controls.onVoxToggle}
        onSquelchChange={controls.onSquelchChange}
        commands={controls.commands}
        canControl={controls.canControl}
      />
    );
  } else if (activePanel === "filter") {
    panelContent = (
      <SlicePanelFilter
        availableModes={controls.availableModes}
        currentMode={controls.currentMode}
        filterLow={controls.filterLow}
        filterHigh={controls.filterHigh}
        onModeChange={controls.onModeChange}
        onFilterChange={controls.onFilterChange}
        canControl={controls.canControl}
      />
    );
  } else if (activePanel === "rx") {
    panelContent = (
      <SlicePanelRxInline
        stages={controls.rxGainStages}
        antennas={controls.antennas}
        currentAntenna={controls.currentAntenna}
        onAntennaChange={controls.onAntennaChange}
        gains={controls.gains}
        onGainChange={controls.onGainChange}
        canControl={controls.canControl}
      />
    );
  } else if (activePanel === "xrit") {
    panelContent = (
      <SlicePanelXRit
        rit={controls.rit}
        xit={controls.xit}
        split={controls.split}
        ifShift={controls.ifShift}
        cwSpeed={controls.cwSpeed}
        currentMode={controls.currentMode2}
        onRitToggle={controls.onRitToggle}
        onRitOffset={controls.onRitOffset}
        onXitToggle={controls.onXitToggle}
        onXitOffset={controls.onXitOffset}
        onSplitToggle={controls.onSplitToggle}
        onIfShift={controls.onIfShift}
        onCwSpeed={controls.onCwSpeed}
        canControl={controls.canControl}
      />
    );
  } else if (activePanel === "audio") {
    panelContent = (
      <SlicePanelAud
        afGainStage={controls.afGainStage}
        gains={controls.gains}
        onGainChange={controls.onGainChange}
        audioEnabled={controls.audioEnabled}
        noiseGateEnabled={controls.noiseGateEnabled}
        noiseGateThreshold={controls.noiseGateThreshold}
        onNoiseGateToggle={controls.onNoiseGateToggle}
        onNoiseGateThresholdChange={controls.onNoiseGateThresholdChange}
        clientNrEnabled={controls.clientNrEnabled}
        clientNrLevel={controls.clientNrLevel}
        onClientNrToggle={controls.onClientNrToggle}
        onClientNrLevelChange={controls.onClientNrLevelChange}
        sweetenEnabled={controls.sweetenEnabled}
        sweetenAmount={controls.sweetenAmount}
        onSweetenToggle={controls.onSweetenToggle}
        onSweetenAmountChange={controls.onSweetenAmountChange}
        expanderEnabled={controls.expanderEnabled}
        expanderThreshold={controls.expanderThreshold}
        expanderRatio={controls.expanderRatio}
        expanderAttackMs={controls.expanderAttackMs}
        expanderReleaseMs={controls.expanderReleaseMs}
        expanderRangeDb={controls.expanderRangeDb}
        onExpanderToggle={controls.onExpanderToggle}
        onExpanderThresholdChange={controls.onExpanderThresholdChange}
        onExpanderRatioChange={controls.onExpanderRatioChange}
        onExpanderAttackMsChange={controls.onExpanderAttackMsChange}
        onExpanderReleaseMsChange={controls.onExpanderReleaseMsChange}
        onExpanderRangeDbChange={controls.onExpanderRangeDbChange}
        compressorEnabled={controls.compressorEnabled}
        compressorThreshold={controls.compressorThreshold}
        compressorRatio={controls.compressorRatio}
        compressorAttackMs={controls.compressorAttackMs}
        compressorReleaseMs={controls.compressorReleaseMs}
        compressorKnee={controls.compressorKnee}
        compressorMakeupDb={controls.compressorMakeupDb}
        onCompressorToggle={controls.onCompressorToggle}
        onCompressorThresholdChange={controls.onCompressorThresholdChange}
        onCompressorRatioChange={controls.onCompressorRatioChange}
        onCompressorAttackMsChange={controls.onCompressorAttackMsChange}
        onCompressorReleaseMsChange={controls.onCompressorReleaseMsChange}
        onCompressorKneeChange={controls.onCompressorKneeChange}
        onCompressorMakeupDbChange={controls.onCompressorMakeupDbChange}
        spectralTamingEnabled={controls.spectralTamingEnabled}
        spectralTamingTameAmount={controls.spectralTamingTameAmount}
        spectralTamingRecoverAmount={controls.spectralTamingRecoverAmount}
        spectralTamingSpeed={controls.spectralTamingSpeed}
        onSpectralTamingToggle={controls.onSpectralTamingToggle}
        onSpectralTamingTameAmountChange={
          controls.onSpectralTamingTameAmountChange
        }
        onSpectralTamingRecoverAmountChange={
          controls.onSpectralTamingRecoverAmountChange
        }
        onSpectralTamingSpeedChange={controls.onSpectralTamingSpeedChange}
        levelerEnabled={controls.levelerEnabled}
        levelerTargetLevel={controls.levelerTargetLevel}
        levelerSpeed={controls.levelerSpeed}
        levelerMaxGainDb={controls.levelerMaxGainDb}
        onLevelerToggle={controls.onLevelerToggle}
        onLevelerTargetLevelChange={controls.onLevelerTargetLevelChange}
        onLevelerSpeedChange={controls.onLevelerSpeedChange}
        onLevelerMaxGainDbChange={controls.onLevelerMaxGainDbChange}
        canControl={controls.canControl}
      />
    );
  }

  return (
    <div ref={containerRef}>
      {/* Tab button row */}
      <div className="flex border-t border-white/10 mt-1">
        {tabs.map((tab) => {
          const isActive = activePanel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => toggle(tab.id)}
              className={`flex-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                isActive
                  ? "bg-cosmic-cyan/15 text-cosmic-cyan border-t-2 border-cosmic-cyan -mt-px"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Expandable panel */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          activePanel
            ? activePanel === "audio"
              ? "max-h-[520px] opacity-100"
              : "max-h-[300px] opacity-100"
            : "max-h-0 opacity-0"
        }`}
      >
        {panelContent && (
          <div className="px-2 py-2 border-t border-white/5">
            {panelContent}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Inline RX Panel ─────────────────────────────────────────────────────────

function SlicePanelRxInline({
  stages,
  antennas,
  currentAntenna,
  onAntennaChange,
  gains,
  onGainChange,
  canControl,
}: {
  stages: GainStage[];
  antennas: string[];
  currentAntenna: string | null;
  onAntennaChange: (port: string) => void;
  gains: Record<string, number>;
  onGainChange: (stage: string, value: number) => void;
  canControl: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const classifyToken = (stage: GainStage) =>
    `${stage.name} ${stage.label ?? ""}`
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

  const preampStage =
    stages.find((stage) => {
      const token = classifyToken(stage);
      return token.includes("PREAMP") || token === "PRE";
    }) ?? null;
  const attStage =
    stages.find((stage) => {
      const token = classifyToken(stage);
      return token === "ATT" || token.includes("ATTEN");
    }) ?? null;
  const fineStages = stages.filter(
    (stage) => stage !== preampStage && stage !== attStage,
  );
  const hasFineStages = fineStages.length > 0;

  return (
    <div className="space-y-2">
      {antennas.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">
            Antenna
          </div>
          <div className="flex flex-wrap gap-1">
            {antennas.map((antenna) => {
              const isActive = antenna === currentAntenna;
              return (
                <button
                  key={antenna}
                  type="button"
                  onClick={() => onAntennaChange(antenna)}
                  disabled={!canControl}
                  className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed ${
                      isActive
                        ? "bg-cosmic-cyan/15 border-cosmic-cyan/30 text-cosmic-cyan"
                        : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
                    }`}
                >
                  {antenna}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(preampStage || attStage) && (
        <div className="space-y-2">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">
            Front End
          </div>
          {preampStage && (
            <GainSlider
              stage={preampStage}
              value={gains[preampStage.name] ?? preampStage.min}
              onChange={(v) => onGainChange(preampStage.name, v)}
              disabled={!canControl}
              size="compact"
            />
          )}
          {attStage && (
            <GainSlider
              stage={attStage}
              value={gains[attStage.name] ?? attStage.min}
              onChange={(v) => onGainChange(attStage.name, v)}
              disabled={!canControl}
              size="compact"
            />
          )}
        </div>
      )}

      {hasFineStages && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setShowAdvanced((open) => !open)}
            className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded border bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
          >
            {showAdvanced
              ? "Hide RX Fine Controls"
              : `Show RX Fine Controls (${fineStages.length})`}
          </button>

          {showAdvanced && (
            <div className="space-y-2 pt-0.5">
              {fineStages.map((stage) => (
                <GainSlider
                  key={stage.name}
                  stage={stage}
                  value={gains[stage.name] ?? stage.min}
                  onChange={(v) => onGainChange(stage.name, v)}
                  disabled={!canControl}
                  size="compact"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {stages.length === 0 && (
        <div className="text-[10px] text-gray-600 italic">
          No RX gain stages available
        </div>
      )}
    </div>
  );
}

// ─── Inline X/RIT Panel ─────────────────────────────────────────────────

function SlicePanelXRit({
  rit,
  xit,
  split,
  ifShift,
  cwSpeed,
  currentMode,
  onRitToggle,
  onRitOffset,
  onXitToggle,
  onXitOffset,
  onSplitToggle,
  onIfShift,
  onCwSpeed,
  canControl,
}: {
  rit: { enabled: boolean; offsetHz: number } | undefined;
  xit: { enabled: boolean; offsetHz: number } | undefined;
  split: boolean;
  ifShift: number;
  cwSpeed: number;
  currentMode: string;
  onRitToggle: (enabled: boolean) => void;
  onRitOffset: (offsetHz: number) => void;
  onXitToggle: (enabled: boolean) => void;
  onXitOffset: (offsetHz: number) => void;
  onSplitToggle: (enabled: boolean) => void;
  onIfShift: (hz: number) => void;
  onCwSpeed: (wpm: number) => void;
  canControl: boolean;
}) {
  const ritEnabled = rit?.enabled ?? false;
  const ritOffset = rit?.offsetHz ?? 0;
  const xitEnabled = xit?.enabled ?? false;
  const xitOffset = xit?.offsetHz ?? 0;
  const isCw =
    currentMode.toUpperCase() === "CW" || currentMode.toUpperCase() === "CWR";

  return (
    <div className="space-y-2">
      {/* RIT row */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onRitToggle(!ritEnabled)}
          disabled={!canControl}
          className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors shrink-0
            disabled:opacity-40 disabled:cursor-not-allowed ${
              ritEnabled
                ? "bg-plasma-orange/20 border-plasma-orange/30 text-plasma-orange"
                : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
            }`}
        >
          RIT
        </button>
        <input
          type="range"
          min={-9999}
          max={9999}
          step={10}
          value={ritOffset}
          onChange={(e) => onRitOffset(Number(e.target.value))}
          disabled={!canControl || !ritEnabled}
          className="flex-1 h-1 accent-plasma-orange disabled:opacity-30"
        />
        <span className="text-[10px] font-mono text-gray-400 w-14 text-right tabular-nums">
          {ritOffset >= 0 ? "+" : ""}
          {ritOffset}
        </span>
        {ritEnabled && ritOffset !== 0 && (
          <button
            onClick={() => onRitOffset(0)}
            disabled={!canControl}
            className="text-[9px] text-gray-500 hover:text-gray-300 disabled:opacity-40"
            title="Clear RIT offset"
          >
            CLR
          </button>
        )}
      </div>

      {/* XIT row */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onXitToggle(!xitEnabled)}
          disabled={!canControl}
          className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors shrink-0
            disabled:opacity-40 disabled:cursor-not-allowed ${
              xitEnabled
                ? "bg-cosmic-cyan/20 border-cosmic-cyan/30 text-cosmic-cyan"
                : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
            }`}
        >
          XIT
        </button>
        <input
          type="range"
          min={-9999}
          max={9999}
          step={10}
          value={xitOffset}
          onChange={(e) => onXitOffset(Number(e.target.value))}
          disabled={!canControl || !xitEnabled}
          className="flex-1 h-1 accent-cosmic-cyan disabled:opacity-30"
        />
        <span className="text-[10px] font-mono text-gray-400 w-14 text-right tabular-nums">
          {xitOffset >= 0 ? "+" : ""}
          {xitOffset}
        </span>
        {xitEnabled && xitOffset !== 0 && (
          <button
            onClick={() => onXitOffset(0)}
            disabled={!canControl}
            className="text-[9px] text-gray-500 hover:text-gray-300 disabled:opacity-40"
            title="Clear XIT offset"
          >
            CLR
          </button>
        )}
      </div>

      {/* SPLIT toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSplitToggle(!split)}
          disabled={!canControl}
          className={`flex-1 px-2 py-1 text-[10px] font-bold uppercase rounded border transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed ${
              split
                ? "bg-caution-amber/20 border-caution-amber/30 text-caution-amber"
                : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
            }`}
        >
          SPLIT {split ? "ON" : "OFF"}
        </button>
      </div>

      {/* IF Shift */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 shrink-0 w-7">IF</span>
        <input
          type="range"
          min={-2000}
          max={2000}
          step={10}
          value={ifShift}
          onChange={(e) => onIfShift(Number(e.target.value))}
          disabled={!canControl}
          className="flex-1 h-1 accent-nebula-blue disabled:opacity-30"
        />
        <span className="text-[10px] font-mono text-gray-400 w-14 text-right tabular-nums">
          {ifShift >= 0 ? "+" : ""}
          {ifShift} Hz
        </span>
        {ifShift !== 0 && (
          <button
            onClick={() => onIfShift(0)}
            disabled={!canControl}
            className="text-[9px] text-gray-500 hover:text-gray-300 disabled:opacity-40"
            title="Clear IF shift"
          >
            CLR
          </button>
        )}
      </div>

      {/* CW Speed — only shown in CW modes */}
      {isCw && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 shrink-0 w-7">WPM</span>
          <input
            type="range"
            min={5}
            max={60}
            step={1}
            value={cwSpeed}
            onChange={(e) => onCwSpeed(Number(e.target.value))}
            disabled={!canControl}
            className="flex-1 h-1 accent-signal-green disabled:opacity-30"
          />
          <span className="text-[10px] font-mono text-gray-400 w-8 text-right tabular-nums">
            {cwSpeed}
          </span>
        </div>
      )}
    </div>
  );
}
