import { useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useLocationWeather } from "@/hooks/useLocalWeather";
import { weatherCodeToDescription } from "@/lib/api/openMeteo";
import {
  formatSpeed,
  formatTemperature,
  resolveUnits,
} from "@/lib/hamclock/units";
import { latLonToGrid } from "@/lib/utils/grid";
import { formatDistance, getPathMetrics } from "@/lib/utils/path";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useMapStore } from "@/stores/mapStore";
import { WeatherGlyph, type WeatherGlyphKind } from "../tiles/WeatherTile";
import { WallReport, type WallReportFact } from "./WallReport";

/** WMO code → one of the seven wall glyph shapes (mirrors `WeatherTile`). */
function glyphKind(code: number, isDay: boolean): WeatherGlyphKind {
  if (code === 0) return isDay ? "clear" : "clear-night";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "rain";
}

function coordinates(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}${lon >= 0 ? "E" : "W"}`;
}

export interface DxTargetReportProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The map's chosen DX target in one place: callsign, grid, coordinates,
 * distance, short- and long-path bearing from the active QTH, and the
 * weather at the target's own coordinates. Retires the accordion sidebar's
 * "DX Target" panel (wall spec §15, HW-25); the great-circle numbers come
 * from the same `getPathMetrics` helper `PathAnalysis` and the retired
 * panel used, so nothing here can disagree with the map.
 */
export function DxTargetReport({ open, onClose }: DxTargetReportProps) {
  const target = useMapStore((s) => s.target);
  const location = useActiveLocation();
  const units = useHamClockDisplayStore((s) => s.units);
  const { weather, isLoading, error, hasLocation } = useLocationWeather(
    target?.lat,
    target?.lon,
  );

  const metrics = useMemo(
    () =>
      target && location
        ? getPathMetrics(location.lat, location.lon, target.lat, target.lon)
        : null,
    [target, location],
  );

  if (!target) {
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="DX target report"
        hero="—"
        verdict="NO TARGET"
        footer="GREAT CIRCLE · OPEN-METEO"
      >
        <p className="hcr-note">
          Pick a target on the map to see its grid, distance, bearing and
          weather.
        </p>
      </WallReport>
    );
  }

  const grid = target.grid || latLonToGrid(target.lat, target.lon);
  const callsign = target.name || grid;
  const resolved = resolveUnits(units, grid);
  const condition = weather
    ? weatherCodeToDescription(weather.weatherCode).toUpperCase()
    : "NO DATA";

  const facts: WallReportFact[] = [
    { label: "CALLSIGN", value: callsign },
    { label: "GRID", value: grid },
    { label: "COORDINATES", value: coordinates(target.lat, target.lon) },
    {
      label: "SHORT PATH",
      value: metrics ? `${Math.round(metrics.shortPath.bearing)}°` : "—",
    },
    {
      label: "LONG PATH",
      value: metrics ? `${Math.round(metrics.longPath.bearing)}°` : "—",
    },
  ];

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title={`DX target report · ${callsign}`}
      tone="accent"
      hero={metrics ? formatDistance(metrics.shortPath.distance) : "—"}
      verdict={callsign}
      facts={facts}
      footer="OPEN-METEO AT THE TARGET · GREAT CIRCLE FROM THE QTH"
      updated={weather ? condition : "AWAITING FEED"}
    >
      <div className="hcr-cols">
        <div className="hcr-box">
          <h4>Path to {callsign}</h4>
          {metrics ? (
            <dl className="hcr-kv">
              <dt>DISTANCE</dt>
              <dd>{formatDistance(metrics.shortPath.distance)}</dd>
              <dt>SHORT PATH</dt>
              <dd>{Math.round(metrics.shortPath.bearing)}°</dd>
              <dt>LONG PATH</dt>
              <dd>
                {Math.round(metrics.longPath.bearing)}° ·{" "}
                {formatDistance(metrics.longPath.distance)}
              </dd>
              <dt>HOPS</dt>
              <dd>~{metrics.hops}F</dd>
            </dl>
          ) : (
            <p className="hcr-note">
              Set your QTH to see distance and bearing to this target.
            </p>
          )}
        </div>
        <div className="hcr-box">
          <h4>Weather at the target</h4>
          {weather ? (
            <div className="hcr-media">
              <WeatherGlyph
                kind={glyphKind(weather.weatherCode, weather.isDay)}
              />
              <dl className="hcr-kv">
                <dt>TEMPERATURE</dt>
                <dd>{formatTemperature(weather.temperature, resolved)}</dd>
                <dt>WIND</dt>
                <dd>{formatSpeed(weather.windSpeed, resolved)}</dd>
                <dt>HUMIDITY</dt>
                <dd>{Math.round(weather.humidity)}%</dd>
              </dl>
            </div>
          ) : (
            <p className="hcr-note">
              {!hasLocation
                ? "No target coordinates to read."
                : error
                  ? "Open-Meteo is unavailable right now."
                  : isLoading
                    ? "Reading conditions at the target…"
                    : "No weather published for this location."}
            </p>
          )}
        </div>
      </div>
    </WallReport>
  );
}
