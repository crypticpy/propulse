/**
 * ProfileTabBar -- Shared tab navigation for the profile page.
 *
 * Desktop: rectangular tab buttons in a row.
 * Mobile: pill-shaped buttons in a horizontally scrollable row.
 */

import { useRef } from "react";

export type ProfileTab =
  | "overview"
  | "locations"
  | "awards"
  | "stats"
  | "social";

interface TabDef {
  id: ProfileTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "locations", label: "Locations" },
  { id: "awards", label: "Awards" },
  { id: "stats", label: "Stats" },
  { id: "social", label: "Social" },
];

interface ProfileTabBarProps {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  isMobile: boolean;
  rankColor?: string;
}

export function ProfileTabBar({
  activeTab,
  onTabChange,
  isMobile,
  rankColor,
}: ProfileTabBarProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = TABS.findIndex((t) => t.id === activeTab);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = TABS[(currentIndex + 1) % TABS.length];
      onTabChange(next.id);
      tabRefs.current.get(next.id)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = TABS[(currentIndex - 1 + TABS.length) % TABS.length];
      onTabChange(prev.id);
      tabRefs.current.get(prev.id)?.focus();
    }
  };

  if (isMobile) {
    return (
      <div className="relative mb-4">
        <div
          className="flex gap-2 overflow-x-auto scrollbar-none pr-6"
          role="tablist"
          aria-label="Profile sections"
          onKeyDown={handleKeyDown}
          style={{
            maskImage:
              "linear-gradient(to right, black calc(100% - 24px), transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, black calc(100% - 24px), transparent)",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              id={`profile-tab-${tab.id}`}
              aria-controls={`profile-tabpanel-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none ${
                activeTab === tab.id
                  ? "bg-plasma-orange text-white"
                  : "bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10"
              }`}
              style={
                activeTab === tab.id && rankColor
                  ? { backgroundColor: rankColor }
                  : undefined
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex gap-2 mb-6"
      role="tablist"
      aria-label="Profile sections"
      onKeyDown={handleKeyDown}
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => {
            if (el) tabRefs.current.set(tab.id, el);
            else tabRefs.current.delete(tab.id);
          }}
          role="tab"
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          id={`profile-tab-${tab.id}`}
          aria-controls={`profile-tabpanel-${tab.id}`}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none ${
            activeTab === tab.id
              ? rankColor
                ? "border text-white"
                : "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30"
              : "text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent"
          }`}
          style={
            activeTab === tab.id && rankColor
              ? {
                  backgroundColor: `${rankColor}20`,
                  color: rankColor,
                  borderColor: `${rankColor}40`,
                }
              : undefined
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
