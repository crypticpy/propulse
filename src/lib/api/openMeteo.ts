/**
 * Open-Meteo API client for station-local weather conditions.
 * Free tier: 10,000 requests/day. No API key required. CORS-enabled.
 */

export interface LocalWeatherData {
  temperature: number; // Celsius
  windSpeed: number; // km/h
  windDirection: number; // degrees
  weatherCode: number; // WMO weather code
  isDay: boolean;
  precipitation: number; // mm
  humidity: number; // %
  pressure: number; // hPa
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
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
  const data = await res.json();
  const c = data.current;

  return {
    temperature: c.temperature_2m,
    windSpeed: c.wind_speed_10m,
    windDirection: c.wind_direction_10m,
    weatherCode: c.weather_code,
    isDay: c.is_day === 1,
    precipitation: c.precipitation,
    humidity: c.relative_humidity_2m,
    pressure: c.surface_pressure,
  };
}
