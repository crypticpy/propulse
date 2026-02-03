/**
 * LiteModeToggle Component
 *
 * Toggle button for switching between Default and Lite viewing modes.
 * Lite mode collapses all panels into slim pill/tag views for more globe space.
 */

import { useMapStore } from "@/stores/mapStore";

interface LiteModeToggleProps {
  className?: string;
}

export function LiteModeToggle({ className = "" }: LiteModeToggleProps) {
  const { isLiteMode, toggleLiteMode } = useMapStore();

  return (
    <button
      onClick={toggleLiteMode}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl
                  ${
                    isLiteMode
                      ? "bg-cosmic-cyan/20 border-cosmic-cyan/40 text-cosmic-cyan"
                      : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                  }
                  backdrop-blur-md border transition-all duration-200 group ${className}`}
      title={isLiteMode ? "Switch to Default View" : "Switch to Lite View"}
    >
      {/* Icon - shows expand/collapse state */}
      <svg
        className={`w-4 h-4 transition-transform duration-200 ${
          isLiteMode ? "" : "rotate-180"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        {isLiteMode ? (
          // Expand icon (panels are collapsed)
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
          />
        ) : (
          // Collapse icon (panels are expanded)
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
          />
        )}
      </svg>

      {/* Label */}
      <span className="text-sm font-medium">
        {isLiteMode ? "Lite" : "Default"}
      </span>

      {/* Status indicator dot */}
      <div
        className={`w-1.5 h-1.5 rounded-full transition-colors ${
          isLiteMode ? "bg-cosmic-cyan" : "bg-gray-500"
        }`}
      />
    </button>
  );
}

export default LiteModeToggle;
