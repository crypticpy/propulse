/**
 * ViewModeToggle Component
 *
 * Toggle between 3D globe, 2D flat map, and azimuthal equidistant views.
 * Supports compact mode for tight spaces.
 */

import { useMapStore, type ViewMode } from "@/stores/mapStore";

interface ViewModeToggleProps {
  className?: string;
  /** Compact mode for smaller spaces - shows icons only */
  compact?: boolean;
}

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string; icon: string }> = [
  { value: "globe", label: "Globe", icon: "🌍" },
  { value: "flat", label: "Flat", icon: "🗺️" },
  { value: "azimuthal", label: "Azimuthal", icon: "🎯" },
];

export function ViewModeToggle({
  className = "",
  compact = false,
}: ViewModeToggleProps) {
  const { viewMode, setViewMode } = useMapStore();

  if (compact) {
    return (
      <div
        className={`inline-flex rounded-md bg-white/5 p-0.5 border border-white/10 ${className}`}
      >
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setViewMode(option.value)}
            title={option.label}
            className={`
              px-1.5 py-1 rounded text-xs transition-all
              ${
                viewMode === option.value
                  ? "bg-plasma-orange text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              }
            `}
          >
            {option.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex rounded-lg bg-white/5 p-1 border border-white/10 ${className}`}
    >
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => setViewMode(option.value)}
          className={`
            px-4 py-2 rounded-md text-sm font-medium transition-all
            ${
              viewMode === option.value
                ? "bg-plasma-orange text-white shadow-glow-orange"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }
          `}
        >
          <span className="mr-1.5">{option.icon}</span>
          {option.label}
        </button>
      ))}
    </div>
  );
}
