import { useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useLocationWeather } from "@/hooks/useLocalWeather";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { weatherCodeToDescription } from "@/lib/api/openMeteo";
import type { WeatherAlert } from "@/lib/api/weather";
import {
  formatSpeed,
  formatTemperature,
  resolveUnits,
} from "@/lib/hamclock/units";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { WeatherGlyph, type WeatherGlyphKind } from "../tiles/WeatherTile";
import { WallReport, type WallReportFact } from "./WallReport";

/** Which tile opened the report; it only chooses the hero. */
export type WeatherFocus = "weather" | "alerts";

/** Alerts worth drawing at wall size before the box runs out of height. */
const MAX_ALERTS = 5;

const SEVERITY_RANK: Record<WeatherAlert["severity"], number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
};

const SEVERITY_TONE: Record<WeatherAlert["severity"], string> = {
  Extreme: "hc-bad",
  Severe: "hc-bad",
  Moderate: "hc-warn",
  Minor: "hc-info-text",
  Unknown: "hc-dim-text",
};

const COMPASS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

function compass(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  return COMPASS[Math.round(normalized / 22.5) % 16];
}

/** WMO code → one of the seven wall glyph shapes (mirrors the tile). */
function glyphKind(code: number, isDay: boolean): WeatherGlyphKind {
  if (code === 0) return isDay ? "clear" : "clear-night";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "rain";
}

export interface WeatherReportProps {
  open: boolean;
  onClose: () => void;
  focus: WeatherFocus;
}

/**
 * Conditions at the operating QTH plus the active NWS alert set. The alert
 * feed is the nationwide active set — the same one the tile counts and `useRIM`
 * scores — so the list says US-wide rather than implying it is local.
 */
export function WeatherReport({ open, onClose, focus }: WeatherReportProps) {
  const location = useActiveLocation();
  const units = useHamClockDisplayStore((s) => s.units);
  const { weather, isLoading, error, hasLocation } = useLocationWeather(
    location?.lat,
    location?.lon,
  );
  const { alerts, error: alertError } = useWeatherAlerts();

  const ranked = useMemo(
    () =>
      [...alerts].sort(
        (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
      ),
    [alerts],
  );
  const worst = ranked[0] ?? null;

  const resolved = resolveUnits(units, location?.grid);
  const condition = weather
    ? weatherCodeToDescription(weather.weatherCode).toUpperCase()
    : "NO DATA";

  const alertHero = focus === "alerts" && alerts.length > 0;
  const hero = alertHero
    ? alerts.length
    : weather
      ? formatTemperature(weather.temperature, resolved)
      : "—";
  const verdict = alertHero
    ? (worst?.severity.toUpperCase() ?? "ACTIVE")
    : focus === "alerts"
      ? "ALL CLEAR"
      : condition;
  const tone = worst
    ? SEVERITY_TONE[worst.severity]
    : focus === "alerts"
      ? "hc-good"
      : "hc-info-text";

  const facts: WallReportFact[] = [
    {
      label: "WIND",
      value: weather
        ? `${compass(weather.windDirection)} ${formatSpeed(weather.windSpeed, resolved)}`
        : "—",
    },
    { label: "HUMIDITY", value: weather ? `${Math.round(weather.humidity)}%` : "—" },
    {
      label: "PRESSURE",
      value: weather ? `${Math.round(weather.pressure)} hPa` : "—",
    },
    {
      label: "RAIN",
      value:
        weather?.precipitationProbability == null
          ? "—"
          : `${Math.round(weather.precipitationProbability)}%`,
    },
    {
      label: "PRECIP",
      value: weather ? `${weather.precipitation.toFixed(1)} mm` : "—",
    },
    { label: "NWS ALERTS", value: alerts.length },
  ];

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`Weather report · ${location?.name || location?.grid || "DE"}`}
      tone={
        tone === "hc-bad"
          ? "bad"
          : tone === "hc-warn"
            ? "warn"
            : tone === "hc-good"
              ? "good"
              : "info"
      }
      hero={hero}
      verdict={verdict}
      facts={facts}
      footer="OPEN-METEO AT THE QTH · NWS ACTIVE ALERTS, US-WIDE"
      updated={weather ? condition : "AWAITING FEED"}
    >
      <div className="hcr-cols">
        <div className="hcr-box">
          <h4>Now at the QTH</h4>
          {weather ? (
            <div className="hcr-media">
              <WeatherGlyph kind={glyphKind(weather.weatherCode, weather.isDay)} />
              <dl className="hcr-kv">
                <dt>TEMPERATURE</dt>
                <dd>{formatTemperature(weather.temperature, resolved)}</dd>
                <dt>WIND</dt>
                <dd>
                  {compass(weather.windDirection)}{" "}
                  {formatSpeed(weather.windSpeed, resolved)}
                </dd>
                <dt>HUMIDITY</dt>
                <dd>{Math.round(weather.humidity)}%</dd>
                <dt>PRESSURE</dt>
                <dd>{Math.round(weather.pressure)} hPa</dd>
              </dl>
            </div>
          ) : (
            <p className="hcr-note">
              {!hasLocation
                ? "Set your QTH to read local conditions."
                : error
                  ? "Open-Meteo is unavailable right now."
                  : isLoading
                    ? "Reading local conditions…"
                    : "No weather published for this location."}
            </p>
          )}
        </div>
        <div className="hcr-box">
          <h4>Active NWS alerts · {alerts.length}</h4>
          {alertError ? (
            <p className="hcr-note">NWS alert feed unreachable. Retrying.</p>
          ) : ranked.length === 0 ? (
            <p className="hcr-empty hc-good">ALL CLEAR</p>
          ) : (
            <div className="hcr-list">
              {ranked.slice(0, MAX_ALERTS).map((alert) => (
                <div
                  key={alert.id}
                  className={`hcr-item ${SEVERITY_TONE[alert.severity]}`}
                >
                  <b>
                    {alert.event} · {alert.severity}
                  </b>
                  <span>{alert.areaDesc}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </WallReport>
  );
}
