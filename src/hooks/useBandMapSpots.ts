/**
 * useBandMapSpots — Live spot data hook for the Band Map widget.
 *
 * Merges spots from two sources:
 * 1. Bridge (WSJT-X decodes via wsjtxStore) — real-time, no polling
 * 2. Supabase (spot_history_live cutover view) — 15s polling
 *
 * Returns a flat array of BandMapSpot objects filtered by the selected band.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import { BAND_RANGES } from "@/lib/data/bandRanges";
import { classifySpot } from "@/lib/contest/spotContestClassifier";
import type { ContestClassifierContext } from "@/lib/contest/spotContestClassifier";
import { useContestContext } from "@/hooks/useContestContext";

// ── Types ───────────────────────────────────────────────────────────────────

export type BandMapSpotSource = "bridge" | "supabase";

export interface BandMapSpot {
  /** Contacted station callsign */
  callsign: string;
  /** Frequency in kHz */
  frequency: number;
  /** Operating mode (FT8, CW, SSB, etc.) */
  mode: string;
  /** Signal-to-noise ratio in dB */
  snr?: number;
  /** When the spot was received */
  time: Date;
  /** Data source */
  source: BandMapSpotSource;
  /** DXCC entity number, if known */
  dxcc?: number;
  /** Whether this spot is classified as contest-related */
  isContest?: boolean;
  /** Confidence of contest classification (0-1) */
  contestConfidence?: number;
}

export interface UseBandMapSpotsResult {
  /** Spots for the selected band, sorted newest first */
  spots: BandMapSpot[];
  /** Whether data is loading */
  loading: boolean;
  /** Active data source: bridge > supabase > none */
  source: "bridge" | "supabase" | "none";
  /** Re-fetch Supabase data */
  refetch: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// ── Hook ────────────────────────────────────────────────────────────────────

export function useBandMapSpots(
  band: string,
  timeRangeMinutes: number = 15,
): UseBandMapSpotsResult {
  const range = BAND_RANGES[band];
  const contestCtx = useContestContext();

  // ── Contest classifier context ────────────────────────────────────────
  const classifierContext = useMemo<ContestClassifierContext>(
    () => ({
      activeContests: contestCtx.activeContests,
      isContestWeekend: contestCtx.isContestWeekend,
    }),
    [contestCtx.activeContests, contestCtx.isContestWeekend],
  );

  // ── Bridge (WSJT-X) spots ───────────────────────────────────────────────

  const wsjtxDecodes = useWSJTXStore((s) => s.decodes);
  const wsjtxStatus = useWSJTXStore((s) => s.status);
  const wsjtxConnected = useWSJTXStore((s) => s.connected);

  const bridgeSpots = useMemo<BandMapSpot[]>(() => {
    if (!wsjtxConnected || !wsjtxStatus || !range) return [];

    const dialKHz = wsjtxStatus.frequency / 1000;
    const cutoff = Date.now() - timeRangeMinutes * MINUTE;

    return wsjtxDecodes
      .filter((d) => {
        if (!d.callsign) return false;
        if (d.receivedAt < cutoff) return false;
        const spotKHz = dialKHz + d.deltaFrequency / 1000;
        return spotKHz >= range.startKHz && spotKHz <= range.endKHz;
      })
      .map((d) => ({
        callsign: d.callsign!,
        frequency: dialKHz + d.deltaFrequency / 1000,
        mode: d.mode || wsjtxStatus.mode,
        snr: d.snr,
        time: new Date(d.receivedAt),
        source: "bridge" as const,
      }));
  }, [wsjtxDecodes, wsjtxStatus, wsjtxConnected, range, timeRangeMinutes]);

  // ── Supabase (spot_history_live) spots ──────────────────────────────────

  const startTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - timeRangeMinutes);
    return d;
  }, [timeRangeMinutes]);

  const supabaseQuery = useQuery({
    queryKey: ["bandmap-spots", band, timeRangeMinutes],
    queryFn: async (): Promise<BandMapSpot[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from("spot_history_live")
        .select("tx_callsign, frequency_khz, mode, snr, spotted_at, dxcc")
        .eq("band", band)
        .gte("spotted_at", startTime.toISOString())
        .order("spotted_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      return (
        (data ?? []) as Array<{
          tx_callsign: string;
          frequency_khz: number;
          mode: string | null;
          snr: number | null;
          spotted_at: string;
          dxcc: number | null;
        }>
      ).map((row) => ({
        callsign: row.tx_callsign,
        frequency: row.frequency_khz,
        mode: row.mode ?? "UNKNOWN",
        snr: row.snr ?? undefined,
        time: new Date(row.spotted_at),
        source: "supabase" as const,
        dxcc: row.dxcc ?? undefined,
      }));
    },
    enabled: isSupabaseConfigured && Boolean(range),
    staleTime: 10 * SECOND,
    refetchInterval: 15 * SECOND,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // ── Merge & deduplicate ─────────────────────────────────────────────────

  const spots = useMemo<BandMapSpot[]>(() => {
    // Bridge takes priority; fall back to Supabase
    const all: BandMapSpot[] = [];

    if (bridgeSpots.length > 0) {
      all.push(...bridgeSpots);
    }

    if (supabaseQuery.data && supabaseQuery.data.length > 0) {
      all.push(...supabaseQuery.data);
    }

    // Dedup: same callsign within 1 kHz and 1 minute = same spot. Prefer bridge.
    const seen = new Map<string, BandMapSpot>();
    for (const spot of all) {
      const timeMin = Math.floor(spot.time.getTime() / MINUTE);
      const freqRounded = Math.round(spot.frequency);
      const key = `${spot.callsign}_${freqRounded}_${timeMin}`;
      if (!seen.has(key)) {
        seen.set(key, spot);
      }
    }

    // Sort newest first and classify
    return Array.from(seen.values())
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .map((spot) => {
        const classification = classifySpot(
          {
            callsign: spot.callsign,
            frequency: spot.frequency,
            mode: spot.mode,
            band,
            time: spot.time,
          },
          classifierContext,
        );
        return {
          ...spot,
          isContest: classification.isContest,
          contestConfidence: classification.confidence,
        };
      });
  }, [bridgeSpots, supabaseQuery.data, band, classifierContext]);

  // ── Source determination ────────────────────────────────────────────────

  const source: "bridge" | "supabase" | "none" = wsjtxConnected
    ? "bridge"
    : isSupabaseConfigured
      ? "supabase"
      : "none";

  return {
    spots,
    loading: supabaseQuery.isLoading,
    source,
    refetch: () => {
      supabaseQuery.refetch();
    },
  };
}
