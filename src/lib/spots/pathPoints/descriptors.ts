/** Build PathPointDescriptors from an explicit model result. No decoration inference. */
import { z } from "zod";
import {
  modelProvenanceSchema,
  pathPointDescriptorSchema,
  type PathDescriptor,
  type PathPointDescriptor,
} from "@/lib/views/spotContracts";

type ModelProvenance = z.infer<typeof modelProvenanceSchema>;
import type { LayerHeights } from "@/lib/utils/ionosphere";
import type { HopQuality, RayTraceResult } from "@/lib/utils/rayTrace";
import { isApproximateLocation } from "@/lib/spots/presentation";
import {
  apexDisplayHeightKm,
  computeGroundPoints,
  decorativeShellPlacement,
} from "./geometry";
import { pathPointId } from "./identity";

export const DEFAULT_PATH_POINT_STALE_AFTER_MS = 30 * 60 * 1000;

/** Fallback when the producer does not pass `path.model` / `model`. */
export const BUILTIN_RAY_TRACE_MODEL_NAME = "Propulse physics ray trace";
export const BUILTIN_RAY_TRACE_MODEL_VERSION = "propulse-physics";

export function builtinRayTraceProvenance(
  modeledAtMs: number,
  summary: string,
): ModelProvenance {
  return {
    name: BUILTIN_RAY_TRACE_MODEL_NAME,
    version: BUILTIN_RAY_TRACE_MODEL_VERSION,
    modeledAtMs,
    inputsAsOfMs: modeledAtMs,
    explanation:
      `Built-in tracer: simplified Chapman f0F2, Martyn's secant MUF, and ITU-R P.533 D-layer absorption. Not a full ITU-R P.533 circuit prediction. ${summary}`.trim(),
  };
}

export type PathPointBuildStatus =
  | "ready"
  | "model-unavailable"
  | "model-stale"
  | "no-hops";

export interface PathPointSet {
  pathId: string;
  status: PathPointBuildStatus;
  unavailableReason: string | null;
  points: PathPointDescriptor[];
}

export interface BuildPathPointInput {
  pathId: string;
  path?: PathDescriptor | null;
  result: RayTraceResult | null;
  /** Used when path.model is absent. Required for any inspectable points. */
  model?: ModelProvenance | null;
  nowMs: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  pathMode?: "short" | "long";
  includeShellHighlights?: boolean;
  layerHeights?: LayerHeights | null;
  staleAfterMs?: number;
}

function emptySet(
  pathId: string,
  status: PathPointBuildStatus,
  unavailableReason: string,
): PathPointSet {
  return { pathId, status, unavailableReason, points: [] };
}

function resolveModel(
  path: PathDescriptor | null | undefined,
  model: ModelProvenance | null | undefined,
): ModelProvenance | null {
  return path?.model ?? model ?? null;
}

function locationPrecision(
  path: PathDescriptor | null | undefined,
): PathPointDescriptor["locationPrecision"] {
  if (!path) return "modeled";
  if (path.kind === "approximate") return "approximate";
  if (isApproximateLocation(path.from.location) || isApproximateLocation(path.to.location)) {
    return "approximate";
  }
  return "modeled";
}

function formatKm(km: number): string {
  return Number.isInteger(km) ? `${km} km` : `${km.toFixed(0)} km`;
}

function hopLabel(hopIndex: number): string {
  return `Hop ${hopIndex + 1}`;
}

function modeledConditions(hop: HopQuality): string | null {
  const parts: string[] = [];
  if (Number.isFinite(hop.muf)) parts.push(`modeled MUF ${hop.muf.toFixed(1)} MHz`);
  if (Number.isFinite(hop.f0F2)) parts.push(`modeled f0F2 ${hop.f0F2.toFixed(1)} MHz`);
  if (Number.isFinite(hop.absorptionDb)) {
    parts.push(`modeled absorption ${hop.absorptionDb.toFixed(1)} dB`);
  }
  if (parts.length === 0) return null;
  return parts.join("; ");
}

function apexExplanation(
  hopIndex: number,
  modeledHeightKm: number | null,
  displayHeightKm: number,
  hop: HopQuality | null,
  precision: PathPointDescriptor["locationPrecision"],
): string {
  const hopName = hopLabel(hopIndex);
  if (modeledHeightKm === null) {
    return `${hopName} modeled ray apex. Reflection height is unavailable from the model. Drawn marker height is decorative. This is a model prediction, not a measured bounce.`;
  }
  const heightClause =
    Math.abs(displayHeightKm - modeledHeightKm) > 0.5
      ? ` Modeled reflection height is ${formatKm(modeledHeightKm)}; the globe draws this apex at ${formatKm(displayHeightKm)} so the arc meets the ionosphere shells.`
      : ` Modeled reflection height is ${formatKm(modeledHeightKm)}.`;
  const conditions = hop ? modeledConditions(hop) : null;
  const precisionClause =
    precision === "approximate"
      ? " Endpoint locations are approximate, so this position is approximate."
      : "";
  const extra = conditions ? ` ${conditions}.` : "";
  return `${hopName} modeled ray apex.${heightClause}${precisionClause}${extra} Layer is not supplied by the model. This is a model prediction, not confirmed reception.`;
}

