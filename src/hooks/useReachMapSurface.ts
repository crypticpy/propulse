import { useEffect, useMemo, useState } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useStationCastContext } from "./useStationCastContext";
import {
  propagationModelClient,
  propagationModelEnabled,
  propagationStationCastRequested,
  propagationStationCastVisible,
} from "@/lib/propagation/modelClient";
import {
  buildReachMapRequest,
  chunkReachMapSurfaceRequest,
  predictionsToReachMapCells,
  summarizeReachMapPredictions,
} from "@/lib/propagation/reachMapSurface";
import type { OperationalSpaceWeather } from "@/lib/propagation/coreFeatureBuilder";

const REACH_MAP_LAYER_ID = "reach-map";

export interface ReachMapSurfaceState {
  status: "idle" | "loading" | "ready" | "partial" | "unavailable" | "input-required";
  loading: boolean;
  error: string | null;
  modelVersion: string | null;
  profile: string | null;
  cellCount: number;
  expectedCellCount: number;
  failedCellCount: number;
  fallbackCellCount: number;
  staleInputCellCount: number;
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
    status: "idle",
    loading: false,
    error: null,
    modelVersion: null,
    profile: null,
    cellCount: 0,
    expectedCellCount: 0,
    failedCellCount: 0,
    fallbackCellCount: 0,
    staleInputCellCount: 0,
  });
  const timeKey = Math.floor(options.validTime.getTime() / 300_000);
  const weatherKey = JSON.stringify(options.weather ?? {});
  const declaredPowerWatts = useMemo(() => {
    if (!propagationStationCastRequested) return 5;
    const envelope = deriveEnvelope(options.band, { mode: "WSPR" });
    return Math.max(envelope?.conductedPowerWatts ?? 5, 0.001);
  }, [deriveEnvelope, options.band]);

  useEffect(() => {
    const remove = () => useMapStore.getState().removeOverlayLayer(REACH_MAP_LAYER_ID);
    const client = propagationModelClient;
    if (!options.enabled) {
      remove();
      setState((current) => ({
        ...current,
        status: "idle",
        loading: false,
        error: null,
        cellCount: 0,
        expectedCellCount: 0,
        failedCellCount: 0,
        fallbackCellCount: 0,
        staleInputCellCount: 0,
      }));
      return remove;
    }
    if (!propagationModelEnabled || !client) {
      remove();
      setState((current) => ({
        ...current,
        status: "unavailable",
        loading: false,
        error: "Prediction service is not configured",
        cellCount: 0,
        expectedCellCount: 0,
        failedCellCount: 0,
        fallbackCellCount: 0,
        staleInputCellCount: 0,
      }));
      return remove;
    }
    if (!location) {
      remove();
      setState((current) => ({
        ...current,
        status: "input-required",
        loading: false,
        error: "Set an operating location to build ReachMap",
        cellCount: 0,
        expectedCellCount: 0,
        failedCellCount: 0,
        fallbackCellCount: 0,
        staleInputCellCount: 0,
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
      personalizationEnabled: propagationStationCastRequested,
      deriveEnvelope: (band, targetBearingDeg) =>
        deriveEnvelope(band, { mode: "WSPR", targetBearingDeg }),
    });
    const chunks = chunkReachMapSurfaceRequest(request);
    setState((current) => ({
      ...current,
      status: "loading",
      loading: true,
      error: null,
      expectedCellCount: grid.length,
      failedCellCount: 0,
    }));
    Promise.allSettled(
      chunks.map((chunk) => client.surface(chunk, controller.signal)),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        const predictions = results.flatMap((result) =>
          result.status === "fulfilled" ? result.value.cells : [],
        );
        const failedCellCount = results.reduce(
          (total, result, index) =>
            total + (result.status === "rejected" ? chunks[index].cells.length : 0),
          0,
        );
        if (predictions.length === 0) {
          remove();
          setState({
            status: "unavailable",
            loading: false,
            error: "Prediction service is unavailable",
            modelVersion: null,
            profile: null,
            cellCount: 0,
            expectedCellCount: grid.length,
            failedCellCount: grid.length,
            fallbackCellCount: 0,
            staleInputCellCount: 0,
          });
          return;
        }
        const cells = predictionsToReachMapCells(
          predictions,
          grid,
          propagationStationCastVisible,
        );
        if (options.renderOverlay !== false) {
          useMapStore.getState().updateOverlayLayer(REACH_MAP_LAYER_ID, {
            type: "cells",
            cells,
          });
        } else {
          remove();
        }
        const summary = summarizeReachMapPredictions(predictions);
        setState({
          status: failedCellCount > 0 ? "partial" : "ready",
          loading: false,
          error: null,
          modelVersion: summary.modelVersion,
          profile: summary.profile,
          cellCount: cells.length,
          expectedCellCount: grid.length,
          failedCellCount,
          fallbackCellCount: summary.fallbackCellCount,
          staleInputCellCount: summary.staleInputCellCount,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        remove();
        setState((current) => ({
          ...current,
          status: "unavailable",
          loading: false,
          error: error instanceof Error ? error.message : "ReachMap request failed",
          cellCount: 0,
          failedCellCount: current.expectedCellCount,
          fallbackCellCount: 0,
          staleInputCellCount: 0,
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
    personalized: hasConfiguredChain && propagationStationCastVisible,
    available: propagationModelEnabled && location !== null,
  };
}
