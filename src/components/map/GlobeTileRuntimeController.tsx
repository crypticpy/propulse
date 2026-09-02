import { useContext, useEffect, useMemo } from "react";
import { TilesRendererContext } from "3d-tiles-renderer/r3f";
import type { DisplayQualitySettings } from "@/lib/map/displayQuality";
import {
  recordGlobeTileInvalidation,
  registerGlobeTileDiagnostics,
} from "@/lib/map/globeDiagnostics";
import {
  applyGlobeTileRuntimeBudget,
  readGlobeTileRuntimeSnapshot,
  resolveGlobeTileRuntimeBudget,
  type GlobeTileLayer,
  type GlobeTileRendererRuntime,
} from "@/lib/map/globeTileRuntime";

interface GlobeTileRuntimeControllerProps {
  layer: GlobeTileLayer;
  settings: DisplayQualitySettings;
}

/**
 * Runs inside TilesRendererContext so quality limits are applied only after
 * the renderer exists. It also keeps diagnostics source-specific: imagery and
 * labels expose separate cache and queue state instead of one misleading sum.
 */
export function GlobeTileRuntimeController({
  layer,
  settings,
}: GlobeTileRuntimeControllerProps) {
  const renderer = useContext(TilesRendererContext);
  const budget = useMemo(
    () => resolveGlobeTileRuntimeBudget(settings, layer),
    [layer, settings],
  );

  useEffect(() => {
    if (!renderer) return;
    const runtime = renderer as unknown as GlobeTileRendererRuntime;
    applyGlobeTileRuntimeBudget(runtime, budget);
    // UpdateOnChangePlugin deliberately idles a stationary renderer. A
    // quality change must wake it so reduced cache/traversal budgets take
    // effect without requiring the operator to bump the camera.
    renderer.dispatchEvent({ type: "needs-update" });

    if (!import.meta.env.DEV) return;
    const readRuntime = () => readGlobeTileRuntimeSnapshot(runtime);
    const unregister = registerGlobeTileDiagnostics(layer, readRuntime);
    const handleInvalidation = () => recordGlobeTileInvalidation(layer);
    renderer.addEventListener("needs-update", handleInvalidation);

    return () => {
      renderer.removeEventListener("needs-update", handleInvalidation);
      unregister();
    };
  }, [budget, layer, renderer]);

  return null;
}
