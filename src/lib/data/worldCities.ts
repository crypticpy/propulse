/**
 * DX-relevant world cities for a multi-timezone world clock widget.
 *
 * Coordinates are city-center approximations; IANA timezone ids are used so
 * local time (including DST) can be derived with Intl.DateTimeFormat.
 */

export interface WorldCity {
  id: string;
  city: string;
  country: string;
  tz: string;
  lat: number;
  lon: number;
}

export const WORLD_CITIES: WorldCity[] = [
  { id: "london", city: "London", country: "United Kingdom", tz: "Europe/London", lat: 51.5074, lon: -0.1278 },
  { id: "paris", city: "Paris", country: "France", tz: "Europe/Paris", lat: 48.8566, lon: 2.3522 },
  { id: "reykjavik", city: "Reykjavik", country: "Iceland", tz: "Atlantic/Reykjavik", lat: 64.1466, lon: -21.9426 },
  { id: "new-york", city: "New York", country: "United States", tz: "America/New_York", lat: 40.7128, lon: -74.006 },
  { id: "chicago", city: "Chicago", country: "United States", tz: "America/Chicago", lat: 41.8781, lon: -87.6298 },
  { id: "denver", city: "Denver", country: "United States", tz: "America/Denver", lat: 39.7392, lon: -104.9903 },
  { id: "los-angeles", city: "Los Angeles", country: "United States", tz: "America/Los_Angeles", lat: 34.0522, lon: -118.2437 },
  { id: "honolulu", city: "Honolulu", country: "United States", tz: "Pacific/Honolulu", lat: 21.3069, lon: -157.8583 },
  { id: "anchorage", city: "Anchorage", country: "United States", tz: "America/Anchorage", lat: 61.2181, lon: -149.9003 },
  { id: "sao-paulo", city: "São Paulo", country: "Brazil", tz: "America/Sao_Paulo", lat: -23.5505, lon: -46.6333 },
  { id: "buenos-aires", city: "Buenos Aires", country: "Argentina", tz: "America/Argentina/Buenos_Aires", lat: -34.6037, lon: -58.3816 },
  { id: "johannesburg", city: "Johannesburg", country: "South Africa", tz: "Africa/Johannesburg", lat: -26.2041, lon: 28.0473 },
  { id: "cairo", city: "Cairo", country: "Egypt", tz: "Africa/Cairo", lat: 30.0444, lon: 31.2357 },
  { id: "dubai", city: "Dubai", country: "United Arab Emirates", tz: "Asia/Dubai", lat: 25.2048, lon: 55.2708 },
  { id: "moscow", city: "Moscow", country: "Russia", tz: "Europe/Moscow", lat: 55.7558, lon: 37.6173 },
  { id: "new-delhi", city: "New Delhi", country: "India", tz: "Asia/Kolkata", lat: 28.6139, lon: 77.209 },
  { id: "singapore", city: "Singapore", country: "Singapore", tz: "Asia/Singapore", lat: 1.3521, lon: 103.8198 },
  { id: "tokyo", city: "Tokyo", country: "Japan", tz: "Asia/Tokyo", lat: 35.6762, lon: 139.6503 },
  { id: "sydney", city: "Sydney", country: "Australia", tz: "Australia/Sydney", lat: -33.8688, lon: 151.2093 },
  { id: "auckland", city: "Auckland", country: "New Zealand", tz: "Pacific/Auckland", lat: -36.8485, lon: 174.7633 },
];

export const DEFAULT_WORLD_CLOCK_IDS: string[] = ["london", "new-york", "tokyo", "sydney"];
