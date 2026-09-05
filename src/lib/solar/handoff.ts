import { ALL_UI_MODES, type UIMode } from "@/lib/utils/modeNormalize";
import { latLonToGrid } from "@/lib/utils/grid";

export interface SolarHandoff {
  version: 1;
  target?: { lat: number; lon: number; grid: string; name?: string };
  mode: UIMode;
  /** Explicit planning instant; absent means live conditions. */
  at?: string;
}
export function parseSolarHandoff(value: unknown): SolarHandoff | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<SolarHandoff>;
  if (input.version !== 1 || !ALL_UI_MODES.includes(input.mode as UIMode)) return null;
  if (input.at !== undefined && (typeof input.at !== "string" || !Number.isFinite(Date.parse(input.at)))) return null;
  const target = input.target;
  if (target && (!Number.isFinite(target.lat) || !Number.isFinite(target.lon) || Math.abs(target.lat) > 90 || Math.abs(target.lon) > 180)) return null;
  return { version: 1, mode: input.mode as UIMode, ...(input.at ? { at: new Date(input.at).toISOString() } : {}),
    ...(target ? { target: { lat: target.lat, lon: target.lon, grid: latLonToGrid(target.lat, target.lon), ...(typeof target.name === "string" ? { name: target.name.slice(0, 120) } : {}) } } : {}),
  };
}
/** Physics modes supported by the current path engine. Keep the mapping visible. */
export function solarAnalysisMode(mode: UIMode): "SSB" | "CW" | "FT8" {
  return mode === "CW" ? "CW" : ["FT8", "FT4", "DATA", "RTTY"].includes(mode) ? "FT8" : "SSB";
}
