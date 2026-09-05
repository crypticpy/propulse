import { useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useMapDisplayTime } from "@/hooks/useUTCClock";
import {
  buildReliabilityForecast,
  type ReliabilityCell,
} from "@/lib/hamclock/reliabilityForecast";
import { nearestHamClockPower } from "@/lib/station/stationPhysics";
import {
  useHamClockStore,
  type HamClockReliabilityMode,
} from "@/stores/hamclockStore";
import { useMapStore } from "@/stores/mapStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useActiveChain, useUserAntennas } from "@/stores/shackStore";

/**
 * Bands the wall shows. `HAMCLOCK_RELIABILITY_BANDS` carries nine bands, which
 * is two too many to stay legible from ten feet, so the wall keeps the six an
 * operator actually chases and drops 160m / 30m / 12m.
 */
export const WALL_FORECAST_BANDS = [
  "80m",
  "40m",
  "20m",
  "17m",
  "15m",
  "10m",
] as const;

export type WallForecastBand = (typeof WALL_FORECAST_BANDS)[number];

export type WallReliabilityStatus =
  /** No operating location configured yet. */
  | "no-station"
  /** No DX target picked, so there is no path to score. */
  | "no-target"
  /** Kp / SFI still in flight. */
  | "loading"
  /** The physics engine rejected the inputs. */
  | "failed"
  | "ready";

export interface WallReliability {
  status: WallReliabilityStatus;
  /**
   * Cells keyed `band:hourIndex` — absolute UTC hours, not 00–23 — covering
   * the displayed UTC day and the one after it, so a `+18H` column read at 20Z
   * lands on tomorrow's 14Z instead of wrapping back to this morning.
   */
  cells: Map<string, ReliabilityCell>;
  /** UTC hour 0–23 the wall is showing, for labels like `20Z`. */
  hour: number;
  /** Whole UTC hours since the epoch for the displayed instant. */
  hourIndex: number;
  /** Where the path ends, for the context line. */
  targetLabel: string;
  mode: HamClockReliabilityMode;
}

/**
 * One shared 48-hour physics matrix for every wall tile that needs it.
 *
 * The forecast page can mount the matrix and the reliability bars in both
 * rails at once, which would otherwise run the enhanced band model 432 times
 * per tile. The inputs are identical across those instances, so a single-entry
 * module cache lets the second through fourth mount reuse the first result.
 * The cache key covers every input, so a change to Kp, SFI, mode, station or
 * day recomputes exactly once.
 */
let cacheKey = "";
let cacheCells: Map<string, ReliabilityCell> | null = null;

const HOUR_MS = 60 * 60 * 1000;

/** Days of matrix built: the displayed UTC day plus the next one. */
const FORECAST_DAYS = 2;

/** Whole UTC hours since the epoch — the monotonic key the cells use. */
export function wallHourIndex(at: Date): number {
  return Math.floor(at.getTime() / HOUR_MS);
}

function cellKey(band: string, hourIndex: number): string {
  return `${band}:${hourIndex}`;
}

