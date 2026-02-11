/**
 * ShackPage -- Station equipment, signal path diagram, and performance analysis.
 *
 * 3-tab flat design: Equipment (default), Diagram, Performance.
 * Desktop: centered content (max-width 1200px) with segmented control.
 * Mobile: stacked with horizontally scrollable segmented control.
 */

import { useState } from "react";
import { useShackStore } from "@/stores/shackStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { EquipmentSection } from "@/components/shack/EquipmentSection";
import { DiagramSection } from "@/components/shack/DiagramSection";
import { PerformanceSection } from "@/components/shack/PerformanceSection";
import { HelpTooltip } from "@/components/help/HelpTooltip";

// ---- View types -------------------------------------------------------------

type ShackView = "equipment" | "diagram" | "performance";

interface ViewDef {
  id: ShackView;
  label: string;
  subtitle: string;
}

const VIEWS: ViewDef[] = [
  { id: "equipment", label: "Equipment", subtitle: "Station Equipment" },
  { id: "diagram", label: "Diagram", subtitle: "Signal Path Diagram" },
  { id: "performance", label: "Performance", subtitle: "Performance Analysis" },
];

// ---- Header -----------------------------------------------------------------

function ShackHeader({
  isMobile,
  subtitle,
}: {
  isMobile: boolean;
  subtitle: string;
}) {
  const radioCount = useShackStore((s) => s.radios.length);
  const antennaCount = useShackStore((s) => s.antennas.length);
  const feedlineCount = useShackStore((s) => s.feedlines.length);
  const accessoryCount = useShackStore((s) => s.accessories.length);
  const inlineCount = useShackStore((s) => s.inlineComponents.length);

  const totalCount =
    radioCount + antennaCount + feedlineCount + accessoryCount + inlineCount;

  return (
    <div
      className={`flex flex-wrap items-start gap-3 ${isMobile ? "mb-4" : "mb-6"}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h1
            className={`font-bold text-white ${isMobile ? "text-xl" : "text-2xl"}`}
          >
            My Shack
          </h1>
          <HelpTooltip
            section="radio-shack"
            tooltip="Learn more about My Shack"
          />
        </div>
        <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
      </div>

      {totalCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-gray-400">
            {totalCount} item{totalCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ---- View Switcher (segmented control) --------------------------------------

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

// ---- Main Page --------------------------------------------------------------

export default function ShackPage() {
  const isMobile = useIsMobile();
  const [activeView, setActiveView] = useState<ShackView>("equipment");

  const currentViewDef = VIEWS.find((v) => v.id === activeView) ?? VIEWS[0];

  // ---- Desktop layout ----
  if (!isMobile) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <ShackHeader isMobile={false} subtitle={currentViewDef.subtitle} />

        {/* View switcher */}
        <div className="mb-6">
          <ViewSwitcher activeView={activeView} onChangeView={setActiveView} />
        </div>

        {/* View content */}
        {activeView === "equipment" && <EquipmentSection />}
        {activeView === "diagram" && (
          <DiagramSection
            onNavigateToEquipment={() => setActiveView("equipment")}
          />
        )}
        {activeView === "performance" && <PerformanceSection />}
      </div>
    );
  }

  // ---- Mobile layout ----
  return (
    <div className="px-4 py-4">
      <ShackHeader isMobile={true} subtitle={currentViewDef.subtitle} />

      {/* View switcher */}
      <div className="mb-4 overflow-x-auto scrollbar-none -mx-4 px-4">
        <ViewSwitcher activeView={activeView} onChangeView={setActiveView} />
      </div>

      {/* View content */}
      {activeView === "equipment" && <EquipmentSection />}
      {activeView === "diagram" && (
        <DiagramSection
          onNavigateToEquipment={() => setActiveView("equipment")}
        />
      )}
      {activeView === "performance" && <PerformanceSection />}
    </div>
  );
}
