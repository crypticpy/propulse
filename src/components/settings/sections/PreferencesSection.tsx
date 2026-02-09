/**
 * PreferencesSection
 *
 * Standalone section component extracted from SettingsModal's "preferences" tab.
 * Renders all user preference controls organized by category:
 * Display, Accessibility, Map & Globe, Propagation, Forecast Display,
 * Interaction, and Bands.
 *
 * All changes are applied immediately via the user store -- no save button required.
 */

import { useSettingsStore } from "@/stores/settingsStore";
import { FavoredBandsPicker } from "@/components/settings/FavoredBandsPicker";
import { BandPresetManager } from "@/components/settings/BandPresetManager";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  SegmentedButton,
  SectionHeader,
  SettingSelect,
  ConditionalSubSettings,
  SettingSlider,
  SettingRow,
} from "@/components/settings/ui";
import { ANTENNA_TYPES, type AntennaType } from "@/lib/data/antennas";
import type { NoiseEnvironment } from "@/lib/utils/noiseModel";
import type { ColorBlindMode } from "@/lib/themes/colorblind";
import {
  COLOR_BLIND_MODE_NAMES,
  COLOR_BLIND_MODE_DESCRIPTIONS,
} from "@/lib/themes/colorblind";
import {
  ALL_BANDS,
  DEFAULT_SPOT_CLUSTERING,
  DEFAULT_COMPASS_ROSE,
  DEFAULT_SPOT_AGE,
  DEFAULT_UI_INTERACTION,
  DEFAULT_FORECAST_DISPLAY,
  type TextScale,
  type BeamWidthOption,
  type BandId,
} from "@/types/user";

// ─── Noise environment display options ───────────────────────────────────────

const NOISE_ENVIRONMENT_OPTIONS: { value: NoiseEnvironment; label: string }[] =
  [
    { value: "quiet_rural", label: "Quiet Rural" },
    { value: "rural", label: "Rural" },
    { value: "residential", label: "Suburban / Residential" },
    { value: "city", label: "Urban / City" },
  ];

// ─── Spot color mode options ─────────────────────────────────────────────────

const SPOT_COLOR_MODE_OPTIONS: {
  value: "mode" | "band";
  label: string;
}[] = [
  { value: "band", label: "By Band" },
  { value: "mode", label: "By Mode" },
];

// ─── Beam width options for compass rose ─────────────────────────────────────

const BEAM_WIDTH_OPTIONS: { value: BeamWidthOption; label: string }[] = [
  { value: 30, label: "30\u00B0" },
  { value: 45, label: "45\u00B0" },
  { value: 60, label: "60\u00B0" },
  { value: 90, label: "90\u00B0" },
];

// =============================================================================
// PreferencesSection
// =============================================================================

