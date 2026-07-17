import type { StationFeatureEnvelope } from "./stationChainEngine";

const WSPR_THRESHOLD_DB = -28;
const DB_PER_LOG_ODDS = 6;

export interface StationCastAdjustment {
  featureContract: "station-chain-v1";
  coreProbability: number;
  personalizedProbability: number;
  confidence: number;
  linkAdjustmentDb: number;
  powerAdjustmentDb: number;
  modeAdjustmentDb: number;
  stage: "deterministic_physics_adapter";
  assumptions: string[];
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function logit(probability: number): number {
  const bounded = clamp(probability, 1e-6, 1 - 1e-6);
  return Math.log(bounded / (1 - bounded));
}

function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export function applyStationPhysicsAdapter(
  coreProbability: number,
  coreConfidence: number,
  coreReferencePowerWatts: number,
  envelope: StationFeatureEnvelope,
): StationCastAdjustment {
  const referencePower = Math.max(coreReferencePowerWatts, 1e-9);
  const effectivePower = Math.max(envelope.eirpWatts, 1e-9);
  const powerAdjustmentDb = 10 * Math.log10(effectivePower / referencePower);
  const modeAdjustmentDb = WSPR_THRESHOLD_DB - envelope.modeSnrThresholdDb;
  const linkAdjustmentDb = clamp(
    powerAdjustmentDb + modeAdjustmentDb,
    -30,
    30,
  );
  const personalizedProbability = envelope.supported
    ? logistic(logit(coreProbability) + linkAdjustmentDb / DB_PER_LOG_ODDS)
    : 0;
  let confidencePenalty = 1;
  if (envelope.localSystemNoiseFloorDbm == null) confidencePenalty *= 0.85;
  if (envelope.receiverEvidenceIsRelative) confidencePenalty *= 0.9;
  if (!envelope.supported) confidencePenalty *= 0.5;

  return {
    featureContract: "station-chain-v1",
    coreProbability: clamp(coreProbability, 0, 1),
    personalizedProbability: clamp(personalizedProbability, 0, 1),
    confidence: clamp(coreConfidence * confidencePenalty, 0, 1),
    linkAdjustmentDb,
    powerAdjustmentDb,
    modeAdjustmentDb,
    stage: "deterministic_physics_adapter",
    assumptions: [
      "six_db_per_log_odds_link_response",
      "wspr_threshold_is_minus_28_db",
      ...envelope.assumptions,
    ],
  };
}
