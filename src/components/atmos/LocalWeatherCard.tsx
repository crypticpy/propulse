/**
 * LocalWeatherCard — Compact sidebar card showing current weather
 * at the user's station QTH via Open-Meteo.
 */

import { useLocalWeather } from "@/hooks/useLocalWeather";
import {
  weatherCodeToDescription,
  weatherCodeToIcon,
} from "@/lib/api/openMeteo";

const WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function LocalWeatherCard() {
  const { weather, isLoading, hasLocation } = useLocalWeather();

  if (!hasLocation) {
    return (
      <div className="text-center py-2">
        <p className="text-xs text-su-muted">
          Set station location in Profile
        </p>
      </div>
    );
  }

  if (isLoading || !weather) {
    return (
      <div className="flex items-center justify-center py-3">
        <div className="w-3 h-3 border border-su-line border-t-plasma-orange rounded-full animate-spin" />
      </div>
    );
  }

  const icon = weatherCodeToIcon(weather.weatherCode, weather.isDay);
  const desc = weatherCodeToDescription(weather.weatherCode);
  const windDir = WIND_DIRS[Math.round(weather.windDirection / 45) % 8];

  return (
    <div className="space-y-2">
      {/* Condition + temp */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-lg font-orbitron font-bold text-su-text">
            {Math.round(weather.temperature)}&deg;C
          </div>
          <div className="text-xs text-su-muted">{desc}</div>
        </div>
      </div>
      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-su-muted">Wind</div>
        <div className="text-su-muted font-mono text-right">
          {Math.round(weather.windSpeed)} km/h {windDir}
        </div>
        <div className="text-su-muted">Humidity</div>
        <div className="text-su-muted font-mono text-right">
          {weather.humidity}%
        </div>
        <div className="text-su-muted">Pressure</div>
        <div className="text-su-muted font-mono text-right">
          {Math.round(weather.pressure)} hPa
        </div>
        {weather.precipitation > 0 && (
          <>
            <div className="text-su-muted">Precip</div>
            <div className="text-su-muted font-mono text-right">
              {weather.precipitation.toFixed(1)} mm
            </div>
          </>
        )}
      </div>
    </div>
  );
}
