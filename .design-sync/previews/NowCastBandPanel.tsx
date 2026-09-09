import { NowCastBandPanel } from "propulse";

const BANDS = ["20m", "40m", "15m"];

function prediction(overrides: Record<string, unknown> = {}) {
  return {
    model_version: "nowcast-hf-v4.2",
    feature_contract: "station-chain-v1",
    issue_time: "2026-09-08T18:40:00Z",
    valid_time: "2026-09-08T18:40:00Z",
    band: "20m",
    mode: "WSPR",
    target_grid4: "JO31",
    core_probability: 0.82,
    personalized_probability: 0.74,
    confidence: 0.88,
    ood_flags: [] as string[],
    data_freshness: { path_history: 240, space_weather: 900 },
    top_factors: ["solar_zenith_angle", "kp_index", "path_history_snr"],
    assumptions: ["mid-latitude path", "no auroral absorption"],
    profile: "nowcast",
    ...overrides,
  };
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    featureContract: "station-chain-v1",
    chainFingerprint: "ic7300-g5rv",
    band: "20m",
    frequencyMHz: 14.074,
    mode: "FT8",
    requestedPowerWatts: 100,
    conductedPowerWatts: 95,
    powerAtAntennaWatts: 82,
    eirpWatts: 210,
    erpWatts: 128,
    totalPassiveLossDb: 1.2,
    feedlineLossDb: 0.8,
    inlineLossDb: 0.4,
    amplifierGainDb: 0,
    antennaGainTowardPathDbi: 6.5,
    targetBearingDeg: 312,
    takeoffAngleDeg: 14,
    receiverNoiseFloorDbm: -128,
    receiverEvidence: "manufacturer_claim",
    receiverEvidenceIsRelative: true,
    localSystemNoiseFloorDbm: -122,
    modeBandwidthHz: 50,
    modeSnrThresholdDb: -21,
    supported: true,
    warningCodes: [] as string[],
    assumptions: [],
    ...overrides,
  };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    visible: true,
    available: true,
    personalized: false,
    pending: false,
    capabilityError: null,
    predictions: new Map(),
    stationEnvelopes: new Map(),
    errors: new Map(),
    requestedCount: 3,
    failedCount: 0,
    partial: false,
    fallbackBands: [] as string[],
    staleInputBands: [] as string[],
    nowcastBands: BANDS,
    ...overrides,
  };
}

export function PersonalizedPath() {
  const predictions = new Map([
    ["20m", prediction({ band: "20m", core_probability: 0.82, personalized_probability: 0.76, confidence: 0.91 })],
    ["40m", prediction({ band: "40m", core_probability: 0.64, personalized_probability: 0.58, confidence: 0.83, top_factors: ["path_history_snr", "grayline_offset"] })],
    ["15m", prediction({ band: "15m", core_probability: 0.31, personalized_probability: 0.19, confidence: 0.62, profile: "physics", ood_flags: ["sparse_path_history"] })],
  ]);
  const stationEnvelopes = new Map([
    ["20m", envelope({ band: "20m" })],
    ["40m", envelope({ band: "40m", frequencyMHz: 7.074, eirpWatts: 140, antennaGainTowardPathDbi: 3.2, totalPassiveLossDb: 1.8 })],
    ["15m", envelope({ band: "15m", frequencyMHz: 21.074, supported: false, warningCodes: ["antenna_not_resonant"] })],
  ]);
  return (
    <NowCastBandPanel
      state={baseState({ personalized: true, predictions, stationEnvelopes })}
      bands={BANDS}
      stationLabel="IC-7300 · G5RV"
      locationLabel="EM12 -> JO31"
      mode="FT8"
    />
  );
}

export function CoreOnly() {
  const predictions = new Map([
    ["20m", prediction({ band: "20m", core_probability: 0.82 })],
    ["40m", prediction({ band: "40m", core_probability: 0.64, confidence: 0.7 })],
    ["15m", prediction({ band: "15m", core_probability: 0.31, confidence: 0.5, profile: "physics" })],
  ]);
  return (
    <NowCastBandPanel
      state={baseState({ personalized: false, predictions })}
      bands={BANDS}
      locationLabel="EM12 -> JO31"
    />
  );
}

export function Loading() {
  return (
    <NowCastBandPanel
      state={baseState({ pending: true, predictions: new Map() })}
      bands={BANDS}
      locationLabel="EM12 -> JO31"
    />
  );
}

export function Unavailable() {
  return (
    <NowCastBandPanel
      state={baseState({
        available: false,
        capabilityError: null,
        predictions: new Map(),
        errors: new Map([["20m", new Error("model unavailable")]]),
      })}
      bands={BANDS}
      locationLabel="EM12 -> JO31"
    />
  );
}
