/**
 * Time formatting and calculation utilities
 * Includes UTC/local time formatting and sun position calculations
 */

/**
 * Format a date as UTC time string
 *
 * @param date - Date to format
 * @returns Formatted string like "14:32:15 UTC"
 *
 * @example
 * ```ts
 * formatUTC(new Date())  // "14:32:15 UTC"
 * ```
 */
export function formatUTC(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds} UTC`;
}

/**
 * Format a date as local time string
 *
 * @param date - Date to format
 * @param use24h - Use 24-hour format (default: false for 12-hour with AM/PM)
 * @returns Formatted string like "08:32 AM" or "08:32"
 *
 * @example
 * ```ts
 * formatLocal(new Date(), false)  // "08:32 AM"
 * formatLocal(new Date(), true)   // "08:32"
 * ```
 */
export function formatLocal(date: Date, use24h: boolean = false): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");

  if (use24h) {
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${period}`;
}

/**
 * Format a date as full local datetime string
 *
 * @param date - Date to format
 * @param use24h - Use 24-hour format
 * @returns Formatted string like "Jan 15, 2024 08:32 AM"
 */
export function formatLocalDateTime(
  date: Date,
  use24h: boolean = false,
): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: !use24h,
  };
  return date.toLocaleString(undefined, options);
}

/**
 * Get human-readable time ago string
 *
 * @param date - Past date to compare against now
 * @returns Formatted string like "5 minutes ago", "2 hours ago", "just now"
 *
 * @example
 * ```ts
 * getTimeAgo(new Date(Date.now() - 300000))  // "5 minutes ago"
 * getTimeAgo(new Date(Date.now() - 7200000)) // "2 hours ago"
 * ```
 */
export function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 30) {
    return "just now";
  }
  if (diffSeconds < 60) {
    return `${diffSeconds} seconds ago`;
  }
  if (diffMinutes === 1) {
    return "1 minute ago";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }
  if (diffHours === 1) {
    return "1 hour ago";
  }
  if (diffHours < 24) {
    return `${diffHours} hours ago`;
  }
  if (diffDays === 1) {
    return "yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  // For older dates, return formatted date
  return date.toLocaleDateString();
}

/**
 * Check if the sun is currently up at a given location
 * Uses a simplified solar position algorithm
 *
 * @param lat - Latitude in decimal degrees
 * @param lon - Longitude in decimal degrees
 * @param date - Date/time to check (default: now)
 * @returns True if sun is above horizon
 *
 * @example
 * ```ts
 * isDay(30.27, -97.74)  // true if daytime in Austin, TX
 * ```
 */
export function isDay(
  lat: number,
  lon: number,
  date: Date = new Date(),
): boolean {
  const { altitude } = getSunPosition(lat, lon, date);
  // Sun is "up" when altitude is above -0.833 degrees (accounts for refraction)
  return altitude > -0.833;
}

/**
 * Calculate sun position for a given location and time
 * Returns solar altitude and azimuth angles
 *
 * @param lat - Latitude in decimal degrees
 * @param lon - Longitude in decimal degrees
 * @param date - Date/time to calculate for
 * @returns Object with altitude (degrees above horizon) and azimuth (degrees from north)
 */
