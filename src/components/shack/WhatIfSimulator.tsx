/**
 * WhatIfSimulator — Sandbox copy of the active station chain.
 *
 * Power, feedline length, and SWR can be varied without touching inventory.
 * Apply writes those values back to the live chain.
 */

import { useEffect, useMemo, useState } from "react";
import {
  useActiveChain,
  useShackStore,
  useStationInventory,
} from "@/stores/shackStore";
import { computeStationChainPerformance } from "@/lib/station/stationChainEngine";
import { BandCapabilityStrip } from "./BandCapabilityStrip";
import type { StationChain } from "@/types/stationChain";
import type { UserAntenna, UserFeedline } from "@/types/shack";

function formatWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}kW`;
  if (w >= 100) return `${w.toFixed(0)}W`;
  if (w >= 1) return `${w.toFixed(1)}W`;
  return `${(w * 1000).toFixed(0)}mW`;
}

function cloneChain(chain: StationChain, powerWatts: number): StationChain {
  return {
    ...chain,
    operatingPowerWatts: powerWatts,
    nodes: chain.nodes.map((node) => ({ ...node })),
    feedlineRuns: chain.feedlineRuns.map((run) => ({
      ...run,
      inlineComponentIds: [...run.inlineComponentIds],
    })),
  };
}

export function WhatIfSimulator() {
  const chain = useActiveChain();
  const inventory = useStationInventory();
  const updateChain = useShackStore((s) => s.updateChain);
  const updateFeedline = useShackStore((s) => s.updateFeedline);
  const updateAntenna = useShackStore((s) => s.updateAntenna);

  const liveFeedlineId = chain?.feedlineRuns[0]?.feedlineId;
  const liveAntennaId = chain?.nodes.find((node) => node.type === "antenna");
  const liveAntenna =
    liveAntennaId?.type === "antenna"
      ? inventory.antennas.find((item) => item.id === liveAntennaId.antennaId)
      : undefined;
  const liveFeedline = liveFeedlineId
    ? inventory.feedlines.find((item) => item.id === liveFeedlineId)
    : undefined;

  const chainId = chain?.id;
  const [powerWatts, setPowerWatts] = useState(
    chain?.operatingPowerWatts ?? 100,
  );
  const [lengthFeet, setLengthFeet] = useState(liveFeedline?.lengthFeet ?? 50);
  const [swr, setSwr] = useState(1.5);
  const [swrTouched, setSwrTouched] = useState(false);
  const [swrBand, setSwrBand] = useState(liveAntenna?.bands[0] ?? "20m");

  useEffect(() => {
    if (!chain) return;
    setPowerWatts(chain.operatingPowerWatts);
    setLengthFeet(liveFeedline?.lengthFeet ?? 50);
    setSwr(1.5);
    setSwrTouched(false);
    setSwrBand(liveAntenna?.bands[0] ?? "20m");
    // Reset the sandbox only when the operator switches paths, not on Apply.
  }, [chainId]); // eslint-disable-line react-hooks/exhaustive-deps -- chainId is the switch signal

  const baseline = useMemo(
    () => computeStationChainPerformance(chain, inventory),
    [chain, inventory],
  );

  const sandbox = useMemo(() => {
    if (!chain) return null;
    const antennas: UserAntenna[] = inventory.antennas.map((antenna) => {
      if (antenna.id !== liveAntenna?.id || !swrTouched) return antenna;
      return {
        ...antenna,
        swrByBand: { ...antenna.swrByBand, [swrBand]: swr },
      };
    });
    const feedlines: UserFeedline[] = inventory.feedlines.map((feedline) =>
      feedline.id === liveFeedline?.id
        ? { ...feedline, lengthFeet }
        : feedline,
    );
    return computeStationChainPerformance(cloneChain(chain, powerWatts), {
      ...inventory,
      antennas,
      feedlines,
    });
  }, [chain, inventory, lengthFeet, liveAntenna?.id, liveFeedline?.id, powerWatts, swr, swrBand, swrTouched]);

  if (!chain) {
    return (
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider mb-2">
          What-If Simulator
        </h3>
        <p className="text-sm text-gray-500">
          Activate a signal path in the Diagram lab to sandbox upgrades.
        </p>
      </div>
    );
  }

  const liveChain = chain;

  const bandLossData =
    sandbox?.bands.map((b) => ({ band: b.band, lossDb: b.feedlineLossDb })) ??
    [];

  function reset() {
    setPowerWatts(liveChain.operatingPowerWatts);
    setLengthFeet(liveFeedline?.lengthFeet ?? 50);
    setSwr(1.5);
    setSwrTouched(false);
  }

  function apply() {
    if (powerWatts !== liveChain.operatingPowerWatts) {
      updateChain(liveChain.id, { operatingPowerWatts: powerWatts });
    }
    if (liveFeedline && lengthFeet !== liveFeedline.lengthFeet) {
      updateFeedline(liveFeedline.id, { lengthFeet });
    }
    if (liveAntenna && swrTouched) {
      updateAntenna(liveAntenna.id, {
        swrByBand: { ...liveAntenna.swrByBand, [swrBand]: swr },
      });
    }
  }

  return (
    <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
          What-If Simulator
        </h3>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="text-[10px] text-gray-400 hover:text-gray-200 uppercase tracking-wider"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={apply}
            className="text-[10px] text-plasma-orange hover:text-plasma-orange/80 uppercase tracking-wider"
          >
            Apply to path
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Sandbox of <span className="text-gray-300">{liveChain.name}</span>. Apply
        writes only the fields you changed.
      </p>

      <div className="space-y-4">
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
            min={1}
            max={1500}
            step={powerWatts < 10 ? 1 : powerWatts < 100 ? 5 : 10}
            value={powerWatts}
            onChange={(e) => setPowerWatts(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-plasma-orange"
          />
        </div>
        {liveFeedline && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                Feedline length
              </label>
              <span className="text-sm font-mono text-plasma-orange">
                {lengthFeet} ft
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={300}
              step={5}
              value={lengthFeet}
              onChange={(e) => setLengthFeet(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-plasma-orange"
            />
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              SWR
            </label>
            <span className="text-sm font-mono text-plasma-orange">
              {swr.toFixed(1)}:1
            </span>
          </div>
          {liveAntenna && liveAntenna.bands.length > 1 && (
            <select
              aria-label="SWR band"
              value={swrBand}
              onChange={(event) => setSwrBand(event.target.value)}
              className="mb-1.5 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-gray-300"
            >
              {liveAntenna.bands.map((band) => (
                <option key={band} value={band}>
                  {band}
                </option>
              ))}
            </select>
          )}
          <input
            type="range"
            min={1}
            max={5}
            step={0.1}
            value={swr}
            onChange={(e) => {
              setSwrTouched(true);
              setSwr(Number(e.target.value));
            }}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-plasma-orange"
          />
        </div>
      </div>

      {sandbox && sandbox.bands.length > 0 && (
        <div className="space-y-4">
          <BandCapabilityStrip bands={bandLossData} />
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 pr-3 text-[10px] text-gray-400">
                    Band
                  </th>
                  <th className="text-right py-2 px-3 text-[10px] text-gray-400">
                    Live ERP
                  </th>
                  <th className="text-right py-2 pl-3 text-[10px] text-gray-400">
                    Sandbox ERP
                  </th>
                </tr>
              </thead>
              <tbody>
                {sandbox.bands.map((band) => {
                  const live = baseline.bands.find((item) => item.band === band.band);
                  return (
                    <tr key={band.band} className="border-b border-white/5">
                      <td className="py-1.5 pr-3 text-gray-200">{band.band}</td>
                      <td className="py-1.5 px-3 text-right text-gray-400">
                        {live ? formatWatts(live.erpWatts) : "—"}
                      </td>
                      <td className="py-1.5 pl-3 text-right text-plasma-orange">
                        {formatWatts(band.erpWatts)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
