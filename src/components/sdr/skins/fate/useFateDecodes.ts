/**
 * useFateDecodes — Core data enrichment hook for the Fate (F8) FT8/FT4 skin.
 *
 * Transforms raw WsjtxDecode[] into enriched rows suitable for the decode table.
 * Computes distance/bearing from operator QTH, tracks new stations per session,
 * and splits decodes into "all" vs. "directed at me" buckets.
 */

import { useMemo, useRef } from "react";
import type { WsjtxDecode } from "@/lib/radio/protocol";
import { extractCallInfo, isCQMessage } from "@/lib/ft8/ft8MessageParser";
import { gridDistance, gridBearing, isValidGrid } from "@/lib/utils/grid";
import { formatUtcMsSinceMidnight } from "@/components/sdr/skins/types";
import {
  isFoxMessage,
  parseFoxMessage,
  detectDxpedition,
  isHoundResponse as checkHoundResponse,
} from "./fateFoxHound";

// ─── Enriched decode row ─────────────────────────────────────────────────────

export interface EnrichedDecode {
  // Original WsjtxDecode fields
  isNew: boolean;
  time: number;
  snr: number;
  deltaTime: number;
  deltaFrequency: number;
  mode: string;
  message: string;
  lowConfidence: boolean;
  callsign?: string;
  grid?: string;
  instanceId?: string;

  // Enriched fields
  parsedCallsign: string | null;
  parsedGrid: string | null;
  isCQ: boolean;
  cqDirection: string | null;
  signalReport: string | null;
  senderCallsign: string | null;
  isCompound: boolean;
  isFoxMulti: boolean;
  foxCallsign: string | null;
  isHoundResponse: boolean;
  detectedFoxCallsign: string | null;
  distanceKm: number | null;
  bearingDeg: number | null;
  isNewStation: boolean;
  utcFormatted: string;
  rowKey: string;
  cycleId: number;
}

// ─── Aggregate stats ─────────────────────────────────────────────────────────

export interface FateDecodeStats {
  totalDecodes: number;
  uniqueCallsigns: number;
  newStations: number;
}

// ─── FT8/FT4 standard dial frequencies ──────────────────────────────────────

export const FT8_DIAL_FREQUENCIES = [
  { band: "160m", mode: "FT8", freqHz: 1840000, label: "1.840" },
  { band: "80m", mode: "FT8", freqHz: 3573000, label: "3.573" },
  { band: "60m", mode: "FT8", freqHz: 5357000, label: "5.357" },
  { band: "40m", mode: "FT8", freqHz: 7074000, label: "7.074" },
  { band: "40m", mode: "FT4", freqHz: 7047500, label: "7.047" },
  { band: "30m", mode: "FT8", freqHz: 10136000, label: "10.136" },
  { band: "20m", mode: "FT8", freqHz: 14074000, label: "14.074" },
  { band: "20m", mode: "FT4", freqHz: 14080000, label: "14.080" },
  { band: "17m", mode: "FT8", freqHz: 18100000, label: "18.100" },
  { band: "15m", mode: "FT8", freqHz: 21074000, label: "21.074" },
  { band: "12m", mode: "FT8", freqHz: 24915000, label: "24.915" },
  { band: "10m", mode: "FT8", freqHz: 28074000, label: "28.074" },
  { band: "6m", mode: "FT8", freqHz: 50313000, label: "50.313" },
  { band: "2m", mode: "FT8", freqHz: 144174000, label: "144.174" },
] as const;

// ─── Hook return type ────────────────────────────────────────────────────────

interface UseFateDecodesResult {
  enriched: EnrichedDecode[];
  directed: EnrichedDecode[];
  stats: FateDecodeStats;
}

// ─── Hook implementation ─────────────────────────────────────────────────────

