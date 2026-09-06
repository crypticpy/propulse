import { useEffect } from "react";
import { create } from "zustand";
import type { BandActivitySnapshot } from "./useBandActivity";
import { useUTCClock } from "./useUTCClock";
import { recordLiveBandSample, type LiveBandSample } from "@/lib/hamclock/liveBandHistory";

// Session-only global observations survive report close/reopen and pin handoff.
// Never accept regional/path snapshots into this store.
const useSamples = create<{ samples: LiveBandSample[] }>(() => ({ samples: [] }));
export function useLiveBandHistory(globalData: BandActivitySnapshot | undefined) {
  const now = useUTCClock(30_000).getTime();
  const samples = useSamples((state) => state.samples);
  useEffect(() => {
    useSamples.setState((state) => {
      const samples = recordLiveBandSample(state.samples, globalData, now);
      return samples === state.samples ? state : { samples };
    });
  }, [globalData, now]);
  return { samples, now };
}
