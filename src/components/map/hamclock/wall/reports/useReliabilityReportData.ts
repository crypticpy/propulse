import { useMemo } from "react";
import SunCalc from "suncalc";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useBandActivity, type BandActivityScope } from "@/hooks/useBandActivity";
import { useNowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import { policyAllows } from "@/lib/map/operationalScope";
import { latLonToGrid } from "@/lib/utils/grid";
import { continentForLatLon } from "@/lib/utils/continent";
import { stationPhysicsScores } from "@/lib/verdict/physicsScore";
import { useMapStore } from "@/stores/mapStore";
import { useWallReliability, WALL_FORECAST_BANDS } from "../tiles/useWallReliability";
import { FORECAST_HOUR_MS, modelEvidence, reportPathLabel } from "./forecastEvidence";

/** Presentation joins existing sources; never changes engine/gate behavior. */
export function useReliabilityReportData(band: string, selectedHour?: number) {
  const wall = useWallReliability();
  const location = useActiveLocation();
  const target = useMapStore(state => state.target);
  const station = useStationCastContext();
  const { policy } = useMapOperationalContext();
  const now = Date.now();
  const hourIndex = selectedHour ?? wall.hourIndex;
  const targetContext = useMemo(() => target ? {
    ...target, grid: latLonToGrid(target.lat, target.lon, 4),
  } : null, [target]);
  const originGrid = location ? latLonToGrid(location.lat, location.lon, 4) : null;
  const sameStation = !!location && !!station.location &&
    Math.abs(location.lat - station.location.lat) < 0.001 &&
    Math.abs(location.lon - station.location.lon) < 0.001;
  const nowcast = useNowCastBandPredictions({
    origin: sameStation ? station.location : null,
    target: targetContext,
    mode: wall.mode,
    weather: {
      ...(wall.inputs.kp === null ? {} : { kp: wall.inputs.kp }),
      ...(wall.inputs.sfi === null ? {} : { f107: wall.inputs.sfi }),
    },
    weatherUpdatedAt: wall.updatedAt ?? undefined,
    deriveEnvelope: station.deriveEnvelope,
  });
  const scope = useMemo<BandActivityScope>(() => {
    if (originGrid && targetContext) return { type: "pair", txField: originGrid.slice(0, 2), rxField: targetContext.grid.slice(0, 2) };
    const continent = location ? continentForLatLon(location.lat, location.lon) : null;
    return continent ? { type: "regional", continent } : { type: "global" };
  }, [originGrid, targetContext, location]);
  const publicAllowed = policyAllows(policy, "liveSpots", "public");
  const activity = useBandActivity(scope, publicAllowed);
  const context = { band, targetGrid: targetContext?.grid ?? null, mode: wall.mode, hourIndex, now };
  const unavailableReason = !targetContext ? "NO TARGET — PATH MODEL UNAVAILABLE"
    : !nowcast.enabled ? "MODEL OFF"
    : !sameStation ? "STATION LOCATION DOES NOT MATCH"
    : !nowcast.available ? "MODEL CAPABILITY UNAVAILABLE" : null;
  const model = unavailableReason ? { prediction: null, reason: unavailableReason }
    : modelEvidence(nowcast.predictions.get(band), context);
  const liveModel = unavailableReason ? { prediction: null, reason: unavailableReason }
    : modelEvidence(nowcast.predictions.get(band), { ...context, hourIndex: wall.hourIndex });
  const dayStart = wall.hourIndex - wall.hour;
  const matrix = useMemo(() => {
    const values = new Map<string, number>();
    for (let offset = 0; offset < 48; offset++) {
      const index = dayStart + offset;
      const localScores = !target && location && wall.inputs.kp !== null && wall.inputs.sfi !== null
        ? stationPhysicsScores(wall.inputs.kp, wall.inputs.sfi, SunCalc.getPosition(new Date(index * FORECAST_HOUR_MS), location.lat, location.lon).altitude > 0)
        : null;
      for (const candidate of WALL_FORECAST_BANDS) {
        const value = localScores ? (localScores.get(candidate) ?? NaN) * 100 : wall.cells.get(`${candidate}:${index}`)?.score;
        if (value !== undefined && Number.isFinite(value)) values.set(`${candidate}:${index}`, value);
      }
    }
    return values;
  }, [dayStart, wall.cells, wall.inputs.kp, wall.inputs.sfi, target, location]);
  const physics = Array.from({ length: 48 }, (_, offset) => ({
    hourIndex: dayStart + offset, score: matrix.get(`${band}:${dayStart + offset}`) ?? null,
  }));
  const activityAt = activity.data?.fetchedAt ?? null;
  const sampleHour = activityAt === null ? null : Math.floor(activityAt / FORECAST_HOUR_MS);
  const liveObserved = publicAllowed && activityAt !== null && now - activityAt >= 0 && now - activityAt <= 120_000
    ? activity.data?.get(band) ?? null : null;
  const observed = hourIndex === sampleHour ? liveObserved : null;
  return { wall, location, target: targetContext, nowcast, model, liveModel, physics, matrix, liveObserved, hourIndex, dayStart,
    cell: wall.cells.get(`${band}:${hourIndex}`) ?? null,
    observed, activityAt, activityError: activity.isError, scope,
    sourceLabel: reportPathLabel(originGrid, targetContext?.grid ?? null),
  };
}
