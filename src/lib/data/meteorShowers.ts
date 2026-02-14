/**
 * Major Meteor Shower Calendar for VHF/UHF Meteor Scatter
 *
 * Meteor scatter propagation on 6 meters (50 MHz) and 2 meters (144 MHz)
 * is enhanced during major meteor showers. This module provides accurate
 * astronomical data for ~20 major meteor showers to support:
 *
 * - Globe overlay showing active shower radiants
 * - Meteor scatter band condition predictions
 * - Calendar/scheduling for MS operating sessions
 *
 * Data sources:
 * - IAU Meteor Data Center (https://www.ta3.sk/IAUC22DB/MDC2022/)
 * - International Meteor Organization (IMO) shower calendar
 * - American Meteor Society (AMS)
 *
 * RA/Dec values are J2000.0 epoch radiant positions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeteorShower {
  /** Common name */
  name: string;
  /** IAU three-letter code */
  code: string;
  /** Peak month (1-12) */
  peakMonth: number;
  /** Peak day of month */
  peakDay: number;
  /** Active period start month (1-12) */
  activeStartMonth: number;
  /** Active period start day */
  activeStartDay: number;
  /** Active period end month (1-12) */
  activeEndMonth: number;
  /** Active period end day */
  activeEndDay: number;
  /** Right Ascension of radiant in degrees (J2000) */
  radiantRA: number;
  /** Declination of radiant in degrees (J2000) */
  radiantDec: number;
  /** Zenithal Hourly Rate at peak */
  zhr: number;
  /** Geocentric entry velocity in km/s */
  velocity: number;
  /** Parent body (comet or asteroid) */
  parentBody: string;
  /** Good for 6m (50 MHz) meteor scatter */
  bestFor6m: boolean;
}

// ---------------------------------------------------------------------------
// Shower Data
// ---------------------------------------------------------------------------

