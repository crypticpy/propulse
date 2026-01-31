/**
 * ViewModeToggle Component
 *
 * Toggle between 3D globe, 2D flat map, and azimuthal equidistant views.
 */

import { useMapStore, type ViewMode } from "@/stores/mapStore";

interface ViewModeToggleProps {
  className?: string;
}

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string; icon: string }> = [
  { value: "globe", label: "Globe", icon: "🌍" },
  { value: "flat", label: "Flat", icon: "🗺️" },
  { value: "azimuthal", label: "Azimuthal", icon: "🎯" },
];

export function ViewModeToggle({ className = "" }: ViewModeToggleProps) {
  const { viewMode, setViewMode } = useMapStore();

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
