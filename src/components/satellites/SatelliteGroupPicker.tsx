/**
 * SatelliteGroupPicker -- Collapsible panel for enabling/disabling
 * additional Celestrak TLE satellite groups.
 *
 * Default: only "Amateur Radio" group enabled (locked, cannot be disabled).
 * Users can opt in to additional groups like weather, cubesat, education, etc.
 * Groups are organized by category (core, science, utility).
 */

import { useState } from "react";
import {
  AVAILABLE_SATELLITE_GROUPS,
  useSatelliteGroupStore,
} from "@/stores/satelliteGroupStore";
import type { SatelliteGroupInfo } from "@/stores/satelliteGroupStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Category display order and labels */
const CATEGORY_ORDER = ["core", "science", "utility"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core",
  science: "Science",
  utility: "Utility",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Toggle switch matching the SatelliteCard design */
function GroupToggle({
  enabled,
  locked,
  onToggle,
}: {
  enabled: boolean;
  locked?: boolean;
  onToggle: () => void;
}) {
  if (locked) {
    return (
      <div className="flex items-center gap-1.5">
        <svg
          className="w-3.5 h-3.5 text-su-muted"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    );
  }

  return (
    <button
      onClick={onToggle}
      aria-label={enabled ? "Disable group" : "Enable group"}
      aria-pressed={enabled}
      className="relative flex-shrink-0 w-[36px] h-[20px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/50"
      style={{
        backgroundColor: enabled
          ? "rgba(34, 197, 94, 0.4)"
          : "rgba(255, 255, 255, 0.1)",
      }}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[16px] h-[16px] rounded-full transition-transform duration-200 ${
          enabled
            ? "translate-x-[16px] bg-signal-green"
            : "translate-x-0 bg-su-line"
        }`}
      />
    </button>
  );
}

/** Single group row */
function GroupRow({ group }: { group: SatelliteGroupInfo }) {
  const isEnabled = useSatelliteGroupStore((s) => s.isGroupEnabled(group.id));
  const enableGroup = useSatelliteGroupStore((s) => s.enableGroup);
  const disableGroup = useSatelliteGroupStore((s) => s.disableGroup);
  const isLocked = group.id === "amateur";

  const handleToggle = () => {
    if (isLocked) return;
    if (isEnabled) {
      disableGroup(group.id);
    } else {
      enableGroup(group.id);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-su-text truncate">
            {group.label}
          </span>
        </div>
        <p className="text-xs text-su-muted break-words">
          {group.description}
        </p>
      </div>
      <GroupToggle
        enabled={isEnabled}
        locked={isLocked}
        onToggle={handleToggle}
      />
    </div>
  );
}

/** Category section */
function CategorySection({
  category,
  groups,
}: {
  category: string;
  groups: SatelliteGroupInfo[];
}) {
  return (
    <div className="bg-su-line/10 border border-su-line/20 rounded-lg px-3 py-2">
      <div className="text-xs font-bold uppercase tracking-wider text-su-muted mb-1">
        {CATEGORY_LABELS[category] ?? category}
      </div>
      <div className="divide-y divide-su-line/20">
        {groups.map((group) => (
          <GroupRow key={group.id} group={group} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SatelliteGroupPicker() {
  const [isExpanded, setIsExpanded] = useState(false);
  const enabledGroups = useSatelliteGroupStore((s) => s.enabledGroups);
  const resetDefaults = useSatelliteGroupStore((s) => s.resetDefaults);

  // Group available groups by category
  const groupedByCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    groups: AVAILABLE_SATELLITE_GROUPS.filter((g) => g.category === cat),
  })).filter((entry) => entry.groups.length > 0);

  const enabledCount = enabledGroups.length;
  const hasNonDefault = enabledCount > 1 || !enabledGroups.includes("amateur");

  return (
    <div className="bg-su-line/10 border border-su-line/20 rounded-xl">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/50 rounded-xl"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-su-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <span className="text-sm font-medium text-su-text">
            Satellite Sources
          </span>
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-su-line/20 text-su-muted border border-su-line/40">
            {enabledCount}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-su-muted transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-su-muted">
            Expand your satellite database with additional Celestrak groups.
            Default: Amateur Radio only.
          </p>

          {/* Category sections */}
          {groupedByCategory.map(({ category, groups }) => (
            <CategorySection
              key={category}
              category={category}
              groups={groups}
            />
          ))}

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-su-muted">
              Additional groups may increase load time. Data refreshes every 4-6
              hours.
            </p>
            {hasNonDefault && (
              <button
                onClick={resetDefaults}
                className="text-xs text-su-muted hover:text-plasma-orange transition-colors whitespace-nowrap"
              >
                Reset to Default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
