/**
 * SlicePanelTabs — SmartSDR-style expandable tab panel system for the slice flag.
 *
 * Renders a button row at the bottom of FlexVfoDisplay. Clicking a tab
 * expands a panel below with controls. Only one panel open at a time.
 * Clicking the active tab collapses it.
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { GainStage } from "@/lib/radio/protocol";
import { GainSlider } from "@/components/sdr/primitives/GainSlider";
import { SlicePanelDsp } from "./SlicePanelDsp";
import { SlicePanelFilter } from "./SlicePanelFilter";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SlicePanelId = "dsp" | "filter" | "rx" | "audio" | "xrit";

export interface SlicePanelControlProps {
  canControl: boolean;

  // DSP
  nbEnabled: boolean;
  nrEnabled: boolean;
  agcEnabled: boolean;
  agcMode: number;
  anfEnabled: boolean;
  squelchLevel: number;
  onNbToggle: () => void;
  onNrToggle: () => void;
  onAgcToggle: () => void;
  onAgcModeChange: (mode: number) => void;
  onAnfToggle: () => void;
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

export function SlicePanelTabs({
  controls,
}: {
  controls: SlicePanelControlProps;
}) {
  const [activePanel, setActivePanel] = useState<SlicePanelId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(
    (id: SlicePanelId) => setActivePanel((prev) => (prev === id ? null : id)),
    [],
  );

  // Escape closes the active panel; 1-4 keys toggle panels when
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

      // Number keys 1-4 toggle the tabs (only when no input is focused)
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        e.preventDefault();
        toggle(TABS[idx].id);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activePanel, toggle]);

  let panelContent: ReactNode = null;
  if (activePanel === "dsp") {
    panelContent = (
      <SlicePanelDsp
        nbEnabled={controls.nbEnabled}
        nrEnabled={controls.nrEnabled}
        agcEnabled={controls.agcEnabled}
        agcMode={controls.agcMode}
        anfEnabled={controls.anfEnabled}
        squelchLevel={controls.squelchLevel}
        onNbToggle={controls.onNbToggle}
        onNrToggle={controls.onNrToggle}
        onAgcToggle={controls.onAgcToggle}
        onAgcModeChange={controls.onAgcModeChange}
        onAnfToggle={controls.onAnfToggle}
        onSquelchChange={controls.onSquelchChange}
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
      <SlicePanelAudioInline
        afGainStage={controls.afGainStage}
        gains={controls.gains}
        onGainChange={controls.onGainChange}
        audioEnabled={controls.audioEnabled}
        noiseGateEnabled={controls.noiseGateEnabled}
        noiseGateThreshold={controls.noiseGateThreshold}
        clientNrEnabled={controls.clientNrEnabled}
        clientNrLevel={controls.clientNrLevel}
        onNoiseGateToggle={controls.onNoiseGateToggle}
        onNoiseGateThresholdChange={controls.onNoiseGateThresholdChange}
        onClientNrToggle={controls.onClientNrToggle}
        onClientNrLevelChange={controls.onClientNrLevelChange}
        canControl={controls.canControl}
      />
    );
  }

  return (
    <div ref={containerRef}>
      {/* Tab button row */}
      <div className="flex border-t border-white/10 mt-1">
        {TABS.map((tab) => {
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
          activePanel ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
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
}

// ─── Inline RX Panel ─────────────────────────────────────────────────────────

function SlicePanelRxInline({
  stages,
  gains,
  onGainChange,
  canControl,
}: {
  stages: GainStage[];
  gains: Record<string, number>;
  onGainChange: (stage: string, value: number) => void;
  canControl: boolean;
}) {
  if (stages.length === 0) {
    return (
      <div className="text-[10px] text-gray-600 italic">
        No RX gain stages available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {stages.map((stage) => (
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

// ─── Inline Audio Panel ──────────────────────────────────────────────────────

function nrLevelLabel(level: number): string {
  if (level === 0) return "Off";
  if (level <= 3) return "Mild";
  if (level <= 6) return "Moderate";
  return "Aggressive";
}

function SlicePanelAudioInline({
  afGainStage,
  gains,
  onGainChange,
  audioEnabled,
  noiseGateEnabled,
  noiseGateThreshold,
  clientNrEnabled,
  clientNrLevel,
  onNoiseGateToggle,
  onNoiseGateThresholdChange,
  onClientNrToggle,
  onClientNrLevelChange,
  canControl,
}: {
  afGainStage: GainStage | null;
  gains: Record<string, number>;
  onGainChange: (stage: string, value: number) => void;
  audioEnabled: boolean;
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
  clientNrEnabled: boolean;
  clientNrLevel: number;
  onNoiseGateToggle: (enabled: boolean) => void;
  onNoiseGateThresholdChange: (threshold: number) => void;
  onClientNrToggle: (enabled: boolean) => void;
  onClientNrLevelChange: (level: number) => void;
  canControl: boolean;
}) {
  return (
    <div className="space-y-2">
      {/* AF gain slider */}
      {afGainStage && (
        <GainSlider
          stage={afGainStage}
          value={gains[afGainStage.name] ?? afGainStage.min}
          onChange={(v) => onGainChange(afGainStage.name, v)}
          disabled={!canControl}
          size="compact"
        />
      )}

      {/* Client-side DSP */}
      {!audioEnabled ? (
        <div className="text-[10px] text-gray-600 italic">
          Start audio stream to use DSP
        </div>
      ) : (
        <>
          {/* Noise Gate */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNoiseGateToggle(!noiseGateEnabled)}
              className={`px-1.5 py-0.5 text-[9px] font-semibold rounded border transition-colors ${
                noiseGateEnabled
                  ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                  : "bg-white/5 border-white/10 text-gray-500"
              }`}
            >
              Gate {noiseGateEnabled ? "On" : "Off"}
            </button>
            {noiseGateEnabled && (
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="range"
                  min={-80}
                  max={-20}
                  step={1}
                  value={noiseGateThreshold}
                  onChange={(e) =>
                    onNoiseGateThresholdChange(Number(e.target.value))
                  }
                  className="flex-1 h-1 accent-plasma-orange"
                />
                <span className="text-[9px] font-mono text-gray-400 w-8 text-right">
                  {noiseGateThreshold}
                </span>
              </div>
            )}
          </div>

          {/* Noise Reduction */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onClientNrToggle(!clientNrEnabled)}
              className={`px-1.5 py-0.5 text-[9px] font-semibold rounded border transition-colors ${
                clientNrEnabled
                  ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                  : "bg-white/5 border-white/10 text-gray-500"
              }`}
            >
              NR {clientNrEnabled ? "On" : "Off"}
            </button>
            {clientNrEnabled && (
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={clientNrLevel}
                  onChange={(e) =>
                    onClientNrLevelChange(Number(e.target.value))
                  }
                  className="flex-1 h-1 accent-plasma-orange"
                />
                <span className="text-[9px] font-mono text-gray-400 w-12 text-right">
                  {clientNrLevel} {nrLevelLabel(clientNrLevel)}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
