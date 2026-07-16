import { buildCorePathFeatures, type OperationalSpaceWeather } from "./coreFeatureBuilder";
import type {
  PredictionCell,
  PropagationPrediction,
  SurfacePredictionRequest,
} from "./modelClient";
import type { StationFeatureEnvelope } from "@/lib/station/stationChainEngine";
import { getBearing } from "@/lib/utils/path";
import { latLonToGrid } from "@/lib/utils/grid";
import type { OverlayCell } from "@/types/mapOverlays";

export const REACH_MAP_CELL_DEGREES = 15;

export interface ReachMapGridCell {
  id: string;
  lat: number;
  lon: number;
  widthDeg: number;
  heightDeg: number;
  targetGrid4: string;
}

export interface ReachMapRequestOptions {
  origin: { lat: number; lon: number };
  band: string;
  validTime: Date;
  declaredPowerWatts: number;
  weather?: OperationalSpaceWeather;
  deriveEnvelope: (
    band: string,
    targetBearingDeg: number,
  ) => StationFeatureEnvelope | null;
}

export function buildReachMapGrid(
  cellDegrees = REACH_MAP_CELL_DEGREES,
): ReachMapGridCell[] {
  if (cellDegrees <= 0 || 180 % cellDegrees !== 0 || 360 % cellDegrees !== 0) {
    throw new Error("ReachMap cell size must divide both 180 and 360 degrees");
  }
  const cells: ReachMapGridCell[] = [];
  for (let lat = -90 + cellDegrees / 2; lat < 90; lat += cellDegrees) {
    for (let lon = -180 + cellDegrees / 2; lon < 180; lon += cellDegrees) {
      const targetGrid4 = latLonToGrid(lat, lon, 4);
      cells.push({
        id: `reach-${targetGrid4}-${lat}-${lon}`,
        lat,
        lon,
        widthDeg: cellDegrees,
        heightDeg: cellDegrees,
        targetGrid4,
      });
    }
  }
  return cells;
}

export function buildReachMapRequest(
  options: ReachMapRequestOptions,
): { request: SurfacePredictionRequest; grid: ReachMapGridCell[] } {
  const grid = buildReachMapGrid();
  const cells: PredictionCell[] = grid.map((cell) => {
    const bearing = getBearing(
      options.origin.lat,
      options.origin.lon,
      cell.lat,
      cell.lon,
    );
    return {
      target_grid4: cell.targetGrid4,
      values: buildCorePathFeatures({
        origin: options.origin,
        target: cell,
        band: options.band,
        declaredPowerWatts: options.declaredPowerWatts,
        validTime: options.validTime,
        weather: options.weather,
      }),
      station: options.deriveEnvelope(options.band, bearing) ?? undefined,
    };
  });
  const timestamp = options.validTime.toISOString();
  return {
    grid,
    request: {
      origin_grid4: latLonToGrid(options.origin.lat, options.origin.lon, 4),
      issue_time: timestamp,
      valid_time: timestamp,
      band: options.band,
      mode: "WSPR",
      declared_power_watts: options.declaredPowerWatts,
      cells,
      data_freshness_seconds: {
        // Live per-path history is not available for every global cell yet.
        path_history: 86_400,
      },
    },
  };
}

export function reachMapProbabilityColor(probability: number): string {
  const value = Math.max(0, Math.min(1, probability));
  if (value < 0.2) return "#dc2626";
  if (value < 0.4) return "#f97316";
  if (value < 0.6) return "#facc15";
  if (value < 0.8) return "#22c55e";
  return "#06b6d4";
}

export function reachMapProfileLabel(profile: string | null): string {
  if (profile === "nowcast") return "NowCast";
  if (profile === "physics") return "Physics fallback";
  return profile || "Pending";
}

export function predictionsToReachMapCells(
  predictions: PropagationPrediction[],
  grid: ReachMapGridCell[],
): OverlayCell[] {
  const locations = new Map(grid.map((cell) => [cell.targetGrid4, cell]));
  return predictions.flatMap((prediction) => {
    const cell = locations.get(prediction.target_grid4);
    if (!cell) return [];
    const probability = prediction.personalized_probability;
    return [{
      id: cell.id,
      lat: cell.lat,
      lon: cell.lon,
      widthDeg: cell.widthDeg,
      heightDeg: cell.heightDeg,
      color: reachMapProbabilityColor(probability),
      opacity: 0.2 + 0.45 * prediction.confidence,
      value: probability,
      label: `${prediction.target_grid4}: ${Math.round(probability * 100)}%`,
    }];
  });
}
