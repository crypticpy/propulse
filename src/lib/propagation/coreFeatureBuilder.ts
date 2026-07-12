import type { CoreFeatureValues } from "./modelClient";

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

export const HF_BAND_MHZ: Record<string, number> = {
  "160m": 1.9,
  "80m": 3.6,
  "60m": 5.35,
  "40m": 7.1,
  "30m": 10.12,
  "20m": 14.1,
  "17m": 18.1,
  "15m": 21.1,
  "12m": 24.9,
  "10m": 28.1,
};

const WEATHER_FEATURES = [
  "bt",
  "bx_gsm",
  "by_gsm",
  "bz_gsm",
  "temperature_k",
  "density_cm3",
  "wind_speed",
  "flow_pressure",
  "electric_field",
  "plasma_beta",
  "alfven_mach",
  "kp",
  "sunspot_number",
  "dst",
  "ae",
  "proton_flux_10mev",
  "ap",
  "f107",
  "pcn",
  "al",
  "au",
  "magnetosonic_mach",
  "hp60",
] as const;

const DERIVED_WEATHER_FEATURES = [
  "kp_delta_3h",
  "kp_max_24h",
  "bz_min_3h",
  "dst_min_6h",
] as const;

export type OperationalSpaceWeather = Partial<
  Record<(typeof WEATHER_FEATURES)[number] | (typeof DERIVED_WEATHER_FEATURES)[number], number>
>;

export interface RecentPathHistory {
  prev1?: number;
  prev2?: number;
  prev3?: number;
  prev24?: number;
}

export interface CorePathFeatureInput {
  origin: { lat: number; lon: number };
  target: { lat: number; lon: number };
  band: string;
  declaredPowerWatts: number;
  validTime: Date;
  weather?: OperationalSpaceWeather;
  history?: RecentPathHistory;
}

function normalizeLongitude(value: number): number {
  return ((value + 540) % 360) - 180;
}

function sunElevation(date: Date, lat: number, lon: number): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000);
  const fractionalHour = date.getUTCHours() + 0.5;
  const gamma =
    (2 * Math.PI) / 365 * (dayOfYear - 1 + (fractionalHour - 12) / 24);
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const hourAngle =
    ((fractionalHour * 60 + equationOfTime + 4 * lon) / 4 - 180) * DEG;
  const latRad = lat * DEG;
  const sine = Math.max(
    -1,
    Math.min(
      1,
      Math.sin(latRad) * Math.sin(declination) +
        Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle),
    ),
  );
  return Math.asin(sine) / DEG;
}

export function buildCorePathFeatures(input: CorePathFeatureInput): CoreFeatureValues {
  const frequency = HF_BAND_MHZ[input.band];
  if (!frequency) throw new Error(`Unsupported HF model band: ${input.band}`);
  if (!Number.isFinite(input.declaredPowerWatts) || input.declaredPowerWatts <= 0) {
    throw new Error("Declared power must be positive");
  }
  const la1 = input.origin.lat * DEG;
  const lo1 = input.origin.lon * DEG;
  const la2 = input.target.lat * DEG;
  const lo2 = input.target.lon * DEG;
  const deltaLon = lo2 - lo1;
  const central = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(la1) * Math.sin(la2) +
          Math.cos(la1) * Math.cos(la2) * Math.cos(deltaLon),
      ),
    ),
  );
  const midLatRad = Math.atan2(
    Math.sin(la1) + Math.sin(la2),
    Math.sqrt(
      Math.pow(Math.cos(la1) + Math.cos(la2) * Math.cos(deltaLon), 2) +
        Math.pow(Math.cos(la2) * Math.sin(deltaLon), 2),
    ),
  );
  const midLonRad =
    lo1 +
    Math.atan2(
      Math.cos(la2) * Math.sin(deltaLon),
      Math.cos(la1) + Math.cos(la2) * Math.cos(deltaLon),
    );
  const bearing = Math.atan2(
    Math.sin(deltaLon) * Math.cos(la2),
    Math.cos(la1) * Math.sin(la2) -
      Math.sin(la1) * Math.cos(la2) * Math.cos(deltaLon),
  );
  const midLat = midLatRad / DEG;
  const midLon = normalizeLongitude(midLonRad / DEG);
  const hour = input.validTime.getUTCHours() + 0.5;
  const start = Date.UTC(input.validTime.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((input.validTime.getTime() - start) / 86_400_000);
  const sunTx = sunElevation(input.validTime, input.origin.lat, input.origin.lon);
  const sunRx = sunElevation(input.validTime, input.target.lat, input.target.lon);
  const sunMid = sunElevation(input.validTime, midLat, midLon);
  const powerDbm = 10 * Math.log10(input.declaredPowerWatts * 1000);
  const values: CoreFeatureValues = {
    band_mhz: frequency,
    power_bin_dbm: Math.round(powerDbm / 5) * 5,
    hod_sin: Math.sin((2 * Math.PI * hour) / 24),
    hod_cos: Math.cos((2 * Math.PI * hour) / 24),
    doy_sin: Math.sin((2 * Math.PI * (dayOfYear - 1)) / 365),
    doy_cos: Math.cos((2 * Math.PI * (dayOfYear - 1)) / 365),
    is_weekend: [0, 6].includes(input.validTime.getUTCDay()) ? 1 : 0,
    dist_km: central * EARTH_RADIUS_KM,
    bearing_sin: Math.sin(bearing),
    bearing_cos: Math.cos(bearing),
    tx_lat_sin: Math.sin(la1),
    tx_lat_cos: Math.cos(la1),
    tx_lon_sin: Math.sin(lo1),
    tx_lon_cos: Math.cos(lo1),
    rx_lat_sin: Math.sin(la2),
    rx_lat_cos: Math.cos(la2),
    mid_lat_sin: Math.sin(midLatRad),
    mid_lat_cos: Math.cos(midLatRad),
    sun_elev_tx: sunTx,
    sun_elev_rx: sunRx,
    sun_elev_mid: sunMid,
    dark_frac: Number(sunTx < 0) / 3 + Number(sunMid < 0) / 3 + Number(sunRx < 0) / 3,
    min_abs_elev_ends: Math.min(Math.abs(sunTx), Math.abs(sunRx)),
  };
  for (const band of Object.keys(HF_BAND_MHZ)) {
    values[`band_${band}`] = Number(band === input.band);
  }
  for (const name of WEATHER_FEATURES) {
    const value = input.weather?.[name];
    values[`${name}_missing`] = value == null ? 1 : 0;
    if (value != null && Number.isFinite(value)) values[name] = value;
  }
  for (const name of DERIVED_WEATHER_FEATURES) {
    const value = input.weather?.[name];
    if (value != null && Number.isFinite(value)) values[name] = value;
  }
  for (const [lag, value] of Object.entries({
    prev1: input.history?.prev1,
    prev2: input.history?.prev2,
    prev3: input.history?.prev3,
    prev24: input.history?.prev24,
  })) {
    values[`path_success_${lag}`] = value ?? 0;
    values[`path_${lag}_available`] = value == null ? 0 : 1;
  }
  return values;
}
