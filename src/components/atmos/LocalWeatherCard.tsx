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
        <p className="text-[10px] text-gray-600">
          Set station location in Profile
        </p>
      </div>
    );
  }

  if (isLoading || !weather) {
    return (
      <div className="flex items-center justify-center py-3">
        <div className="w-3 h-3 border border-gray-600 border-t-plasma-orange rounded-full animate-spin" />
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
          <div className="text-lg font-orbitron font-bold text-white">
            {Math.round(weather.temperature)}&deg;C
          </div>
          <div className="text-[10px] text-gray-400">{desc}</div>
        </div>
      </div>
      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div className="text-gray-500">Wind</div>
        <div className="text-gray-300 font-mono text-right">
          {Math.round(weather.windSpeed)} km/h {windDir}
        </div>
        <div className="text-gray-500">Humidity</div>
        <div className="text-gray-300 font-mono text-right">
          {weather.humidity}%
        </div>
        <div className="text-gray-500">Pressure</div>
        <div className="text-gray-300 font-mono text-right">
          {Math.round(weather.pressure)} hPa
        </div>
        {weather.precipitation > 0 && (
          <>
            <div className="text-gray-500">Precip</div>
            <div className="text-nebula-blue font-mono text-right">
              {weather.precipitation.toFixed(1)} mm
            </div>
          </>
        )}
      </div>
    </div>
  );
}
