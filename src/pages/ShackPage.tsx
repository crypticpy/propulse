/**
 * ShackPage — Station equipment & signal chain management.
 *
 * 7-tab interface: Overview, Radios, Antennas, Feedlines, Accessories, Presets, Performance.
 * Desktop: centered content (max-width 1200px) with horizontal button tabs.
 * Mobile: scrollable pill tabs with stacked content.
 */

import { useState } from "react";
import {
  useActiveRadio,
  useShackStore,
  useUserRadios,
} from "@/stores/shackStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { RadioManager } from "@/components/settings/RadioManager";
import { AntennaManager } from "@/components/shack/AntennaManager";
import { FeedlineManager } from "@/components/shack/FeedlineManager";
import { AccessoryManager } from "@/components/shack/AccessoryManager";
import { PresetBuilder } from "@/components/shack/PresetBuilder";
import { PerformanceDashboard } from "@/components/shack/PerformanceDashboard";
import { BandCapabilityStrip } from "@/components/shack/BandCapabilityStrip";
import { SignalChainDiagram } from "@/components/shack/SignalChainDiagram";
import { useStationPerformance } from "@/hooks/useStationPerformance";

// ─── Tab types ───────────────────────────────────────────────────────────────

type ShackTab =
  | "overview"
  | "radios"
  | "antennas"
  | "feedlines"
  | "accessories"
  | "presets"
  | "performance";

interface TabDef {
  id: ShackTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "radios", label: "Radios" },
  { id: "antennas", label: "Antennas" },
  { id: "feedlines", label: "Feedlines" },
  { id: "accessories", label: "Accessories" },
  { id: "presets", label: "Presets" },
  { id: "performance", label: "Performance" },
];

// ─── Header ─────────────────────────────────────────────────────────────────