export const MAJOR_METEOR_SHOWERS: MeteorShower[] = [
  {
    name: "Quadrantids",
    code: "QUA",
    peakMonth: 1,
    peakDay: 4,
    activeStartMonth: 1,
    activeStartDay: 1,
    activeEndMonth: 1,
    activeEndDay: 10,
    radiantRA: 230.1,
    radiantDec: 48.5,
    zhr: 110,
    velocity: 41,
    parentBody: "2003 EH1 (asteroid)",
    bestFor6m: true,
  },
  {
    name: "Lyrids",
    code: "LYR",
    peakMonth: 4,
    peakDay: 22,
    activeStartMonth: 4,
    activeStartDay: 14,
    activeEndMonth: 4,
    activeEndDay: 30,
    radiantRA: 271.4,
    radiantDec: 33.6,
    zhr: 18,
    velocity: 49,
    parentBody: "C/1861 G1 (Thatcher)",
    bestFor6m: true,
  },
  {
    name: "Pi Puppids",
    code: "PPU",
    peakMonth: 4,
    peakDay: 24,
    activeStartMonth: 4,
    activeStartDay: 15,
    activeEndMonth: 4,
    activeEndDay: 28,
    radiantRA: 110.0,
    radiantDec: -45.0,
    zhr: 40,
    velocity: 18,
    parentBody: "26P/Grigg-Skjellerup",
    bestFor6m: false,
  },
  {
    name: "Eta Aquariids",
    code: "ETA",
    peakMonth: 5,
    peakDay: 6,
    activeStartMonth: 4,
    activeStartDay: 19,
    activeEndMonth: 5,
    activeEndDay: 28,
    radiantRA: 338.0,
    radiantDec: -1.0,
    zhr: 50,
    velocity: 66,
    parentBody: "1P/Halley",
    bestFor6m: true,
  },
  {
    name: "Arietids",
    code: "ARI",
    peakMonth: 6,
    peakDay: 7,
    activeStartMonth: 5,
    activeStartDay: 22,
    activeEndMonth: 7,
    activeEndDay: 2,
    radiantRA: 44.5,
    radiantDec: 24.0,
    zhr: 30,
    velocity: 39,
    parentBody: "96P/Machholz (or Phaethon)",
    bestFor6m: true,
  },
  {
    name: "June Bootids",
    code: "JBO",
    peakMonth: 6,
    peakDay: 27,
    activeStartMonth: 6,
    activeStartDay: 22,
    activeEndMonth: 7,
    activeEndDay: 2,
    radiantRA: 224.0,
    radiantDec: 48.0,
    zhr: 5,
    velocity: 18,
    parentBody: "7P/Pons-Winnecke",
    bestFor6m: false,
  },
  {
    name: "Southern Delta Aquariids",
    code: "SDA",
    peakMonth: 7,
    peakDay: 30,
    activeStartMonth: 7,
    activeStartDay: 12,
    activeEndMonth: 8,
    activeEndDay: 23,
    radiantRA: 340.0,
    radiantDec: -16.3,
    zhr: 25,
    velocity: 41,
    parentBody: "96P/Machholz",
    bestFor6m: true,
  },
  {
    name: "Alpha Capricornids",
    code: "CAP",
    peakMonth: 7,
    peakDay: 30,
    activeStartMonth: 7,
    activeStartDay: 3,
    activeEndMonth: 8,
    activeEndDay: 15,
    radiantRA: 307.0,
    radiantDec: -10.0,
    zhr: 5,
    velocity: 23,
    parentBody: "169P/NEAT",
    bestFor6m: false,
  },
  {
    name: "Perseids",
    code: "PER",
    peakMonth: 8,
    peakDay: 12,
    activeStartMonth: 7,
    activeStartDay: 17,
    activeEndMonth: 8,
    activeEndDay: 24,
    radiantRA: 48.0,
    radiantDec: 58.0,
    zhr: 100,
    velocity: 59,
    parentBody: "109P/Swift-Tuttle",
    bestFor6m: true,
  },
  {
    name: "Kappa Cygnids",
    code: "KCG",
    peakMonth: 8,
    peakDay: 17,
    activeStartMonth: 8,
    activeStartDay: 3,
    activeEndMonth: 8,
    activeEndDay: 25,
    radiantRA: 286.0,
    radiantDec: 59.0,
    zhr: 3,
    velocity: 25,
    parentBody: "Unknown",
    bestFor6m: false,
  },
  {
    name: "Draconids",
    code: "DRA",
    peakMonth: 10,
    peakDay: 8,
    activeStartMonth: 10,
    activeStartDay: 6,
    activeEndMonth: 10,
    activeEndDay: 10,
    radiantRA: 262.0,
    radiantDec: 54.0,
    zhr: 10,
    velocity: 20,
    parentBody: "21P/Giacobini-Zinner",
    bestFor6m: false,
  },
  {
    name: "Orionids",
    code: "ORI",
    peakMonth: 10,
    peakDay: 21,
    activeStartMonth: 10,
    activeStartDay: 2,
    activeEndMonth: 11,
    activeEndDay: 7,
    radiantRA: 95.0,
    radiantDec: 15.5,
    zhr: 20,
    velocity: 66,
    parentBody: "1P/Halley",
    bestFor6m: true,
  },
  {
    name: "Southern Taurids",
    code: "STA",
    peakMonth: 10,
    peakDay: 10,
    activeStartMonth: 9,
    activeStartDay: 10,
    activeEndMonth: 11,
    activeEndDay: 20,
    radiantRA: 32.0,
    radiantDec: 9.0,
    zhr: 5,
    velocity: 27,
    parentBody: "2P/Encke",
    bestFor6m: false,
  },
  {
    name: "Northern Taurids",
    code: "NTA",
    peakMonth: 11,
    peakDay: 12,
    activeStartMonth: 10,
    activeStartDay: 20,
    activeEndMonth: 12,
    activeEndDay: 10,
    radiantRA: 58.0,
    radiantDec: 22.0,
    zhr: 5,
    velocity: 29,
    parentBody: "2P/Encke",
    bestFor6m: false,
  },
  {
    name: "Leonids",
    code: "LEO",
    peakMonth: 11,
    peakDay: 17,
    activeStartMonth: 11,
    activeStartDay: 6,
    activeEndMonth: 11,
    activeEndDay: 30,
    radiantRA: 152.0,
    radiantDec: 21.6,
    zhr: 15,
    velocity: 71,
    parentBody: "55P/Tempel-Tuttle",
    bestFor6m: true,
  },
  {
    name: "Andromedids",
    code: "AND",
    peakMonth: 12,
    peakDay: 3,
    activeStartMonth: 11,
    activeStartDay: 25,
    activeEndMonth: 12,
    activeEndDay: 6,
    radiantRA: 25.5,
    radiantDec: 37.0,
    zhr: 3,
    velocity: 19,
    parentBody: "3D/Biela",
    bestFor6m: false,
  },
  {
    name: "Phoenicids",
    code: "PHO",
    peakMonth: 12,
    peakDay: 2,
    activeStartMonth: 11,
    activeStartDay: 28,
    activeEndMonth: 12,
    activeEndDay: 9,
    radiantRA: 18.0,
    radiantDec: -53.0,
    zhr: 5,
    velocity: 18,
    parentBody: "289P/Blanpain",
    bestFor6m: false,
  },
  {
    name: "Geminids",
    code: "GEM",
    peakMonth: 12,
    peakDay: 14,
    activeStartMonth: 12,
    activeStartDay: 4,
    activeEndMonth: 12,
    activeEndDay: 20,
    radiantRA: 112.3,
    radiantDec: 32.5,
    zhr: 150,
    velocity: 35,
    parentBody: "3200 Phaethon (asteroid)",
    bestFor6m: true,
  },
  {
    name: "Ursids",
    code: "URS",
    peakMonth: 12,
    peakDay: 22,
    activeStartMonth: 12,
    activeStartDay: 17,
    activeEndMonth: 12,
    activeEndDay: 26,
    radiantRA: 217.0,
    radiantDec: 75.8,
    zhr: 10,
    velocity: 33,
    parentBody: "8P/Tuttle",
    bestFor6m: false,
  },
  {
    name: "Sigma Hydrids",
    code: "HYD",
    peakMonth: 12,
    peakDay: 6,
    activeStartMonth: 12,
    activeStartDay: 3,
    activeEndMonth: 12,
    activeEndDay: 15,
    radiantRA: 127.0,
    radiantDec: 2.0,
    zhr: 3,
    velocity: 58,
    parentBody: "Unknown",
    bestFor6m: true,
  },
];

