/**
 * Open-Meteo API client for station-local weather conditions.
 * Free tier: 10,000 requests/day. No API key required. CORS-enabled.
 */

export interface LocalWeatherData {
  /** IANA timezone resolved by Open-Meteo for these coordinates. */
  timezone?: string;
  temperature: number; // Celsius
  windSpeed: number; // km/h
  windDirection: number; // degrees
  weatherCode: number; // WMO weather code
  isDay: boolean;
  precipitation: number; // mm
  /** Today's maximum chance of precipitation, %; null when not returned. */
  precipitationProbability: number | null;
  humidity: number; // %
  pressure: number; // hPa
  /** UTC instant of the `current` reading, derived from Open-Meteo's local
   * `current.time` + `utc_offset_seconds`; null if either was unparseable. */
  observedAt: Date | null;
}

/** WMO weather code to description */
export function weatherCodeToDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 49) return "Fog";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  if (code <= 89) return "Hail";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

/** WMO weather code to icon */
export function weatherCodeToIcon(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? "\u2600\uFE0F" : "\uD83C\uDF19";
  if (code <= 3) return isDay ? "\u26C5" : "\uD83C\uDF19";
  if (code <= 49) return "\uD83C\uDF2B\uFE0F";
  if (code <= 59) return "\uD83C\uDF26\uFE0F";
  if (code <= 69) return "\uD83C\uDF27\uFE0F";
  if (code <= 79) return "\uD83C\uDF28\uFE0F";
  if (code <= 86) return "\uD83C\uDF28\uFE0F";
  if (code <= 99) return "\u26C8\uFE0F";
  return "\u2753";
}

export async function fetchLocalWeather(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<LocalWeatherData> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lon.toFixed(4));
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "wind_speed_10m",
      "wind_direction_10m",
      "weather_code",
      "is_day",
      "precipitation",
      "relative_humidity_2m",
      "surface_pressure",
    ].join(","),
  );
  // Today's rain chance for the wall weather tile; daily needs a timezone.
  url.searchParams.set("daily", "precipitation_probability_max");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
  const data = await res.json();
  const c = data.current;
  const rainChance = data.daily?.precipitation_probability_max?.[0];

  // `current.time` is a local wall-clock string ("YYYY-MM-DDTHH:mm") with no
  // offset marker because `timezone=auto` was requested; `utc_offset_seconds`
  // (always present alongside it) is what converts it back to a UTC instant.
  const utcOffsetSeconds =
    typeof data.utc_offset_seconds === "number" ? data.utc_offset_seconds : 0;
  const localTimeMs =
    typeof c.time === "string" ? Date.parse(`${c.time}:00Z`) : NaN;
  const observedAt = Number.isFinite(localTimeMs)
    ? new Date(localTimeMs - utcOffsetSeconds * 1000)
    : null;

  return {
    timezone: typeof data.timezone === "string" ? data.timezone : undefined,
    observedAt,
    temperature: c.temperature_2m,
    windSpeed: c.wind_speed_10m,
    windDirection: c.wind_direction_10m,
    weatherCode: c.weather_code,
    isDay: c.is_day === 1,
    precipitation: c.precipitation,
    precipitationProbability:
      typeof rainChance === "number" && Number.isFinite(rainChance)
        ? rainChance
        : null,
    humidity: c.relative_humidity_2m,
    pressure: c.surface_pressure,
  };
}