function ShackHeader({ isMobile }: { isMobile: boolean }) {
  const activeRadio = useActiveRadio();

  return (
    <div
      className={`flex flex-wrap items-start gap-3 ${isMobile ? "mb-4" : "mb-6"}`}
    >
      <div className="flex-1 min-w-0">
        <h1
          className={`font-bold text-white ${isMobile ? "text-xl" : "text-2xl"}`}
        >
          Shack
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Station equipment &amp; signal chain
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {activeRadio && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-plasma-orange/15 text-plasma-orange">
            {activeRadio.displayName?.trim() ||
              `${activeRadio.manufacturer} ${activeRadio.model}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Overview tab ───────────────────────────────────────────────────────────

function OverviewTab({
  setActiveTab,
}: {
  setActiveTab: (tab: ShackTab) => void;
}) {
  const radios = useShackStore((s) => s.radios);
  const antennas = useShackStore((s) => s.antennas);
  const feedlines = useShackStore((s) => s.feedlines);
  const accessories = useShackStore((s) => s.accessories);
  const activePresetId = useShackStore((s) => s.activePresetId);
  const presets = useShackStore((s) => s.stationPresets);
  const activePreset = presets.find((p) => p.id === activePresetId);
  const userRadios = useUserRadios();
  const performance = useStationPerformance();

  const counts = [
    { label: "Radios", count: radios.length, color: "text-plasma-orange" },
    { label: "Antennas", count: antennas.length, color: "text-signal-green" },
    {
      label: "Feedlines",
      count: feedlines.length,
      color: "text-caution-amber",
    },
    {
      label: "Accessories",
      count: accessories.length,
      color: "text-nebula-blue",
    },
  ];

  const isEmpty = counts.every((c) => c.count === 0);

  const bandLossData = performance.bands.map((b) => ({
    band: b.band,
    lossDb: b.feedlineLossDb,
  }));

  return (
    <div className="space-y-6">
      {/* Equipment count cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {counts.map((item) => (
          <div
            key={item.label}
            className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4 text-center"
          >
            <div className={`text-3xl font-bold ${item.color}`}>
              {item.count}
            </div>
            <div className="text-xs text-gray-400 mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Active preset summary */}
      {activePreset && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">
              Active Preset
            </h3>
            <span className="text-xs text-plasma-orange font-medium">
              {activePreset.name}
            </span>
          </div>
          <div className="text-xs text-gray-400 space-y-1">
            <div>
              Radio:{" "}
              {(() => {
                const r = userRadios.find(
                  (x) => x.userRadio.id === activePreset.radioId,
                );
                return (
                  r?.equipment?.displayName ??
                  r?.equipment?.model ??
                  r?.userRadio.nickname ??
                  "\u2014"
                );
              })()}
            </div>
            <div>
              Antenna:{" "}
              {antennas.find((a) => a.id === activePreset.antennaId)?.name ??
                "\u2014"}
            </div>
            <div>Power: {activePreset.operatingPowerWatts}W</div>
          </div>

          {/* Signal chain diagram */}
          <SignalChainDiagram
            radioName={(() => {
              const r = userRadios.find(
                (x) => x.userRadio.id === activePreset.radioId,
              );
              return (
                r?.equipment?.displayName ??
                r?.equipment?.model ??
                r?.userRadio.nickname ??
                undefined
              );
            })()}
            accessoryNames={accessories
              .filter((a) => activePreset.accessoryIds.includes(a.id))
              .map((a) => a.name)}
            feedlineName={
              feedlines.find((f) => f.id === activePreset.feedlineId)?.name
            }
            antennaName={
              antennas.find((a) => a.id === activePreset.antennaId)?.name
            }
            feedlineLossDb={
              performance.bands.length > 0
                ? performance.bands.reduce(
                    (sum, b) => sum + b.feedlineLossDb,
                    0,
                  ) / performance.bands.length
                : undefined
            }
            accessoryGainDb={
              performance.bands.length > 0
                ? performance.bands[0].accessoryGainDb
                : undefined
            }
          />

          {bandLossData.length > 0 && (
            <BandCapabilityStrip bands={bandLossData} />
          )}
        </div>
      )}

      {/* Guidance when empty */}
      {isEmpty && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6 text-center space-y-3">
          <div className="text-lg font-semibold text-gray-200">
            Build your station
          </div>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Start by adding your radios, antennas, feedlines, and accessories to
            build a complete station profile. This data powers propagation
            predictions, signal chain loss calculations, and performance
            analysis.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {(
              ["radios", "antennas", "feedlines", "accessories"] as ShackTab[]
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 py-1 text-xs rounded-full bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-200 transition-colors capitalize"
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ShackPage() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<ShackTab>("overview");

  // ─── Desktop layout ────────────────────────────────────────────────

  if (!isMobile) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <ShackHeader isMobile={false} />

        {/* Desktop tab bar — horizontal buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30"
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "overview" && (
          <OverviewTab setActiveTab={setActiveTab} />
        )}

        {activeTab === "radios" && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-gray-200 mb-4">
              Radio Fleet
            </h2>
            <RadioManager />
          </div>
        )}

        {activeTab === "antennas" && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            <AntennaManager />
          </div>
        )}

        {activeTab === "feedlines" && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            <FeedlineManager />
          </div>
        )}

        {activeTab === "accessories" && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            <AccessoryManager />
          </div>
        )}

        {activeTab === "presets" && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            <PresetBuilder />
          </div>
        )}

        {activeTab === "performance" && (
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            <PerformanceDashboard />
          </div>
        )}
      </div>
    );
  }

  // ─── Mobile layout ─────────────────────────────────────────────────

  return (
    <div className="px-4 py-4">
      <ShackHeader isMobile={true} />

      {/* Mobile tab bar — scrollable pills */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-3 -mx-4 px-4 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-plasma-orange text-white"
                : "bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab setActiveTab={setActiveTab} />}

      {activeTab === "radios" && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <h2 className="text-base font-semibold text-gray-200 mb-3">
            Radio Fleet
          </h2>
          <RadioManager />
        </div>
      )}

      {activeTab === "antennas" && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <AntennaManager />
        </div>
      )}

      {activeTab === "feedlines" && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <FeedlineManager />
        </div>
      )}

      {activeTab === "accessories" && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <AccessoryManager />
        </div>
      )}

      {activeTab === "presets" && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <PresetBuilder />
        </div>
      )}

      {activeTab === "performance" && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <PerformanceDashboard />
        </div>
      )}
    </div>
  );
}
