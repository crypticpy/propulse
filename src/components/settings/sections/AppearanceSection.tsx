/**
 * Appearance section for Settings page.
 * Wraps the existing AppearanceSettings component with section header,
 * plus a custom hex color disclosure section for power users.
 */

import { useState, useCallback, useEffect, useId } from "react";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useThemeStore } from "@/stores/themeStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { THEMES, type ThemeId } from "@/lib/themes";
import type { SdrSkinName } from "@/components/sdr/skins/types";
import {
  TICKER_COVERAGE_PRESETS,
  type TickerCoverageArea,
} from "@/lib/map/tickerCoverage";

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
  const tickerPositionId = useId();
  const tickerCoverageId = useId();
  const customPrimary = useThemeStore((s) => s.customPrimary);
  const customSecondary = useThemeStore((s) => s.customSecondary);
  const setCustomColors = useThemeStore((s) => s.setCustomColors);
  const setAccent = useThemeStore((s) => s.setAccent);
  const themeId = useThemeStore((s) => s.themeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const sdrSkinName = useSettingsStore((s) => s.sdrSkinName ?? "classic");
  const tickerPosition = useSettingsStore((s) => s.tickerPosition);
  const tickerCoverageArea = useSettingsStore(
    (s) => s.tickerCoverageArea ?? "regional",
  );
  const globeHiResTextures = useSettingsStore((s) => s.globeHiResTextures);
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

      <div className="border-t border-white/10" />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          SDR Display Settings
        </h3>
        <p className="text-sm text-gray-500">
          Spectrum, waterfall, and passband display settings have moved to the
          SDR Console. Open the SDR Console and click the gear icon to
          configure.
        </p>
      </section>

      <div className="border-t border-white/10 pt-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          SDR Console Skin
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Choose a layout for the SDR Console page. Classic is the original
          2-column layout. Flexible is a full-viewport layout inspired by
          FlexRadio SmartSDR (desktop only).
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              {
                id: "classic" as SdrSkinName,
                name: "Classic",
                desc: "Card-based 2-column layout with controls on the left and waterfall on the right.",
              },
              {
                id: "flexible" as SdrSkinName,
                name: "Flexible",
                desc: "Full-viewport SDR interface with spectrum scope, waterfall, S-meter, and side controls.",
              },
              {
                id: "fate" as SdrSkinName,
                name: "F8 (Fate)",
                desc: "Purpose-built FT8/FT4 decode interface with band activity table and directed messages.",
              },
            ] as const
          ).map((skin) => {
            const isActive = sdrSkinName === skin.id;
            return (
              <button
                key={skin.id}
                type="button"
                onClick={() => updatePreferences({ sdrSkinName: skin.id })}
                className={`relative px-4 py-3 rounded-lg text-left transition-colors border ${
                  isActive
                    ? "bg-plasma-orange/15 border-plasma-orange/40 text-white"
                    : "bg-void-black border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200"
                }`}
              >
                <div className="text-sm font-medium">{skin.name}</div>
                <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                  {skin.desc}
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
          News Ticker
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Position of the live DX news ticker showing propagation data, weather
          alerts, and lightning proximity.
        </p>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={tickerPositionId}
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Position
            </label>
            <select
              id={tickerPositionId}
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
          <div>
            <label
              htmlFor={tickerCoverageId}
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Weather &amp; lightning area
            </label>
            <select
              id={tickerCoverageId}
              value={tickerCoverageArea}
              onChange={(e) =>
                updatePreferences({
                  tickerCoverageArea: e.target.value as TickerCoverageArea,
                })
              }
              className="w-full px-3 py-2 bg-void-black border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30"
            >
              {Object.entries(TICKER_COVERAGE_PRESETS).map(([value, preset]) => (
                <option key={value} value={value}>
                  {preset.label} — {preset.lightningKm} km lightning /{" "}
                  {preset.weatherKm} km weather
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] leading-4 text-gray-500">
              Centered on your station. Solar indices, space weather, and DX
              activity remain global and live.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 pt-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Map Imagery
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          The globe and flat map ship with web-size NASA Blue Marble imagery.
          Opt in to the full-resolution version for sharper close-up zoom.
        </p>
        <ToggleSwitch
          checked={globeHiResTextures}
          onChange={(checked) =>
            updatePreferences({ globeHiResTextures: checked })
          }
          label="High-resolution Blue Marble (5400×2700)"
          description="Downloads the current month's texture (~2.5 MB) from the PropPulse CDN for supported satellite views. Display quality controls how aggressively it is rendered. Cached by the browser; no effect offline."
        />
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
