/**
 * ProfileTabBar -- Shared tab navigation for the profile page.
 *
 * Desktop: rectangular tab buttons in a row.
 * Mobile: pill-shaped buttons in a horizontally scrollable row.
 */

export type ProfileTab = "overview" | "locations" | "awards" | "stats";

interface TabDef {
  id: ProfileTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "locations", label: "Locations" },
  { id: "awards", label: "Awards" },
  { id: "stats", label: "Stats" },
];

interface ProfileTabBarProps {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  isMobile: boolean;
}

export function ProfileTabBar({
  activeTab,
  onTabChange,
  isMobile,
}: ProfileTabBarProps) {
  if (isMobile) {
    return (
      <div className="flex gap-2 overflow-x-auto scrollbar-none mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
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
    );
  }

  return (
    <div className="flex gap-2 mb-6">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
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
  );
}
