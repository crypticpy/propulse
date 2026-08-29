/**
 * Band Verdict engine v1 (E4) — pure fusion of the physics engine's
 * per-band rating with live spot confirmation.
 *
 * The verdict is the 2x2 of (physics says open) x (spots confirm activity):
 *
 *                    spots confirm     no spot confirmation
 *   physics open     "confirmed"       "likely"
 *   physics closed   "surprise"        "closed"
 *
 * "surprise" is the interesting cell: real activity the model didn't
 * predict (sporadic-E, TEP, gray-line enhancement) — exactly what an
 * operator wants shouted at them.
 *
 * Entirely client-side (Open Core). v2 cloud correction is Phase 3.
 */

export type BandVerdict = "confirmed" | "likely" | "surprise" | "closed";

/** Operational open-ness rank, used by the state machine's asymmetric holds */
export const VERDICT_RANK: Record<BandVerdict, number> = {
  closed: 0,
  likely: 1,
  surprise: 2,
  confirmed: 3,
};

/**
 * Threshold hysteresis on the physics score: a band ENTERS "open" at a
 * higher score than it EXITS, so jitter around one boundary can't flap
 * the verdict. Scores come from the existing kp/sfi band rating mapped
 * to 0..1 (Excellent .9 / Good .7 / Fair .45 / Poor .2).
 */
export const PHYSICS_OPEN_ENTER = 0.4;
export const PHYSICS_OPEN_EXIT = 0.3;

/** Spot confirmation: enter at >=3 recent spots, exit when none remain */
export const SPOTS_CONFIRM_ENTER = 3;
export const SPOTS_CONFIRM_EXIT = 1;

export interface VerdictInputs {
  band: string;
  /** 0..1 physics rating for the band right now (day/night resolved) */
  physicsScore: number;
  /** Spots heard on this band within the window */
  spotCount: number;
  /** Distinct spotters/receivers behind spotCount (dedupe strength) */
  uniqueSpotters: number;
  /** Binning window used for spotCount, minutes */
  windowMinutes: number;
}

/** Previous edge states, for hysteresis. Omit on first evaluation. */
export interface VerdictEdgeState {
  physicsOpen: boolean;
  spotConfirmed: boolean;
}

export interface BandVerdictResult {
  band: string;
  verdict: BandVerdict;
  physicsOpen: boolean;
  spotConfirmed: boolean;
  /** 0..1 rough confidence in the verdict, for the UI's why popover */
  confidence: number;
  /** Human-readable factor lines for the decision log / why popover */
  why: string[];
}

export function computeVerdict(
  inputs: VerdictInputs,
  prev?: VerdictEdgeState,
): BandVerdictResult {
  const { band, physicsScore, spotCount, uniqueSpotters, windowMinutes } =
    inputs;

  const physicsOpen = prev?.physicsOpen
    ? physicsScore >= PHYSICS_OPEN_EXIT
    : physicsScore >= PHYSICS_OPEN_ENTER;

  const spotConfirmed = prev?.spotConfirmed
    ? spotCount >= SPOTS_CONFIRM_EXIT
    : spotCount >= SPOTS_CONFIRM_ENTER;

  let verdict: BandVerdict;
  if (physicsOpen && spotConfirmed) verdict = "confirmed";
  else if (physicsOpen) verdict = "likely";
  else if (spotConfirmed) verdict = "surprise";
  else verdict = "closed";

  // Confidence: agreement between the two arms is high confidence in
  // either direction; disagreement cells are inherently less certain,
  // scaled by how strong the confirming/denying evidence is.
  let confidence: number;
  switch (verdict) {
    case "confirmed":
      confidence = Math.min(1, 0.7 + spotCount / 30 + physicsScore * 0.1);
      break;
    case "closed":
      confidence = Math.min(1, 0.6 + (PHYSICS_OPEN_EXIT - physicsScore));
      break;
    case "surprise":
      // More independent spotters -> more real
      confidence = Math.min(1, 0.35 + uniqueSpotters * 0.08);
      break;
    case "likely":
      confidence = Math.min(1, 0.35 + physicsScore * 0.4);
      break;
  }

  const why: string[] = [
    `Physics score ${physicsScore.toFixed(2)} → ${
      physicsOpen ? "open" : "closed"
    } (enter ≥${PHYSICS_OPEN_ENTER}, exit <${PHYSICS_OPEN_EXIT})`,
    `${spotCount} spot${spotCount === 1 ? "" : "s"} from ${uniqueSpotters} spotter${
      uniqueSpotters === 1 ? "" : "s"
    } in last ${windowMinutes} min → ${
      spotConfirmed ? "confirmed" : "unconfirmed"
    }`,
  ];
  if (verdict === "surprise") {
    why.push("Activity the model did not predict — possible Es/TEP opening");
  }

  return {
    band,
    verdict,
    physicsOpen,
    spotConfirmed,
    confidence: Math.round(confidence * 100) / 100,
    why,
  };
}
