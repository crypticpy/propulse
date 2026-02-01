/**
 * ViewModeToggle Component
 *
 * Toggle between 3D globe, 2D flat map, and azimuthal equidistant views.
 * Uses clear SVG icons with text labels for better identification.
 */

import { useMapStore, type ViewMode } from "@/stores/mapStore";

interface ViewModeToggleProps {
  className?: string;
  /** Compact mode for smaller spaces */
  compact?: boolean;
}

// SVG icons for each view mode
const GlobeIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="12" cy="12" r="10" />
    <ellipse cx="12" cy="12" rx="10" ry="4" />
    <path d="M12 2v20" />
  </svg>
);

const FlatIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <rect x="3" y="5" width="18" height="14" rx="1" />
    <path d="M3 10h18" />
    <path d="M8 5v14" />
    <path d="M16 5v14" />
  </svg>
);

const AzimuthalIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v4" />
    <path d="M12 18v4" />
    <path d="M2 12h4" />
    <path d="M18 12h4" />
  </svg>
);

const VIEW_OPTIONS: Array<{
  value: ViewMode;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    value: "globe",
    label: "3D Globe",
    shortLabel: "Globe",
    icon: GlobeIcon,
    description: "Interactive 3D globe view",
  },
  {
    value: "flat",
    label: "2D Map",
    shortLabel: "Flat",
    icon: FlatIcon,
    description: "Traditional flat map projection",
  },
  {
    value: "azimuthal",
    label: "Azimuthal",
    shortLabel: "Az",
    icon: AzimuthalIcon,
    description: "Centered on your QTH - beam headings are straight lines",
  },
];

export function ViewModeToggle({
  className = "",
  compact = false,
}: ViewModeToggleProps) {
  const { viewMode, setViewMode } = useMapStore();

  if (compact) {
    // Icons-only in compact mode for space efficiency
    return (
      <div
        className={`inline-flex rounded-md bg-white/5 p-0.5 border border-white/10 ${className}`}
      >
        {VIEW_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = viewMode === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setViewMode(option.value)}
              title={`${option.label}: ${option.description}`}
              className={`
                p-1.5 rounded transition-all
                ${
                  isActive
                    ? "bg-plasma-orange text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/10"
                }
              `}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex rounded-lg bg-nebula-blue/50 p-1 border border-white/10 ${className}`}
    >
      {VIEW_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            onClick={() => setViewMode(option.value)}
            title={option.description}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
              ${
                viewMode === option.value
                  ? "bg-plasma-orange text-white shadow-glow-orange"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }
            `}
          >
            <Icon className="w-5 h-5" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
