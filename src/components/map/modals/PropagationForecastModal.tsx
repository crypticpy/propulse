/**
 * PropagationForecastModal Component
 *
 * Expanded modal view of the 24-hour propagation forecast.
 * Shows larger heatmap, best window recommendations, and educational content.
 */

import { useEffect, useMemo, useState } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { NowCastBandPanel } from "@/components/propagation/NowCastBandPanel";
import { HF_MODEL_BANDS } from "@/lib/propagation/coreFeatureBuilder";
import type { NowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";
import {
  getForecastStatusColor,
  type HourlyForecast,
  type BestWindow,
} from "@/lib/utils/bands";
import { useSettingsStore } from "@/stores/settingsStore";

interface PropagationForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  forecast: HourlyForecast[];
  bestWindows: BestWindow[];
  currentHour: number;
  kp: number;
  sfi: number;
  stationCallsign: string;
  targetName: string;
  /** Live ML NowCast for the same path, shown alongside the physics forecast. */
  nowCast?: NowCastBandPredictions;
  /** Operator's selected mode, used for the personalized probability row. */
  mode?: string;
  stationLabel?: string;
  locationLabel?: string;
}

// Bands to display (top to bottom - high bands first)
const DISPLAY_BANDS = [
  "10m",
  "12m",
  "15m",
  "17m",
  "20m",
  "30m",
  "40m",
  "80m",
  "160m",
];

// Modal SVG dimensions (larger). `CHART_WIDTH_BASE` is the chart width at
// the default 16px root font size; `chartGeometry()` scales it up with the
// operator's Text Size setting so the heat-map's SNR labels keep fitting
// their cells instead of being hidden past `md` (see `snrLabelFits` below).
const CHART_WIDTH_BASE = 600;
const CHART_HEIGHT = 300;
// `MARGIN.top` is the *base* (unscaled) top margin. The chart's actual top
// margin at render time is `chartTopMargin(rootFontPx)`, which never goes
// below this but grows past it once the NOW label needs more room than
// this fits (see that function below). `right`/`bottom`/`left` aren't
// touched by any of this -- they don't interact with `text-xs` labels the
// way the NOW label does.
const MARGIN = { top: 28, right: 16, bottom: 32, left: 48 };

const ROOT_FONT_PX_DEFAULT = 16;
// Tailwind's `text-xs` is 0.75rem at every root size, so this stays a
// constant multiplier of whatever the computed root font size is.
const TEXT_XS_REM = 0.75;
const CHAR_WIDTH_EM = 0.6; // rough per-character advance for a monospace numeral
/**
 * Clearance so a label flush against the fit line isn't chosen. 3px rather
 * than a hairline margin, since two labels only 0.73px apart still read as
 * touching at typical screen densities.
 */
const LABEL_FIT_MARGIN_PX = 3;
/**
 * Fixed vertical offset (in SVG px) from the chart's top margin up to the
 * flat top edge of the current-time triangle. This is a graphic dimension
 * -- the triangle itself doesn't grow with Text Size -- unlike the NOW
 * label positioned above it, which does.
 */
const NOW_TRIANGLE_TOP_OFFSET_PX = 12;
/**
 * Approximate cap-height of a `text-xs` label as a fraction of its font
 * size. Used only to reserve enough vertical clearance above/below the
 * label -- SVG text has no layout-time metrics to measure exactly, so this
 * is a deliberately rough but scale-aware stand-in.
 */
const LABEL_CAP_HEIGHT_EM = 0.7;
/**
 * Gap between the NOW label's bottom edge and the top of the current-time
 * triangle, as a fraction of the label's own font size (not a fixed px
 * value) so the two stay visibly separated as Text Size grows instead of
 * the fixed-size triangle eating into a shrinking share of the label.
 */
const NOW_LABEL_GAP_EM = 1 / 3;

/**
 * Chart width and per-hour cell width at a given computed root font size.
 *
 * Scaling the chart *proportionally* with the root font size (round 2's
 * approach) doesn't actually help: both the cell width and the label width
 * grow at the same rate, so their ratio -- and therefore the fit -- never
 * changes. A 3-character SNR value (most readings, since `bands.ts` clamps
 * to [-30, -5]) needs `3 * 0.6 * (rootFontPx * 0.75)` px plus
 * `LABEL_FIT_MARGIN_PX` of clearance; proportional scaling stays short of
 * that at every one of the app's text scales.
 *
 * Cells are sized from the *widest label they need to hold* instead: each
 * cell is at least wide enough for a 3-character label plus a full
 * `2 * LABEL_FIT_MARGIN_PX` of clearance (double `snrLabelFits`'s own
 * margin, so the fit check below always has slack to spare), falling back
 * to the proportionally-scaled width on the rare chance that's ever wider.
 * `chartWidth` is then rebuilt from that cell width so `viewBox` and the
 * SVG's `width` attribute stay equal (one SVG user unit is exactly one CSS
 * pixel). The heat map's container is `overflow-x-auto`, so a wider chart
 * scrolls instead of overflowing. Pure so it is unit-testable without
 * rendering the SVG.
 */
