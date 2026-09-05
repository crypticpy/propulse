export interface HomeWeather {
  at: number; timezone: string; temperature: number; wind: number; gusts: number | null; code: number;
  hours: Array<{ at: number; temperature: number; rain: number | null; wind: number | null }>;
}
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function parseHomeWeather(value: unknown): HomeWeather {
  const data = value as { timezone?: unknown; current?: Record<string, unknown>; hourly?: Record<string, unknown[]> };
  const c = data?.current, h = data?.hourly;
  if (!c || !number(c.time) || !number(c.temperature_2m) || !number(c.wind_speed_10m) || !number(c.weather_code)) throw new Error("Weather readings unavailable");
  const timezone = typeof data.timezone === "string" ? data.timezone : "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new Error("Weather timezone unavailable"); }
  const hours = Array.isArray(h?.time) ? h.time.flatMap((at, i) => number(at) && number(h.temperature_2m?.[i]) ? [{ at: at * 1000, temperature: h.temperature_2m[i] as number, rain: number(h.precipitation_probability?.[i]) ? h.precipitation_probability[i] as number : null, wind: number(h.wind_speed_10m?.[i]) ? h.wind_speed_10m[i] as number : null }] : []) : [];
  return { at: c.time * 1000, timezone, temperature: c.temperature_2m, wind: c.wind_speed_10m, gusts: number(c.wind_gusts_10m) ? c.wind_gusts_10m : null, code: c.weather_code, hours };
}
export async function fetchHomeWeather(lat: number, lon: number, signal?: AbortSignal) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), current: "temperature_2m,wind_speed_10m,wind_gusts_10m,weather_code", hourly: "temperature_2m,precipitation_probability,wind_speed_10m", forecast_days: "2", timezone: "auto", timeformat: "unixtime" }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Weather service unavailable");
  return parseHomeWeather(await response.json());
}
export function weatherIsCurrent(at: number, now: number) { return Number.isFinite(at) && at <= now + 60000 && now - at < 90 * 60000; }
