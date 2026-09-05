import type { NoiseEnvironment } from "@/lib/utils/noiseModel";
import { getEnhancedBandConditions } from "@/lib/utils/bands";
import { getAntennaGainForPath, type AntennaType } from "@/lib/data/antennas";
import { calculateGreatCircleDistance } from "@/lib/utils/bands";
import type { KpPoint, SolarFluxForecastProduct } from "@/lib/solar/dataTypes";
export interface HomeForecastInput {
  origin: { lat: number; lon: number }; target: { lat: number; lon: number };
  now: number; kp: number; sfi: number; predictedKp: KpPoint[]; fluxForecast?: SolarFluxForecastProduct;
  mode: "SSB" | "CW" | "FT8"; power: number; antenna: AntennaType; noise: NoiseEnvironment;
}
export function forecastSolarInput(input: Pick<HomeForecastInput, "kp" | "sfi" | "predictedKp" | "fluxForecast">, at: number) {
  const kp = input.predictedKp.find(point => point.kind === "predicted" && Date.parse(point.time_tag) <= at && at < Date.parse(point.time_tag) + 10800000);
  const flux = input.fluxForecast?.forecast.find(point => point.date === new Date(at).toISOString().slice(0,10));
  return { kp: kp?.kp ?? input.kp, sfi: flux?.predicted_flux ?? input.sfi, kpSource: kp ? "NOAA forecast" : "current held constant", fluxSource: flux ? "NOAA forecast" : "current held constant" };
}
export function buildHomeForecast(input: HomeForecastInput) {
  if (![input.now,input.kp,input.sfi,input.power,input.origin.lat,input.origin.lon,input.target.lat,input.target.lon].every(Number.isFinite) || input.power <= 0 || input.power > 1500 || input.sfi <= 0 || input.kp < 0 || input.kp > 9) return [];
  const gain = getAntennaGainForPath(input.antenna, calculateGreatCircleDistance(input.origin.lat,input.origin.lon,input.target.lat,input.target.lon));
  return [0,3,6,9,12].map(hours => {
    const at = input.now + hours * 3600000;
    const solar = forecastSolarInput(input, at);
    return { at, ...solar, bands: getEnhancedBandConditions(input.origin.lat,input.origin.lon,input.target.lat,input.target.lon,solar.kp,solar.sfi,new Date(at),input.power,input.mode,gain,input.noise) };
  });
}

export function upcomingKp(points: KpPoint[], now: number) {
  return points.filter(point => point.kind === "predicted" && Date.parse(point.time_tag) + 10800000 > now && Date.parse(point.time_tag) < now + 86400000);
}