export function getSunPosition(
  lat: number,
  lon: number,
  date: Date = new Date(),
): { altitude: number; azimuth: number } {
  // Convert to radians
  const latRad = lat * (Math.PI / 180);

  // Calculate Julian day
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const julianCentury = (julianDate - 2451545) / 36525;

  // Solar coordinates
  const geomMeanLongSun =
    (280.46646 + julianCentury * (36000.76983 + 0.0003032 * julianCentury)) %
    360;
  const geomMeanAnomSun =
    357.52911 + julianCentury * (35999.05029 - 0.0001537 * julianCentury);
  const eccentEarthOrbit =
    0.016708634 - julianCentury * (0.000042037 + 0.0000001267 * julianCentury);

  const sunEqOfCtr =
    Math.sin((geomMeanAnomSun * Math.PI) / 180) *
      (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury)) +
    Math.sin((2 * geomMeanAnomSun * Math.PI) / 180) *
      (0.019993 - 0.000101 * julianCentury) +
    Math.sin((3 * geomMeanAnomSun * Math.PI) / 180) * 0.000289;

  const sunTrueLong = geomMeanLongSun + sunEqOfCtr;
  const sunAppLong =
    sunTrueLong -
    0.00569 -
    0.00478 * Math.sin(((125.04 - 1934.136 * julianCentury) * Math.PI) / 180);

  const meanObliqEcliptic =
    23 +
    (26 +
      (21.448 -
        julianCentury *
          (46.815 + julianCentury * (0.00059 - julianCentury * 0.001813))) /
        60) /
      60;
  const obliqCorr =
    meanObliqEcliptic +
    0.00256 * Math.cos(((125.04 - 1934.136 * julianCentury) * Math.PI) / 180);

  const sunDeclin =
    (Math.asin(
      Math.sin((obliqCorr * Math.PI) / 180) *
        Math.sin((sunAppLong * Math.PI) / 180),
    ) *
      180) /
    Math.PI;

  // Equation of time
  const varY = Math.tan(((obliqCorr / 2) * Math.PI) / 180) ** 2;
  const eqOfTime =
    4 *
    (180 / Math.PI) *
    (varY * Math.sin((2 * geomMeanLongSun * Math.PI) / 180) -
      2 * eccentEarthOrbit * Math.sin((geomMeanAnomSun * Math.PI) / 180) +
      4 *
        eccentEarthOrbit *
        varY *
        Math.sin((geomMeanAnomSun * Math.PI) / 180) *
        Math.cos((2 * geomMeanLongSun * Math.PI) / 180) -
      0.5 * varY * varY * Math.sin((4 * geomMeanLongSun * Math.PI) / 180) -
      1.25 *
        eccentEarthOrbit *
        eccentEarthOrbit *
        Math.sin((2 * geomMeanAnomSun * Math.PI) / 180));

  // Time offset and true solar time
  const timeOffset = eqOfTime + 4 * lon - (60 * date.getTimezoneOffset()) / -60;
  const trueSolarTime =
    (date.getHours() * 60 +
      date.getMinutes() +
      date.getSeconds() / 60 +
      timeOffset) %
    1440;

  // Hour angle
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  // Solar zenith and altitude
  const solarZenith =
    (Math.acos(
      Math.sin(latRad) * Math.sin((sunDeclin * Math.PI) / 180) +
        Math.cos(latRad) *
          Math.cos((sunDeclin * Math.PI) / 180) *
          Math.cos((hourAngle * Math.PI) / 180),
    ) *
      180) /
    Math.PI;

  const altitude = 90 - solarZenith;

  // Solar azimuth
  let azimuth: number;
  if (hourAngle > 0) {
    azimuth =
      ((Math.acos(
        (Math.sin(latRad) * Math.cos((solarZenith * Math.PI) / 180) -
          Math.sin((sunDeclin * Math.PI) / 180)) /
          (Math.cos(latRad) * Math.sin((solarZenith * Math.PI) / 180)),
      ) *
        180) /
        Math.PI +
        180) %
      360;
  } else {
    azimuth =
      (540 -
        (Math.acos(
          (Math.sin(latRad) * Math.cos((solarZenith * Math.PI) / 180) -
            Math.sin((sunDeclin * Math.PI) / 180)) /
            (Math.cos(latRad) * Math.sin((solarZenith * Math.PI) / 180)),
        ) *
          180) /
          Math.PI) %
      360;
  }

  return {
    altitude: Math.round(altitude * 100) / 100,
    azimuth: Math.round(azimuth * 100) / 100,
  };
}

/**
 * Get sunrise and sunset times for a location
 *
 * @param lat - Latitude in decimal degrees
 * @param lon - Longitude in decimal degrees
 * @param date - Date to calculate for (default: today)
 * @returns Object with sunrise and sunset Date objects, or null if midnight sun/polar night
 */
export function getSunTimes(
  lat: number,
  lon: number,
  date: Date = new Date(),
): { sunrise: Date | null; sunset: Date | null } {
  // Simplified sunrise/sunset calculation
  // For more accuracy, use a dedicated library like SunCalc

  const dayOfYear = getDayOfYear(date);
  const latRad = lat * (Math.PI / 180);

  // Solar declination (simplified)
  const declination = -23.45 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const declinationRad = declination * (Math.PI / 180);

  // Hour angle
  const cosHourAngle = -Math.tan(latRad) * Math.tan(declinationRad);

  // Check for midnight sun or polar night
  if (cosHourAngle < -1) {
    // Midnight sun - sun never sets
    return { sunrise: null, sunset: null };
  }
  if (cosHourAngle > 1) {
    // Polar night - sun never rises
    return { sunrise: null, sunset: null };
  }

  const hourAngle = Math.acos(cosHourAngle) * (180 / Math.PI);

  // Solar noon (local time)
  const solarNoon = 12 - lon / 15;

  const sunriseHour = solarNoon - hourAngle / 15;
  const sunsetHour = solarNoon + hourAngle / 15;

  const sunrise = new Date(date);
  sunrise.setHours(
    Math.floor(sunriseHour),
    Math.round((sunriseHour % 1) * 60),
    0,
    0,
  );

  const sunset = new Date(date);
  sunset.setHours(
    Math.floor(sunsetHour),
    Math.round((sunsetHour % 1) * 60),
    0,
    0,
  );

  return { sunrise, sunset };
}

/**
 * Get the day of year (1-366)
 */
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}