function shellExplanation(
  hopIndex: number,
  displayHeightKm: number,
  modeledHeightKm: number | null,
): string {
  const hopName = hopLabel(hopIndex);
  const modeled =
    modeledHeightKm === null
      ? " Modeled reflection height is unavailable."
      : ` Modeled ray-apex height is ${formatKm(modeledHeightKm)}.`;
  return `${hopName} decorative shell-intersection highlight drawn at ${formatKm(displayHeightKm)}.${modeled} This marker sits on the displayed ionosphere shell for clarity. It is not an actual reflection height, and shell color is not evidence of a modeled layer.`;
}

function groundExplanation(
  hopIndex: number,
  precision: PathPointDescriptor["locationPrecision"],
): string {
  const hopName = hopLabel(hopIndex);
  const precisionClause =
    precision === "approximate"
      ? " Endpoint locations are approximate, so this ground point is approximate."
      : " Position is interpolated along the modeled great-circle path.";
  return `${hopName} modeled ground-hop point between ionospheric hops.${precisionClause} This is not a measured bounce location.`;
}

export function pathPointHoverText(point: PathPointDescriptor): string {
  const hopName = hopLabel(point.hopIndex);
  if (point.role === "ray-apex") {
    return point.modeledHeightKm === null
      ? `${hopName} modeled apex; height unavailable`
      : `${hopName} modeled apex at ${formatKm(point.modeledHeightKm)}`;
  }
  if (point.role === "shell-highlight") {
    return `${hopName} decorative shell marker at ${formatKm(point.displayHeightKm)}`;
  }
  return `${hopName} ground hop`;
}

export function pathPointListLabel(point: PathPointDescriptor): string {
  const hopName = hopLabel(point.hopIndex);
  if (point.role === "ray-apex") return `${hopName} · modeled ray apex`;
  if (point.role === "shell-highlight") return `${hopName} · decorative shell intersection`;
  return `${hopName} · ground hop`;
}

export function buildPathPointSet(input: BuildPathPointInput): PathPointSet {
  const pathId = input.path?.id ?? input.pathId;
  const model = resolveModel(input.path, input.model);
  if (!model) {
    return emptySet(
      pathId,
      "model-unavailable",
      "Path point details are unavailable because the model provenance is missing.",
    );
  }
  if (!input.result) {
    return emptySet(
      pathId,
      "model-unavailable",
      "Path point details are unavailable because the model result is missing.",
    );
  }

  const hops = input.result.hops;
  if (hops.length === 0) {
    return emptySet(
      pathId,
      "no-hops",
      "This model result has no hop points to inspect.",
    );
  }

  const staleAfter = input.staleAfterMs ?? DEFAULT_PATH_POINT_STALE_AFTER_MS;
  const ageMs = input.nowMs - model.modeledAtMs;
  const stale = Number.isFinite(ageMs) && ageMs > staleAfter;
  const precision = locationPrecision(input.path);
  const pathMode = input.pathMode ?? input.result.pathMode;
  const groundPts = computeGroundPoints(
    input.startLat,
    input.startLon,
    input.endLat,
    input.endLon,
    hops.length,
    pathMode,
  );

  const points: PathPointDescriptor[] = [];

  for (let hopIndex = 0; hopIndex < hops.length; hopIndex++) {
    const hop = hops[hopIndex];
    const rp = hop.reflectionPoint;
    const modeledHeightKm = Number.isFinite(hop.hmF2) ? hop.hmF2 : null;
    const displayHeightKm =
      modeledHeightKm === null ? 0 : apexDisplayHeightKm(modeledHeightKm);

    points.push(
      pathPointDescriptorSchema.parse({
        id: pathPointId(pathId, hopIndex, "ray-apex"),
        pathId,
        hopIndex,
        role: "ray-apex",
        coordinates: { lat: rp.lat, lon: rp.lon },
        displayHeightKm,
        modeledHeightKm,
        layer: null,
        locationPrecision: precision,
        explanation: apexExplanation(
          hopIndex,
          modeledHeightKm,
          displayHeightKm,
          hop,
          precision,
        ),
        model,
      }),
    );

    if (input.includeShellHighlights && input.layerHeights && modeledHeightKm !== null) {
      const shell = decorativeShellPlacement(modeledHeightKm, input.layerHeights);
      points.push(
        pathPointDescriptorSchema.parse({
          id: pathPointId(pathId, hopIndex, "shell-highlight"),
          pathId,
          hopIndex,
          role: "shell-highlight",
          coordinates: { lat: rp.lat, lon: rp.lon },
          displayHeightKm: shell.displayHeightKm,
          modeledHeightKm,
          layer: null,
          locationPrecision: precision,
          explanation: shellExplanation(
            hopIndex,
            shell.displayHeightKm,
            modeledHeightKm,
          ),
          model,
        }),
      );
    }

    if (hopIndex > 0) {
      const ground = groundPts[hopIndex];
      if (ground) {
        points.push(
          pathPointDescriptorSchema.parse({
            id: pathPointId(pathId, hopIndex, "ground-point"),
            pathId,
            hopIndex,
            role: "ground-point",
            coordinates: { lat: ground.lat, lon: ground.lon },
            displayHeightKm: 0,
            modeledHeightKm: null,
            layer: null,
            locationPrecision: precision,
            explanation: groundExplanation(hopIndex, precision),
            model,
          }),
        );
      }
    }
  }

  return {
    pathId,
    status: stale ? "model-stale" : "ready",
    unavailableReason: stale
      ? "This model result is stale. Point positions still reflect the last modeled run."
      : null,
    points,
  };
}
