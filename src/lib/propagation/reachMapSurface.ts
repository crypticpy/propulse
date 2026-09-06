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

export const REACH_MAP_CELL_WIDTH_DEGREES = 20;
export const REACH_MAP_CELL_HEIGHT_DEGREES = 10;
export const REACH_MAP_SURFACE_CHUNK_CELLS = 144;

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
  /** Defaults to validTime (live NowCast). Earlier for FutureCast horizons. */
  issueTime?: Date;
  declaredPowerWatts: number;
  weather?: OperationalSpaceWeather;
  personalizationEnabled?: boolean;
  deriveEnvelope: (
    band: string,
    targetBearingDeg: number,
  ) => StationFeatureEnvelope | null;
}

export function buildReachMapGrid(
  cellWidthDegrees = REACH_MAP_CELL_WIDTH_DEGREES,
  cellHeightDegrees = REACH_MAP_CELL_HEIGHT_DEGREES,
): ReachMapGridCell[] {
  if (
    cellWidthDegrees <= 0 ||
    cellHeightDegrees <= 0 ||
    360 % cellWidthDegrees !== 0 ||
    180 % cellHeightDegrees !== 0 ||
    cellWidthDegrees % 20 !== 0 ||
    cellHeightDegrees % 10 !== 0
  ) {
    throw new Error(
      "ReachMap cell dimensions must align to Maidenhead fields and divide the globe exactly",
    );
  }
  const cells: ReachMapGridCell[] = [];
  for (
    let lat = -90 + cellHeightDegrees / 2;
    lat < 90;
    lat += cellHeightDegrees
  ) {
    for (
      let lon = -180 + cellWidthDegrees / 2;
      lon < 180;
      lon += cellWidthDegrees
    ) {
      const targetGrid4 = latLonToGrid(lat, lon, 4);
      cells.push({
        id: `reach-${targetGrid4}`,
        lat,
        lon,
        widthDeg: cellWidthDegrees,
        heightDeg: cellHeightDegrees,
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
      ...(options.personalizationEnabled === false
        ? {}
        : { station: options.deriveEnvelope(options.band, bearing) ?? undefined }),
    };
  });
  const timestamp = options.validTime.toISOString();
  return {
    grid,
    request: {
      origin_grid4: latLonToGrid(options.origin.lat, options.origin.lon, 4),
      issue_time: (options.issueTime ?? options.validTime).toISOString(),
      valid_time: timestamp,
      band: options.band,
      mode: "WSPR",
      declared_power_watts: options.declaredPowerWatts,
      cells,
    },
  };
}

export function chunkReachMapSurfaceRequest(
  request: SurfacePredictionRequest,
  maximumCells = REACH_MAP_SURFACE_CHUNK_CELLS,
): SurfacePredictionRequest[] {
  if (!Number.isInteger(maximumCells) || maximumCells < 1 || maximumCells > 4096) {
    throw new Error("ReachMap surface chunk size must be between 1 and 4,096");
  }
  const chunks: SurfacePredictionRequest[] = [];
  for (let index = 0; index < request.cells.length; index += maximumCells) {
    chunks.push({
      ...request,
      cells: request.cells.slice(index, index + maximumCells),
    });
  }
  return chunks;
}

export interface ReachMapPredictionSummary {
  modelVersion: string | null;
  profile: string | null;
  fallbackCellCount: number;
  staleInputCellCount: number;
  oodCellCount: number;
  meanConfidence: number | null;
  maxDataAgeSeconds: number | null;
}

export function summarizeReachMapPredictions(
  predictions: PropagationPrediction[],
): ReachMapPredictionSummary {
  const modelVersions = new Set(predictions.map((prediction) => prediction.model_version));
  const profiles = new Set(predictions.map((prediction) => prediction.profile));
  const freshnessValues = predictions.flatMap((prediction) =>
    Object.values(prediction.data_freshness).filter(
      (value): value is number => Number.isFinite(value),
    ),
  );
  return {
    modelVersion:
      modelVersions.size === 1 ? [...modelVersions][0] : modelVersions.size > 1 ? "mixed" : null,
    profile: profiles.size === 1 ? [...profiles][0] : profiles.size > 1 ? "mixed" : null,
    fallbackCellCount: predictions.filter((prediction) => prediction.profile === "physics").length,
    staleInputCellCount: predictions.filter((prediction) =>
      prediction.ood_flags.includes("recent_network_stale_physics_fallback") ||
      prediction.assumptions.includes("path_history_stale_or_unavailable_physics_fallback"),
    ).length,
    oodCellCount: predictions.filter((prediction) => prediction.ood_flags.length > 0).length,
    meanConfidence: predictions.length > 0
      ? predictions.reduce((total, prediction) => total + prediction.confidence, 0) /
        predictions.length
      : null,
    maxDataAgeSeconds: freshnessValues.length > 0 ? Math.max(...freshnessValues) : null,
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
  if (profile === "physics") return "Physics profile";
  if (profile === "mixed") return "Mixed profiles";
  return profile || "Pending";
}

export function predictionsToReachMapCells(
  predictions: PropagationPrediction[],
  grid: ReachMapGridCell[],
  personalized = true,
): OverlayCell[] {
  const locations = new Map(grid.map((cell) => [cell.targetGrid4, cell]));
  return predictions.flatMap((prediction) => {
    const cell = locations.get(prediction.target_grid4);
    if (!cell) return [];
    const probability = personalized
      ? prediction.personalized_probability
      : prediction.core_probability;
    return [{
      id: cell.id,
      lat: cell.lat,
      lon: cell.lon,
      widthDeg: cell.widthDeg,
      heightDeg: cell.heightDeg,
      color: reachMapProbabilityColor(probability),
      opacity: 0.2 + 0.45 * prediction.confidence,
      value: probability,
      label: [
        `${prediction.target_grid4}: ${Math.round(probability * 100)}%`,
        `${Math.round(prediction.confidence * 100)}% confidence`,
        reachMapProfileLabel(prediction.profile),
      ].join(" · "),
    }];
  });
}
