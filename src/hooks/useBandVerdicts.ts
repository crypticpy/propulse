/**
 * useBandVerdicts — glue hook for the Band Health ladder (BH2).
 *
 * Picks the operator's headline scope (Regional from the station continent,
 * DX field pair when the DX toggle is on and a target exists, Global as the
 * fallback), fuses the physics band-condition model with the scoped
 * band-activity endpoint into per-band LadderInputs, feeds them through the
 * verdict store on a fixed cadence, and returns the stable ladder states.
 *
 * Counts come from /api/spots/band-activity (server-side deduplicated —
 * the §3 observation identity), NOT from the client's grid-scoped spot
 * feeds; the same-population rule applies to the ladder's verified bar.
 *
 * Physics arm: Regional is scored home-only (is MY region's ionosphere
 * open), DX home→target (see src/lib/verdict/physicsScore.ts).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import SunCalc from "suncalc";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useProfileStore } from "@/stores/profileStore";
import { bandPhysicsScores } from "@/lib/verdict/physicsScore";
import {
  useBandActivity,
  type BandActivityScope,
} from "@/hooks/useBandActivity";
import {
  useVerdictStore,
  FADING_STREAK_THRESHOLD,
  scopeBandKey,
  type LadderIngestInput,
  type LadderResultEntry,
} from "@/stores/verdictStore";
import { LADDER_RANK, type LadderState } from "@/lib/verdict/ladder";
import {
  continentForLatLon,
  CONTINENT_LABEL,
  type ContinentCode,
} from "@/lib/utils/continent";
import { getContinent } from "@/lib/utils/multipliers";
import { latLonToGrid } from "@/lib/utils/grid";

const INGEST_INTERVAL_MS = 60_000;
/** How often the path-physics date input is refreshed when nothing else
 * changes. Solar zenith moves ~1°/4min, so 5 minutes keeps MUF/absorption
 * current without recomputing the path model on every ingest tick. */
const PHYSICS_REFRESH_INTERVAL_MS = 5 * 60_000;

type VerdictBatchReader = () => LadderIngestInput[];

/**
 * One ingest cadence per active scope, even when responsive layouts mount more
 * than one consumer (for example PropSphere's desktop and mobile panels).
 * Without this small coordinator, duplicate hook instances would advance the
 * falling-streak machine several times during one real minute and could label
 * a band Fading too early. The first live reader is not special: the interval
 * selects the first currently registered non-empty batch on every tick.
 */
const scopeReaders = new Map<string, Map<symbol, VerdictBatchReader>>();
const scopeTimers = new Map<string, number>();
const scopeIngestBuckets = new Map<string, number>();

function ingestScope(scopeId: string): void {
  const bucket = Math.floor(Date.now() / INGEST_INTERVAL_MS);
  if (scopeIngestBuckets.get(scopeId) === bucket) return;
  const readers = scopeReaders.get(scopeId);
  if (!readers) return;
  for (const read of readers.values()) {
    const batch = read();
    if (batch.length === 0) continue;
    useVerdictStore.getState().ingest(batch);
    scopeIngestBuckets.set(scopeId, bucket);
    return;
  }
}

function registerScopeReader(
  scopeId: string,
  read: VerdictBatchReader,
): () => void {
  const id = Symbol(scopeId);
  const readers = scopeReaders.get(scopeId) ?? new Map();
  readers.set(id, read);
  scopeReaders.set(scopeId, readers);

  if (!scopeTimers.has(scopeId)) {
    ingestScope(scopeId);
    scopeTimers.set(
      scopeId,
      window.setInterval(() => ingestScope(scopeId), INGEST_INTERVAL_MS),
    );
  }

  return () => {
    const current = scopeReaders.get(scopeId);
    current?.delete(id);
    if (current && current.size > 0) return;
    scopeReaders.delete(scopeId);
    const timer = scopeTimers.get(scopeId);
    if (timer !== undefined) window.clearInterval(timer);
    scopeTimers.delete(scopeId);
  };
}

export interface ActiveScope {
  /** Store/canonical key: 'global' | 'regional:EU' | 'dx:EM-JO' */
  id: string;
  type: "global" | "regional" | "dx";
  /** Short header label, e.g. "Regional · Europe" or "DX · EM→JO" */
  label: string;
  continent: ContinentCode | null;
}

export interface BandLadderEntry {
  band: string;
  stable: LadderState;
  result: LadderResultEntry;
  since: number;
  /** Opening is dying: consecutive falling trend while stirring or better */
  fading: boolean;
}

export interface UseBandVerdictsResult {
  bands: BandLadderEntry[];
  ready: boolean;
  scope: ActiveScope;
  /** The band-activity scope backing this ladder — reuse it for display
   * queries so the panel shares the same React Query cache entry. */
  activityScope: BandActivityScope;
  /** Whether the DX toggle can do anything (home + target fields known) */
  dxAvailable: boolean;
}

export function bandVerdictInputsAreReady(
  currentKp: number | null,
  currentSfi: number | null,
  activityReady: boolean,
): boolean {
  return currentKp !== null && currentSfi !== null && activityReady;
}

const FIELD_RE = /^[A-R]{2}$/;

