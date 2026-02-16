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
import { SlicePanelDsp } from "./SlicePanelDsp";
import { SlicePanelFilter } from "./SlicePanelFilter";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SlicePanelId = "dsp" | "filter" | "rx" | "audio";

export interface SlicePanelControlProps {
  canControl: boolean;

  // DSP
  nbEnabled: boolean;
  nrEnabled: boolean;
  agcEnabled: boolean;
  onNbToggle: () => void;
  onNrToggle: () => void;
  onAgcToggle: () => void;

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
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS: { id: SlicePanelId; label: string }[] = [
  { id: "dsp", label: "DSP" },
  { id: "filter", label: "FILT" },
  { id: "rx", label: "RX" },
  { id: "audio", label: "AUD" },
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
        onNbToggle={controls.onNbToggle}
        onNrToggle={controls.onNrToggle}
        onAgcToggle={controls.onAgcToggle}
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

const DISCRETE_STAGES = new Set(["PREAMP", "ATT"]);
const DISCRETE_STEPS = [
  { label: "Off", value: 0 },
  { label: "10dB", value: 10 },
  { label: "20dB", value: 20 },
];

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
      {stages.map((stage) => {
        const val = gains[stage.name] ?? stage.min;

        if (DISCRETE_STAGES.has(stage.name)) {
          return (
            <div key={stage.name} className="space-y-0.5">
              <span className="text-[10px] text-gray-500">
                {stage.label ?? stage.name}
              </span>
              <div className="flex gap-1">
                {DISCRETE_STEPS.map((step) => (
                  <button
                    key={step.value}
                    onClick={() => onGainChange(stage.name, step.value)}
                    disabled={!canControl}
                    className={`flex-1 px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed ${
                        val === step.value
                          ? "bg-signal-green/15 text-signal-green border-signal-green/30"
                          : "bg-white/5 text-gray-500 border-white/10 hover:bg-white/10"
                      }`}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={stage.name} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">
                {stage.label ?? stage.name}
              </span>
              <span className="text-[10px] text-gray-200 font-mono">
                {stage.max <= 1 ? Math.round(val * 100) + "%" : val}
              </span>
            </div>
            <input
              type="range"
              min={stage.min}
              max={stage.max}
              step={stage.step}
              value={val}
              onChange={(e) => onGainChange(stage.name, Number(e.target.value))}
              disabled={!canControl}
              className="w-full h-1 accent-cosmic-cyan disabled:opacity-40"
            />
          </div>
        );
      })}
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
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">
              {afGainStage.label ?? "AF"}
            </span>
            <span className="text-[10px] text-gray-200 font-mono">
              {afGainStage.max <= 1
                ? Math.round((gains[afGainStage.name] ?? 0) * 100) + "%"
                : (gains[afGainStage.name] ?? afGainStage.min)}
            </span>
          </div>
          <input
            type="range"
            min={afGainStage.min}
            max={afGainStage.max}
            step={afGainStage.step}
            value={gains[afGainStage.name] ?? afGainStage.min}
            onChange={(e) =>
              onGainChange(afGainStage.name, Number(e.target.value))
            }
            disabled={!canControl}
            className="w-full h-1 accent-cosmic-cyan disabled:opacity-40"
          />
        </div>
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