export function chartGeometry(rootFontPx: number): {
  chartWidth: number;
  cellWidth: number;
  marginTop: number;
  cellHeight: number;
} {
  const proportionalCellWidth =
    (CHART_WIDTH_BASE * (rootFontPx / ROOT_FONT_PX_DEFAULT) -
      MARGIN.left -
      MARGIN.right) /
    24;
  const fontSizePx = rootFontPx * TEXT_XS_REM;
  const charWidthPx = fontSizePx * CHAR_WIDTH_EM;
  const widestLabelPx = 3 * charWidthPx; // "-30".."-10": the widest SNR readings
  const cellWidth = Math.max(
    proportionalCellWidth,
    widestLabelPx + 2 * LABEL_FIT_MARGIN_PX,
  );
  const chartWidth = MARGIN.left + MARGIN.right + 24 * cellWidth;
  const marginTop = chartTopMargin(rootFontPx);
  const cellHeight =
    (CHART_HEIGHT - marginTop - MARGIN.bottom) / DISPLAY_BANDS.length;
  return { chartWidth, cellWidth, marginTop, cellHeight };
}

/**
 * Top margin for the chart at a given computed root font size.
 *
 * Round 5 fix (#870 finding 2): the NOW label sits `nowLabelY(rootFontPx)`
 * px above the current-time triangle, inside the fixed `MARGIN.top` band of
 * space above the grid. The label is `text-xs`, so it grows with the root
 * font size while the triangle (a fixed graphic) and a fixed top margin do
 * not -- past roughly an 18px root the label's top edge clips off the top
 * of the SVG. The margin now grows with the label's own font size so
 * there's always room for the triangle's fixed offset, the label's full
 * cap height, the label-to-triangle gap, and a `LABEL_FIT_MARGIN_PX` worth
 * of clearance to the SVG's own top edge -- and never shrinks below the
 * original 28px base.
 */
function chartTopMargin(rootFontPx: number): number {
  const fontSizePx = rootFontPx * TEXT_XS_REM;
  const capHeightPx = fontSizePx * LABEL_CAP_HEIGHT_EM;
  const gapPx = fontSizePx * NOW_LABEL_GAP_EM;
  const required =
    NOW_TRIANGLE_TOP_OFFSET_PX + gapPx + capHeightPx + LABEL_FIT_MARGIN_PX;
  return Math.max(MARGIN.top, required);
}

/**
 * Whether `value`'s rendered `text-xs` label fits inside a chart cell
 * `cellWidthPx` wide, given the page's current computed root font size in
 * pixels. Pure and exported so the arithmetic is unit-testable without
 * rendering the SVG (jsdom computes no layout, so a real measurement is not
 * available here). Replaces the old `CELL_WIDTH > 20 && CELL_HEIGHT > 20`
 * gate, which was built from two module-level constants and so was always
 * `true` -- a compile-time constant that gated nothing.
 */
export function snrLabelFits(
  value: number,
  cellWidthPx: number,
  rootFontPx: number = ROOT_FONT_PX_DEFAULT,
): boolean {
  const fontSizePx = rootFontPx * TEXT_XS_REM;
  const charWidthPx = fontSizePx * CHAR_WIDTH_EM;
  const labelWidthPx = String(value).length * charWidthPx;
  return labelWidthPx + LABEL_FIT_MARGIN_PX <= cellWidthPx;
}

/**
 * Vertical center for the "NOW" label above the current-time arrow, paired
 * with `dominantBaseline="central"` in the markup below.
 *
 * Round 5 fix (#870 finding 2): at the default 16px root this used to place
 * the label's center only 6px above the triangle's flat top edge, while the
 * centered 12px label's own glyphs occupy roughly 8px of vertical space --
 * so the label sat on top of the triangle instead of above it, worse as
 * Text Size grows. The label is now anchored `NOW_LABEL_GAP_EM` of its own
 * font size above the triangle's top edge (not a fixed px gap), and
 * `chartTopMargin` grows in lockstep so the label's top edge never clips
 * off the top of the SVG either.
 */
