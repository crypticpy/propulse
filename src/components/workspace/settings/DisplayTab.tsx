import { useState } from "react";
import { Button } from "@/components/station-ui";
import { HamClockSegmented } from "@/components/map/hamclock/wall/controls";
import { useTextScalePreference } from "@/hooks/useTextScale";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { canvasRulesFor } from "@/lib/workspace/canvasRules";
import { PRESETS } from "@/lib/widgets/heatmap";
import type { HeatMapMetric } from "@/lib/widgets/heatmap";
import type { RailWidth } from "@/lib/workspace/types";
import type { TextScale } from "@/types/user";
import { useActiveWorkspace, useWorkspaceStore, type HeatMapPresetId } from "@/stores/workspaceStore";

const PRESET_OPTIONS: { value: HeatMapPresetId; label: string }[] = PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label.toUpperCase(),
}));

const HEADLINE_RULE_OPTIONS: { value: HeatMapMetric; label: string; detail: string }[] = [
  { value: "ladder", label: "LADDER", detail: "Band Health verdict" },
  { value: "count", label: "BUSIEST", detail: "Most distinct DX" },
  { value: "reporters", label: "REPORTERS", detail: "Most spotters" },
  { value: "ratio", label: "VS BASELINE", detail: "Furthest above normal" },
];

const TEXT_SIZE_OPTIONS: { value: TextScale; label: string }[] = [
  { value: "sm", label: "SMALL" },
  { value: "md", label: "MEDIUM" },
  { value: "lg", label: "LARGE" },
  { value: "xl", label: "EXTRA LARGE" },
];

const WIDTH_OPTIONS: { value: RailWidth; label: string }[] = [
  { value: "narrow", label: "NARROW" },
  { value: "normal", label: "NORMAL" },
  { value: "wide", label: "WIDE" },
];

/** Semantic station tokens only — never a raw hex, never pure white (DS-16, legibility standard). Matches the exact strings the shipped presets already use (`compute.ts`). */
const COLOR_SWATCHES: { value: string; label: string }[] = [
  { value: "rgb(var(--su-muted-rgb))", label: "MUTED" },
  { value: "rgb(var(--su-muted-rgb) / 0.7)", label: "SOFT MUTED" },
  { value: "rgb(var(--su-success-rgb) / 0.5)", label: "SOFT GREEN" },
  { value: "rgb(var(--su-success-rgb))", label: "GREEN" },
  { value: "rgb(var(--su-warning-rgb) / 0.7)", label: "SOFT AMBER" },
  { value: "rgb(var(--su-warning-rgb))", label: "AMBER" },
  { value: "rgb(var(--su-danger-rgb))", label: "RED" },
  { value: "rgb(var(--su-accent-rgb))", label: "ACCENT" },
];

function thresholdBounds(metric: HeatMapMetric): { min: number; max: number; step: number } {
  switch (metric) {
    case "ladder":
      return { min: 0, max: 4, step: 1 };
    case "ratio":
      return { min: -3, max: 3, step: 0.1 };
    default:
      return { min: 0, max: 50, step: 1 };
  }
}

function swatch(color: string) {
  return <span aria-hidden="true" className="workspace-settings-swatch" style={{ background: color }} />;
}

type Section = "heatmap" | "bands" | "layout";

/**
 * DisplayTab (#657, owner round 2): heat-map preset + threshold sliders +
 * per-bucket colour, the headline-rule choice, text size, per-rail width and
 * this workspace's visible bands. Split into three internal sections (a
 * `HamClockSegmented`, not a nested `HamClockTabs`) for the same reason the
 * wall's own `DisplayTab` cut its panel-visibility list: `HamClockDialog`'s
 * body is fixed-height and never scrolls, and all of this together does not
 * fit one screen at once.
 */
