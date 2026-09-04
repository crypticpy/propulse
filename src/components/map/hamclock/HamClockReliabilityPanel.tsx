import { useMemo } from "react";
import { ANTENNA_TYPES, type AntennaType } from "@/lib/data/antennas";
import {
  buildReliabilityForecast,
  HAMCLOCK_RELIABILITY_BANDS,
  type ReliabilityCell,
} from "@/lib/hamclock/reliabilityForecast";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  getColorBlindColor,
  getStatusIcon,
  type ColorBlindMode,
} from "@/lib/themes/colorblind";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore } from "@/stores/mapStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useActiveChain, useUserAntennas } from "@/stores/shackStore";
import { nearestHamClockPower } from "@/lib/station/stationPhysics";
import type {
  HamClockReliabilityMode,
  HamClockReliabilityPower,
} from "@/stores/hamclockStore";

const MODES: HamClockReliabilityMode[] = ["SSB", "CW", "FT8"];
const POWERS: HamClockReliabilityPower[] = [5, 25, 100, 500, 1500];
const selectClass =
  "min-w-0 rounded border border-white/10 bg-void-black px-1.5 py-1 font-mono text-[10px] text-gray-200 focus:border-plasma-orange/60 focus:outline-none";

type ReliabilityTier = "strong" | "workable" | "marginal" | "low" | "none";

function reliabilityTier(score: number): ReliabilityTier {
  if (score >= 75) return "strong";
  if (score >= 50) return "workable";
  if (score >= 25) return "marginal";
  if (score > 0) return "low";
  return "none";
}

/**
 * Every tier carries both a color-blind-safe hue and a texture. The tiny
 * matrix cells cannot hold readable glyphs, so the repeated patterns provide
 * the redundant non-color cue while the legend names the same pattern/icon.
 */
function cellPresentation(score: number, mode: ColorBlindMode) {
  const tier = reliabilityTier(score);
  if (tier === "strong") {
    return {
      tier,
      color: getColorBlindColor(mode, "excellent"),
      backgroundImage: "none",
    };
  }
  if (tier === "workable") {
    return {
      tier,
      color: getColorBlindColor(mode, "good"),
      backgroundImage:
        "repeating-linear-gradient(135deg, transparent 0 2px, rgba(0,0,0,0.7) 2px 3px)",
    };
  }
  if (tier === "marginal") {
    return {
      tier,
      color: getColorBlindColor(mode, "fair"),
      backgroundImage:
        "repeating-linear-gradient(90deg, transparent 0 2px, rgba(0,0,0,0.7) 2px 3px)",
    };
  }
  if (tier === "low") {
    return {
      tier,
      color: getColorBlindColor(mode, "poor"),
      backgroundImage:
        "radial-gradient(circle at center, rgba(0,0,0,0.8) 0 1px, transparent 1px)",
    };
  }
  return {
    tier,
    color: getColorBlindColor(mode, "closed"),
    backgroundImage: "none",
  };
}
function targetLabel(target: { name?: string; grid?: string }): string {
  return target.name || target.grid || "DX target";
}

/**
 * Compact Band × UTC-hour matrix for the HamClock information stack. The
 * parent only mounts this component while its panel is expanded, keeping the
 * 24 enhanced-model calculations off the normal map render path.
 */