export function PreferencesSection() {
  // Actions (stable references — no re-render on state changes)
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);
  const setColorBlindMode = useSettingsStore((s) => s.setColorBlindMode);
  const setAntennaType = useSettingsStore((s) => s.setAntennaType);
  const setNoiseEnvironment = useSettingsStore((s) => s.setNoiseEnvironment);
  const updateSpotClustering = useSettingsStore((s) => s.updateSpotClustering);
  const updateCompassRose = useSettingsStore((s) => s.updateCompassRose);
  const updateSpotAge = useSettingsStore((s) => s.updateSpotAge);
  const updateForecastDisplay = useSettingsStore(
    (s) => s.updateForecastDisplay,
  );
  const updateUIInteraction = useSettingsStore((s) => s.updateUIInteraction);
  const setHighContrast = useSettingsStore((s) => s.setHighContrast);

  // Individual selectors for derived values (avoids subscribing to full store)
  const timeFormat = useSettingsStore((s) => s.timeFormat ?? "12h");
  const textScale: TextScale = useSettingsStore((s) => s.textScale ?? "md");
  const highContrast = useSettingsStore((s) => s.highContrast ?? false);
  const colorBlindMode: ColorBlindMode = useSettingsStore(
    (s) => s.colorBlindMode ?? "none",
  );
  const spotClustering = useSettingsStore(
    (s) => s.spotClustering ?? DEFAULT_SPOT_CLUSTERING,
  );
  const compassRose = useSettingsStore(
    (s) => s.compassRose ?? DEFAULT_COMPASS_ROSE,
  );
  const spotAge = useSettingsStore((s) => s.spotAge ?? DEFAULT_SPOT_AGE);
  const uiInteraction = useSettingsStore(
    (s) => s.uiInteraction ?? DEFAULT_UI_INTERACTION,
  );
  const spotColorMode = uiInteraction.spotColorMode ?? "mode";
  const showSpotCallsignLabels = uiInteraction.showSpotCallsignLabels ?? true;
  const antennaType: AntennaType = useSettingsStore(
    (s) => s.antennaType ?? "isotropic",
  );
  const noiseEnvironment: NoiseEnvironment = useSettingsStore(
    (s) => s.noiseEnvironment ?? "residential",
  );
  const forecastDisplay = useSettingsStore(
    (s) => s.forecastDisplay ?? DEFAULT_FORECAST_DISPLAY,
  );

  return (
    <div className="space-y-8">
      {/* ── Display ──────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader>Display</SectionHeader>

        {/* Time Format */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Time Format
          </label>
          <SegmentedButton
            options={[
              { value: "24h" as const, label: "24h" },
              { value: "12h" as const, label: "12h" },
            ]}
            value={timeFormat}
            onChange={(v) => updatePreferences({ timeFormat: v })}
          />
        </div>

        {/* Text Scale */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Text Size
            <span className="ml-2 text-xs text-gray-500 font-normal">
              (Accessibility)
            </span>
          </label>
          <SegmentedButton<TextScale>
            options={[
              { value: "sm", label: <span className="text-xs">Small</span> },
              { value: "md", label: "Normal" },
              { value: "lg", label: <span className="text-base">Large</span> },
            ]}
            value={textScale}
            onChange={(v) => updatePreferences({ textScale: v })}
          />
          <p className="text-xs text-gray-500 mt-1">
            Increase text size for better readability. Affects panels and data
            displays.
          </p>
        </div>

        {/* Visual Style */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Visual Style
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Globe and map rendering style
          </p>
          <SegmentedButton
            options={[
              { value: "realistic" as const, label: "Realistic" },
              { value: "high-viz" as const, label: "High-Viz" },
            ]}
            value={uiInteraction.visualStyle ?? "realistic"}
            onChange={(v) => updateUIInteraction({ visualStyle: v })}
          />
        </div>
      </section>

      <div className="border-t border-white/10" />

      {/* ── Accessibility ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader>Accessibility</SectionHeader>

        <SettingSelect
          id="pref-color-blind-mode"
          label="Color Vision Mode"
          description={COLOR_BLIND_MODE_DESCRIPTIONS[colorBlindMode]}
          value={colorBlindMode}
          onChange={(v) => setColorBlindMode(v as ColorBlindMode)}
        >
          {(Object.keys(COLOR_BLIND_MODE_NAMES) as ColorBlindMode[]).map(
            (mode) => (
              <option key={mode} value={mode}>
                {COLOR_BLIND_MODE_NAMES[mode]}
              </option>
            ),
          )}
        </SettingSelect>

        <ToggleSwitch
          label="High Contrast"
          description="Increase contrast for better visibility"
          checked={highContrast}
          onChange={(checked) => setHighContrast(checked)}
        />
      </section>

      <div className="border-t border-white/10" />

      {/* ── Map & Globe ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader>Map &amp; Globe</SectionHeader>

        <ToggleSwitch
          label="Spot Clustering"
          description="Group nearby DX spots together on the globe"
          checked={spotClustering.enabled}
          onChange={(checked) => updateSpotClustering({ enabled: checked })}
        />
        <ConditionalSubSettings show={spotClustering.enabled}>
          <SettingSlider
            id="pref-cluster-grid-size"
            label="Grid Size"
            description="Cell size in degrees for grouping spots"
            value={spotClustering.gridSize}
            min={5}
            max={15}
            onChange={(v) => updateSpotClustering({ gridSize: v })}
          />
          <SettingSlider
            id="pref-cluster-min-size"
            label="Min Cluster Size"
            description="Minimum spots to form a cluster"
            value={spotClustering.minClusterSize}
            min={2}
            max={10}
            onChange={(v) => updateSpotClustering({ minClusterSize: v })}
          />
        </ConditionalSubSettings>

        <ToggleSwitch
          label="Compass Rose"
          description="Show compass rose overlay at your QTH location"
          checked={compassRose.enabled}
          onChange={(checked) => updateCompassRose({ enabled: checked })}
        />
        <ConditionalSubSettings show={compassRose.enabled}>
          <SettingRow label="Beam Width">
            <SegmentedButton<string>
              options={BEAM_WIDTH_OPTIONS.map((o) => ({
                value: String(o.value),
                label: o.label,
              }))}
              value={String(compassRose.beamWidth)}
              onChange={(v) =>
                updateCompassRose({
                  beamWidth: Number(v) as BeamWidthOption,
                })
              }
            />
          </SettingRow>
          <ToggleSwitch
            label="Show Beam Width Wedge"
            checked={compassRose.showBeamWidth}
            onChange={(checked) =>
              updateCompassRose({ showBeamWidth: checked })
            }
          />
        </ConditionalSubSettings>

        <ToggleSwitch
          label="Spot Age Display"
          description="Visual decay for spot markers based on age"
          checked={spotAge.enabled}
          onChange={(checked) => updateSpotAge({ enabled: checked })}
        />
        <ConditionalSubSettings show={spotAge.enabled}>
          <SettingSlider
            id="pref-spot-max-age"
            label="Max Age"
            description="Maximum age before spots are fully faded"
            value={spotAge.maxAgeMinutes}
            min={5}
            max={120}
            step={5}
            formatValue={(v) => `${v} min`}
            onChange={(v) => updateSpotAge({ maxAgeMinutes: v })}
          />
          <ToggleSwitch
            label="Show Age Column"
            description="Display age in DX cluster list"
            checked={spotAge.showAgeColumn}
            onChange={(checked) => updateSpotAge({ showAgeColumn: checked })}
          />
        </ConditionalSubSettings>

        <ToggleSwitch
          label="Callsign Labels"
          description="Show callsign labels on globe spot markers"
          checked={showSpotCallsignLabels}
          onChange={(checked) =>
            updateUIInteraction({ showSpotCallsignLabels: checked })
          }
        />

        <ToggleSwitch
          label="Spotter Labels"
          description="Show spotter callsign on globe spot markers"
          checked={uiInteraction.showSpotterLabels ?? false}
          onChange={(checked) =>
            updateUIInteraction({ showSpotterLabels: checked })
          }
        />

        <SettingSlider
          id="pref-spot-hit-radius"
          label="Spot Click Radius"
          description="Adjust how close you need to click to select a spot"
          value={uiInteraction.spotHitRadiusMultiplier ?? 1.0}
          min={0.5}
          max={2.0}
          step={0.1}
          formatValue={(v) => `${v.toFixed(1)}x`}
          onChange={(v) => updateUIInteraction({ spotHitRadiusMultiplier: v })}
        />

        <SettingSelect
          id="pref-spot-color-mode"
          label="Spot Color Mode"
          description="How spots are color-coded on the globe"
          value={spotColorMode}
          onChange={(v) =>
            updateUIInteraction({ spotColorMode: v as "mode" | "band" })
          }
        >
          {SPOT_COLOR_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SettingSelect>
      </section>

      <div className="border-t border-white/10" />

      {/* ── Propagation ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader>Propagation</SectionHeader>

        <SettingSelect
          id="pref-noise-environment"
          label="Noise Environment"
          description="Affects SNR predictions for band conditions and propagation models. Based on ITU-R P.372 man-made noise levels."
          value={noiseEnvironment}
          onChange={(v) => setNoiseEnvironment(v as NoiseEnvironment)}
        >
          {NOISE_ENVIRONMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SettingSelect>

        <div>
          <SettingSelect
            id="pref-antenna-type"
            label="Antenna Type"
            description="Used for propagation predictions -- affects gain calculations based on path takeoff angle."
            value={antennaType}
            onChange={(v) => setAntennaType(v as AntennaType)}
          >
            {ANTENNA_TYPES.map((ant) => (
              <option key={ant.type} value={ant.type}>
                {ant.name} ({ant.peakGainDbi > 0 ? "+" : ""}
                {ant.peakGainDbi} dBi peak)
              </option>
            ))}
          </SettingSelect>
          {(() => {
            const selected = ANTENNA_TYPES.find((a) => a.type === antennaType);
            if (!selected) return null;
            return (
              <div className="text-xs text-gray-500 mt-2 space-y-0.5 pl-1">
                <p>{selected.description}</p>
                <p className="font-mono">
                  Optimal elevation: {selected.optimalElevationDeg}°
                </p>
              </div>
            );
          })()}
        </div>

        {/* ── Forecast Display ────────────────────────────────────────── */}
        <div className="border-t border-white/10 pt-4 mt-4" />
        <SectionHeader>Forecast Display</SectionHeader>

        <SettingRow label="Band Mode">
          <SegmentedButton<string>
            options={[
              { value: "common", label: "Common" },
              { value: "all", label: "All" },
              { value: "custom", label: "Custom" },
            ]}
            value={forecastDisplay.bandMode}
            onChange={(v) =>
              updateForecastDisplay({
                bandMode: v as "common" | "all" | "custom",
              })
            }
          />
        </SettingRow>
        <ConditionalSubSettings show={forecastDisplay.bandMode === "custom"}>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
            {ALL_BANDS.map((band) => {
              const isSelected = forecastDisplay.customBands.includes(band);
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => {
                    const next = isSelected
                      ? forecastDisplay.customBands.filter(
                          (b: BandId) => b !== band,
                        )
                      : [...forecastDisplay.customBands, band];
                    updateForecastDisplay({ customBands: next });
                  }}
                  className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                    isSelected
                      ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-400 border-white/10 hover:text-gray-200"
                  }`}
                >
                  {band}
                </button>
              );
            })}
          </div>
        </ConditionalSubSettings>

        <ToggleSwitch
          label="Show SNR Values"
          checked={forecastDisplay.showSnrValues}
          onChange={(checked) =>
            updateForecastDisplay({ showSnrValues: checked })
          }
        />

        <ToggleSwitch
          label="Detailed Footer"
          checked={forecastDisplay.detailedFooter}
          onChange={(checked) =>
            updateForecastDisplay({ detailedFooter: checked })
          }
        />

        <SettingRow label="Hours to Show">
          <SegmentedButton<string>
            options={[
              { value: "13", label: "13h" },
              { value: "24", label: "24h" },
            ]}
            value={String(forecastDisplay.hoursToShow)}
            onChange={(v) =>
              updateForecastDisplay({
                hoursToShow: Number(v) as 13 | 24,
              })
            }
          />
        </SettingRow>
      </section>

      <div className="border-t border-white/10" />

      {/* ── Interaction ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader>Interaction</SectionHeader>

        <SettingSlider
          id="pref-hold-duration"
          label="Hold Duration"
          description="Time to hold for context menu"
          value={uiInteraction.holdDurationMs}
          min={300}
          max={2000}
          step={100}
          formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
          onChange={(v) => updateUIInteraction({ holdDurationMs: v })}
        />

        <ToggleSwitch
          label="Auto-Dismiss Flyout"
          checked={uiInteraction.flyoutAutoDismissEnabled}
          onChange={(checked) =>
            updateUIInteraction({ flyoutAutoDismissEnabled: checked })
          }
        />
        <ConditionalSubSettings show={uiInteraction.flyoutAutoDismissEnabled}>
          <SettingSlider
            id="pref-flyout-dismiss-ms"
            label="Dismiss After"
            value={uiInteraction.flyoutAutoDismissMs}
            min={1000}
            max={10000}
            step={500}
            formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
            onChange={(v) => updateUIInteraction({ flyoutAutoDismissMs: v })}
          />
        </ConditionalSubSettings>
      </section>

      <div className="border-t border-white/10" />

      {/* ── Bands ────────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <FavoredBandsPicker />
        <BandPresetManager />
      </section>
    </div>
  );
}