export function nowLabelY(rootFontPx: number): number {
  const fontSizePx = rootFontPx * TEXT_XS_REM;
  const capHeightPx = fontSizePx * LABEL_CAP_HEIGHT_EM;
  const gapPx = fontSizePx * NOW_LABEL_GAP_EM;
  const marginTop = chartTopMargin(rootFontPx);
  return marginTop - NOW_TRIANGLE_TOP_OFFSET_PX - gapPx - capHeightPx / 2;
}

/**
 * Format hour for display
 */
function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

/**
 * Format hour range
 */
function formatHourRange(start: number, end: number): string {
  if (start === end) {
    return `${formatHour(start)}z`;
  }
  return `${start.toString().padStart(2, "0")}:00 - ${(end + 1).toString().padStart(2, "0")}:00z`;
}

/**
 * Get status label with proper casing
 */
function getStatusLabel(
  status: "excellent" | "good" | "fair" | "poor" | "closed",
): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function PropagationForecastModal({
  isOpen,
  onClose,
  forecast,
  bestWindows,
  currentHour,
  kp,
  sfi,
  stationCallsign,
  targetName,
  nowCast,
  mode,
  stationLabel,
  locationLabel,
}: PropagationForecastModalProps) {
  const textScale = useSettingsStore((s) => s.textScale ?? "md");
  // The value used for layout math is the browser's actual computed root
  // font size, not `textScale` itself, so a user's browser default other
  // than 16px is honored even at the app's default `md` setting (Settings
  // -> Text Size leaves the root font unset there). `textScale` still
  // triggers a re-read (and the effect re-reads on `isOpen` too, for a
  // caller that keeps this modal mounted while closed), but a
  // `MutationObserver` on `data-text-scale` is what actually keeps the
  // value correct: descendant effects run before `useTextScale()`'s own
  // effect applies that attribute to `<html>`, so a persisted `lg`/`xl`
  // preference reads as 16px on the first pass here and, since `textScale`
  // itself never changes again for an already-hydrated store, a
  // `[textScale]`-only effect would never get a second chance to fix it.
  const [rootFontPx, setRootFontPx] = useState(ROOT_FONT_PX_DEFAULT);
  useEffect(() => {
    const measureRootFontPx = () => {
      const parsed = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      setRootFontPx(Number.isFinite(parsed) ? parsed : ROOT_FONT_PX_DEFAULT);
    };
    measureRootFontPx();

    if (typeof MutationObserver === "undefined") {
      return;
    }
    const observer = new MutationObserver(measureRootFontPx);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-text-scale"],
    });
    return () => observer.disconnect();
  }, [isOpen, textScale]);

  const { chartWidth, cellWidth, marginTop, cellHeight } = useMemo(
    () => chartGeometry(rootFontPx),
    [rootFontPx],
  );

  // Group best windows by quality
  const windowsByQuality = useMemo(() => {
    const excellent = bestWindows.filter((w) => w.peakStatus === "excellent");
    const good = bestWindows.filter((w) => w.peakStatus === "good");
    const fair = bestWindows.filter((w) => w.peakStatus === "fair");
    return { excellent, good, fair };
  }, [bestWindows]);

  // Find current best band (right now)
  const currentBestBand = useMemo(() => {
    if (forecast.length === 0) {
      return null;
    }
    const currentData = forecast[currentHour];
    if (!currentData) {
      return null;
    }

    let best = null;
    let bestSnr = -40;

    for (const band of currentData.bands) {
      if (band.snrEstimate > bestSnr && band.status !== "closed") {
        bestSnr = band.snrEstimate;
        best = band;
      }
    }

    return best;
  }, [forecast, currentHour]);

  // Determine day/night recommendation
  const timeOfDayTip = useMemo(() => {
    const dayBands = ["10m", "12m", "15m", "17m", "20m"];
    const nightBands = ["40m", "80m", "160m"];

    const hasDayOpening = bestWindows.some(
      (w) =>
        dayBands.includes(w.band) &&
        (w.peakStatus === "excellent" || w.peakStatus === "good"),
    );
    const hasNightOpening = bestWindows.some(
      (w) =>
        nightBands.includes(w.band) &&
        (w.peakStatus === "excellent" || w.peakStatus === "good"),
    );

    if (hasDayOpening && hasNightOpening) {
      return "This path has both day and night opportunities. Higher bands (10-20m) work best during daylight hours, while lower bands (40-160m) excel at night.";
    } else if (hasDayOpening) {
      return "This path favors daytime operation. Focus on 10-20m during daylight hours for best results.";
    } else if (hasNightOpening) {
      return "This path favors nighttime operation. Lower bands (40-160m) will provide the most reliable contacts after dark.";
    }
    return "Challenging conditions for this path. Consider trying different times or waiting for improved solar conditions.";
  }, [bestWindows]);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="24-Hour Propagation Forecast"
      subtitle={`${stationCallsign} to ${targetName}`}
      size="xl"
    >
      <div className="space-y-6">
        {/* Current conditions summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-su-line/10 rounded-xl p-4 text-center">
            <div className="text-xs text-su-muted mb-1">K-Index</div>
            <div
              className={`text-2xl font-mono font-bold ${
                kp <= 2
                  ? "text-signal-green"
                  : kp <= 4
                    ? "text-caution-amber"
                    : "text-alert-red"
              }`}
            >
              {kp}
            </div>
            <div className="text-xs text-su-muted mt-1">
              {kp <= 2 ? "Quiet" : kp <= 4 ? "Unsettled" : "Stormy"}
            </div>
          </div>
          <div className="bg-su-line/10 rounded-xl p-4 text-center">
            <div className="text-xs text-su-muted mb-1">Solar Flux</div>
            <div
              className={`text-2xl font-mono font-bold ${
                sfi >= 120
                  ? "text-signal-green"
                  : sfi >= 90
                    ? "text-good"
                    : "text-caution-amber"
              }`}
            >
              {sfi}
            </div>
            <div className="text-xs text-su-muted mt-1">
              {sfi >= 150 ? "Excellent" : sfi >= 100 ? "Good" : "Low"}
            </div>
          </div>
          <div className="bg-su-line/10 rounded-xl p-4 text-center">
            <div className="text-xs text-su-muted mb-1">Current Time</div>
            <div className="text-2xl font-mono font-bold text-plasma-orange">
              {currentHour.toString().padStart(2, "0")}:00z
            </div>
            <div className="text-xs text-su-muted mt-1">UTC</div>
          </div>
          <div className="bg-su-line/10 rounded-xl p-4 text-center">
            <div className="text-xs text-su-muted mb-1">Best Band Now</div>
            <div
              className={`text-2xl font-mono font-bold`}
              style={{
                color: currentBestBand
                  ? getForecastStatusColor(currentBestBand.status)
                  : "#666",
              }}
            >
              {currentBestBand?.band || "---"}
            </div>
            <div className="text-xs text-su-muted mt-1">
              {currentBestBand
                ? `${currentBestBand.snrEstimate} dB`
                : "No opening"}
            </div>
          </div>
        </div>

        {/* Large heatmap */}
        <div className="bg-su-line/10 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-y-1 mb-4">
            <h3 className="text-sm font-medium text-su-text">
              Band Conditions by Hour (UTC)
            </h3>
            <div className="flex items-center flex-wrap gap-4 gap-y-1 text-xs">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#00ff88" }}
                />
                <span className="text-su-muted">Excellent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#44dd66" }}
                />
                <span className="text-su-muted">Good</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#ffaa00" }}
                />
                <span className="text-su-muted">Fair</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#ff4455" }}
                />
                <span className="text-su-muted">Poor</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ background: "#374151" }}
                />
                <span className="text-su-muted">Closed</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {/* `shrink-0` (plus an explicit width, not just `min-w`) keeps
                this SVG from being scaled down as a flex item if a flex
                layout is ever reintroduced here, so `overflow-x-auto`
                scrolls to the unshrunk width instead of the whole chart
                (labels included) contracting with the `viewBox`. The SVG
                is `block mx-auto` rather than sitting in a
                `flex justify-center` parent (round 5, #870 finding 1):
                with `justify-center`, a chart wider than the container on
                a narrow viewport puts half the overflow on the *start*
                side, which the scrollbar can't reach, leaving the band
                labels and earliest hour columns permanently hidden.
                `margin: auto` on a block element centers it when it fits
                and collapses to 0 when it overflows, so the scrollable
                range always starts at the left edge. */}
            <svg
              width={chartWidth}
              height={CHART_HEIGHT}
              viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
              className="block shrink-0 mx-auto"
              style={{ width: `${chartWidth}px` }}
            >
              {/* Definitions */}
              <defs>
                <filter
                  id="modalGlow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient
                  id="modalCellShine"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="white" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Y-axis labels (bands) - improved contrast */}
              {DISPLAY_BANDS.map((band, idx) => (
                <text
                  key={band}
                  x={MARGIN.left - 8}
                  y={marginTop + idx * cellHeight + cellHeight / 2 + 4}
                  textAnchor="end"
                  className="fill-su-text text-xs font-mono"
                >
                  {band}
                </text>
              ))}

              {/* X-axis labels (hours) - show every 2 hours with better contrast */}
              {Array.from({ length: 12 }, (_, i) => i * 2).map((hour) => (
                <text
                  key={hour}
                  x={MARGIN.left + hour * cellWidth + cellWidth}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-su-muted text-xs font-mono"
                >
                  {hour.toString().padStart(2, "0")}
                </text>
              ))}

              {/* Grid cells */}
              {forecast.map((hourData) =>
                DISPLAY_BANDS.map((band, bandIdx) => {
                  const bandData = hourData.bands.find((b) => b.band === band);
                  const status = bandData?.status || "closed";
                  const color = getForecastStatusColor(status);
                  const x = MARGIN.left + hourData.hour * cellWidth;
                  const y = marginTop + bandIdx * cellHeight;

                  return (
                    <g key={`modal-${hourData.hour}-${band}`}>
                      <rect
                        x={x + 0.5}
                        y={y + 0.5}
                        width={cellWidth - 1}
                        height={cellHeight - 1}
                        fill={color}
                        opacity={0.9}
                        rx={2}
                        className="transition-opacity hover:opacity-100"
                      />
                      <rect
                        x={x + 0.5}
                        y={y + 0.5}
                        width={cellWidth - 1}
                        height={(cellHeight - 1) / 2}
                        fill="url(#modalCellShine)"
                        rx={2}
                      />
                      {/* Show SNR only when its text-xs label actually fits
                          this cell at the current root font size -- the
                          color heatmap still carries the information either
                          way, and no label beats an overlapping one. */}
                      {bandData &&
                        snrLabelFits(
                          bandData.snrEstimate,
                          cellWidth,
                          rootFontPx,
                        ) && (
                          <text
                            x={x + cellWidth / 2}
                            y={y + cellHeight / 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="fill-black/40 text-xs font-mono pointer-events-none"
                          >
                            {bandData.snrEstimate}
                          </text>
                        )}
                    </g>
                  );
                }),
              )}

              {/* Current time indicator */}
              <g filter="url(#modalGlow)">
                <line
                  x1={MARGIN.left + currentHour * cellWidth + cellWidth / 2}
                  y1={marginTop - 6}
                  x2={MARGIN.left + currentHour * cellWidth + cellWidth / 2}
                  y2={CHART_HEIGHT - MARGIN.bottom + 6}
                  stroke="#ff6b35"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
                <polygon
                  points={`
                    ${MARGIN.left + currentHour * cellWidth + cellWidth / 2 - 6},${marginTop - NOW_TRIANGLE_TOP_OFFSET_PX}
                    ${MARGIN.left + currentHour * cellWidth + cellWidth / 2 + 6},${marginTop - NOW_TRIANGLE_TOP_OFFSET_PX}
                    ${MARGIN.left + currentHour * cellWidth + cellWidth / 2},${marginTop - 2}
                  `}
                  fill="#ff6b35"
                />
              </g>

              {/* NOW label */}
              <text
                x={MARGIN.left + currentHour * cellWidth + cellWidth / 2}
                y={nowLabelY(rootFontPx)}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-plasma-orange text-xs font-bold"
              >
                NOW
              </text>
            </svg>
          </div>
        </div>

        {/* Live ML NowCast for the same path (independent of the physics chart) */}
        {nowCast && (
          <NowCastBandPanel
            state={nowCast}
            bands={HF_MODEL_BANDS}
            stationLabel={stationLabel}
            locationLabel={locationLabel}
            mode={mode}
          />
        )}

        {/* Best Windows Recommendations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Recommendations */}
          <div className="bg-su-line/10 rounded-xl p-4">
            <h3 className="text-sm font-medium text-su-text mb-3 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-signal-green"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Best Operating Windows
            </h3>

            {bestWindows.length === 0 ? (
              <p className="text-su-muted text-sm">
                No favorable windows found for this path. Consider waiting for
                better conditions.
              </p>
            ) : (
              <div className="space-y-2">
                {bestWindows.slice(0, 5).map((window, idx) => (
                  <div
                    key={window.band}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      idx === 0
                        ? "bg-signal-green/10 border border-signal-green/30"
                        : "bg-su-line/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="font-mono font-bold text-sm"
                        style={{
                          color: getForecastStatusColor(window.peakStatus),
                        }}
                      >
                        {window.band}
                      </span>
                      <span className="text-su-muted text-xs">
                        {formatHourRange(window.startHour, window.endHour)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          color: getForecastStatusColor(window.peakStatus),
                          backgroundColor: `${getForecastStatusColor(window.peakStatus)}20`,
                        }}
                      >
                        {getStatusLabel(window.peakStatus)}
                      </span>
                      <span className="font-mono text-xs text-su-muted">
                        {window.peakSnr} dB
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Band Groupings */}
          <div className="bg-su-line/10 rounded-xl p-4">
            <h3 className="text-sm font-medium text-su-text mb-3 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-plasma-orange"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              Path Analysis
            </h3>

            <div className="space-y-3">
              {/* Excellent bands */}
              {windowsByQuality.excellent.length > 0 && (
                <div>
                  <div className="text-xs text-signal-green font-medium mb-1">
                    Excellent Conditions Expected
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {windowsByQuality.excellent.map((w) => (
                      <span
                        key={w.band}
                        className="text-xs px-2 py-1 bg-signal-green/20 text-signal-green rounded"
                      >
                        {w.band}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Good bands */}
              {windowsByQuality.good.length > 0 && (
                <div>
                  <div className="text-xs text-good font-medium mb-1">
                    Good Conditions Expected
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {windowsByQuality.good.map((w) => (
                      <span
                        key={w.band}
                        className="text-xs px-2 py-1 bg-good/20 text-good rounded"
                      >
                        {w.band}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Fair bands */}
              {windowsByQuality.fair.length > 0 && (
                <div>
                  <div className="text-xs text-caution-amber font-medium mb-1">
                    Marginal Conditions
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {windowsByQuality.fair.map((w) => (
                      <span
                        key={w.band}
                        className="text-xs px-2 py-1 bg-caution-amber/20 text-caution-amber rounded"
                      >
                        {w.band}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendation */}
              <div className="pt-2 border-t border-su-line/40">
                <p className="text-xs text-su-muted leading-relaxed">
                  {timeOfDayTip}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Educational Content for Beginners */}
        <div className="bg-gradient-to-r from-nebula-blue/50 to-void/50 rounded-xl p-4 border border-su-line/40">
          <h3 className="text-sm font-medium text-su-text mb-3 flex items-center gap-2">
            <svg
              className="w-4 h-4 text-cosmic-cyan"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Understanding the Forecast
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-su-muted">
            <div>
              <h4 className="text-su-text font-medium mb-1">
                How to Read This Chart
              </h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Each row is an amateur radio band (frequency)</li>
                <li>Each column is an hour of the day (UTC time)</li>
                <li>Green = excellent propagation expected</li>
                <li>The orange line shows the current time</li>
              </ul>
            </div>
            <div>
              <h4 className="text-su-text font-medium mb-1">
                Two Independent Predictions
              </h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  The 24-hour chart is a physics forecast computed from solar
                  flux and Kp — an outlook for planning your day
                </li>
                <li>
                  NowCast is a machine-learned estimate for right now, trained
                  on millions of real WSPR reports over this kind of path
                </li>
                <li>
                  They are computed independently, so small disagreements are
                  normal — trust NowCast for “now,” the chart for “later”
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-su-text font-medium mb-1">
                From Path to Your Mode
              </h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  “Path (WSPR)” is the chance a single WSPR transmission would
                  be decoded — the most sensitive probe of an open path
                </li>
                <li>
                  “Your mode” re-scores that for your equipment and the mode
                  selected in the top bar (SSB voice needs roughly 38 dB more
                  signal than WSPR; FT8 sits in between)
                </li>
                <li>
                  A path can be open for digital modes while still too weak for
                  voice — that gap is exactly what the two numbers show
                </li>
                <li>
                  A “Physics profile” tag means recent path history was
                  unavailable for that band, so the model's physics-trained
                  profile served the estimate — still a model prediction, at
                  reduced confidence
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-su-text font-medium mb-1">Tips for DX</h4>
              <ul className="space-y-1 list-disc list-inside">
                <li>Higher bands (10-20m) work best during daylight</li>
                <li>Lower bands (40-160m) are better at night</li>
                <li>Greyline (dawn/dusk) can offer unique openings</li>
                <li>Higher solar flux = better high-band conditions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DetailModal>
  );
}

export default PropagationForecastModal;