function fieldForLatLon(lat?: number, lon?: number): string | null {
  if (lat == null || lon == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const field = latLonToGrid(lat, lon, 4).slice(0, 2).toUpperCase();
  return FIELD_RE.test(field) ? field : null;
}

export function useBandVerdicts(): UseBandVerdictsResult {
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();
  const station = useProfileStore((s) => s.station);
  // First saved target is "the target" by convention (see useBandConditionsTint)
  const savedTargets = useProfileStore((s) => s.savedTargets);
  const firstTarget = savedTargets[0];
  const dxMode = useVerdictStore((s) => s.dxMode);

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

  // Scope derivation. Continent comes from station coordinates via the same
  // box classifier the server uses on spots (scope membership matches), with
  // the callsign-prefix table as fallback for a station without coordinates.
  const stationGridField =
    station?.grid && FIELD_RE.test(station.grid.slice(0, 2).toUpperCase())
      ? station.grid.slice(0, 2).toUpperCase()
      : null;
  const homeField =
    stationGridField ?? fieldForLatLon(station?.lat, station?.lon);
  const targetField = fieldForLatLon(firstTarget?.lat, firstTarget?.lon);
  const dxAvailable = homeField !== null && targetField !== null;

  let continent: ContinentCode | null =
    station != null ? continentForLatLon(station.lat, station.lon) : null;
  if (continent === null && station?.callsign) {
    continent = getContinent(station.callsign);
  }

  const scope = useMemo((): ActiveScope => {
    if (dxMode && homeField && targetField) {
      return {
        id: `dx:${homeField}-${targetField}`,
        type: "dx",
        label: `DX · ${homeField}→${targetField}`,
        continent,
      };
    }
    if (continent) {
      return {
        id: `regional:${continent}`,
        type: "regional",
        label: `Regional · ${CONTINENT_LABEL[continent]}`,
        continent,
      };
    }
    return { id: "global", type: "global", label: "Global", continent: null };
  }, [dxMode, homeField, targetField, continent]);

  const activityScope = useMemo((): BandActivityScope => {
    if (scope.type === "dx" && homeField && targetField) {
      return { type: "pair", txField: homeField, rxField: targetField };
    }
    if (scope.type === "regional" && scope.continent) {
      return { type: "regional", continent: scope.continent };
    }
    return { type: "global" };
  }, [scope, homeField, targetField]);

  const { data: activityByBand } = useBandActivity(activityScope);

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

  // Per-band physics score, 0..1. Regional/Global score the home ionosphere
  // only; DX scores the home→target path. The Date refreshes on every dep
  // change AND at least every PHYSICS_REFRESH_INTERVAL_MS via the tick above.
  const stationLatDep = station?.lat;
  const stationLonDep = station?.lon;
  const targetLatDep = firstTarget?.lat;
  const targetLonDep = firstTarget?.lon;
  const isDxScope = scope.type === "dx";
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
        isDxScope && targetLatDep != null && targetLonDep != null
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
    isDxScope,
    targetLatDep,
    targetLonDep,
    physicsRefreshedAt,
  ]);

  const activityReady = activityByBand !== undefined;
  // Persisted machines are useful for hysteresis, but they are not evidence
  // that the current page load has usable inputs. Treat the ladder as ready
  // only after both solar drivers and the active observation scope arrive, so
  // a reload or failed activity request cannot relabel stored verdicts as live.
  const ready = bandVerdictInputsAreReady(
    currentKp,
    currentSfi,
    activityReady,
  );

  // Build the active scope's evaluation batch. Only the active scope is
  // ingested — idle scopes keep their persisted machines until revisited.
  const evals = useMemo((): LadderIngestInput[] => {
    if (!ready || !activityReady || currentKp === null || currentSfi === null) {
      return [];
    }
    const batch: LadderIngestInput[] = [];
    for (const [band, physicsScore] of physicsScores) {
      const status = activityByBand.get(band);
      batch.push({
        scopeId: scope.id,
        band,
        inputs: {
          physicsScore,
          obs20m: status?.obs20m ?? 0,
          reporters20m: status?.reporters20m ?? 0,
          count10mRecent: status?.count10mRecent ?? 0,
          count10mPrior: status?.count10mPrior ?? 0,
        },
        counts: status
          ? {
              count60m: status.count60m,
              sourceCounts60m: status.sourceCounts60m,
              modeObs20m: status.modeObs20m,
            }
          : undefined,
        kp: currentKp,
        sfi: currentSfi,
      });
    }
    return batch;
  }, [
    ready,
    activityReady,
    currentKp,
    currentSfi,
    physicsScores,
    activityByBand,
    scope.id,
  ]);

  const evalsRef = useRef(evals);
  evalsRef.current = evals;

  useEffect(() => {
    if (!ready || !activityReady) return;
    return registerScopeReader(scope.id, () => evalsRef.current);
    // scope.id: switching scope ingests the new scope immediately so its
    // chips appear (first evaluation shows raw, no hold) instead of waiting
    // out the interval.
  }, [ready, activityReady, scope.id]);

  const machines = useVerdictStore((s) => s.machines);
  const results = useVerdictStore((s) => s.results);
  const fallingStreaks = useVerdictStore((s) => s.fallingStreaks);

  const bandOrder = useMemo(
    () => [...physicsScores.keys()],
    [physicsScores],
  );

  const bands = useMemo((): BandLadderEntry[] => {
    const entries: BandLadderEntry[] = [];
    for (const result of Object.values(results)) {
      if (result.scopeId !== scope.id) continue;
      const key = scopeBandKey(scope.id, result.band);
      const machine = machines[key];
      if (!machine) continue;
      entries.push({
        band: result.band,
        stable: machine.stable,
        result,
        since: machine.stableSince,
        fading:
          (fallingStreaks[key] ?? 0) >= FADING_STREAK_THRESHOLD &&
          LADDER_RANK[machine.stable] >= LADDER_RANK.stirring,
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
  }, [machines, results, fallingStreaks, bandOrder, scope.id]);

  return { bands, ready, scope, activityScope, dxAvailable };
}

export default useBandVerdicts;
