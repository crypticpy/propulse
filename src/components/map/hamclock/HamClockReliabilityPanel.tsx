import { useMemo } from "react";
import { ANTENNA_TYPES, type AntennaType } from "@/lib/data/antennas";
import {
  buildReliabilityForecast,
  HAMCLOCK_RELIABILITY_BANDS,
  type ReliabilityCell,
} from "@/lib/hamclock/reliabilityForecast";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore } from "@/stores/mapStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type {
  HamClockReliabilityMode,
  HamClockReliabilityPower,
} from "@/stores/hamclockStore";

const MODES: HamClockReliabilityMode[] = ["SSB", "CW", "FT8"];
const POWERS: HamClockReliabilityPower[] = [5, 25, 100, 500, 1500];
const selectClass =
  "min-w-0 rounded border border-white/10 bg-void-black px-1.5 py-1 font-mono text-[10px] text-gray-200 focus:border-plasma-orange/60 focus:outline-none";

function cellColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#84cc16";
  if (score >= 25) return "#f59e0b";
  if (score > 0) return "#ef4444";
  return "#374151";
}
function targetLabel(target: { name?: string; grid?: string }): string {
  return target.name || target.grid || "DX target";
}

/**
 * Compact Band × UTC-hour matrix for the HamClock information stack. The
 * parent only mounts this component while its panel is expanded, keeping the
 * 24 enhanced-model calculations off the normal map render path.
 */
export function HamClockReliabilityPanel({
  displayTime,
}: {
  displayTime: Date;
}) {
  const origin = useActiveLocation();
  const target = useMapStore((state) => state.target);
  const reliability = useHamClockStore((state) => state.reliability);
  const setReliability = useHamClockStore((state) => state.setReliability);
  const noiseEnvironment = useSettingsStore(
    (state) => state.noiseEnvironment,
  );
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();
  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index;
  const sfi = solarFluxQuery.data?.[solarFluxQuery.data.length - 1]?.flux;

  const result = useMemo(() => {
    if (!origin || !target || kp == null || sfi == null) {
      return { cells: [] as ReliabilityCell[], failed: false };
    }
    try {
      return {
        cells: buildReliabilityForecast({
          origin,
          target,
          kp,
          sfi,
          baseTime: displayTime,
          mode: reliability.mode,
          powerWatts: reliability.powerWatts,
          antennaType: reliability.antennaType,
          noiseEnvironment,
        }),
        failed: false,
      };
    } catch {
      // A supplementary wall pane must not take down the map if a future
      // model input falls outside the engine's accepted range.
      return { cells: [] as ReliabilityCell[], failed: true };
    }
  }, [
    origin,
    target,
    kp,
    sfi,
    displayTime,
    reliability,
    noiseEnvironment,
  ]);

  const cellsByKey = useMemo(
    () =>
      new Map(
        result.cells.map((cell) => [`${cell.band}:${cell.hour}`, cell]),
      ),
    [result.cells],
  );
  const selectedHour = displayTime.getUTCHours();
  const bestNow = useMemo(
    () =>
      result.cells
        .filter((cell) => cell.hour === selectedHour)
        .sort((left, right) => right.score - left.score)[0],
    [result.cells, selectedHour],
  );

  if (!origin) {
    return (
      <p className="font-mono text-xs text-gray-500">
        Configure a station QTH to calculate a path.
      </p>
    );
  }
  if (!target) {
    return (
      <p className="font-mono text-xs text-gray-500">
        Select a DX target on the map to build the 24-hour matrix.
      </p>
    );
  }
  if (kIndexQuery.isLoading || solarFluxQuery.isLoading) {
    return <p className="font-mono text-xs text-gray-500">Loading model inputs…</p>;
  }
  if (kp == null || sfi == null || result.failed) {
    return (
      <p className="font-mono text-xs text-caution-amber">
        Reliability model unavailable for the current inputs.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex min-w-0 flex-col gap-1 text-[9px] uppercase tracking-wide text-gray-500">
          Mode
          <select
            aria-label="Reliability mode"
            value={reliability.mode}
            onChange={(event) =>
              setReliability({
                mode: event.target.value as HamClockReliabilityMode,
              })
            }
            className={selectClass}
          >
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[9px] uppercase tracking-wide text-gray-500">
          Power
          <select
            aria-label="Reliability power"
            value={reliability.powerWatts}
            onChange={(event) =>
              setReliability({
                powerWatts: Number(event.target.value) as HamClockReliabilityPower,
              })
            }
            className={selectClass}
          >
            {POWERS.map((power) => (
              <option key={power} value={power}>
                {power.toLocaleString()} W
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-[9px] uppercase tracking-wide text-gray-500">
          Antenna
          <select
            aria-label="Reliability antenna"
            value={reliability.antennaType}
            onChange={(event) =>
              setReliability({ antennaType: event.target.value as AntennaType })
            }
            className={selectClass}
          >
            {ANTENNA_TYPES.map((antenna) => (
              <option key={antenna.type} value={antenna.type}>
                {antenna.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
        <span className="truncate text-gray-500">to {targetLabel(target)}</span>
        {bestNow && (
          <span className="shrink-0 text-plasma-orange">
            {bestNow.band} {bestNow.score}
          </span>
        )}
      </div>

      <div className="overflow-x-auto pb-1">
        <table className="min-w-[410px] border-separate border-spacing-[2px] text-[8px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-void-black pr-1 text-left font-mono text-gray-500">
                UTC
              </th>
              {Array.from({ length: 24 }, (_, hour) => (
                <th
                  key={hour}
                  className={`w-3 text-center font-mono font-normal ${
                    hour === selectedHour
                      ? "text-plasma-orange"
                      : "text-gray-600"
                  }`}
                  aria-label={`${hour}:00 UTC`}
                >
                  {hour % 3 === 0 ? hour.toString().padStart(2, "0") : "·"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HAMCLOCK_RELIABILITY_BANDS.map((band) => (
              <tr key={band}>
                <th className="sticky left-0 z-10 bg-void-black pr-1 text-left font-mono font-normal text-gray-300">
                  {band}
                </th>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = cellsByKey.get(`${band}:${hour}`);
                  const label = cell
                    ? `${band} ${hour.toString().padStart(2, "0")}:00 UTC: reliability ${cell.score} of 100, SNR ${cell.snrEstimate} dB, confidence ${cell.confidence} percent`
                    : `${band} ${hour.toString().padStart(2, "0")}:00 UTC: unavailable`;
                  return (
                    <td
                      key={hour}
                      aria-label={label}
                      title={label}
                      className={`h-3 min-w-3 rounded-sm ${
                        hour === selectedHour
                          ? "ring-1 ring-plasma-orange ring-offset-1 ring-offset-void-black"
                          : ""
                      }`}
                      style={{ backgroundColor: cellColor(cell?.score ?? 0) }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-[9px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <i className="h-2 w-2 rounded-sm bg-alert-red" /> Low
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="h-2 w-2 rounded-sm bg-caution-amber" /> Marginal
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="h-2 w-2 rounded-sm bg-lime-500" /> Workable
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="h-2 w-2 rounded-sm bg-green-500" /> Strong
        </span>
      </div>
      <p className="text-[9px] leading-relaxed text-gray-600">
        Enhanced path-model index using current Kp/SFI. Relative comparison,
        not a guaranteed QSO probability.
      </p>
    </div>
  );
}
