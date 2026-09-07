import { create } from "zustand";
import { useProfileStore } from "@/stores/profileStore";
import { useUTCClock } from "@/hooks/useUTCClock";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { selectPskStationReports, pskStationState, type PskDirection, type PskWindowMinutes } from "@/lib/hamclock/pskStation";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { canonicalPskCallsign, type PskStationSnapshot } from "@/lib/hamclock/pskStation";

const REFRESH_MS = 300_000;
const snapshotSchema = z.object({
  callsign: z.string(),
  status: z.enum(["ok", "stale", "unavailable"]),
  fetchedAt: z.number().finite().nullable(),
  checkedAt: z.number().finite(),
  retryAt: z.number().finite(),
  windowMinutes: z.literal(1440),
  limit: z.number().int().positive().max(1000),
  limited: z.boolean(),
  discarded: z.number().int().nonnegative(),
  reports: z.array(z.object({
    senderCallsign: z.string().max(32), receiverCallsign: z.string().max(32),
    senderLocator: z.string().max(8).nullable(), receiverLocator: z.string().max(8).nullable(),
    frequencyHz: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    mode: z.string().min(1).max(24), snr: z.number().finite().nullable(),
    observedAt: z.number().finite(),
  })).max(1000),
});

/** One query for both directions, every band and all five local age windows. */
export function usePskStation(value: string, enabled = true) {
  const callsign = canonicalPskCallsign(value);
  const query = useQuery({
    queryKey: ["pskStation", callsign],
    queryFn: async ({ signal }): Promise<PskStationSnapshot> => {
      const response = await fetch(`/api/spots/psk-station?callsign=${encodeURIComponent(callsign!)}`, { signal });
      // A 502 can contain an honest unavailable snapshot with its next retry time.
      const data = snapshotSchema.parse(await response.json());
      if (data.callsign !== callsign) throw new Error("PSK Reporter callsign mismatch");
      if (!response.ok && data.status !== "unavailable") throw new Error("PSK Reporter station feed unavailable");
      return data;
    },
    enabled: enabled && callsign !== null,
    staleTime: REFRESH_MS,
    gcTime: 30 * 60_000,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  return { ...query, callsign };
}

/** Session controls shared by tile, report and the forthcoming coordinated map overlay. */
export const usePskStationView = create<{
  direction: PskDirection; minutes: PskWindowMinutes; band: string;
  setDirection: (direction: PskDirection) => void;
  setMinutes: (minutes: PskWindowMinutes) => void;
  setBand: (band: string) => void;
}>((set) => ({
  direction: "of", minutes: 15, band: "all",
  setDirection: (direction) => set({ direction }),
  setMinutes: (minutes) => set({ minutes }),
  setBand: (band) => set({ band }),
}));

export function usePskStationData(enabled = true) {
  const call = useProfileStore(s => s.station?.callsign ?? "");
  const feed = usePskStation(call, enabled);
  const view = usePskStationView();
  const now = useUTCClock(10_000).getTime();
  const rows = selectPskStationReports(feed.data, view.direction, view.minutes, now)
    .filter(row => view.band === "all" || bandFromFreq(row.frequencyHz / 1_000) === view.band);
  const state = !feed.callsign ? "SET STATION CALL" : feed.isLoading ? "LOADING" :
    feed.error ? (feed.data?.fetchedAt ? "STALE" : "UNAVAILABLE") : pskStationState(feed.data, now);
  return { feed, view, rows, now, state };
}
