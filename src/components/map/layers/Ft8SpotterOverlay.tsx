/**
 * Ft8SpotterOverlay — Parent group for FT8 Spotter globe visualization.
 *
 * Orchestrates the three 3D sub-components (burst traces, grid heatmap,
 * cycle radar) using data from useFt8SpotterData. Renders inside the R3F
 * Canvas — the HTML HUD is rendered separately by GlobeView.
 */

import { useMemo } from "react";
import {
  useFt8SpotterData,
  type Ft8SpotterDecode,
} from "@/hooks/useFt8SpotterData";
import { Ft8BurstTraces, type Ft8ResolvedTrace } from "./Ft8BurstTraces";
import { Ft8GridHeatmap } from "./Ft8GridHeatmap";
import { Ft8CycleRadar } from "./Ft8CycleRadar";

// ─── Props ───────────────────────────────────────────────────────────────────

interface Ft8SpotterOverlayProps {
  /** Operator station — null if not configured */
  station: {
    lat: number;
    lon: number;
    grid?: string;
    callsign?: string;
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a Ft8SpotterDecode into an Ft8ResolvedTrace for the burst renderer */
function decodeToTrace(d: Ft8SpotterDecode, index: number): Ft8ResolvedTrace {
  return {
    id: `${d.callsign}_${d.cycleId}_${d.time}`,
    endLat: d.lat,
    endLon: d.lon,
    snr: d.snr,
    mode: d.mode,
    callsign: d.callsign,
    delay: index * 50, // 50ms stagger per trace
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Ft8SpotterOverlay({ station }: Ft8SpotterOverlayProps) {
  // Hook called once inside R3F tree — GlobeView has a separate call for HUD
  // (R3F Canvas uses its own React reconciler, so hooks can't be shared)
  const data = useFt8SpotterData();

  // Convert current cycle decodes into burst traces
  const traces: Ft8ResolvedTrace[] = useMemo(
    () => data.currentCycleDecodes.map(decodeToTrace),
    [data.currentCycleDecodes],
  );

  const hasQth = station != null && station.lat != null && station.lon != null;

  return (
    <group>
      {/* Grid heatmap — always renders when there's recent data */}
      <Ft8GridHeatmap decodes={data.allRecentDecodes} />

      {/* Burst traces — only when QTH is available */}
      {hasQth && (
        <Ft8BurstTraces
          traces={traces}
          qthLat={station.lat}
          qthLon={station.lon}
          band={data.currentBand}
          isNewCycle={data.isNewCycle}
        />
      )}

      {/* Cycle radar sweep — only when QTH is available */}
      {hasQth && (
        <Ft8CycleRadar
          qthLat={station.lat}
          qthLon={station.lon}
          cycleProgress={data.cycleProgress}
          isNewCycle={data.isNewCycle}
        />
      )}
    </group>
  );
}
