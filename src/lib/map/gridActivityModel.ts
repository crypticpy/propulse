import type { ResolvedSpot } from "@/components/map/LiveSpotArcs";
import type { LiveSpot, SpotSource } from "@/types/livespot";
import { latLonToGrid } from "@/lib/utils/grid";

/** Maidenhead precisions that remain useful as selectable map regions. */
export type GridActivityResolution = 2 | 4 | 6;

/**
 * Which end of a reported path contributes geographic activity.
 *
 * DX is intentionally the default: it answers "where can I work someone?"
 * Reporter origin is available as an explicit diagnostic view, while `both`
 * is useful when comparing network reach. A path whose two ends land in the
 * same grid is counted only once in that cell.
 */
export type GridActivityEndpoint = "dx" | "reporter" | "both";

export interface GridActivityCell {
  /** Stable renderer-independent identity (`resolution:grid`). */
  id: string;
  grid: string;
  resolution: GridActivityResolution;
  reportCount: number;
  uniqueDxCallsignCount: number;
  uniqueReporterCallsignCount: number;
  uniquePathCount: number;
  newestTimestamp: number;
  oldestTimestamp: number;
  sourceMix: Readonly<Record<SpotSource, number>>;
  modeMix: Readonly<Record<string, number>>;
  /** Stable source/report keys for exact click-through membership. */
  reportIds: readonly string[];
  /** Exact eligible reports represented by `reportIds`, in newest-first order. */
  reports: readonly LiveSpot[];
  /** Persistent visual weight, independent from the recency animation. */
  densityScore: number;
  /** Freshness at snapshot time, independent from report density. */
  recencyScore: number;
  color: string;
}

export interface GridActivitySnapshot {
  cells: readonly GridActivityCell[];
  cellsByGrid: ReadonlyMap<string, GridActivityCell>;
  resolution: GridActivityResolution;
  endpoint: GridActivityEndpoint;
  /** Earliest time a retained report expires, used to sleep while feeds are quiet. */
  nextExpiryTimestamp: number | null;
}

export interface BuildGridActivityOptions {
  resolution: GridActivityResolution;
  endpoint?: GridActivityEndpoint;
  now?: number;
  windowMs?: number;
}

export interface GridActivityBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface RankGridActivityOptions {
  budget: number;
  /** A projection can identify on-screen cells before applying its draw budget. */
  isVisible?: (cell: GridActivityCell) => boolean;
}

const DEFAULT_WINDOW_MS = 30 * 60 * 1000;
const DENSITY_SATURATION_COUNT = 25;

/** Shared duration of the animated freshness accent in every projection. */
export const GRID_ACTIVITY_RECENCY_PULSE_MS = 5_000;

const SOURCE_KEYS: readonly SpotSource[] = [
  "PSKReporter",
  "RBN",
  "Cluster",
  "WSJT-X",
];

interface CellAccumulator {
  grid: string;
  reports: Map<string, LiveSpot>;
  timestamps: Map<string, number>;
  dxCallsigns: Set<string>;
  reporterCallsigns: Set<string>;
  paths: Set<string>;
  sourceMix: Record<SpotSource, number>;
  modeMix: Record<string, number>;
}