export function useFateDecodes(
  decodes: WsjtxDecode[],
  myCallsign: string | null,
  myGrid: string | null,
): UseFateDecodesResult {
  // Persistent set of callsigns heard this session — survives re-renders
  const seenCallsignsRef = useRef<Set<string>>(new Set());

  const result = useMemo(() => {
    const myGridValid = myGrid && isValidGrid(myGrid);
    const myCallUpper = myCallsign?.toUpperCase() ?? null;

    // Track new stations discovered in *this* computation pass
    let newStationsThisPass = 0;
    const callsignSet = new Set<string>();

    const enriched: EnrichedDecode[] = decodes.map((d, idx) => {
      const parsed = extractCallInfo(d.message);
      const parsedCallsign = parsed.callsign ?? null;
      const parsedGrid = parsed.grid ?? null;
      const isCQ = isCQMessage(d.message);
      const cqDirection = parsed.cqDirection ?? null;
      const signalReport = parsed.signalReport ?? null;
      const senderCallsign = parsed.senderCallsign ?? null;
      const isCompound = parsed.isCompound ?? false;
      const isFoxMulti =
        (parsed.isFoxMulti ?? false) || isFoxMessage(d.message);

      // Extract Fox callsign from Fox multi-call or compound messages
      let foxCallsign: string | null = null;
      if (isFoxMessage(d.message)) {
        const foxPairs = parseFoxMessage(d.message);
        if (foxPairs.length > 0) {
          foxCallsign = foxPairs[0].fox;
        }
      }

      // Distance / bearing from operator QTH
      let distanceKm: number | null = null;
      let bearingDeg: number | null = null;
      if (myGridValid && parsedGrid && isValidGrid(parsedGrid)) {
        try {
          distanceKm = gridDistance(myGrid, parsedGrid);
          bearingDeg = gridBearing(myGrid, parsedGrid);
        } catch {
          // malformed grid — leave null
        }
      }

      // New-station tracking
      const callUpper = parsedCallsign?.toUpperCase() ?? null;
      let isNewStation = false;
      if (callUpper) {
        callsignSet.add(callUpper);
        if (!seenCallsignsRef.current.has(callUpper)) {
          seenCallsignsRef.current.add(callUpper);
          isNewStation = true;
          newStationsThisPass++;
        }
      }

      // Cycle ID: FT8 = 15s cycles, FT4 = 7.5s cycles
      const cycleDurationMs = d.mode === "FT4" ? 7500 : 15000;
      const cycleId = Math.floor(d.time / cycleDurationMs);

      return {
        // Spread original fields
        isNew: d.isNew,
        time: d.time,
        snr: d.snr,
        deltaTime: d.deltaTime,
        deltaFrequency: d.deltaFrequency,
        mode: d.mode,
        message: d.message,
        lowConfidence: d.lowConfidence,
        callsign: d.callsign,
        grid: d.grid,
        instanceId: d.instanceId,

        // Enriched
        parsedCallsign,
        parsedGrid,
        isCQ,
        cqDirection,
        signalReport,
        senderCallsign,
        isCompound,
        isFoxMulti,
        foxCallsign,
        isHoundResponse: false, // Set in second pass after detectDxpedition
        detectedFoxCallsign: null, // Set in second pass after detectDxpedition
        distanceKm,
        bearingDeg,
        isNewStation,
        utcFormatted: formatUtcMsSinceMidnight(d.time),
        rowKey: `${d.time}-${d.deltaFrequency}-${d.snr}-${idx}`,
        cycleId,
      };
    });

    // ── Fox/Hound second pass: detect DXpedition and mark Hound responses ──
    const detectedFox = detectDxpedition(enriched);
    if (detectedFox) {
      for (const e of enriched) {
        e.detectedFoxCallsign = detectedFox;
        if (!e.isFoxMulti && checkHoundResponse(e.message, detectedFox)) {
          e.isHoundResponse = true;
        }
      }
    }

    // Directed = decodes where the message text contains my callsign
    const directed: EnrichedDecode[] = myCallUpper
      ? enriched.filter((e) => e.message.toUpperCase().includes(myCallUpper))
      : [];

    const stats: FateDecodeStats = {
      totalDecodes: enriched.length,
      uniqueCallsigns: callsignSet.size,
      newStations: newStationsThisPass,
    };

    return { enriched, directed, stats };
  }, [decodes, myCallsign, myGrid]);

  return result;
}
