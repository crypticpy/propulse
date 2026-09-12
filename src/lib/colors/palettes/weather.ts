/** Pure weather/seismic color authorities. Renderer geometry and caches stay local. */
import type { WeatherAlert } from "@/lib/api/weather";
import type { StormCategory } from "@/lib/api/tropical";
import type { RiverGauge } from "@/lib/api/gauges";

export const EQ_MAGNITUDE_COLORS: ReadonlyArray<{
  minMagnitude: number;
  label: string;
  color: string;
}> = [
  { minMagnitude: 7, label: "M7+", color: "#ff2020" },
  { minMagnitude: 5, label: "M5–7", color: "#ff8800" },
  { minMagnitude: 4, label: "M4–5", color: "#ffcc00" },
  { minMagnitude: -Infinity, label: "<M4", color: "#88cc44" },
];

/** Descending inclusive lower bounds; NaN retains the existing light-quake fallback. */
export function getEarthquakeMagnitudeColor(magnitude: number): string {
  return (
    EQ_MAGNITUDE_COLORS.find((band) => magnitude >= band.minMagnitude) ??
    EQ_MAGNITUDE_COLORS[EQ_MAGNITUDE_COLORS.length - 1]
  ).color;
}

export const WEATHER_SEVERITY_ORDER = [
  "Extreme",
  "Severe",
  "Moderate",
  "Minor",
] as const;
export const ALERT_SEVERITY_COLORS: Record<
  (typeof WEATHER_SEVERITY_ORDER)[number],
  string
> = {
  Extreme: "#ff0040",
  Severe: "#ff6600",
  Moderate: "#ffaa00",
  Minor: "#ffdd44",
};
/** Atmos distinguishes Unknown from Minor; the main map deliberately does not. */
export const ATMOS_ALERT_SEVERITY_COLORS: Record<
  WeatherAlert["severity"],
  string
> = {
  ...ALERT_SEVERITY_COLORS,
  Unknown: "#888888",
};

export function getWeatherSeverityColor(
  severity: WeatherAlert["severity"],
  context: "map" | "atmos" = "map",
): string {
  switch (severity) {
    case "Extreme":
    case "Severe":
    case "Moderate":
    case "Minor":
      return context === "atmos"
        ? ATMOS_ALERT_SEVERITY_COLORS[severity]
        : ALERT_SEVERITY_COLORS[severity];
    default:
      return context === "atmos"
        ? ATMOS_ALERT_SEVERITY_COLORS.Unknown
        : ALERT_SEVERITY_COLORS.Minor;
  }
}

/** Existing map alert UI treatments; these contexts intentionally use different alpha. */
export function getWeatherSeverityTint(
  severity: WeatherAlert["severity"],
  context: "modal" | "flyout",
): string {
  const color = getWeatherSeverityColor(severity);
  const channels = [1, 3, 5].map((start) =>
    parseInt(color.slice(start, start + 2), 16),
  );
  return `rgba(${channels.join(", ")}, ${context === "modal" ? 0.15 : 0.2})`;
}

export const STORM_CATEGORY_HEX: Record<StormCategory, string> = {
  TD: "#3b82f6",
  TS: "#eab308",
  "1": "#f97316",
  "2": "#f97316",
  "3": "#ef4444",
  "4": "#dc2626",
  "5": "#991b1b",
};
/** Atmos intentionally groups category 3–5 into one red. */
export const ATMOS_STORM_CATEGORY_HEX: Record<StormCategory, string> = {
  ...STORM_CATEGORY_HEX,
  "4": STORM_CATEGORY_HEX["3"],
  "5": STORM_CATEGORY_HEX["3"],
};

export function getAtmosStormColor(category: StormCategory): string {
  return Object.prototype.hasOwnProperty.call(
    ATMOS_STORM_CATEGORY_HEX,
    category,
  )
    ? ATMOS_STORM_CATEGORY_HEX[category]
    : ATMOS_STORM_CATEGORY_HEX["3"];
}

export const RIVER_STATUS_HEX: Record<RiverGauge["floodStatus"], string> = {
  normal: "#22c55e",
  action: "#eab308",
  minor: "#f97316",
  moderate: "#ef4444",
  major: "#991b1b",
};
export const ATMOS_RIVER_STATUS_HEX: Record<RiverGauge["floodStatus"], string> =
  {
    ...RIVER_STATUS_HEX,
    normal: "#3b82f6",
    major: "#dc2626",
  };

export const WEATHER_LEGEND_ENTRIES = WEATHER_SEVERITY_ORDER.map(
  (severity) => ({
    label: severity,
    color: getWeatherSeverityColor(severity),
  }),
);
export const ATMOS_WEATHER_LEGEND_ENTRIES = [...WEATHER_SEVERITY_ORDER]
  .reverse()
  .map((severity) => ({
    text: severity,
    color: getWeatherSeverityColor(severity, "atmos"),
  }));

/** Explicit groups avoid integer-key enumeration reordering TD/TS after categories. */
export const STORM_LEGEND_ENTRIES = [
  { category: "TD", label: "TD" },
  { category: "TS", label: "TS" },
  { category: "1", label: "Cat 1–2" },
  { category: "3", label: "Cat 3" },
  { category: "4", label: "Cat 4" },
  { category: "5", label: "Cat 5" },
].map(({ category, label }) => ({
  label,
  color: STORM_CATEGORY_HEX[category as StormCategory],
}));
export const ATMOS_STORM_LEGEND_ENTRIES = [
  { category: "TD", text: "TD" },
  { category: "TS", text: "TS" },
  { category: "1", text: "Cat 1-2" },
  { category: "3", text: "Cat 3-5" },
].map(({ category, text }) => ({
  text,
  color: getAtmosStormColor(category as StormCategory),
}));
export const RIVER_LEGEND_ENTRIES = [
  { status: "normal", label: "Normal" },
  { status: "action", label: "Action" },
  { status: "minor", label: "Minor flood" },
  { status: "moderate", label: "Moderate flood" },
  { status: "major", label: "Major flood" },
].map(({ status, label }) => ({
  label,
  color: RIVER_STATUS_HEX[status as RiverGauge["floodStatus"]],
}));
