/**
 * Model provenance descriptors.
 *
 * PropPulse serves band predictions from three different engines, and until
 * now the UI gave no way to tell them apart:
 *
 *  - the full ITU-R P.533 path (`getEnhancedBandConditions` ->
 *    `lib/utils/ionosphere.ts`, `rayTrace.ts`, `signal.ts`), which powers the
 *    Band Conditions panel whenever it succeeds;
 *  - the empirical band-score model (`getBandConditionsForPath`), a per-band
 *    base SNR with distance/illumination/Kp adjustments, which powers the 24h
 *    forecast heatmap and stands in for P.533 when it throws; and
 *  - the NowCast/StationCast ML models served from Railway, which power the
 *    NowCast chips and serve their physics-trained profile *per band* when
 *    recent path history is stale or unavailable.
 *
 * The first two share a source tree, which is exactly why they need separate
 * descriptors -- "physics engine" reads as one thing to a user, and only one
 * of the two traces a ray. The NowCast model's physics profile is a third,
 * distinct thing again: a learned model on path geometry, sun and
 * solar-wind features -- not the client-side engine.
 *
 * "Physics" here is a statement about provenance, not quality -- the physics
 * engine is the intended path for the panels that use it, and the model's
 * physics profile is still a model prediction, just at reduced confidence.
 * These descriptors exist so neither is ever mistaken for the other.
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

/**
 * Descriptor for panels served by the full ITU-R P.533 path
 * (`getEnhancedBandConditions`): ionospheric parameters, a traced ray path and
 * an S-unit signal prediction.
 */
export const P533_SOURCE: ModelSourceDescriptor = {
  label: "P.533",
  tone: "physics",
  detail:
    "Served by the built-in ITU-R P.533 propagation engine running in your browser: ionospheric parameters, a traced ray path and an S-unit signal prediction.\nNo machine-learning model is involved in these numbers.",
};

/**
 * Descriptor for panels served by the empirical band-score model
 * (`getBandConditionsForPath`): a per-band base SNR adjusted for distance,
 * illumination and Kp.
 *
 * This is deliberately NOT called P.533. It shares the same source tree but
 * traces no rays and computes no ionospheric profile, so labelling it P.533
 * would be the exact misattribution these descriptors exist to prevent.
 */
export const BAND_SCORE_SOURCE: ModelSourceDescriptor = {
  label: "Estimate",
  tone: "physics",
  detail:
    "Served by the built-in band model: a per-band base SNR adjusted for path distance, illumination and geomagnetic activity.\nA fast estimate -- not the full ITU-R P.533 ray trace, and not a machine-learning model.",
};

/**
 * Descriptor for a NowCast slot the ML model is not serving at all.
 *
 * Deliberately vague about which local engine stepped in: this is returned
 * from NowCast provenance, which cannot see what the surrounding panel called.
 */
export const MODEL_UNUSED_SOURCE: ModelSourceDescriptor = {
  label: "Physics",
  tone: "physics",
  detail:
    "The NowCast ML model is not serving these numbers -- they come from the local propagation engine running in your browser.",
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
  | "errors"
>;

/**
 * Describe where a NowCast panel's numbers actually came from.
 *
 * The model service answers per band, so one panel can legitimately mix
 * NowCast-profile and physics-profile bands. This reports the mix rather
 * than claiming whichever profile happened to answer first.
 *
 * @param displayedBands - Restrict the counts to the bands the caller actually
 *   renders. The hook requests every model band, but a panel may show only a
 *   subset, and a badge that counts a fallback on a band the user cannot see
 *   describes a screen that does not exist. Omit to describe the whole request.
 */
export function describeNowCastSource(
  nowCast: NowCastProvenance,
  displayedBands?: readonly string[],
): ModelSourceDescriptor {
  if (!nowCast.available) {
    return MODEL_UNUSED_SOURCE;
  }

  const shown = displayedBands ? new Set(displayedBands) : null;
  const countShown = (bands: readonly string[]) =>
    shown ? bands.filter((band) => shown.has(band)).length : bands.length;

  const mlCount = countShown(nowCast.nowcastBands);
  const fallbackCount = countShown(nowCast.fallbackBands);
  const staleCount = countShown(nowCast.staleInputBands);
  // A band that errored lands in neither nowcastBands nor fallbackBands, so it
  // has to be counted separately or the wording below overclaims.
  const failedCount = countShown([...nowCast.errors.keys()]);

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
    return MODEL_UNUSED_SOURCE;
  }

  if (mlCount === 0) {
    return {
      label: "Physics profile",
      tone: "degraded",
      detail:
        failedCount > 0
          ? `Every band the NowCast model service answered was served by its physics profile, and ${failedCount} band${failedCount === 1 ? "" : "s"} returned no prediction at all -- recent path history is stale or unavailable.\nThese are still model predictions, at reduced confidence.`
          : "The NowCast model service answered, but every band was served by its physics profile -- recent path history is stale or unavailable.\nThese are model predictions at reduced confidence, not the client physics engine.",
    };
  }

  const modelName = nowCast.personalized ? "NowCast + StationCast" : "NowCast";

  if (fallbackCount > 0 || staleCount > 0 || failedCount > 0) {
    const parts: string[] = [];
    if (fallbackCount > 0) {
      parts.push(
        `${fallbackCount} band${fallbackCount === 1 ? "" : "s"} served by the physics profile`,
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
