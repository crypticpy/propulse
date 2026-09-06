import { useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useLocationWeather } from "@/hooks/useLocalWeather";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { weatherCodeToDescription } from "@/lib/api/openMeteo";
import {
  formatSpeed,
  formatTemperature,
  resolveUnits,
} from "@/lib/hamclock/units";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { WeatherGlyph, type WeatherGlyphKind } from "../tiles/WeatherTile";
import { SEVERITY_TONE, rankAlerts } from "./alertSeverity";
import { NwsAlertBox } from "./NwsAlertBox";
import { WallReport, type WallReportFact } from "./WallReport";
import { useHamClockSessionTrend } from "./sessionTrend";
import { reportFooter } from "../tokens";
import { WallSeriesChart } from "./WallSeriesChart";

/** Which tile opened the report; it only chooses the hero. */
export type WeatherFocus = "weather" | "alerts";

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

  const ranked = useMemo(() => rankAlerts(alerts), [alerts]);
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
      ? "NONE MAPPED"
      : condition;
  // The NWS alert set is nationwide, so its severity should only colour the
  // hero when that alert set is the thing being shown — a local Open-Meteo
  // reading has nothing to do with an alert active somewhere else in the US.
  // `useWeatherAlerts` drops alerts without mappable geometry, so an empty
  // list is not proof nothing is in force — the tone stays neutral rather
  // than claiming an all-clear the feed cannot support.
  const tone =
    focus === "alerts"
      ? worst
        ? SEVERITY_TONE[worst.severity]
        : "hc-dim-text"
      : "hc-info-text";

  const trendKey = `weather-temp-${location?.lat ?? "na"},${location?.lon ?? "na"}`;
  const trend = useHamClockSessionTrend(
    trendKey,
    weather ? weather.temperature : null,
    weather?.observedAt?.getTime(),
  );

  const { footer, updated } = reportFooter(
    "OPEN-METEO · NWS ACTIVE ALERTS, US-WIDE",
    weather?.observedAt,
  );

  const facts: WallReportFact[] = [
    {
      label: "WIND",
      value: weather
        ? `${compass(weather.windDirection)} ${formatSpeed(weather.windSpeed, resolved)}`
        : "—",
    },
    {
      label: "HUMIDITY",
      value: weather ? `${Math.round(weather.humidity)}%` : "—",
    },
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
      footer={footer}
      updated={updated}
      pinId={`weather-${focus}`}
      pinElement={<WeatherReport open onClose={onClose} focus={focus} />}
    >
      <div className="hcr-cols hcr-cols--fill">
        <div className="hcr-stack">
          <div className="hcr-box">
            <h4>Now at the QTH</h4>
            {weather ? (
              <div className="hcr-media">
                <WeatherGlyph
                  kind={glyphKind(weather.weatherCode, weather.isDay)}
                />
                <dl className="hcr-kv">
                  <dt>TEMPERATURE</dt>
                  <dd>{formatTemperature(weather.temperature, resolved)}</dd>
                  <dt>SKY</dt>
                  <dd>{condition}</dd>
                  <dt>SIDE</dt>
                  <dd>{weather.isDay ? "DAY" : "NIGHT"}</dd>
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
          <div className="hcr-chart">
            <p className="hcr-chart-title">TEMPERATURE — 2 H · SESSION</p>
            <WallSeriesChart
              label="TEMPERATURE — 2 H · SESSION"
              points={trend.map((point) => ({
                ...point,
                value:
                  resolved === "imperial"
                    ? point.value * 1.8 + 32
                    : point.value,
              }))}
              unit={resolved === "imperial" ? "°F" : "°C"}
              maxGapMs={10 * 60 * 1000}
            />
          </div>
        </div>
        <NwsAlertBox
          title="Active NWS alerts"
          alerts={ranked}
          error={Boolean(alertError)}
          emptyLabel="NONE MAPPED"
        />
      </div>
    </WallReport>
  );
}
