/**
 * Appearance section for Settings page.
 * Wraps the existing AppearanceSettings component with section header,
 * plus a custom hex color disclosure section for power users.
 */

import { useState, useCallback, useEffect } from "react";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { useThemeStore } from "@/stores/themeStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { THEMES, type ThemeId } from "@/lib/themes";

// ─── Hex validation ─────────────────────────────────────────────────────────

const HEX_3 = /^#[0-9A-Fa-f]{3}$/;
const HEX_6 = /^#[0-9A-Fa-f]{6}$/;

function isValidHex(value: string): boolean {
  return HEX_3.test(value) || HEX_6.test(value);
}

/** Expand shorthand #RGB to #RRGGBB */
function normalizeHex(hex: string): string {
  if (HEX_3.test(hex)) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AppearanceSection() {
  const customPrimary = useThemeStore((s) => s.customPrimary);
  const customSecondary = useThemeStore((s) => s.customSecondary);
  const setCustomColors = useThemeStore((s) => s.setCustomColors);
  const setAccent = useThemeStore((s) => s.setAccent);
  const themeId = useThemeStore((s) => s.themeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const sdrWaterfallPalette = useSettingsStore((s) => s.sdrWaterfallPalette);
  const tickerPosition = useSettingsStore((s) => s.tickerPosition);
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);

  // Local form state for hex inputs
  const [primaryHex, setPrimaryHex] = useState(customPrimary ?? "#ff6b35");
  const [secondaryHex, setSecondaryHex] = useState(
    customSecondary ?? "#00ff88",
  );
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);

  // Sync local state when store changes externally (e.g., settings backup import)
  useEffect(() => {
    setPrimaryHex(customPrimary ?? "#ff6b35");
    setSecondaryHex(customSecondary ?? "#00ff88");
  }, [customPrimary, customSecondary]);

  const handleApply = useCallback(() => {
    let hasError = false;

    if (!isValidHex(primaryHex)) {
      setPrimaryError("Invalid hex (#RGB or #RRGGBB)");
      hasError = true;
    } else {
      setPrimaryError(null);
    }

    if (!isValidHex(secondaryHex)) {
      setSecondaryError("Invalid hex (#RGB or #RRGGBB)");
      hasError = true;
    } else {
      setSecondaryError(null);
    }

    if (hasError) return;

    setCustomColors(normalizeHex(primaryHex), normalizeHex(secondaryHex));
  }, [primaryHex, secondaryHex, setCustomColors]);

  const handleReset = useCallback(() => {
    setPrimaryHex("#ff6b35");
    setSecondaryHex("#00ff88");
    setPrimaryError(null);
    setSecondaryError(null);
    // Reset to the default "plasma" preset
    setAccent("plasma");
  }, [setAccent]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Accent Color
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Choose a color theme for the interface
        </p>
        <AppearanceSettings />
      </div>

      {/* Custom Colors disclosure */}
      <details className="mt-4">
        <summary className="text-sm font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none">
          Custom Colors
        </summary>
        <div className="mt-3 space-y-3">
          {/* Accent color (primary) */}
          <div>
            <label
              htmlFor="custom-primary-hex"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Accent Color
            </label>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full border border-white/20 shrink-0"
                style={{
                  backgroundColor: isValidHex(primaryHex)
                    ? normalizeHex(primaryHex)
                    : "#333",
                }}
              />
              <input
                id="custom-primary-hex"
                type="text"
                value={primaryHex}
                onChange={(e) => {
                  setPrimaryHex(e.target.value);
                  setPrimaryError(null);
                }}
                placeholder="#ff6b35"
                maxLength={7}
                className="w-28 px-2 py-1.5 text-sm bg-void-black border border-white/10 rounded-lg text-gray-200 placeholder-gray-600 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>
            {primaryError && (
              <p className="text-xs text-alert-red mt-1">{primaryError}</p>
            )}
          </div>

          {/* Background tint (secondary) */}
          <div>
            <label
              htmlFor="custom-secondary-hex"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Secondary Color
            </label>
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full border border-white/20 shrink-0"
                style={{
                  backgroundColor: isValidHex(secondaryHex)
                    ? normalizeHex(secondaryHex)
                    : "#333",
                }}
              />
              <input
                id="custom-secondary-hex"
                type="text"
                value={secondaryHex}
                onChange={(e) => {
                  setSecondaryHex(e.target.value);
                  setSecondaryError(null);
                }}
                placeholder="#00ff88"
                maxLength={7}
                className="w-28 px-2 py-1.5 text-sm bg-void-black border border-white/10 rounded-lg text-gray-200 placeholder-gray-600 focus:border-plasma-orange/50 focus:outline-none"
              />
            </div>
            {secondaryError && (
              <p className="text-xs text-alert-red mt-1">{secondaryError}</p>
            )}
          </div>

          {/* Apply + Reset */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleApply}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30 hover:bg-plasma-orange/30 transition-colors"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-400 border border-white/10 hover:text-gray-200 hover:border-white/20 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </details>

      <div className="border-t border-white/10 pt-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Theme
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Choose a base theme for the interface
        </p>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((theme) => {
            const isActive = themeId === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => setTheme(theme.id as ThemeId)}
                className={`relative px-4 py-3 rounded-lg text-left transition-colors border ${
                  isActive
                    ? "bg-plasma-orange/15 border-plasma-orange/40 text-white"
                    : "bg-void-black border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                    style={{ backgroundColor: theme.colors.bgPrimary }}
                  />
                  <span className="text-sm font-medium">{theme.name}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                  {theme.description}
                </p>
                {isActive && (
                  <span className="absolute top-2 right-2 text-plasma-orange text-xs">
                    &#10003;
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/10 pt-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          SDR Waterfall
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Controls the color palette used by the SDR Console waterfall and
          spectrum.
        </p>
        <div className="max-w-sm">
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Palette
          </label>
          <select
            value={sdrWaterfallPalette}
            onChange={(e) =>
              updatePreferences({
                sdrWaterfallPalette: e.target
                  .value as typeof sdrWaterfallPalette,
              })
            }
            className="w-full px-3 py-2 bg-void-black border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30"
          >
            <option value="classic">
              Classic (black→blue→cyan→yellow→red)
            </option>
            <option value="viridis">Viridis</option>
            <option value="magma">Magma</option>
            <option value="gray">Grayscale</option>
          </select>
        </div>
      </div>

      <div className="border-t border-white/10 pt-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          News Ticker
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Position of the live DX news ticker showing propagation data, weather
          alerts, and lightning proximity.
        </p>
        <div className="max-w-sm">
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Position
          </label>
          <select
            value={tickerPosition}
            onChange={(e) =>
              updatePreferences({
                tickerPosition: e.target.value as
                  | "bottom"
                  | "above-panels"
                  | "top",
              })
            }
            className="w-full px-3 py-2 bg-void-black border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30"
          >
            <option value="bottom">Below map (default)</option>
            <option value="above-panels">Above map &amp; panels</option>
            <option value="top">Top — below masthead</option>
          </select>
        </div>
      </div>

      {/* Live Preview */}
      <div className="border-t border-white/10 pt-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Preview
        </h3>
        <div className="bg-void-black rounded-xl border border-white/10 p-4 space-y-3">
          <div
            className="h-1 w-16 rounded-full"
            style={{ backgroundColor: "var(--theme-accent-primary)" }}
          />
          <p className="text-sm text-gray-300">Sample panel content</p>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-5 rounded-full relative"
              style={{ backgroundColor: "var(--theme-accent-primary)" }}
            >
              <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5" />
            </div>
            <span className="text-xs text-gray-400">Active setting</span>
          </div>
          <button
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ backgroundColor: "var(--theme-accent-primary)" }}
          >
            Sample Button
          </button>
        </div>
      </div>
    </div>
  );
}
