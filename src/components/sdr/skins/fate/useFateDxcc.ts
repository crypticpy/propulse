/**
 * useFateDxcc — Batch DXCC entity resolution for F8 decode rows.
 *
 * Uses synchronous lookupEntity() + useLogbook() isWorked/getWorkedBands
 * for instant per-row DXCC data without async/debounce overhead.
 *
 * Returns a Map keyed by uppercase callsign -> DxccRowData.
 * Designed for rendering 200+ decode rows efficiently.
 */

import { useMemo } from "react";
import { lookupEntity } from "@/lib/data/dxccEntities";
import type { DXCCEntity } from "@/lib/data/dxccEntities";
import type { EnrichedDecode } from "./useFateDecodes";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DxccRowData {
  /** Resolved DXCC entity, or null if callsign prefix not found */
  entity: DXCCEntity | null;
  /** Whether the callsign has been worked before (any band/mode) */
  isWorked: boolean;
  /** Bands on which this callsign has been previously worked */
  workedBands: string[];
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Batch-resolves DXCC entity data for all decoded callsigns.
 *
 * IMPORTANT: isWorked and getWorkedBands must be passed from the component
 * that calls useLogbook() — hooks cannot be called inside useMemo.
 *
 * @param decodes - Array of enriched FT8/FT4 decodes
 * @param isWorked - Callback from useLogbook().isWorked
 * @param getWorkedBands - Callback from useLogbook().getWorkedBands
 * @returns Map keyed by uppercase callsign to DxccRowData
 */
export function useFateDxcc(
  decodes: EnrichedDecode[],
  isWorked: (callsign: string) => boolean,
  getWorkedBands: (callsign: string) => string[],
): Map<string, DxccRowData> {
  return useMemo(() => {
    const map = new Map<string, DxccRowData>();

    for (const d of decodes) {
      const call = d.parsedCallsign;
      if (!call) continue;

      const key = call.toUpperCase();
      if (map.has(key)) continue;

      const lookupResult = lookupEntity(key);

      map.set(key, {
        entity: lookupResult?.entity ?? null,
        isWorked: isWorked(key),
        workedBands: getWorkedBands(key),
      });
    }

    return map;
  }, [decodes, isWorked, getWorkedBands]);
}
