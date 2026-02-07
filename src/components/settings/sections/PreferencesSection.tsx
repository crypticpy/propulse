/**
 * PreferencesSection
 *
 * Standalone section component extracted from SettingsModal's "preferences" tab.
 * Renders all user preference controls organized by category:
 * Display, Accessibility, Map & Globe, Propagation, and Bands.
 *
 * All changes are applied immediately via the user store -- no save button required.
 */

import { useSettingsStore } from "@/stores/settingsStore";
import { FavoredBandsPicker } from "@/components/settings/FavoredBandsPicker";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { ANTENNA_TYPES, type AntennaType } from "@/lib/data/antennas";
import type { NoiseEnvironment } from "@/lib/utils/noiseModel";
import type { ColorBlindMode } from "@/lib/themes/colorblind";
import {
  COLOR_BLIND_MODE_NAMES,
  COLOR_BLIND_MODE_DESCRIPTIONS,
} from "@/lib/themes/colorblind";
import {
  DEFAULT_SPOT_CLUSTERING,
  DEFAULT_COMPASS_ROSE,
  DEFAULT_SPOT_AGE,
  DEFAULT_UI_INTERACTION,
  type TextScale,
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

// ─── Custom select dropdown style (caret arrow) ─────────────────────────────

const SELECT_CARET_STYLE: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.75rem center",
  backgroundSize: "1rem",
};

// ─── Segmented button helper ─────────────────────────────────────────────────

function SegmentedButton<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 p-1 bg-void-black rounded-lg border border-white/10">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-plasma-orange text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Section header helper ───────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
      {children}
    </h3>
  );
}

// ─── Select field helper ─────────────────────────────────────────────────────

function SelectField({
  id,
  label,
  description,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-300 mb-1"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-void-black border border-white/10 text-gray-200 rounded-lg px-3 py-2 text-sm focus:border-plasma-orange/50 focus:outline-none appearance-none cursor-pointer"
        style={SELECT_CARET_STYLE}
      >
        {children}
      </select>
      {description && (
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      )}
    </div>
  );
}

// =============================================================================
// PreferencesSection
// =============================================================================

export function PreferencesSection() {
  const settings = useSettingsStore();
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);
  const setColorBlindMode = useSettingsStore((s) => s.setColorBlindMode);
  const setAntennaType = useSettingsStore((s) => s.setAntennaType);
  const setNoiseEnvironment = useSettingsStore((s) => s.setNoiseEnvironment);
  const updateSpotClustering = useSettingsStore((s) => s.updateSpotClustering);
  const updateCompassRose = useSettingsStore((s) => s.updateCompassRose);
  const updateSpotAge = useSettingsStore((s) => s.updateSpotAge);

  // Derived values with safe defaults
  const timeFormat = settings.timeFormat ?? "12h";
  const textScale: TextScale = settings.textScale ?? "md";
  const colorBlindMode: ColorBlindMode = settings.colorBlindMode ?? "none";
  const spotClustering = settings.spotClustering ?? DEFAULT_SPOT_CLUSTERING;
  const compassRose = settings.compassRose ?? DEFAULT_COMPASS_ROSE;
  const spotAge = settings.spotAge ?? DEFAULT_SPOT_AGE;
  const uiInteraction = settings.uiInteraction ?? DEFAULT_UI_INTERACTION;
  const spotColorMode = uiInteraction.spotColorMode ?? "mode";
  const showSpotCallsignLabels = uiInteraction.showSpotCallsignLabels ?? true;
  const antennaType: AntennaType = settings.antennaType ?? "isotropic";
  const noiseEnvironment: NoiseEnvironment =
    settings.noiseEnvironment ?? "residential";

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
      </section>

      <div className="border-t border-white/10" />

      {/* ── Accessibility ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader>Accessibility</SectionHeader>

        <SelectField
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
        </SelectField>
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

        <ToggleSwitch
          label="Compass Rose"
          description="Show compass rose overlay at your QTH location"
          checked={compassRose.enabled}
          onChange={(checked) => updateCompassRose({ enabled: checked })}
        />

        <ToggleSwitch
          label="Spot Age Display"
          description="Visual decay for spot markers based on age"
          checked={spotAge.enabled}
          onChange={(checked) => updateSpotAge({ enabled: checked })}
        />

        <ToggleSwitch
          label="Callsign Labels"
          description="Show callsign labels on globe spot markers"
          checked={showSpotCallsignLabels}
          onChange={(checked) =>
            updatePreferences({
              uiInteraction: {
                ...uiInteraction,
                showSpotCallsignLabels: checked,
              },
            })
          }
        />

        <SelectField
          id="pref-spot-color-mode"
          label="Spot Color Mode"
          description="How spots are color-coded on the globe"
          value={spotColorMode}
          onChange={(v) =>
            updatePreferences({
              uiInteraction: {
                ...uiInteraction,
                spotColorMode: v as "mode" | "band",
              },
            })
          }
        >
          {SPOT_COLOR_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SelectField>
      </section>

      <div className="border-t border-white/10" />

      {/* ── Propagation ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader>Propagation</SectionHeader>

        <SelectField
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
        </SelectField>

        <div>
          <SelectField
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
          </SelectField>
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
      </section>

      <div className="border-t border-white/10" />

      {/* ── Bands ────────────────────────────────────────────────────────── */}
      <section>
        <FavoredBandsPicker />
      </section>
    </div>
  );
}
