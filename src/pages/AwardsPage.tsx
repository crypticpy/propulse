/**
 * AwardsPage — Tabbed award tracking dashboard
 *
 * Route: /awards
 * Tabs: DXCC | WAS | WAZ
 *
 * Displays progress toward three major amateur radio awards with
 * color-coded grids and filtering capabilities.
 */

import { useState, useCallback } from "react";
import { useDetailedAwardProgress } from "@/hooks/useAwardProgress";
import { DxccGrid } from "@/components/awards/DxccGrid";
import { WasMap } from "@/components/awards/WasMap";
import { WazGrid } from "@/components/awards/WazGrid";
import { useContestStore } from "@/stores/contestStore";
import { ContestContributions } from "@/components/awards/ContestContributions";

// ─── Tab Types ─────────────────────────────────────────────────────────────

type AwardTab = "dxcc" | "was" | "waz";

const TABS: Array<{ id: AwardTab; label: string; description: string }> = [
  {
    id: "dxcc",
    label: "DXCC",
    description: "DX Century Club — Work 100+ countries",
  },
  {
    id: "was",
    label: "WAS",
    description: "Worked All States — Contact all 50 US states",
  },
  {
    id: "waz",
    label: "WAZ",
    description: "Worked All Zones — Contact all 40 CQ zones",
  },
];

// ─── Component ─────────────────────────────────────────────────────────────

export function AwardsPage() {
  const [activeTab, setActiveTab] = useState<AwardTab>("dxcc");
  const { progress, isLoading } = useDetailedAwardProgress();
  const sessionHistory = useContestStore((s) => s.sessionHistory);
  const hasContestData = sessionHistory.some((s) => s.qsos.length > 0);

  const handleTabChange = useCallback((tab: AwardTab) => {
    setActiveTab(tab);
  }, []);

  // Keyboard navigation for tabs
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let nextIndex = index;
      if (e.key === "ArrowRight") {
        nextIndex = (index + 1) % TABS.length;
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        nextIndex = (index - 1 + TABS.length) % TABS.length;
        e.preventDefault();
      }
      if (nextIndex !== index) {
        handleTabChange(TABS[nextIndex].id);
        // Focus the new tab button
        const btn = document.getElementById(`award-tab-${TABS[nextIndex].id}`);
        btn?.focus();
      }
    },
    [handleTabChange],
  );

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Award Tracking</h1>
        <p className="text-gray-400 text-sm mt-1">
          Track your progress toward DXCC, WAS, and WAZ awards
        </p>
      </div>

      {/* Tab Navigation */}
      <div
        className="flex border-b border-gray-800 mb-6"
        role="tablist"
        aria-label="Award categories"
      >
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.id;
          // Get quick count for tab badge
          let badgeText = "";
          if (progress) {
            switch (tab.id) {
              case "dxcc":
                badgeText = `${progress.dxcc.workedCount}/${progress.dxcc.totalEntities}`;
                break;
              case "was":
                badgeText = `${progress.was.workedCount}/${progress.was.totalStates}`;
                break;
              case "waz":
                badgeText = `${progress.waz.workedCount}/${progress.waz.totalZones}`;
                break;
            }
          }

          return (
            <button
              key={tab.id}
              id={`award-tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`award-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`
                relative px-4 py-3 text-sm font-medium transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:ring-inset
                ${
                  isActive
                    ? "text-plasma-orange"
                    : "text-gray-400 hover:text-gray-200"
                }
              `}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {badgeText && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? "bg-plasma-orange/20 text-plasma-orange"
                        : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {badgeText}
                  </span>
                )}
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-plasma-orange rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      <p className="text-gray-500 text-sm mb-4">
        {TABS.find((t) => t.id === activeTab)?.description}
      </p>

      {/* Contest contributions banner */}
      {hasContestData && <ContestContributions className="mb-4" />}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-gray-400 text-sm">
            Loading logbook entries...
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !progress && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-3 text-gray-600">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="mx-auto"
            >
              <path d="M12 15l-2 5l9-11h-5l2-5l-9 11h5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-300 mb-1">
            No QSOs logged yet
          </h2>
          <p className="text-gray-500 text-sm max-w-md">
            Log your first contacts in the Logbook to start tracking your
            progress toward DXCC, WAS, and WAZ awards.
          </p>
        </div>
      )}

      {/* Tab Panels */}
      {!isLoading && progress && (
        <>
          <div
            id="award-panel-dxcc"
            role="tabpanel"
            aria-labelledby="award-tab-dxcc"
            hidden={activeTab !== "dxcc"}
          >
            {activeTab === "dxcc" && (
              <DxccGrid
                slots={progress.dxcc.slots}
                totalEntities={progress.dxcc.totalEntities}
                workedCount={progress.dxcc.workedCount}
                confirmedCount={progress.dxcc.confirmedCount}
                neededCount={progress.dxcc.neededCount}
              />
            )}
          </div>

          <div
            id="award-panel-was"
            role="tabpanel"
            aria-labelledby="award-tab-was"
            hidden={activeTab !== "was"}
          >
            {activeTab === "was" && (
              <WasMap
                slots={progress.was.slots}
                totalStates={progress.was.totalStates}
                workedCount={progress.was.workedCount}
                confirmedCount={progress.was.confirmedCount}
                neededCount={progress.was.neededCount}
              />
            )}
          </div>

          <div
            id="award-panel-waz"
            role="tabpanel"
            aria-labelledby="award-tab-waz"
            hidden={activeTab !== "waz"}
          >
            {activeTab === "waz" && (
              <WazGrid
                slots={progress.waz.slots}
                totalZones={progress.waz.totalZones}
                workedCount={progress.waz.workedCount}
                confirmedCount={progress.waz.confirmedCount}
                neededCount={progress.waz.neededCount}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AwardsPage;