export function useWallReliability(): WallReliability {
  const origin = useActiveLocation();
  const target = useMapStore((state) => state.target);
  const timeOffset = useMapStore((state) => state.timeOffset);
  const absoluteTime = useMapStore((state) => state.absoluteTime);
  const reliability = useHamClockStore((state) => state.reliability);
  const noiseEnvironment = useSettingsStore((state) => state.noiseEnvironment);
  const activeChain = useActiveChain();
  const antennas = useUserAntennas();
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();

  // The same derivation the map itself uses, so a scenario replay or a solar
  // handoff (which set `absoluteTime`) moves the tiles with the globe rather
  // than leaving them on the live clock. A minute is plenty: the matrix is
  // hourly, and a faster clock would only re-run the memo for nothing.
  const displayTime = useMapDisplayTime(timeOffset, absoluteTime, 60_000);
  const forecastDay = displayTime.toISOString().slice(0, 10);
  const hour = displayTime.getUTCHours();
  const hourIndex = wallHourIndex(displayTime);

  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index;
  const sfi = solarFluxQuery.data?.[solarFluxQuery.data.length - 1]?.flux;

  // Mirror HamClockReliabilityPanel exactly so the wall and the desk panel
  // never disagree about the same path.
  const chainNode = activeChain?.nodes.find((node) => node.type === "antenna");
  const chainAntenna =
    chainNode?.type === "antenna"
      ? antennas.find((antenna) => antenna.id === chainNode.antennaId)
      : undefined;
  const powerWatts = activeChain
    ? nearestHamClockPower(activeChain.operatingPowerWatts)
    : reliability.powerWatts;
  const antennaType = chainAntenna?.gainPatternType ?? reliability.antennaType;

  return useMemo<WallReliability>(() => {
    const empty = new Map<string, ReliabilityCell>();
    const targetLabel = target?.name || target?.grid || "DX target";
    const base = {
      cells: empty,
      hour,
      hourIndex,
      targetLabel,
      mode: reliability.mode,
    };

    if (!origin) return { ...base, status: "no-station" };
    if (!target) return { ...base, status: "no-target" };
    if (kp == null || sfi == null) {
      const loading = kIndexQuery.isLoading || solarFluxQuery.isLoading;
      return { ...base, status: loading ? "loading" : "failed" };
    }

    const key = [
      forecastDay,
      origin.lat.toFixed(3),
      origin.lon.toFixed(3),
      target.lat.toFixed(3),
      target.lon.toFixed(3),
      kp,
      sfi,
      reliability.mode,
      powerWatts,
      antennaType,
      noiseEnvironment ?? "",
    ].join("|");

    if (key !== cacheKey || !cacheCells) {
      try {
        const dayZeroMs = Date.parse(`${forecastDay}T00:00:00.000Z`);
        const next = new Map<string, ReliabilityCell>();
        for (let day = 0; day < FORECAST_DAYS; day++) {
          const baseTime = new Date(dayZeroMs + day * 24 * HOUR_MS);
          const dayStartIndex = wallHourIndex(baseTime);
          const cells = buildReliabilityForecast({
            origin: { lat: origin.lat, lon: origin.lon },
            target: { lat: target.lat, lon: target.lon },
            kp,
            sfi,
            baseTime,
            mode: reliability.mode,
            powerWatts,
            antennaType,
            noiseEnvironment,
          });
          for (const cell of cells) {
            next.set(cellKey(cell.band, dayStartIndex + cell.hour), cell);
          }
        }
        cacheKey = key;
        cacheCells = next;
      } catch {
        cacheKey = "";
        cacheCells = null;
        return { ...base, status: "failed" };
      }
    }

    return { ...base, cells: cacheCells, status: "ready" };
  }, [
    origin,
    target,
    kp,
    sfi,
    forecastDay,
    hour,
    hourIndex,
    reliability.mode,
    powerWatts,
    antennaType,
    noiseEnvironment,
    kIndexQuery.isLoading,
    solarFluxQuery.isLoading,
  ]);
}

/**
 * Score 0–100 for one band at one absolute UTC hour, or `null` when that hour
 * is outside the built window. `hourIndex` is a `wallHourIndex` value, so
 * adding a column offset to it always reads forward in time.
 */
export function wallReliabilityScore(
  cells: Map<string, ReliabilityCell>,
  band: string,
  hourIndex: number,
): number | null {
  return cells.get(cellKey(band, hourIndex))?.score ?? null;
}

/** Theme class for a reliability score, matching the desk panel's tiers. */
export function wallScoreTone(score: number | null): string {
  if (score == null) return "hc-dim-text";
  if (score >= 75) return "hc-good";
  if (score >= 50) return "hc-info-text";
  if (score >= 25) return "hc-warn";
  return "hc-dim-text";
}

/** Highest-scoring wall band at `hourIndex`, or `null` when nothing works. */
export function wallBestBand(
  cells: Map<string, ReliabilityCell>,
  hourIndex: number,
): { band: WallForecastBand; score: number } | null {
  let best: { band: WallForecastBand; score: number } | null = null;
  for (const band of WALL_FORECAST_BANDS) {
    const score = wallReliabilityScore(cells, band, hourIndex);
    if (score == null || score <= 0) continue;
    if (!best || score > best.score) best = { band, score };
  }
  return best;
}
