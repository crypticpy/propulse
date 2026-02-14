/**
 * ITU-R P.372 External Noise Floor Model
 *
 * Extends the base noiseModel.ts with geographic/temporal awareness
 * for globe overlay heatmap rendering. While noiseModel.ts provides
 * per-band noise assessment for a single environment, this module
 * generates spatial noise grids suitable for map visualization.
 *
 * Components modeled:
 * - **Atmospheric noise (Fa)**: Dominant at HF, highest in tropical regions
 *   at night, varies strongly with season, time, and latitude.
 * - **Man-made noise (Fm)**: Depends on urbanization level. Coefficients
 *   from ITU-R P.372-16 Table 1.
 * - **Galactic noise (Fg)**: Cosmic background, independent of location
 *   or time, dominant above ~20 MHz in quiet environments.
 *
 * All noise figures are expressed as Fa (dB above kTB at 290K reference).
 *
 * Reference: ITU-R P.372-16 "Radio noise"
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NoiseFloorResult {
  /** Atmospheric noise figure (dB above kTB) */
  atmospheric: number;
  /** Man-made noise figure (dB above kTB) */
  manMade: number;
  /** Galactic/cosmic noise figure (dB above kTB) */
  galactic: number;
  /** Total combined external noise figure (dB) */
  total: number;
  /** Equivalent noise temperature in Kelvin */
  temperatureK: number;
}

export type UrbanLevel =
  | "quiet_rural"
  | "rural"
  | "residential"
  | "business"
  | "city";

