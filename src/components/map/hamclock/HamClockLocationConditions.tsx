/**
 * Compact local clock and current-weather strip for the HamClock DE/DX cards.
 * The resolved provider timezone lets a remote DX target show its own civil
 * time without relying on the browser or operator timezone.
 */

import { useLocationWeather } from "@/hooks/useLocalWeather";
import {
  weatherCodeToDescription,
  weatherCodeToIcon,
} from "@/lib/api/openMeteo";
import { formatLocationTime } from "@/lib/hamclock/locationConditions";

interface HamClockLocationConditionsProps {
  latitude: number;
  longitude: number;
  displayTime: Date;
  timeZone?: string;
  stationLabel: "DE" | "DX";
}

const WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function HamClockLocationConditions({
  latitude,
  longitude,
  displayTime,
  timeZone,
  stationLabel,
}: HamClockLocationConditionsProps) {
  const { weather, isLoading, error } = useLocationWeather(
    latitude,
    longitude,
  );
  const localTime = formatLocationTime(
    displayTime,
    timeZone ?? weather?.timezone,
  );

  return (
    <div
      className="mt-1.5 border-t border-white/10 pt-1.5"
      aria-label={`${stationLabel} local conditions`}
    >
      <div className="flex min-h-4 items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
          Local
        </span>
        <span className="font-mono text-[11px] font-semibold text-white">
          {localTime ?? "Resolving zone…"}
        </span>
      </div>

      {weather ? (
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-base leading-none" aria-hidden="true">
              {weatherCodeToIcon(weather.weatherCode, weather.isDay)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[10px] text-gray-300">
                {weatherCodeToDescription(weather.weatherCode)}
              </div>
              <div className="font-mono text-[9px] text-gray-500">
                RH {Math.round(weather.humidity)}%
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-sm font-bold text-white">
              {Math.round(weather.temperature)}°C
            </div>
            <div className="font-mono text-[9px] text-gray-500">
              {Math.round(weather.windSpeed)} km/h{" "}
              {WIND_DIRS[Math.round(weather.windDirection / 45) % 8]}
            </div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="mt-1 font-mono text-[9px] text-gray-500">
          Loading weather…
        </div>
      ) : error ? (
        <div
          className="mt-1 font-mono text-[9px] text-caution-amber"
          title={error instanceof Error ? error.message : "Weather unavailable"}
        >
          Weather unavailable
        </div>
      ) : null}
    </div>
  );
}
