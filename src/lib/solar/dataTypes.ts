export interface KpPoint {
  time_tag: string;
  kp: number;
  kind: "observed" | "estimated" | "predicted";
  noaa_scale: string | null;
  /** Official running planetary A value when supplied by NOAA. */
  a_running: number | null;
}

export interface SolarFluxPoint {
  time_tag: string;
  flux: number;
  frequency: 2800;
  schedule: string | null;
}

export interface FlareProbabilityForecast {
  issue_time: string;
  horizon: "1 day";
  c_class: number;
  m_class: number;
  x_class: number;
  proton_10mev: number;
}

export interface MagnetometerPoint {
  time_tag: string;
  bz_gsm: number | null;
  by_gsm: number | null;
  bt: number | null;
}

export interface SunspotPoint {
  time_tag: string;
  ssn: number;
}

export interface XrayPoint {
  time_tag: string;
  flux: number;
  energy: "0.1-0.8nm";
  satellite: number | null;
}

export interface ProtonPoint {
  time_tag: string;
  flux: number;
  energy: ">=10 MeV";
  satellite: number | null;
}

export interface DstPoint {
  time_tag: string;
  dst: number;
}

export interface DrapGrid {
  observation_time: string;
  forecast_time: string;
  frequencies: number[][];
  latitudes: number[];
  longitudes: number[];
}

export interface CmeAnalysisPoint {
  time21_5: string;
  latitude: number;
  longitude: number;
  halfAngle: number;
  speed: number;
  type: string;
  note: string;
  catalog: string;
  link: string;
}

export interface SolarFluxForecastPoint {
  date: string;
  predicted_flux: number;
  predicted_planetary_a: number;
}

export interface SolarFluxForecastProduct {
  issued_at: string;
  forecast: SolarFluxForecastPoint[];
}

export interface NoaaScaleValue {
  scale: number | null;
  text: string | null;
}

export interface NoaaScalesProduct {
  observed_at: string;
  radio_blackout: NoaaScaleValue;
  solar_radiation: NoaaScaleValue;
  geomagnetic_storm: NoaaScaleValue;
}

export interface OfficialSolarAlert {
  product_id: string;
  issued_at: string;
  title: string;
  message: string;
  severity: "information" | "watch" | "warning" | "alert" | "summary";
}

export interface LatestXrayFlare {
  time_tag: string;
  current_class: string;
  max_class: string;
  begin_time: string;
  max_time: string;
  end_time: string | null;
  satellite: number | null;
}

export interface SolarWindMagPoint {
  time_tag: string;
  bx_gsm: number | null;
  by_gsm: number | null;
  bz_gsm: number | null;
  bt: number | null;
}

export interface SolarWindPlasmaPoint {
  time_tag: string;
  density: number | null;
  speed: number | null;
  temperature: number | null;
}