function normalizedToken(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function reportTimestamp(spot: LiveSpot): number {
  const timestamp = spot.time instanceof Date
    ? spot.time.getTime()
    : new Date(spot.time).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Prefer a source's stable report ID. Some imported/adapted feeds omit one;
 * their deterministic fallback combines source, path callsigns, frequency,
 * mode, and exact observation timestamp. The source remains part of both keys
 * because two networks can legitimately report the same contact.
 */
export function gridActivityReportIdentity(spot: LiveSpot): string {
  const source = normalizedToken(spot.source);
  const stableId = spot.id?.trim();
  if (stableId) return `${source}:id:${stableId}`;
  return [
    source,
    "fallback",
    normalizedToken(spot.dx),
    normalizedToken(spot.spotter),
    Number.isFinite(spot.frequency) ? spot.frequency.toFixed(3) : "",
    normalizedToken(spot.mode),
    reportTimestamp(spot),
  ].join(":");
}

function isExactCoordinate(lat: number, lon: number, approximate: boolean) {
  return (
    !approximate &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function gridActivityGridForCoordinate(
  lat: number,
  lon: number,
  resolution: GridActivityResolution,
): string {
  // The shared converter's minimum public precision is four characters.
  // Slice its field/square result for the global two-character activity LOD.
  // Clamp the inclusive north/east API bounds into the final legal field;
  // exactly 90/180 otherwise quantizes one cell beyond Maidenhead's A-R range.
  const safeLat = Math.min(89.999999, lat);
  const safeLon = Math.min(179.999999, lon);
  return latLonToGrid(safeLat, safeLon, Math.max(4, resolution))
    .slice(0, resolution)
    .toUpperCase();
}

function emptySourceMix(): Record<SpotSource, number> {
  return {
    PSKReporter: 0,
    RBN: 0,
    Cluster: 0,
    "WSJT-X": 0,
  };
}

function densityScore(count: number): number {
  if (count <= 0) return 0;
  return Math.min(
    1,
    Math.log1p(count) / Math.log1p(DENSITY_SATURATION_COUNT),
  );
}

export function gridActivityColor(score: number): string {
  if (score >= 0.85) return "#ef4444";
  if (score >= 0.67) return "#eab308";
  if (score >= 0.48) return "#22c55e";
  if (score >= 0.25) return "#06b6d4";
  return "#3b82f6";
}

function addReportToCell(
  cells: Map<string, CellAccumulator>,
  grid: string,
  reportId: string,
  spot: LiveSpot,
  timestamp: number,
) {
  let cell = cells.get(grid);
  if (!cell) {
    cell = {
      grid,
      reports: new Map(),
      timestamps: new Map(),
      dxCallsigns: new Set(),
      reporterCallsigns: new Set(),
      paths: new Set(),
      sourceMix: emptySourceMix(),
      modeMix: {},
    };
    cells.set(grid, cell);
  }
  if (cell.reports.has(reportId)) return;

  cell.reports.set(reportId, spot);
  cell.timestamps.set(reportId, timestamp);
  const dx = normalizedToken(spot.dx);
  const reporter = normalizedToken(spot.spotter);
  const mode = normalizedToken(spot.mode) || "UNKNOWN";
  if (dx) cell.dxCallsigns.add(dx);
  if (reporter) cell.reporterCallsigns.add(reporter);
  if (dx && reporter) cell.paths.add(`${reporter}>${dx}`);
  cell.sourceMix[spot.source] += 1;
  cell.modeMix[mode] = (cell.modeMix[mode] ?? 0) + 1;
}

/** Build the projection-neutral activity facts from the complete eligible feed. */
export function buildGridActivitySnapshot(
  resolvedSpots: readonly ResolvedSpot[],
  {
    resolution,
    endpoint = "dx",
    now = Date.now(),
    windowMs = DEFAULT_WINDOW_MS,
  }: BuildGridActivityOptions,
): GridActivitySnapshot {
  const cutoff = now - Math.max(0, windowMs);
  const reports = new Map<string, ResolvedSpot>();

  // Deduplicate before assigning endpoints so a repeated network response can
  // never inflate density or the path/callsign facts in any resolution.
  for (const resolved of resolvedSpots) {
    const spot = resolved.originalSpot;
    const timestamp = reportTimestamp(spot);
    if (timestamp <= cutoff || timestamp > now + 60_000) continue;
    const identity = gridActivityReportIdentity(spot);
    const previous = reports.get(identity);
    if (!previous || reportTimestamp(previous.originalSpot) < timestamp) {
      reports.set(identity, resolved);
    }
  }

  const accumulators = new Map<string, CellAccumulator>();
  let nextExpiryTimestamp: number | null = null;
  for (const [reportId, resolved] of reports) {
    const spot = resolved.originalSpot;
    const timestamp = reportTimestamp(spot);
    const grids = new Set<string>();

    if (
      (endpoint === "dx" || endpoint === "both") &&
      isExactCoordinate(resolved.dxLat, resolved.dxLon, resolved.dxLocApprox)
    ) {
      grids.add(
        gridActivityGridForCoordinate(
          resolved.dxLat,
          resolved.dxLon,
          resolution,
        ),
      );
    }
    if (
      (endpoint === "reporter" || endpoint === "both") &&
      isExactCoordinate(
        resolved.spotterLat,
        resolved.spotterLon,
        resolved.spotterLocApprox,
      )
    ) {
      grids.add(
        gridActivityGridForCoordinate(
          resolved.spotterLat,
          resolved.spotterLon,
          resolution,
        ),
      );
    }

    if (grids.size === 0) continue;
    const expiry = timestamp + windowMs;
    nextExpiryTimestamp =
      nextExpiryTimestamp === null
        ? expiry
        : Math.min(nextExpiryTimestamp, expiry);
    for (const grid of grids) {
      addReportToCell(
        accumulators,
        grid.toUpperCase(),
        reportId,
        spot,
        timestamp,
      );
    }
  }

  const cells = [...accumulators.values()]
    .map((cell): GridActivityCell => {
      const ordered = [...cell.reports.entries()].sort((a, b) => {
        const timeDelta =
          (cell.timestamps.get(b[0]) ?? 0) -
          (cell.timestamps.get(a[0]) ?? 0);
        return timeDelta || a[0].localeCompare(b[0]);
      });
      const timestamps = ordered.map(
        ([reportId]) => cell.timestamps.get(reportId) ?? 0,
      );
      const score = densityScore(ordered.length);
      return {
        id: `${resolution}:${cell.grid}`,
        grid: cell.grid,
        resolution,
        reportCount: ordered.length,
        uniqueDxCallsignCount: cell.dxCallsigns.size,
        uniqueReporterCallsignCount: cell.reporterCallsigns.size,
        uniquePathCount: cell.paths.size,
        newestTimestamp: Math.max(...timestamps),
        oldestTimestamp: Math.min(...timestamps),
        sourceMix: Object.freeze({ ...cell.sourceMix }),
        modeMix: Object.freeze({ ...cell.modeMix }),
        reportIds: Object.freeze(ordered.map(([reportId]) => reportId)),
        reports: Object.freeze(ordered.map(([, spot]) => spot)),
        densityScore: score,
        recencyScore: Math.min(
          1,
          Math.max(
            0,
            1 - (now - Math.max(...timestamps)) / Math.max(1, windowMs),
          ),
        ),
        color: gridActivityColor(score),
      };
    })
    .sort((a, b) => a.grid.localeCompare(b.grid));

  return {
    cells,
    cellsByGrid: new Map(cells.map((cell) => [cell.grid, cell])),
    resolution,
    endpoint,
    nextExpiryTimestamp,
  };
}

/**
 * Projection adapters call this after determining visibility. The stable
 * tie-breaker prevents cells from flickering in and out at a fixed budget.
 */
export function rankGridActivityCells(
  cells: readonly GridActivityCell[],
  { budget, isVisible = () => true }: RankGridActivityOptions,
): GridActivityCell[] {
  return cells
    .map((cell) => ({ cell, visible: isVisible(cell) }))
    .sort(
      (a, b) =>
        Number(b.visible) - Number(a.visible) ||
        b.cell.recencyScore - a.cell.recencyScore ||
        b.cell.densityScore - a.cell.densityScore ||
        a.cell.id.localeCompare(b.cell.id),
    )
    .slice(0, Math.max(0, Math.floor(budget)))
    .map(({ cell }) => cell);
}

/** Map zoom to the finest resolution whose cells remain practical to select. */
export function gridActivityResolutionForView(
  projection: "globe" | "flat" | "azimuthal",
  zoom: number,
): GridActivityResolution {
  const safeZoom = Number.isFinite(zoom) ? Math.max(0, zoom) : 1;
  if (projection === "flat") {
    if (safeZoom >= 24) return 6;
    if (safeZoom >= 2.5) return 4;
    return 2;
  }
  if (projection === "globe") {
    if (safeZoom >= 8) return 6;
    if (safeZoom >= 2.25) return 4;
    return 2;
  }
  return safeZoom >= 2.4 ? 4 : 2;
}

/** Decode 2-, 4-, or 6-character Maidenhead cells into geographic bounds. */
export function gridActivityBounds(gridValue: string): GridActivityBounds {
  const grid = gridValue.trim().toUpperCase();
  if (!/^[A-R]{2}(?:\d{2}(?:[A-X]{2})?)?$/.test(grid)) {
    throw new Error(`Invalid Maidenhead activity grid: ${gridValue}`);
  }

  let minLon = (grid.charCodeAt(0) - 65) * 20 - 180;
  let minLat = (grid.charCodeAt(1) - 65) * 10 - 90;
  let width = 20;
  let height = 10;
  if (grid.length >= 4) {
    minLon += Number(grid[2]) * 2;
    minLat += Number(grid[3]);
    width = 2;
    height = 1;
  }
  if (grid.length === 6) {
    minLon += (grid.charCodeAt(4) - 65) / 12;
    minLat += (grid.charCodeAt(5) - 65) / 24;
    width = 1 / 12;
    height = 1 / 24;
  }
  return {
    minLat,
    maxLat: minLat + height,
    minLon,
    maxLon: minLon + width,
  };
}

/** Retained source ordering for compact UI summaries and deterministic tests. */
export function activeGridSources(cell: GridActivityCell): SpotSource[] {
  return SOURCE_KEYS.filter((source) => cell.sourceMix[source] > 0);
}
