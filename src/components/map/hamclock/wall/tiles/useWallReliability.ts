import { useMemo } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useUTCClock } from "@/hooks/useUTCClock";
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
  /** Cells keyed `band:hour` for hours 00–23 UTC of the displayed day. */
  cells: Map<string, ReliabilityCell>;
  /** UTC hour the wall is showing (display time, so time travel applies). */
  hour: number;
  /** Where the path ends, for the context line. */
  targetLabel: string;
  mode: HamClockReliabilityMode;
}

/**
 * One shared 24-hour physics matrix for every wall tile that needs it.
 *
 * The forecast page can mount the matrix and the reliability bars in both
 * rails at once, which would otherwise run the enhanced band model 216 times
 * per tile. The inputs are identical across those instances, so a single-entry
 * module cache lets the second through fourth mount reuse the first result.
 * The cache key covers every input, so a change to Kp, SFI, mode, station or
 * day recomputes exactly once.
 */
let cacheKey = "";
let cacheCells: Map<string, ReliabilityCell> | null = null;

function cellKey(band: string, hour: number): string {
  return `${band}:${hour}`;
}

export function useWallReliability(): WallReliability {
  const origin = useActiveLocation();
  const target = useMapStore((state) => state.target);
  const timeOffset = useMapStore((state) => state.timeOffset);
  const reliability = useHamClockStore((state) => state.reliability);
  const noiseEnvironment = useSettingsStore((state) => state.noiseEnvironment);
  const activeChain = useActiveChain();
  const antennas = useUserAntennas();
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();

  // A minute is plenty: the matrix is hourly, and a faster clock would only
  // re-run the memo for nothing.
  const wallTime = useUTCClock(60_000);
  const displayTime = useMemo(
    () => new Date(wallTime.getTime() + timeOffset * 60 * 60 * 1000),
    [wallTime, timeOffset],
  );
  const forecastDay = displayTime.toISOString().slice(0, 10);
  const hour = displayTime.getUTCHours();

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
    const base = { cells: empty, hour, targetLabel, mode: reliability.mode };

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
        const cells = buildReliabilityForecast({
          origin: { lat: origin.lat, lon: origin.lon },
          target: { lat: target.lat, lon: target.lon },
          kp,
          sfi,
          baseTime: new Date(`${forecastDay}T00:00:00.000Z`),
          mode: reliability.mode,
          powerWatts,
          antennaType,
          noiseEnvironment,
        });
        const next = new Map<string, ReliabilityCell>();
        for (const cell of cells) next.set(cellKey(cell.band, cell.hour), cell);
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
    reliability.mode,
    powerWatts,
    antennaType,
    noiseEnvironment,
    kIndexQuery.isLoading,
    solarFluxQuery.isLoading,
  ]);
}

/** Score 0–100 for one band at one UTC hour, or `null` when uncomputed. */
export function wallReliabilityScore(
  cells: Map<string, ReliabilityCell>,
  band: string,
  hour: number,
): number | null {
  return cells.get(cellKey(band, ((hour % 24) + 24) % 24))?.score ?? null;
}

/** Theme class for a reliability score, matching the desk panel's tiers. */
export function wallScoreTone(score: number | null): string {
  if (score == null) return "hc-dim-text";
  if (score >= 75) return "hc-good";
  if (score >= 50) return "hc-info-text";
  if (score >= 25) return "hc-warn";
  return "hc-dim-text";
}

/** Highest-scoring wall band at `hour`, or `null` when nothing is workable. */
export function wallBestBand(
  cells: Map<string, ReliabilityCell>,
  hour: number,
): { band: WallForecastBand; score: number } | null {
  let best: { band: WallForecastBand; score: number } | null = null;
  for (const band of WALL_FORECAST_BANDS) {
    const score = wallReliabilityScore(cells, band, hour);
    if (score == null || score <= 0) continue;
    if (!best || score > best.score) best = { band, score };
  }
  return best;
}