export function HamClockReliabilityPanel() {
  const origin = useActiveLocation();
  const target = useMapStore((state) => state.target);
  const timeOffset = useMapStore((state) => state.timeOffset);
  const reliability = useHamClockStore((state) => state.reliability);
  const setReliability = useHamClockStore((state) => state.setReliability);
  const noiseEnvironment = useSettingsStore(
    (state) => state.noiseEnvironment,
  );
  const colorBlindMode = useSettingsStore(
    (state) => state.colorBlindMode ?? "none",
  );
  const wallTime = useUTCClock();
  const liveDisplayTime = useMemo(
    () => new Date(wallTime.getTime() + timeOffset * 60 * 60 * 1000),
    [wallTime, timeOffset],
  );
  const forecastDay = liveDisplayTime.toISOString().slice(0, 10);
  const forecastBaseTime = useMemo(
    () => new Date(`${forecastDay}T00:00:00.000Z`),
    [forecastDay],
  );
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();
  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index;
  const sfi = solarFluxQuery.data?.[solarFluxQuery.data.length - 1]?.flux;
  const activeChain = useActiveChain();
  const antennas = useUserAntennas();
  const chainAntennaId = activeChain?.nodes.find(
    (node) => node.type === "antenna",
  );
  const chainAntenna =
    chainAntennaId?.type === "antenna"
      ? antennas.find((antenna) => antenna.id === chainAntennaId.antennaId)
      : undefined;
  const matrixPowerWatts = activeChain
    ? nearestHamClockPower(activeChain.operatingPowerWatts)
    : reliability.powerWatts;
  const matrixAntennaType =
    chainAntenna?.gainPatternType ?? reliability.antennaType;

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
          baseTime: forecastBaseTime,
          mode: reliability.mode,
          powerWatts: matrixPowerWatts,
          antennaType: matrixAntennaType,
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
    forecastBaseTime,
    reliability.mode,
    matrixPowerWatts,
    matrixAntennaType,
    noiseEnvironment,
  ]);

  const cellsByKey = useMemo(
    () =>
      new Map(
        result.cells.map((cell) => [`${cell.band}:${cell.hour}`, cell]),
      ),
    [result.cells],
  );
  const selectedHour = liveDisplayTime.getUTCHours();
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
          {activeChain ? (
            <span
              aria-label="Reliability power"
              className={`${selectClass} text-gray-400`}
            >
              {matrixPowerWatts.toLocaleString()} W matrix
            </span>
          ) : (
            <select
              aria-label="Reliability power"
              value={reliability.powerWatts}
              onChange={(event) =>
                setReliability({
                  powerWatts: Number(
                    event.target.value,
                  ) as HamClockReliabilityPower,
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
          )}
        </label>
        <div className="col-span-2 flex min-w-0 flex-col gap-1 text-[9px] uppercase tracking-wide text-gray-500">
          Antenna
          {activeChain ? (
            <p className="rounded border border-white/10 bg-void-black px-1.5 py-1 font-mono text-[10px] normal-case tracking-normal text-gray-200">
              {chainAntenna?.name ?? "Chain antenna"}
            </p>
          ) : (
            <select
              aria-label="Reliability antenna"
              value={reliability.antennaType}
              onChange={(event) =>
                setReliability({
                  antennaType: event.target.value as AntennaType,
                })
              }
              className={selectClass}
            >
              {ANTENNA_TYPES.map((antenna) => (
                <option key={antenna.type} value={antenna.type}>
                  {antenna.name}
                </option>
              ))}
            </select>
          )}
        </div>
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
                  const presentation = cellPresentation(
                    cell?.score ?? 0,
                    colorBlindMode,
                  );
                  const label = cell
                    ? `${band} ${hour.toString().padStart(2, "0")}:00 UTC: reliability ${cell.score} of 100, SNR ${cell.snrEstimate} dB, confidence ${cell.confidence} percent`
                    : `${band} ${hour.toString().padStart(2, "0")}:00 UTC: unavailable`;
                  return (
                    <td
                      key={hour}
                      aria-label={label}
                      title={label}
                      data-reliability-tier={presentation.tier}
                      className={`h-3 min-w-3 rounded-sm ${
                        hour === selectedHour
                          ? "ring-1 ring-plasma-orange ring-offset-1 ring-offset-void-black"
                          : ""
                      }`}
                      style={{
                        backgroundColor: presentation.color,
                        backgroundImage: presentation.backgroundImage,
                        backgroundSize:
                          presentation.tier === "low" ? "4px 4px" : undefined,
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-[9px] text-gray-500">
        {(
          [
            { label: "Low", score: 1, icon: "\u2717" },
            { label: "Marginal", score: 25, icon: "\u2248" },
            { label: "Workable", score: 50, icon: "\u2571" },
            { label: "Strong", score: 75, icon: "\u2713" },
          ] as const
        ).map((item) => {
          const presentation = cellPresentation(item.score, colorBlindMode);
          const paletteIcon = getStatusIcon(
            colorBlindMode,
            item.score >= 50
              ? "good"
              : item.score >= 25
                ? "fair"
                : "poor",
          );
          return (
            <span key={item.label} className="inline-flex items-center gap-1">
              <i
                aria-hidden="true"
                className="h-2 w-2 rounded-sm"
                style={{
                  backgroundColor: presentation.color,
                  backgroundImage: presentation.backgroundImage,
                  backgroundSize:
                    presentation.tier === "low" ? "4px 4px" : undefined,
                }}
              />
              <span aria-hidden="true">{paletteIcon ?? item.icon}</span>
              {item.label}
            </span>
          );
        })}
      </div>
      <p className="text-[9px] leading-relaxed text-gray-600">
        {activeChain
          ? `Live path ${activeChain.name} at ${Math.round(activeChain.operatingPowerWatts)} W. Matrix power is quantized for display only and does not change the station.`
          : "No signal path — using HamClock kit. Enhanced path-model index using current Kp/SFI. Relative comparison, not a guaranteed QSO probability."}
      </p>
    </div>
  );
}
