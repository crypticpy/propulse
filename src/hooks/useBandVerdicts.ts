/**
 * useBandVerdicts — glue hook for the Band Verdict feature (E4).
 *
 * Fuses the physics band-condition model with live spot activity into
 * per-band VerdictInputs, feeds them through the verdict store on a fixed
 * cadence, and returns the resulting stable verdicts for display.
 *
 * Physics arm (v1.1, M4 F3): per-path QTH→first-saved-target scores for the
 * HF bands when a target exists; the kp/sfi day/night table otherwise and
 * for 6m. See src/lib/verdict/physicsScore.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import SunCalc from "suncalc";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useDXStore } from "@/stores/dxStore";
import { useProfileStore } from "@/stores/profileStore";
import { bandPhysicsScores } from "@/lib/verdict/physicsScore";
import { getBandFromFrequency } from "@/lib/api/dxcluster";
import {
  useVerdictStore,
  type VerdictIngestInput,
} from "@/stores/verdictStore";
import type { BandVerdict, BandVerdictResult } from "@/lib/verdict/verdictEngine";
import type { DXSpot } from "@/types/dxcluster";

const INGEST_INTERVAL_MS = 60_000;
const SPOT_WINDOW_MINUTES = 30;
/** How often the path-physics date input is refreshed when nothing else
 * changes. Solar zenith moves ~1°/4min, so 5 minutes keeps MUF/absorption
 * current without recomputing the path model on every ingest tick. */
const PHYSICS_REFRESH_INTERVAL_MS = 5 * 60_000;

export interface BandVerdictEntry {
  band: string;
  stable: BandVerdict;
  result: BandVerdictResult;
  since: number;
}

export interface UseBandVerdictsResult {
  bands: BandVerdictEntry[];
  ready: boolean;
}

function spotTimeMs(spot: DXSpot): number {
  return spot.time instanceof Date
    ? spot.time.getTime()
    : new Date(spot.time).getTime();
}

function resolveBand(spot: DXSpot): string {
  if (spot.band) return spot.band;
  return getBandFromFrequency(spot.frequency);
}

