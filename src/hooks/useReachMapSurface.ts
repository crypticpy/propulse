import { useEffect, useMemo, useState } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useStationCastContext } from "./useStationCastContext";
import {
  propagationModelClient,
  propagationModelEnabled,
} from "@/lib/propagation/modelClient";
import {
  buildReachMapRequest,
  predictionsToReachMapCells,
} from "@/lib/propagation/reachMapSurface";
import type { OperationalSpaceWeather } from "@/lib/propagation/coreFeatureBuilder";

const REACH_MAP_LAYER_ID = "reach-map";

export interface ReachMapSurfaceState {
  loading: boolean;
  error: string | null;
  modelVersion: string | null;
  profile: string | null;
  cellCount: number;
  personalized: boolean;
  available: boolean;
}

export function useReachMapSurface(options: {
  enabled: boolean;
  renderOverlay?: boolean;
  band: string;
  validTime: Date;
  weather?: OperationalSpaceWeather;
}): ReachMapSurfaceState {
  const {
    location,
    deriveEnvelope,
    hasConfiguredChain,
  } = useStationCastContext();
  const [state, setState] = useState<Omit<ReachMapSurfaceState, "personalized" | "available">>({
    loading: false,
    error: null,
    modelVersion: null,
    profile: null,
    cellCount: 0,
  });
  const timeKey = Math.floor(options.validTime.getTime() / 300_000);
  const weatherKey = JSON.stringify(options.weather ?? {});
  const declaredPowerWatts = useMemo(() => {
    const envelope = deriveEnvelope(options.band, { mode: "WSPR" });
    return Math.max(envelope?.conductedPowerWatts ?? 5, 0.001);
  }, [deriveEnvelope, options.band]);

  useEffect(() => {
    const remove = () => useMapStore.getState().removeOverlayLayer(REACH_MAP_LAYER_ID);
    if (!options.enabled) {
      remove();
      setState((current) => ({ ...current, loading: false, error: null, cellCount: 0 }));
      return remove;
    }
    if (!propagationModelEnabled || !propagationModelClient) {
      remove();
      setState((current) => ({
        ...current,
        loading: false,
        error: "Prediction service is not configured",
        cellCount: 0,
      }));
      return remove;
    }
    if (!location) {
      remove();
      setState((current) => ({
        ...current,
        loading: false,
        error: "Set an operating location to build ReachMap",
        cellCount: 0,
      }));
      return remove;
    }

    const controller = new AbortController();
    const validTime = new Date(timeKey * 300_000);
    const weather = JSON.parse(weatherKey) as OperationalSpaceWeather;
    const { request, grid } = buildReachMapRequest({
      origin: location,
      band: options.band,
      validTime,
      declaredPowerWatts,
      weather,
      deriveEnvelope: (band, targetBearingDeg) =>
        deriveEnvelope(band, { mode: "WSPR", targetBearingDeg }),
    });
    setState((current) => ({ ...current, loading: true, error: null }));
    propagationModelClient.surface(request, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const cells = predictionsToReachMapCells(response.cells, grid);
        if (options.renderOverlay !== false) {
          useMapStore.getState().updateOverlayLayer(REACH_MAP_LAYER_ID, {
            type: "cells",
            cells,
          });
        } else {
          remove();
        }
        setState({
          loading: false,
          error: null,
          modelVersion: response.cells[0]?.model_version ?? null,
          profile: response.cells[0]?.profile ?? null,
          cellCount: cells.length,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        remove();
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "ReachMap request failed",
          cellCount: 0,
        }));
      });

    return () => {
      controller.abort();
      remove();
    };
  }, [
    options.enabled,
    options.renderOverlay,
    options.band,
    timeKey,
    weatherKey,
    declaredPowerWatts,
    location,
    deriveEnvelope,
  ]);

  return {
    ...state,
    personalized: hasConfiguredChain,
    available: propagationModelEnabled && location !== null,
  };
}