// ---------------------------------------------------------------------------
// Sidereal Time Calculation
// ---------------------------------------------------------------------------

/**
 * Greenwich Mean Sidereal Time in hours.
 *
 * Uses the IAU 1982 model (accurate to ~0.1 second for modern dates).
 *
 * @param date - UTC date/time
 * @returns GMST in hours (0-24)
 */
function getGMST(date: Date): number {
  // Julian date
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  // Julian centuries from J2000.0
  const T = (jd - 2_451_545.0) / 36_525;
  // GMST in degrees (IAU 1982 model)
  const gmstDeg =
    280.46061837 +
    360.98564736629 * (jd - 2_451_545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38_710_000;
  // Normalize to 0-360 degrees, then convert to hours
  return (((gmstDeg % 360) + 360) % 360) / 15;
}

// ---------------------------------------------------------------------------
// Radiant Position
// ---------------------------------------------------------------------------

/**
 * Convert RA/Dec (J2000 equatorial coordinates) to approximate geographic
 * lat/lon of the radiant's sub-point based on current sidereal time.
 *
 * The "sub-point" is the point on Earth's surface directly below the
 * radiant at the given time. This is useful for globe overlay rendering.
 *
 * @param raDec - Right Ascension and Declination in degrees
 * @param date - UTC date/time
 * @returns Approximate geographic coordinates { lat, lon }
 */
export function radiantToLatLon(
  raDec: { ra: number; dec: number },
  date: Date,
): { lat: number; lon: number } {
  // Declination maps directly to latitude
  const lat = raDec.dec;

  // RA maps to longitude offset from GMST
  // RA in hours = raDec.ra / 15
  // Hour Angle = GMST - RA (both in hours)
  // Longitude = -HA * 15 (converting hours to degrees)
  const gmstHours = getGMST(date);
  const raHours = raDec.ra / 15;
  const haHours = gmstHours - raHours;
  // Sub-point longitude is negative of hour angle converted to degrees
  const lon = ((-haHours * 15 + 540) % 360) - 180;

  return { lat, lon };
}

// ---------------------------------------------------------------------------
// Active Shower Queries
// ---------------------------------------------------------------------------

/**
 * Check if a given month/day falls within a shower's active period.
 * Handles year-boundary wrapping (e.g., Dec 17 - Jan 10).
 */
function isDateInRange(
  month: number,
  day: number,
  shower: MeteorShower,
): boolean {
  const current = month * 100 + day;
  const start = shower.activeStartMonth * 100 + shower.activeStartDay;
  const end = shower.activeEndMonth * 100 + shower.activeEndDay;

  if (start <= end) {
    // Normal range within the same year
    return current >= start && current <= end;
  }
  // Wraps around year boundary (e.g., Dec-Jan)
  return current >= start || current <= end;
}

/**
 * Get currently active meteor showers for a given date.
 *
 * @param date - Date to check (defaults to now)
 * @returns Array of showers whose active period includes the given date
 */
export function getActiveShowers(date: Date = new Date()): MeteorShower[] {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return MAJOR_METEOR_SHOWERS.filter((s) => isDateInRange(month, day, s));
}

/**
 * Get active showers that are good for 6m meteor scatter.
 *
 * @param date - Date to check (defaults to now)
 * @returns Array of 6m-favorable active showers
 */
export function getActive6mShowers(date: Date = new Date()): MeteorShower[] {
  return getActiveShowers(date).filter((s) => s.bestFor6m);
}

/**
 * Days until peak for a shower relative to a given date.
 * Returns 0 on the peak day itself.
 *
 * @param shower - Meteor shower
 * @param date - Reference date (defaults to now)
 * @returns Number of days until the next occurrence of the peak
 */
export function daysUntilPeak(
  shower: MeteorShower,
  date: Date = new Date(),
): number {
  const now = new Date(date);
  now.setHours(0, 0, 0, 0);

  const peakDate = new Date(
    now.getFullYear(),
    shower.peakMonth - 1,
    shower.peakDay,
  );
  peakDate.setHours(0, 0, 0, 0);

  if (peakDate < now) {
    peakDate.setFullYear(peakDate.getFullYear() + 1);
  }

  return Math.round(
    (peakDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * Get a meteor scatter quality rating for the current date.
 *
 * Considers active showers, their ZHR, velocity (fast meteors produce
 * longer ionization trails), and proximity to peak.
 *
 * @param date - Date to check (defaults to now)
 * @returns Quality rating from 0 (no showers) to 100 (peak Geminids/Perseids)
 */
export function getMeteorScatterQuality(date: Date = new Date()): number {
  const active = getActiveShowers(date);
  if (active.length === 0) return 0;

  let maxScore = 0;

  for (const shower of active) {
    const peakDays = daysUntilPeak(shower, date);
    // Use simple symmetric falloff; peak day gives full score
    const peakProximity = Math.max(0, 1 - peakDays / 15);

    // ZHR contributes most; high-velocity meteors produce better ionization
    const velocityFactor = Math.min(1.5, shower.velocity / 40);
    const zhrScore = Math.min(100, shower.zhr * velocityFactor * peakProximity);

    maxScore = Math.max(maxScore, zhrScore);
  }

  return Math.round(Math.min(100, maxScore));
}
