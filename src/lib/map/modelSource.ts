/**
 * Model provenance descriptors.
 *
 * PropPulse serves band predictions from two independent engines, and until
 * now the UI gave no way to tell them apart:
 *
 *  - the local ITU-R P.533 physics engine (`lib/utils/ionosphere.ts` and
 *    friends), which powers Band Conditions and the 24h forecast heatmap; and
 *  - the NowCast/StationCast ML models served from Railway, which power the
 *    NowCast chips and fall back to physics *per band* when their inputs go
 *    stale.
 *
 * "Physics" here is a statement about provenance, not quality -- the physics
 * engine is the intended path for the panels that use it. These descriptors
 * exist so a silent per-band fallback is never mistaken for a model
 * prediction.
 *
 * Rendered by `components/map/ModelSourceBadge.tsx`.
 */

import type { NowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";

export type ModelSourceTone = "physics" | "ml" | "degraded";

export interface ModelSourceDescriptor {
  /** Short pill text. */
  label: string;
  /** Drives the pill colour. */
  tone: ModelSourceTone;
  /** Hover explanation. */
  detail: string;
}

/** Descriptor for panels served purely by the local physics engine. */
export const PHYSICS_SOURCE: ModelSourceDescriptor = {
  label: "Physics",
  tone: "physics",
  detail:
    "Served by the built-in ITU-R P.533 propagation engine running in your browser.\nNo machine-learning model is involved in these numbers.",
};

/** The subset of NowCast state that provenance depends on. */
export type NowCastProvenance = Pick<
  NowCastBandPredictions,
  | "available"
  | "personalized"
  | "pending"
  | "nowcastBands"
  | "fallbackBands"
  | "staleInputBands"
  | "failedCount"
>;

/**
 * Describe where a NowCast panel's numbers actually came from.
 *
 * The model service answers per band, so one panel can legitimately mix ML and
 * physics-fallback bands. This reports the mix rather than claiming whichever
 * engine happened to answer first.
 */
export function describeNowCastSource(
  nowCast: NowCastProvenance,
): ModelSourceDescriptor {
  if (!nowCast.available) {
    return PHYSICS_SOURCE;
  }

  const mlCount = nowCast.nowcastBands.length;
  const fallbackCount = nowCast.fallbackBands.length;
  const staleCount = nowCast.staleInputBands.length;
  // A band that errored lands in neither nowcastBands nor fallbackBands, so it
  // has to be counted separately or the wording below overclaims.
  const failedCount = nowCast.failedCount;

  // Nothing has come back yet.
  if (mlCount === 0 && fallbackCount === 0) {
    if (nowCast.pending) {
      return {
        label: "NowCast …",
        tone: "ml",
        detail: "Waiting on the NowCast model service.",
      };
    }
    if (failedCount > 0) {
      return {
        label: "NowCast unavailable",
        tone: "degraded",
        detail: `The NowCast model service returned no prediction for any of the ${failedCount} requested band${failedCount === 1 ? "" : "s"}.\nNothing here comes from the model.`,
      };
    }
    return PHYSICS_SOURCE;
  }

  if (mlCount === 0) {
    return {
      label: "Physics fallback",
      tone: "degraded",
      detail:
        failedCount > 0
          ? `Every band the NowCast model service answered fell back to the physics engine, and ${failedCount} band${failedCount === 1 ? "" : "s"} returned no prediction at all -- usually because the live spot history behind the model is stale.\nNothing here is a model prediction.`
          : "The NowCast model service answered, but every band fell back to the physics engine -- usually because the live spot history behind the model is stale.\nThese are physics numbers, not model predictions.",
    };
  }

  const modelName = nowCast.personalized ? "NowCast + StationCast" : "NowCast";

  if (fallbackCount > 0 || staleCount > 0 || failedCount > 0) {
    const parts: string[] = [];
    if (fallbackCount > 0) {
      parts.push(
        `${fallbackCount} band${fallbackCount === 1 ? "" : "s"} fell back to physics`,
      );
    }
    if (staleCount > 0) {
      parts.push(
        `${staleCount} band${staleCount === 1 ? "" : "s"} ran on stale inputs`,
      );
    }
    if (failedCount > 0) {
      parts.push(
        `${failedCount} band${failedCount === 1 ? "" : "s"} returned no prediction`,
      );
    }
    const caveats =
      parts.length > 1
        ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
        : parts[0];
    return {
      label: `${modelName} · partial`,
      tone: "degraded",
      detail: `${mlCount} band${mlCount === 1 ? "" : "s"} came from the ${modelName} ML model; ${caveats}.\nMixed provenance -- the per-band chips show which is which.`,
    };
  }

  return {
    label: `${modelName} ML`,
    tone: "ml",
    detail: nowCast.personalized
      ? "Served by the NowCast ML model, adapted to your station and mode by StationCast.\nTrained offline on archived WSPR data; inputs are live spot history."
      : "Served by the NowCast ML model on the model service.\nTrained offline on archived WSPR data; inputs are live spot history.",
  };
}
