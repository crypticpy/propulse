/**
 * ShackPage — Station equipment & signal chain management.
 *
 * 3-view design: Builder (default), Inventory, Analysis.
 * Desktop: centered content (max-width 1200px) with segmented control.
 * Mobile: stacked with horizontally scrollable segmented control.
 */

import { useState } from "react";
import { useActiveRadio } from "@/stores/shackStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { RadioManager } from "@/components/settings/RadioManager";
import { AntennaManager } from "@/components/shack/AntennaManager";
import { FeedlineManager } from "@/components/shack/FeedlineManager";
import { AccessoryManager } from "@/components/shack/AccessoryManager";
import { InlineComponentManager } from "@/components/shack/InlineComponentManager";
import { PerformanceDashboard } from "@/components/shack/PerformanceDashboard";
import { WhatIfSimulator } from "@/components/shack/WhatIfSimulator";
import { PresetComparison } from "@/components/shack/PresetComparison";
import { StationBuilderLab } from "@/components/shack/builder/StationBuilderLab";

// ─── View & Tab types ────────────────────────────────────────────────────────

type ShackView = "builder" | "inventory" | "analysis";

type InventoryTab =
  | "radios"
  | "antennas"
  | "feedlines"
  | "accessories"
  | "inline";

interface ViewDef {
  id: ShackView;
  label: string;
  subtitle: string;
}

const VIEWS: ViewDef[] = [
  { id: "builder", label: "Builder", subtitle: "Station Builder Lab" },
  { id: "inventory", label: "Inventory", subtitle: "Equipment Inventory" },
  { id: "analysis", label: "Analysis", subtitle: "Performance Analysis" },
];

interface InventoryTabDef {
  id: InventoryTab;
  label: string;
}

const INVENTORY_TABS: InventoryTabDef[] = [
  { id: "radios", label: "Radios" },
  { id: "antennas", label: "Antennas" },
  { id: "feedlines", label: "Feedlines" },
  { id: "accessories", label: "Accessories" },
  { id: "inline", label: "Inline" },
];

// ─── Header ─────────────────────────────────────────────────────────────────

function ShackHeader({
  isMobile,
  subtitle,
}: {
  isMobile: boolean;
  subtitle: string;
}) {
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
        <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
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

// ─── View Switcher (segmented control) ───────────────────────────────────────

function ViewSwitcher({
  activeView,
  onChangeView,
}: {
  activeView: ShackView;
  onChangeView: (view: ShackView) => void;
}) {
  return (
    <div className="inline-flex bg-white/5 rounded-xl p-1 overflow-x-auto scrollbar-none">
      {VIEWS.map((view) => (
        <button
          key={view.id}
          onClick={() => onChangeView(view.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            activeView === view.id
              ? "bg-plasma-orange/15 text-plasma-orange"
              : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

// ─── Inventory View ──────────────────────────────────────────────────────────

function InventoryView({ isMobile }: { isMobile: boolean }) {
  const [activeTab, setActiveTab] = useState<InventoryTab>("radios");

  const padding = isMobile ? "p-4" : "p-6";

  return (
    <div className="space-y-4">
      {/* Inventory tab bar */}
      <div
        className={`flex gap-2 ${isMobile ? "overflow-x-auto scrollbar-none -mx-4 px-4" : "flex-wrap"}`}
      >
        {INVENTORY_TABS.map((tab) => (
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
      {activeTab === "radios" && (
        <div
          className={`bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl ${padding}`}
        >
          <h2
            className={`${isMobile ? "text-base" : "text-lg"} font-semibold text-gray-200 mb-${isMobile ? "3" : "4"}`}
          >
            Radio Fleet
          </h2>
          <RadioManager />
        </div>
      )}

      {activeTab === "antennas" && (
        <div
          className={`bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl ${padding}`}
        >
          <AntennaManager />
        </div>
      )}

      {activeTab === "feedlines" && (
        <div
          className={`bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl ${padding}`}
        >
          <FeedlineManager />
        </div>
      )}

      {activeTab === "accessories" && (
        <div
          className={`bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl ${padding}`}
        >
          <AccessoryManager />
        </div>
      )}

      {activeTab === "inline" && (
        <div
          className={`bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl ${padding}`}
        >
          <InlineComponentManager />
        </div>
      )}
    </div>
  );
}

// ─── Analysis View ───────────────────────────────────────────────────────────

function AnalysisView({ isMobile }: { isMobile: boolean }) {
  const padding = isMobile ? "p-4" : "p-6";
  const spacing = isMobile ? "space-y-4" : "space-y-6";

  return (
    <div className={spacing}>
      <div
        className={`bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl ${padding}`}
      >
        <PerformanceDashboard />
      </div>
      <div
        className={`bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl ${padding}`}
      >
        <WhatIfSimulator />
      </div>
      <div
        className={`bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl ${padding}`}
      >
        <PresetComparison />
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ShackPage() {
  const isMobile = useIsMobile();
  const [activeView, setActiveView] = useState<ShackView>("builder");

  const currentViewDef = VIEWS.find((v) => v.id === activeView) ?? VIEWS[0];

  // ─── Desktop layout ────────────────────────────────────────────────

  if (!isMobile) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <ShackHeader isMobile={false} subtitle={currentViewDef.subtitle} />

        {/* View switcher */}
        <div className="mb-6">
          <ViewSwitcher activeView={activeView} onChangeView={setActiveView} />
        </div>

        {/* View content */}
        {activeView === "builder" && <StationBuilderLab />}
        {activeView === "inventory" && <InventoryView isMobile={false} />}
        {activeView === "analysis" && <AnalysisView isMobile={false} />}
      </div>
    );
  }

  // ─── Mobile layout ─────────────────────────────────────────────────

  return (
    <div className="px-4 py-4">
      <ShackHeader isMobile={true} subtitle={currentViewDef.subtitle} />

      {/* View switcher */}
      <div className="mb-4 overflow-x-auto scrollbar-none -mx-4 px-4">
        <ViewSwitcher activeView={activeView} onChangeView={setActiveView} />
      </div>

      {/* View content */}
      {activeView === "builder" && <StationBuilderLab />}
      {activeView === "inventory" && <InventoryView isMobile={true} />}
      {activeView === "analysis" && <AnalysisView isMobile={true} />}
    </div>
  );
}
