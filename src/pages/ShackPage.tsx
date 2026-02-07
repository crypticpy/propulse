/**
 * ShackPage — Station equipment & signal chain management.
 *
 * 7-tab interface: Overview, Radios, Antennas, Feedlines, Accessories, Presets, Performance.
 * Desktop: centered content (max-width 1200px) with horizontal button tabs.
 * Mobile: scrollable pill tabs with stacked content.
 */

import { useState } from "react";
import { useActiveRadio, useShackStore } from "@/stores/shackStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { RadioManager } from "@/components/settings/RadioManager";
import { AntennaManager } from "@/components/shack/AntennaManager";
import { FeedlineManager } from "@/components/shack/FeedlineManager";
import { AccessoryManager } from "@/components/shack/AccessoryManager";
import { PresetBuilder } from "@/components/shack/PresetBuilder";
import { PerformanceDashboard } from "@/components/shack/PerformanceDashboard";

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

function OverviewTab() {
  const radios = useShackStore((s) => s.radios);
  const antennas = useShackStore((s) => s.antennas);
  const feedlines = useShackStore((s) => s.feedlines);
  const accessories = useShackStore((s) => s.accessories);

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
            {["Radios", "Antennas", "Feedlines", "Accessories"].map((tab) => (
              <span
                key={tab}
                className="px-3 py-1 text-xs rounded-full bg-white/5 text-gray-400 border border-white/10"
              >
                {tab}
              </span>
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
        {activeTab === "overview" && <OverviewTab />}

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
      {activeTab === "overview" && <OverviewTab />}

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
