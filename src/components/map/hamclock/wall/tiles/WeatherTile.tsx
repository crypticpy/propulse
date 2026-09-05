import { lazy, Suspense, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useLocationWeather } from "@/hooks/useLocalWeather";
import { weatherCodeToDescription } from "@/lib/api/openMeteo";
import { formatTemperature, resolveUnits } from "@/lib/hamclock/units";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";

// The report is only worth its bytes once an operator opens it.
const WeatherReport = lazy(() =>
  import("../reports/WeatherReport").then((m) => ({ default: m.WeatherReport })),
);

const CLOUD_PATH = "M18 50h27a9 9 0 0 0 1-18 12 12 0 0 0-23-3 8 8 0 0 0-5 21z";

export type WeatherGlyphKind =
  | "clear"
  | "clear-night"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "storm";

/** WMO weather code → one of the seven shapes the wall can draw. */
function weatherGlyphKind(
  code: number,
  isDay: boolean,
): WeatherGlyphKind {
  if (code === 0) return isDay ? "clear" : "clear-night";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "rain";
}

/**
 * Weather glyphs drawn from theme tokens rather than emoji, so they keep the
 * wall's colour language and stay crisp on a 4K panel.
 */
export function WeatherGlyph({ kind }: { kind: WeatherGlyphKind }) {
  const cloud = (dy = 0) => (
    <path
      d={CLOUD_PATH}
      transform={dy ? `translate(0 ${dy})` : undefined}
      fill="var(--hc-fg)"
      opacity={0.82}
    />
  );
  const fall = (dx: number) => (
    <line
      key={dx}
      x1={dx}
      y1={48}
      x2={dx - 3}
      y2={58}
      stroke="var(--hc-info)"
      strokeWidth={3}
      strokeLinecap="round"
    />
  );

  return (
    <svg
      className="hc-media-icon"
      viewBox="0 0 64 64"
      role="img"
      aria-label={kind.replace("-", " ")}
    >
      {kind === "clear" && (
        <>
          <circle cx={32} cy={32} r={13} fill="var(--hc-warn)" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1={32}
              y1={11}
              x2={32}
              y2={17}
              stroke="var(--hc-warn)"
              strokeWidth={3}
              strokeLinecap="round"
              transform={`rotate(${deg} 32 32)`}
            />
          ))}
        </>
      )}
      {kind === "clear-night" && (
        <path
          d="M38 10a22 22 0 1 0 16 38A24 24 0 0 1 38 10z"
          fill="var(--hc-fg)"
          opacity={0.85}
        />
      )}
      {kind === "cloudy" && (
        <>
          <circle cx={24} cy={24} r={11} fill="var(--hc-warn)" />
          {cloud()}
        </>
      )}
      {kind === "fog" && (
        <>
          {[24, 33, 42, 51].map((y) => (
            <line
              key={y}
              x1={10}
              y1={y}
              x2={54}
              y2={y}
              stroke="var(--hc-fg)"
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.7}
            />
          ))}
        </>
      )}
      {kind === "rain" && (
        <>
          {cloud(-8)}
          {[24, 34, 44].map(fall)}
        </>
      )}
      {kind === "snow" && (
        <>
          {cloud(-8)}
          {[22, 32, 42].map((x) => (
            <circle key={x} cx={x} cy={53} r={3} fill="var(--hc-fg)" />
          ))}
        </>
      )}
      {kind === "storm" && (
        <>
          {cloud(-8)}
          <path
            d="M34 44l-11 12h8l-3 10 13-14h-8l5-8z"
            fill="var(--hc-accent)"
          />
        </>
      )}
    </svg>
  );
}

/** Current conditions at the operating QTH: glyph, temperature, rain chance. */
export function WeatherTile() {
  const location = useActiveLocation();
  const units = useHamClockDisplayStore((s) => s.units);
  const { weather, isLoading, error, hasLocation } = useLocationWeather(
    location?.lat,
    location?.lon,
  );
  const [reportOpen, setReportOpen] = useState(false);

  if (!weather) {
    return (
      <HamClockTile title="Local weather" source="OPEN-METEO">
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>
            {!hasLocation
              ? "Set your QTH to see local weather"
              : error
                ? "Open-Meteo unavailable"
                : isLoading
                  ? "Reading local conditions…"
                  : "No weather for this location"}
          </span>
        </TileSub>
      </HamClockTile>
    );
  }

  const resolved = resolveUnits(units, location?.grid);
  const rain = weather.precipitationProbability;

  return (
    <>
      <HamClockTile
        title="Local weather"
        source="OPEN-METEO"
        state="var(--hc-info)"
        onOpen={() => setReportOpen(true)}
        openLabel={`Local weather ${formatTemperature(
          weather.temperature,
          resolved,
        )}. Open the weather report`}
      >
        <div className="hc-media">
          <WeatherGlyph
            kind={weatherGlyphKind(weather.weatherCode, weather.isDay)}
          />
          <div>
            <TileHero tone="hc-info-text">
              {formatTemperature(weather.temperature, resolved)}
            </TileHero>
            <TileSub>
              <span>
                {weatherCodeToDescription(weather.weatherCode).toUpperCase()}
              </span>
              {rain !== null && (
                <span>
                  RAIN <b>{Math.round(rain)}%</b>
                </span>
              )}
            </TileSub>
          </div>
        </div>
      </HamClockTile>

      {reportOpen && (
        <Suspense fallback={null}>
          <WeatherReport
            open
            onClose={() => setReportOpen(false)}
            focus="weather"
          />
        </Suspense>
      )}
    </>
  );
}
