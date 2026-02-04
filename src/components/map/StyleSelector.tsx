/**
 * StyleSelector Component
 *
 * Compact toggle for visual style ("Realistic" | "High-Viz") and
 * spot color mode ("Mode" | "Band") in the PropSphere controls bar.
 *
 * Reads/writes via the uiInteraction slice of user preferences.
 */

import { useUIInteractionPrefs, useUserStore } from "@/stores/userStore";

// ---------------------------------------------------------------------------
// Inline SVG icons (matches project convention — no external icon library)
// ---------------------------------------------------------------------------

/** Eye icon — represents "Realistic" visual style */
const EyeIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** Zap / bolt icon — represents "High-Viz" visual style */
const ZapIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

/** Palette icon — decorative header for the color-mode row */
const PaletteIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
    <circle cx="6.5" cy="12" r="0.5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.14-.74-.39-1.04-.24-.3-.39-.65-.39-1.04 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.17-4.49-8.92-10-8.92z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StyleSelectorProps {
  className?: string;
  /** Icon-only mode for tight spaces */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StyleSelector({
  className = "",
  compact = false,
}: StyleSelectorProps): JSX.Element {
  const prefs = useUIInteractionPrefs();
  const updatePreferences = useUserStore((s) => s.updatePreferences);

  const currentStyle = prefs.visualStyle ?? "realistic";
  const currentColorMode = prefs.spotColorMode ?? "mode";

  const setVisualStyle = (style: "realistic" | "high-viz") => {
    updatePreferences({
      uiInteraction: {
        ...prefs,
        visualStyle: style,
      },
    });
  };

  const setColorMode = (mode: "mode" | "band") => {
    updatePreferences({
      uiInteraction: {
        ...prefs,
        spotColorMode: mode,
      },
    });
  };

  // -------------------------------------------------------------------------
  // Compact (icon-only) variant
  // -------------------------------------------------------------------------
  if (compact) {
    return (
      <div
        className={`flex flex-row gap-1 rounded-xl bg-white/[0.03] backdrop-blur-md
                     border border-white/10 p-1 ${className}`}
      >
        {/* Visual style toggle */}
        <div className="inline-flex rounded-md bg-white/5 p-0.5">
          <button
            onClick={() => setVisualStyle("realistic")}
            title="Realistic style"
            className={`p-1.5 rounded transition-all ${
              currentStyle === "realistic"
                ? "bg-cosmic-cyan/20 text-cosmic-cyan"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <EyeIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setVisualStyle("high-viz")}
            title="High-Viz style"
            className={`p-1.5 rounded transition-all ${
              currentStyle === "high-viz"
                ? "bg-cosmic-cyan/20 text-cosmic-cyan"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <ZapIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Color mode toggle */}
        <div className="inline-flex rounded-md bg-white/5 p-0.5">
          <button
            onClick={() => setColorMode("mode")}
            title="Color by operating mode (FT8/CW/SSB)"
            className={`p-1.5 rounded transition-all ${
              currentColorMode === "mode"
                ? "bg-cosmic-cyan/20 text-cosmic-cyan"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <PaletteIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setColorMode("band")}
            title="Color by frequency band (20m/40m)"
            className={`p-1.5 rounded transition-all ${
              currentColorMode === "band"
                ? "bg-cosmic-cyan/20 text-cosmic-cyan"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 20h20" />
              <path d="M5 20V8l3-3 3 5 3-7 3 4 3-2v15" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Default (full) variant
  // -------------------------------------------------------------------------
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-xl bg-white/[0.03] backdrop-blur-md
                   border border-white/10 p-2 max-w-[200px] ${className}`}
    >
      {/* --- Visual Style row --- */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 w-10 shrink-0">
          Style
        </span>
        <div className="inline-flex flex-1 rounded-md bg-white/5 p-0.5">
          <button
            onClick={() => setVisualStyle("realistic")}
            title="Realistic: clean, understated markers and colors"
            className={`flex items-center gap-1 flex-1 justify-center px-2 py-1 rounded text-xs font-medium transition-all ${
              currentStyle === "realistic"
                ? "bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30"
                : "text-gray-400 hover:text-white hover:bg-white/10 border border-transparent"
            }`}
          >
            <EyeIcon className="w-3.5 h-3.5" />
            <span>Realistic</span>
          </button>
          <button
            onClick={() => setVisualStyle("high-viz")}
            title="High-Viz: bold colors and larger markers"
            className={`flex items-center gap-1 flex-1 justify-center px-2 py-1 rounded text-xs font-medium transition-all ${
              currentStyle === "high-viz"
                ? "bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30"
                : "text-gray-400 hover:text-white hover:bg-white/10 border border-transparent"
            }`}
          >
            <ZapIcon className="w-3.5 h-3.5" />
            <span>HiViz</span>
          </button>
        </div>
      </div>

      {/* --- Color Mode row --- */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 w-10 shrink-0">
          Color
        </span>
        <div className="inline-flex flex-1 rounded-md bg-white/5 p-0.5">
          <button
            onClick={() => setColorMode("mode")}
            title="Color spots by operating mode (FT8 / CW / SSB)"
            className={`flex items-center gap-1 flex-1 justify-center px-2 py-1 rounded text-xs font-medium transition-all ${
              currentColorMode === "mode"
                ? "bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30"
                : "text-gray-400 hover:text-white hover:bg-white/10 border border-transparent"
            }`}
          >
            <span>Mode</span>
          </button>
          <button
            onClick={() => setColorMode("band")}
            title="Color spots by frequency band (20m / 40m / ...)"
            className={`flex items-center gap-1 flex-1 justify-center px-2 py-1 rounded text-xs font-medium transition-all ${
              currentColorMode === "band"
                ? "bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30"
                : "text-gray-400 hover:text-white hover:bg-white/10 border border-transparent"
            }`}
          >
            <span>Band</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default StyleSelector;