export function useBandVerdicts(): UseBandVerdictsResult {
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();
  const station = useProfileStore((s) => s.station);
  // First saved target is "the target" by convention (see useBandConditionsTint)
  const savedTargets = useProfileStore((s) => s.savedTargets);
  const firstTarget = savedTargets[0];
  // Same grid-keyed query as every other call site — shares the cache and
  // scopes spot confirmation to the operator's region, not the whole world.
  const { spots: liveSpots } = useLiveSpots({ grid: station?.grid });
  const clusterSpots = useDXStore((s) => s.spots);

  const kIndexData = kIndexQuery.data;
  const solarFluxData = solarFluxQuery.data;

  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return null;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return null;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Day/night at the user's QTH (fallback to 0,0 when no station is set).
  // Deliberately NOT memoized: every ingest tick re-renders this hook (the
  // store sets fresh object identities), so recomputing per render is what
  // keeps the day/night flank moving on a wall display that never reloads.
  const stationLat = station?.lat ?? 0;
  const stationLon = station?.lon ?? 0;
  const isDaylight =
    SunCalc.getPosition(new Date(), stationLat, stationLon).altitude > 0;

  // Periodic tick so the path-physics date can never freeze: with a steady
  // kp/sfi and unchanged coordinates the memo below would otherwise keep a
  // Date captured hours earlier on a wall display that never reloads.
  const [physicsRefreshedAt, setPhysicsRefreshedAt] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(
      () => setPhysicsRefreshedAt(Date.now()),
      PHYSICS_REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  // Per-band physics score, 0..1. The Date fed to the path model refreshes
  // on every dep change (solar refetch, day/night flank, target edit) AND
  // at least every PHYSICS_REFRESH_INTERVAL_MS via the tick above.
  const stationLatDep = station?.lat;
  const stationLonDep = station?.lon;
  const targetLatDep = firstTarget?.lat;
  const targetLonDep = firstTarget?.lon;
  const physicsScores = useMemo(() => {
    if (currentKp === null || currentSfi === null) {
      return new Map<string, number>();
    }
    return bandPhysicsScores({
      kp: currentKp,
      sfi: currentSfi,
      isDaylight,
      home:
        stationLatDep != null && stationLonDep != null
          ? { lat: stationLatDep, lon: stationLonDep }
          : undefined,
      target:
        targetLatDep != null && targetLonDep != null
          ? { lat: targetLatDep, lon: targetLonDep }
          : undefined,
      date: new Date(physicsRefreshedAt),
    });
  }, [
    currentKp,
    currentSfi,
    isDaylight,
    stationLatDep,
    stationLonDep,
    targetLatDep,
    targetLonDep,
    physicsRefreshedAt,
  ]);

  // Bin live + cluster spots per band within the confirmation window.
  const spotBins = useMemo(() => {
    const bins = new Map<string, { spotters: Set<string>; count: number }>();
    const cutoff = Date.now() - SPOT_WINDOW_MINUTES * 60 * 1000;
    const allSpots: DXSpot[] = [...liveSpots, ...clusterSpots];

    for (const spot of allSpots) {
      if (spotTimeMs(spot) < cutoff) continue;
      const band = resolveBand(spot);
      if (!band || band === "Unknown") continue;
      const spotter =
        (spot as { receiverCallsign?: string }).receiverCallsign ||
        spot.spotter;
      let bin = bins.get(band);
      if (!bin) {
        bin = { spotters: new Set(), count: 0 };
        bins.set(band, bin);
      }
      bin.count += 1;
      if (spotter) bin.spotters.add(spotter);
    }
    return bins;
  }, [liveSpots, clusterSpots]);

  const ready = currentKp !== null && currentSfi !== null;

  // Build the per-band evaluation batch fed to the store.
  const evals = useMemo((): VerdictIngestInput[] => {
    if (!ready || currentKp === null || currentSfi === null) return [];
    const batch: VerdictIngestInput[] = [];
    for (const [band, physicsScore] of physicsScores) {
      const bin = spotBins.get(band);
      batch.push({
        inputs: {
          band,
          physicsScore,
          spotCount: bin?.count ?? 0,
          uniqueSpotters: bin?.spotters.size ?? 0,
          windowMinutes: SPOT_WINDOW_MINUTES,
        },
        kp: currentKp,
        sfi: currentSfi,
      });
    }
    return batch;
  }, [ready, currentKp, currentSfi, physicsScores, spotBins]);

  const evalsRef = useRef(evals);
  evalsRef.current = evals;

  useEffect(() => {
    if (!ready || evalsRef.current.length === 0) return;
    useVerdictStore.getState().ingest(evalsRef.current);
    const interval = setInterval(() => {
      if (evalsRef.current.length > 0) {
        useVerdictStore.getState().ingest(evalsRef.current);
      }
    }, INGEST_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [ready]);

  const machines = useVerdictStore((s) => s.machines);
  const results = useVerdictStore((s) => s.results);

  const bandOrder = useMemo(
    () => [...physicsScores.keys()],
    [physicsScores],
  );

  const bands = useMemo((): BandVerdictEntry[] => {
    const entries: BandVerdictEntry[] = [];
    for (const [band, machine] of Object.entries(machines)) {
      const result = results[band];
      if (!result) continue;
      entries.push({
        band,
        stable: machine.stable,
        result,
        since: machine.stableSince,
      });
    }
    return entries.sort((a, b) => {
      const ai = bandOrder.indexOf(a.band);
      const bi = bandOrder.indexOf(b.band);
      if (ai === -1 && bi === -1) return a.band.localeCompare(b.band);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [machines, results, bandOrder]);

  return { bands, ready };
}

export default useBandVerdicts;
