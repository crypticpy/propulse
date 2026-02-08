/**
 * WhatIfSimulator — Interactive station performance simulator.
 *
 * Lets users adjust power, feedline length, SWR, and equipment selections
 * to see how per-band ERP changes in real-time. Starts from the active
 * station preset (if any) or allows manual equipment selection.
 */

import { useState, useMemo } from "react";
import {
  useActivePreset,
  useUserAntennas,
  useUserFeedlines,
} from "@/stores/shackStore";
import type { UserAntenna, UserFeedline } from "@/types/shack";
import { ANTENNA_TYPE_LABELS } from "@/types/shack";
import {
  calculateFeedlineLoss,
  calculateSWRMismatchLoss,
  BAND_CENTER_FREQUENCIES,
  FEEDLINE_TYPE_NAMES,
} from "@/lib/data/feedlines";
import { ANTENNA_TYPES } from "@/lib/data/antennas";
import { BandCapabilityStrip } from "./BandCapabilityStrip";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimBandResult {
  band: string;
  freqMHz: number;
  feedlineLossDb: number;
  antennaGainDbi: number;
  powerAtAntennaWatts: number;
  erpWatts: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none";

const POWER_MIN = 1;
const POWER_MAX = 1500;
const POWER_DEFAULT = 100;
const LENGTH_MIN = 0;
const LENGTH_MAX = 300;
const SWR_MIN = 1.0;
const SWR_MAX = 5.0;
const SWR_STEP = 0.1;
const SWR_DEFAULT = 1.5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}kW`;
  if (w >= 100) return `${w.toFixed(0)}W`;
  if (w >= 1) return `${w.toFixed(1)}W`;
  return `${(w * 1000).toFixed(0)}mW`;
}

function formatDb(db: number): string {
  return `${db >= 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

function lossColorClass(lossDb: number): string {
  if (lossDb < 3) return "text-signal-green";
  if (lossDb <= 6) return "text-caution-yellow";
  return "text-alert-red";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WhatIfSimulator() {
  // ── Store data ──────────────────────────────────────────────────────────────
  const activePreset = useActivePreset();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();

  // ── Sim state — initialized from active preset when available ─────────────
  const [antennaId, setAntennaId] = useState<string>(
    activePreset?.antennaId ?? "",
  );
  const [feedlineId, setFeedlineId] = useState<string>(
    activePreset?.feedlineId ?? "",
  );
  const [powerWatts, setPowerWatts] = useState<number>(
    activePreset?.operatingPowerWatts ?? POWER_DEFAULT,
  );
  const [swr, setSwr] = useState<number>(SWR_DEFAULT);
  const [lengthOverride, setLengthOverride] = useState<number | null>(null);

  // ── Resolved equipment ──────────────────────────────────────────────────────
  const selectedAntenna: UserAntenna | undefined = useMemo(
    () => antennas.find((a) => a.id === antennaId),
    [antennas, antennaId],
  );

  const selectedFeedline: UserFeedline | undefined = useMemo(
    () => feedlines.find((f) => f.id === feedlineId),
    [feedlines, feedlineId],
  );

  const effectiveLengthFeet: number = useMemo(() => {
    if (lengthOverride !== null) return lengthOverride;
    return selectedFeedline?.lengthFeet ?? 50;
  }, [lengthOverride, selectedFeedline]);

  // ── Performance calculation ─────────────────────────────────────────────────
  const bandResults: SimBandResult[] = useMemo(() => {
    if (!selectedAntenna) return [];

    const results: SimBandResult[] = [];

    for (const band of selectedAntenna.bands) {
      const freqMHz = BAND_CENTER_FREQUENCIES[band];
      if (freqMHz == null) continue;

      // Calculate feedline loss
      let feedlineLossDb = 0;
      if (selectedFeedline) {
        const matchedLoss = calculateFeedlineLoss(
          selectedFeedline.feedlineType,
          effectiveLengthFeet,
          freqMHz,
          selectedFeedline.connectorCount,
          selectedFeedline.connectorType,
          selectedFeedline.condition,
        );
        const mismatchLoss =
          swr > 1.0 ? calculateSWRMismatchLoss(matchedLoss, swr) : 0;
        feedlineLossDb = matchedLoss + mismatchLoss;
      }

      // Antenna gain (use per-band overrides first, then pattern type peak gain)
      const antennaGainDbi =
        selectedAntenna.gainDbiOverride?.[band] ??
        ANTENNA_TYPES.find((a) => a.type === selectedAntenna.gainPatternType)
          ?.peakGainDbi ??
        0;

      // Power at antenna after feedline loss
      const powerAtAntennaWatts =
        powerWatts * Math.pow(10, -feedlineLossDb / 10);

      // ERP with antenna gain
      const erpWatts = powerAtAntennaWatts * Math.pow(10, antennaGainDbi / 10);

      results.push({
        band,
        freqMHz,
        feedlineLossDb,
        antennaGainDbi,
        powerAtAntennaWatts,
        erpWatts,
      });
    }

    // Sort by ERP descending
    results.sort((a, b) => b.erpWatts - a.erpWatts);
    return results;
  }, [selectedAntenna, selectedFeedline, effectiveLengthFeet, powerWatts, swr]);

  // ── Derived summaries ───────────────────────────────────────────────────────
  const totalSystemSummary = useMemo(() => {
    if (bandResults.length === 0) return null;
    const losses = bandResults.map((b) => b.feedlineLossDb);
    const minLoss = Math.min(...losses);
    const maxLoss = Math.max(...losses);
    const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
    const bestBand = bandResults[0];
    const worstBand = bandResults[bandResults.length - 1];
    return { minLoss, maxLoss, avgLoss, bestBand, worstBand };
  }, [bandResults]);

  const bandLossData = useMemo(
    () => bandResults.map((b) => ({ band: b.band, lossDb: b.feedlineLossDb })),
    [bandResults],
  );

  // ── Reset to active preset ─────────────────────────────────────────────────
  function resetToPreset() {
    if (!activePreset) return;
    setAntennaId(activePreset.antennaId);
    setFeedlineId(activePreset.feedlineId ?? "");
    setPowerWatts(activePreset.operatingPowerWatts);
    setSwr(SWR_DEFAULT);
    setLengthOverride(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
          What-If Simulator
        </h3>
        {activePreset && (
          <button
            onClick={resetToPreset}
            className="text-[10px] text-plasma-orange hover:text-plasma-orange/80 transition-colors font-medium uppercase tracking-wider"
          >
            Reset to Preset
          </button>
        )}
      </div>

      {/* Equipment selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Antenna selector */}
        <div>
          <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">
            Antenna
          </label>
          <select
            value={antennaId}
            onChange={(e) => setAntennaId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">-- Select Antenna --</option>
            {antennas
              .filter((a) => !a.retiredAt)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ANTENNA_TYPE_LABELS[a.antennaType]})
                </option>
              ))}
          </select>
        </div>

        {/* Feedline selector */}
        <div>
          <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">
            Feedline
          </label>
          <select
            value={feedlineId}
            onChange={(e) => {
              setFeedlineId(e.target.value);
              setLengthOverride(null); // reset length override on feedline change
            }}
            className={INPUT_CLASS}
          >
            <option value="">-- No Feedline --</option>
            {feedlines
              .filter((f) => !f.retiredAt)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({FEEDLINE_TYPE_NAMES[f.feedlineType]},{" "}
                  {f.lengthFeet} ft)
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        {/* Power slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Power
            </label>
            <span className="text-sm font-mono text-plasma-orange">
              {formatWatts(powerWatts)}
            </span>
          </div>
          <input
            type="range"
            min={POWER_MIN}
            max={POWER_MAX}
            step={powerWatts < 10 ? 1 : powerWatts < 100 ? 5 : 10}
            value={powerWatts}
            onChange={(e) => setPowerWatts(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-plasma-orange"
          />
          <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
            <span>{POWER_MIN}W</span>
            <span>{POWER_MAX}W</span>
          </div>
        </div>

        {/* SWR slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              SWR
            </label>
            <span className="text-sm font-mono text-plasma-orange">
              {swr.toFixed(1)}:1
            </span>
          </div>
          <input
            type="range"
            min={SWR_MIN}
            max={SWR_MAX}
            step={SWR_STEP}
            value={swr}
            onChange={(e) => setSwr(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-plasma-orange"
          />
          <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
            <span>{SWR_MIN.toFixed(1)}:1</span>
            <span>{SWR_MAX.toFixed(1)}:1</span>
          </div>
        </div>

        {/* Feedline length slider */}
        {selectedFeedline && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                Feedline Length
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-plasma-orange">
                  {effectiveLengthFeet} ft
                </span>
                {lengthOverride !== null && (
                  <button
                    onClick={() => setLengthOverride(null)}
                    className="text-[9px] text-gray-500 hover:text-gray-300 transition-colors"
                    title="Reset to actual feedline length"
                  >
                    (actual: {selectedFeedline.lengthFeet} ft)
                  </button>
                )}
              </div>
            </div>
            <input
              type="range"
              min={LENGTH_MIN}
              max={LENGTH_MAX}
              step={5}
              value={effectiveLengthFeet}
              onChange={(e) => setLengthOverride(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-plasma-orange"
            />
            <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
              <span>{LENGTH_MIN} ft</span>
              <span>{LENGTH_MAX} ft</span>
            </div>
          </div>
        )}
      </div>

      {/* Results section */}
      {!selectedAntenna ? (
        <div className="text-center text-gray-500 text-sm py-4">
          Select an antenna to begin simulation
        </div>
      ) : bandResults.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-4">
          No band data for the selected antenna
        </div>
      ) : (
        <div className="space-y-4">
          {/* Band capability strip */}
          <div>
            <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
              Band Capability
            </h4>
            <BandCapabilityStrip bands={bandLossData} />
          </div>

          {/* System summary */}
          {totalSystemSummary && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-void-black/40 rounded-xl p-3 text-center">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">
                  Best Band
                </div>
                <div className="text-sm font-bold text-signal-green">
                  {totalSystemSummary.bestBand.band}
                </div>
                <div className="text-[10px] text-gray-400">
                  {formatWatts(totalSystemSummary.bestBand.erpWatts)} ERP
                </div>
              </div>
              <div className="bg-void-black/40 rounded-xl p-3 text-center">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">
                  Avg Loss
                </div>
                <div
                  className={`text-sm font-bold ${lossColorClass(totalSystemSummary.avgLoss)}`}
                >
                  {totalSystemSummary.avgLoss.toFixed(1)} dB
                </div>
                <div className="text-[10px] text-gray-400">
                  {totalSystemSummary.minLoss.toFixed(1)} &ndash;{" "}
                  {totalSystemSummary.maxLoss.toFixed(1)} dB
                </div>
              </div>
              <div className="bg-void-black/40 rounded-xl p-3 text-center">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">
                  Worst Band
                </div>
                <div className="text-sm font-bold text-caution-yellow">
                  {totalSystemSummary.worstBand.band}
                </div>
                <div className="text-[10px] text-gray-400">
                  {formatWatts(totalSystemSummary.worstBand.erpWatts)} ERP
                </div>
              </div>
            </div>
          )}

          {/* Per-band ERP table */}
          <div>
            <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
              Per-Band Results
            </h4>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 pr-3 text-[10px] text-gray-400 font-medium whitespace-nowrap">
                      Band
                    </th>
                    <th className="text-right py-2 px-3 text-[10px] text-gray-400 font-medium whitespace-nowrap">
                      Freq
                    </th>
                    <th className="text-right py-2 px-3 text-[10px] text-gray-400 font-medium whitespace-nowrap">
                      Loss
                    </th>
                    <th className="text-right py-2 px-3 text-[10px] text-gray-400 font-medium whitespace-nowrap">
                      Ant. Gain
                    </th>
                    <th className="text-right py-2 pl-3 text-[10px] text-gray-400 font-medium whitespace-nowrap">
                      ERP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bandResults.map((b) => (
                    <tr
                      key={b.band}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-1.5 pr-3 font-medium text-gray-200 whitespace-nowrap">
                        {b.band}
                      </td>
                      <td className="py-1.5 px-3 text-right text-gray-400 whitespace-nowrap">
                        {b.freqMHz.toFixed(1)}
                      </td>
                      <td
                        className={`py-1.5 px-3 text-right whitespace-nowrap ${lossColorClass(b.feedlineLossDb)}`}
                      >
                        -{b.feedlineLossDb.toFixed(1)} dB
                      </td>
                      <td className="py-1.5 px-3 text-right text-gray-300 whitespace-nowrap">
                        {formatDb(b.antennaGainDbi)}i
                      </td>
                      <td className="py-1.5 pl-3 text-right font-medium text-plasma-orange whitespace-nowrap">
                        {formatWatts(b.erpWatts)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Power at antenna note */}
          {bandResults.length > 0 && (
            <div className="text-[10px] text-gray-500 text-center border-t border-white/5 pt-3">
              Simulation based on{" "}
              <span className="text-gray-400">
                {formatWatts(powerWatts)} TX
              </span>
              {selectedFeedline && (
                <>
                  {" "}
                  through{" "}
                  <span className="text-gray-400">
                    {effectiveLengthFeet} ft{" "}
                    {FEEDLINE_TYPE_NAMES[selectedFeedline.feedlineType]}
                  </span>
                </>
              )}
              {" at "}
              <span className="text-gray-400">{swr.toFixed(1)}:1 SWR</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