export function DisplayTab() {
  const [section, setSection] = useState<Section>("heatmap");
  const workspace = useActiveWorkspace();
  const setHeatMapPreset = useWorkspaceStore((s) => s.setHeatMapPreset);
  const setHeatMapThreshold = useWorkspaceStore((s) => s.setHeatMapThreshold);
  const setHeatMapColor = useWorkspaceStore((s) => s.setHeatMapColor);
  const setHeadlineRule = useWorkspaceStore((s) => s.setHeadlineRule);
  const setVisibleBands = useWorkspaceStore((s) => s.setVisibleBands);
  const setRailWidth = useWorkspaceStore((s) => s.setRailWidth);
  const { textScale, setTextScale } = useTextScalePreference();

  const { heatMap, headlineRule, visibleBands } = workspace.display;
  const preset = PRESETS.find((p) => p.id === heatMap.presetId) ?? PRESETS[0];
  const bounds = thresholdBounds(preset.scale.metric);
  const rules = canvasRulesFor(workspace.canvasType);

  function toggleBand(band: string) {
    setVisibleBands(visibleBands.includes(band) ? visibleBands.filter((b) => b !== band) : [...visibleBands, band]);
  }

  return (
    <div className="su-stack workspace-settings-display">
      <HamClockSegmented
        label="Section"
        hideLabel
        value={section}
        onChange={setSection}
        options={[
          { value: "heatmap", label: "HEAT MAP" },
          { value: "bands", label: "BANDS & RULES" },
          { value: "layout", label: "LAYOUT" },
        ]}
      />

      {section === "heatmap" && (
        <div className="su-stack">
          <HamClockSegmented label="Heat map colours" value={heatMap.presetId} onChange={setHeatMapPreset} options={PRESET_OPTIONS} />
          <div className="su-stack workspace-settings-thresholds">
            {heatMap.thresholds.map((threshold, index) => (
              <div key={index} className="workspace-settings-threshold-row">
                <span className="su-hint">{`Cut ${index + 1}: ${threshold}`}</span>
                <input
                  type="range"
                  min={bounds.min}
                  max={bounds.max}
                  step={bounds.step}
                  value={threshold}
                  aria-label={`Threshold ${index + 1}`}
                  onChange={(event) => setHeatMapThreshold(index, Number(event.target.value))}
                />
                <HamClockSegmented
                  label={`Bucket ${index} colour`}
                  hideLabel
                  value={heatMap.colors[index] ?? COLOR_SWATCHES[0].value}
                  onChange={(value) => setHeatMapColor(index, value)}
                  options={COLOR_SWATCHES.map((option) => ({ ...option, preview: swatch(option.value) }))}
                />
              </div>
            ))}
            {heatMap.colors[heatMap.thresholds.length] && (
              <div className="workspace-settings-threshold-row">
                <span className="su-hint">{`Bucket ${heatMap.thresholds.length + 1} (above the last cut)`}</span>
                <HamClockSegmented
                  label="Top bucket colour"
                  hideLabel
                  value={heatMap.colors[heatMap.thresholds.length]}
                  onChange={(value) => setHeatMapColor(heatMap.thresholds.length, value)}
                  options={COLOR_SWATCHES.map((option) => ({ ...option, preview: swatch(option.value) }))}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {section === "bands" && (
        <div className="su-stack">
          <HamClockSegmented label="Headline rule" value={headlineRule} onChange={setHeadlineRule} options={HEADLINE_RULE_OPTIONS} />
          <div className="workspace-settings-band-grid">
            <p className="su-eyebrow">Visible bands</p>
            <div className="su-inline workspace-settings-band-chips">
              {BAND_ORDER.map((band) => (
                <Button
                  key={band}
                  variant={visibleBands.includes(band) ? "primary" : "secondary"}
                  onClick={() => toggleBand(band)}
                >
                  {band.toUpperCase()}
                </Button>
              ))}
            </div>
            <Button variant="quiet" onClick={() => setVisibleBands([...BAND_ORDER])}>
              ALL BANDS
            </Button>
          </div>
        </div>
      )}

      {section === "layout" && (
        <div className="su-stack">
          <HamClockSegmented label="Text size" value={textScale} onChange={setTextScale} options={TEXT_SIZE_OPTIONS} />
          {rules.rails.map((rail) => {
            const state = workspace.rails.find((r) => r.side === rail.side);
            if (!state) return null;
            const label = `${rail.side.charAt(0).toUpperCase()}${rail.side.slice(1)} rail width`;
            return (
              <HamClockSegmented
                key={rail.side}
                label={label}
                value={state.width}
                onChange={(width) => setRailWidth(rail.side, width)}
                options={WIDTH_OPTIONS}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