export interface NoiseFloorGrid {
  /** Latitude values (south to north) */
  lats: number[];
  /** Longitude values (west to east) */
  lons: number[];
  /** 2D array of total noise floor values [lat][lon] in dB */
  values: number[][];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference temperature for noise figure calculations */
const T0_KELVIN = 290;

/**
 * Man-made noise coefficients from ITU-R P.372-16 Table 1.
 * Formula: Fm = c - d * log10(f_MHz)
 */
const MAN_MADE_COEFFICIENTS: Record<UrbanLevel, { c: number; d: number }> = {
  city: { c: 76.8, d: 27.7 },
  business: { c: 72.5, d: 27.7 },
  residential: { c: 67.2, d: 27.7 },
  rural: { c: 53.6, d: 28.6 },
  quiet_rural: { c: 44.2, d: 29.4 },
};

/**
 * Atmospheric noise base coefficients by latitude zone.
 *
 * The ITU-R P.372 model uses complex map-based data (CCIR Report 322).
 * We use a simplified parameterized model that captures the major
 * geographic and temporal variations:
 *
 * - Tropical regions (|lat| < 23.5): highest atmospheric noise
 *   (equatorial thunderstorm belt)
 * - Temperate regions (23.5-55): moderate, with seasonal variation
 * - High latitudes (|lat| > 55): lowest atmospheric noise
 *
 * Base formula: Fa_atm = baseC - baseD * log10(f_MHz)
 * with corrections for time of day, season, and latitude zone.
 */
const ATMOSPHERIC_ZONES = {
  tropical: { baseC: 110, baseD: 33 },
  temperate: { baseC: 95, baseD: 33 },
  highLat: { baseC: 80, baseD: 33 },
} as const;

/** Tropical latitude threshold */
const TROPICAL_LAT = 23.5;
/** High latitude threshold */
const HIGH_LAT = 55;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function clampFrequency(mhz: number): number {
  return Math.max(0.5, Math.min(100, mhz));
}

/**
 * Power-sum dB values: 10 * log10(sum(10^(x/10)))
 */
function powerSumDb(...figures: number[]): number {
  const linearSum = figures.reduce((sum, fa) => sum + Math.pow(10, fa / 10), 0);
  return 10 * Math.log10(linearSum);
}

/**
 * Get local solar hour from UTC hour and longitude.
 */
function getLocalSolarHour(utcHour: number, lon: number): number {
  const offset = lon / 15; // 15 degrees per hour
  return (((utcHour + offset) % 24) + 24) % 24;
}

/**
 * Is it winter at this latitude and month?
 * Northern hemisphere winter: Nov-Feb; Southern: May-Aug
 */
function isWinter(month: number, lat: number): boolean {
  if (lat >= 0) {
    return month <= 2 || month >= 11; // Northern winter
  }
  return month >= 5 && month <= 8; // Southern winter
}

/**
 * Is it local nighttime? Simple model based on local solar hour.
 */
function isNighttime(localSolarHour: number): boolean {
  return localSolarHour < 6 || localSolarHour >= 18;
}

// ---------------------------------------------------------------------------
// Noise Component Calculations
// ---------------------------------------------------------------------------

/**
 * Calculate atmospheric noise figure (Fa) in dB.
 *
 * Uses a simplified ITU-R P.372 model:
 * - Base: Fa = c - d * log10(f_MHz) where c,d depend on latitude zone
 * - Nighttime correction: +10 dB (thunderstorm propagation increases at night)
 * - Summer correction: +5 dB (more thunderstorm activity)
 * - Tropical bonus: additional +5 dB for equatorial thunderstorm belt
 *
 * @param frequencyMHz - Frequency in MHz
 * @param lat - Latitude in degrees
 * @param localSolarHour - Local solar hour (0-23)
 * @param month - Month (1-12)
 */
function calculateAtmosphericNoise(
  frequencyMHz: number,
  lat: number,
  localSolarHour: number,
  month: number,
): number {
  const f = clampFrequency(frequencyMHz);
  const absLat = Math.abs(lat);

  // Select latitude zone coefficients
  let zone: keyof typeof ATMOSPHERIC_ZONES;
  if (absLat < TROPICAL_LAT) {
    zone = "tropical";
  } else if (absLat < HIGH_LAT) {
    zone = "temperate";
  } else {
    zone = "highLat";
  }

  const { baseC, baseD } = ATMOSPHERIC_ZONES[zone];
  let fa = baseC - baseD * Math.log10(f);

  // Nighttime enhancement: atmospheric noise propagates further at night
  // due to reduced D-layer absorption of the thunderstorm-generated signals
  if (isNighttime(localSolarHour)) {
    fa += 10;
  }

  // Summer enhancement: more thunderstorm activity
  if (!isWinter(month, lat)) {
    fa += 5;
  }

  // Tropical enhancement: equatorial thunderstorm belt
  // Smooth transition between 15-25 degrees
  if (absLat < 15) {
    fa += 5;
  } else if (absLat < TROPICAL_LAT) {
    fa += (5 * (TROPICAL_LAT - absLat)) / (TROPICAL_LAT - 15);
  }

  return Math.max(0, fa);
}

/**
 * Calculate man-made noise figure (Fm) in dB.
 *
 * Formula: Fm = c - d * log10(f_MHz)
 * Coefficients from ITU-R P.372-16 Table 1.
 *
 * @param frequencyMHz - Frequency in MHz
 * @param urban - Urbanization level
 */
function calculateManMadeNoise(
  frequencyMHz: number,
  urban: UrbanLevel,
): number {
  const f = clampFrequency(frequencyMHz);
  const { c, d } = MAN_MADE_COEFFICIENTS[urban];
  return Math.max(0, c - d * Math.log10(f));
}

/**
 * Calculate galactic (cosmic) noise figure (Fg) in dB.
 *
 * Formula: Fg = 52 - 23 * log10(f_MHz)
 * Independent of location, time, or season. Represents the integrated
 * cosmic radio background (mostly synchrotron radiation from the Milky Way).
 *
 * @param frequencyMHz - Frequency in MHz
 */
function calculateGalacticNoise(frequencyMHz: number): number {
  const f = clampFrequency(frequencyMHz);
  return Math.max(0, 52 - 23 * Math.log10(f));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate external noise at a given frequency and location.
 *
 * Combines atmospheric, man-made, and galactic noise components using
 * power summation. Returns individual component values and the total.
 *
 * @param frequencyMHz - Frequency in MHz (0.5 to 100)
 * @param lat - Latitude in degrees (-90 to 90)
 * @param lon - Longitude in degrees (-180 to 180)
 * @param hour - UTC hour (0-23)
 * @param month - Month (1-12)
 * @param urban - Urbanization level (default: "residential")
 * @returns Noise floor result with individual components and total
 */
export function calculateNoiseFloor(
  frequencyMHz: number,
  lat: number,
  lon: number,
  hour: number,
  month: number,
  urban: UrbanLevel = "residential",
): NoiseFloorResult {
  const localSolarHour = getLocalSolarHour(hour, lon);

  const atmospheric = calculateAtmosphericNoise(
    frequencyMHz,
    lat,
    localSolarHour,
    month,
  );
  const manMade = calculateManMadeNoise(frequencyMHz, urban);
  const galactic = calculateGalacticNoise(frequencyMHz);

  const total = powerSumDb(atmospheric, manMade, galactic);

  // Convert noise figure to equivalent noise temperature
  // T_noise = T0 * (10^(Fa/10) - 1) where T0 = 290K
  const temperatureK = T0_KELVIN * (Math.pow(10, total / 10) - 1);

  return {
    atmospheric: Math.round(atmospheric * 10) / 10,
    manMade: Math.round(manMade * 10) / 10,
    galactic: Math.round(galactic * 10) / 10,
    total: Math.round(total * 10) / 10,
    temperatureK: Math.round(temperatureK),
  };
}

/**
 * Generate a global noise floor grid for heatmap rendering.
 *
 * Produces a regular lat/lon grid of noise values suitable for
 * texture-mapping onto a globe or flat map projection.
 *
 * Uses "quiet_rural" for ocean/remote areas and "residential" for
 * land areas as a reasonable default. The grid is intended for
 * atmospheric noise visualization, so man-made noise is included
 * at a baseline level.
 *
 * @param frequencyMHz - Frequency in MHz
 * @param hour - UTC hour (0-23)
 * @param month - Month (1-12)
 * @param resolution - Grid spacing in degrees (default 10)
 * @returns Grid with latitude array, longitude array, and 2D value array
 */
export function generateNoiseFloorGrid(
  frequencyMHz: number,
  hour: number,
  month: number,
  resolution: number = 10,
): NoiseFloorGrid {
  const lats: number[] = [];
  const lons: number[] = [];
  const values: number[][] = [];

  // Generate latitude and longitude arrays
  for (let lat = -90; lat <= 90; lat += resolution) {
    lats.push(lat);
  }
  for (let lon = -180; lon < 180; lon += resolution) {
    lons.push(lon);
  }

  // Calculate noise at each grid point
  for (let latIdx = 0; latIdx < lats.length; latIdx++) {
    const lat = lats[latIdx];
    const row: number[] = [];

    for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
      const lon = lons[lonIdx];

      // Use quiet_rural as baseline for the grid (heatmap shows
      // atmospheric variation, not urban density)
      const result = calculateNoiseFloor(
        frequencyMHz,
        lat,
        lon,
        hour,
        month,
        "quiet_rural",
      );
      row.push(result.total);
    }

    values.push(row);
  }

  return { lats, lons, values };
}

/**
 * Get the dominant noise source at a given frequency and environment.
 *
 * Useful for UI labels explaining the noise floor to operators.
 *
 * @param result - Previously computed noise floor result
 * @returns String describing the dominant noise source
 */
export function getDominantNoiseSource(result: NoiseFloorResult): string {
  const maxComponent = Math.max(
    result.atmospheric,
    result.manMade,
    result.galactic,
  );

  if (maxComponent === result.atmospheric) {
    return "atmospheric (thunderstorm)";
  }
  if (maxComponent === result.manMade) {
    return "man-made (QRM)";
  }
  return "galactic (cosmic)";
}

/**
 * Classify the noise floor level for color-coding on the globe.
 *
 * @param totalDb - Total noise figure in dB
 * @returns Classification string
 */
export function classifyNoiseFloor(
  totalDb: number,
): "very_high" | "high" | "moderate" | "low" | "very_low" {
  if (totalDb >= 55) return "very_high";
  if (totalDb >= 40) return "high";
  if (totalDb >= 25) return "moderate";
  if (totalDb >= 12) return "low";
  return "very_low";
}
