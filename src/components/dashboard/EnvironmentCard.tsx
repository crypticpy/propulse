/**
 * EnvironmentCard Component (E6)
 *
 * Dashboard card showing current UV index and air quality for the
 * operator's QTH. Backed by `/api/atmos/uv` (Open-Meteo, no key required)
 * and `/api/atmos/aqi` (AirNow/WAQI, degrades gracefully without a key).
 *
 * @module components/dashboard/EnvironmentCard
 */

import { Card } from "@/components/ui/Card";
import { useUvIndex, uvSeverityClass } from "@/hooks/useUvIndex";
import { useAirQuality, aqiSeverityClass } from "@/hooks/useAirQuality";

export interface EnvironmentCardProps {
  className?: string;
}

export function EnvironmentCard({ className = "" }: EnvironmentCardProps) {
  const {
    uv,
    isLoading: uvLoading,
    hasLocation: uvHasLocation,
  } = useUvIndex();
  const {
    aqi,
    isLoading: aqiLoading,
    hasLocation: aqiHasLocation,
    configurationMissing,
  } = useAirQuality();

  const hasLocation = uvHasLocation || aqiHasLocation;

  if (!hasLocation) {
    return (
      <Card className={className} role="region" aria-label="Environment">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
            Environment
          </span>
        </div>
        <div className="text-[10px] text-gray-500">
          Set your grid in Profile for UV and air quality data
        </div>
      </Card>
    );
  }

  const currentUv = uv?.current?.uvIndex ?? null;
  const todayMax = uv?.todayMax ?? null;
  const tomorrowMax = uv?.daily?.[1]?.uvIndexMax ?? null;
  const uvUnavailable = !uvLoading && (!uv || currentUv == null);

  const aqiValue = aqi?.aqi ?? null;
  const aqiUnavailable =
    !aqiLoading && !configurationMissing && (!aqi || aqiValue == null);

  return (
    <Card className={className} role="region" aria-label="Environment">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          Environment
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
            UV Index
          </div>
          {uvUnavailable ? (
            <div className="text-xs text-gray-500">UV data unavailable</div>
          ) : (
            <>
              <div
                className={`text-3xl font-mono tabular-nums leading-none ${uvSeverityClass(currentUv)}`}
              >
                {currentUv != null ? currentUv.toFixed(1) : "—"}
              </div>
              <div className="text-xs text-gray-500 font-mono tabular-nums mt-1">
                {todayMax != null ? todayMax.toFixed(1) : "—"} max today
              </div>
              <div className="text-xs text-gray-500 font-mono tabular-nums">
                {tomorrowMax != null ? tomorrowMax.toFixed(1) : "—"} max
                tomorrow
              </div>
            </>
          )}
        </div>

        <div className="border-l border-white/10 pl-3">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
            Air Quality
          </div>
          {configurationMissing ? (
            <div className="text-xs text-gray-500">Needs API key</div>
          ) : aqiUnavailable ? (
            <div className="text-xs text-gray-500">AQI unavailable</div>
          ) : (
            <>
              <div
                className={`text-3xl font-mono tabular-nums leading-none ${aqiSeverityClass(aqiValue)}`}
              >
                {aqiValue ?? "—"}
              </div>
              <div className="text-xs text-gray-400 truncate mt-1">
                {aqi?.category ?? "—"}
              </div>
              {aqi?.pollutant && (
                <div className="text-xs text-gray-500 font-mono">
                  {aqi.pollutant}
                </div>
              )}
              {aqi?.source && aqi.source !== "none" && (
                <div className="text-[10px] text-gray-600 mt-1">
                  Source: {aqi.source === "airnow" ? "AirNow" : "WAQI"}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

EnvironmentCard.displayName = "EnvironmentCard";

export default EnvironmentCard;
