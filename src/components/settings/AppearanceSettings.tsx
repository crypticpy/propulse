/**
 * AppearanceSettings
 *
 * Accent color picker for the Settings modal.
 * Renders the 8 accent presets from the theme library as selectable swatches.
 * Selecting a preset calls `useThemeStore().setAccent()` which updates CSS custom
 * properties via `applyThemeToDocument()`, instantly re-theming every Tailwind
 * utility that references `plasma-orange` or `signal-green`.
 */

import { useThemeStore } from "@/stores/themeStore";
import { ACCENT_PRESETS } from "@/lib/themes";

export function AppearanceSettings() {
  const accentId = useThemeStore((s) => s.accentId);
  const setAccent = useThemeStore((s) => s.setAccent);

  return (
    <div className="space-y-6">
      {/* Accent Color */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Accent Color
        </h3>
        <p className="text-xs text-gray-500">
          Choose an accent palette. This changes the primary and secondary
          highlight colors throughout the app.
        </p>

        <div className="grid grid-cols-4 gap-3">
          {ACCENT_PRESETS.map((preset) => {
            const isActive = accentId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setAccent(preset.id)}
                aria-pressed={isActive}
                className={`
                  group flex flex-col items-center gap-2 p-3 rounded-xl
                  border transition-all duration-200
                  ${
                    isActive
                      ? "border-white/40 bg-white/10 ring-2 ring-white/20"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                  }
                `}
              >
                {/* Dual-color swatch */}
                <div className="relative w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/10">
                  {/* Primary half (left) */}
                  <div
                    className="absolute inset-0 w-1/2"
                    style={{ backgroundColor: preset.primary }}
                  />
                  {/* Secondary half (right) */}
                  <div
                    className="absolute inset-0 left-1/2 w-1/2"
                    style={{ backgroundColor: preset.secondary }}
                  />
                  {/* Active check overlay */}
                  {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <svg
                        className="w-4 h-4 text-white drop-shadow-md"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Preset name */}
                <span
                  className={`text-[11px] font-medium leading-tight text-center ${
                    isActive
                      ? "text-white"
                      : "text-gray-400 group-hover:text-gray-300"
                  }`}
                >
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Info note */}
      <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">How it works:</strong> Accent colors
          are applied globally via CSS custom properties. All panels, buttons,
          and highlights that use the primary and secondary accent colors will
          update instantly.
        </p>
      </div>
    </div>
  );
}
