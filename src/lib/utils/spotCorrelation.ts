/**
 * Spot-Model Correlation Engine
 *
 * Compares live DX spot data with propagation model predictions to produce
 * confidence-adjusted correlation results. Detects anomalies such as
 * surprise band openings, model overestimates, and sudden activity changes.
 */

import type { LiveSpot } from "@/types/livespot";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How well observed spots agree with the propagation model */
export type CorrelationAgreement =
  | "confirmed"
  | "discrepancy"
  | "surprise"
  | "unverified";

/** Single band/spot correlation result */
export interface CorrelationResult {
  agreement: CorrelationAgreement;
  /** Model prediction label (e.g. "Good", "Fair", "Closed") */
  modelStatus: string;
  spotCount: number;
  averageSNR: number | null;
  /** Adjustment factor applied to model confidence (-1.0 to +1.0) */
  confidenceAdjustment: number;
  /** Human-readable explanation */
  details: string;
}

/** Aggregated correlation summary for one band */
export interface BandCorrelationSummary {
  band: string;
  modelStatus: string;
  spotCount: number;
  averageSNR: number | null;
  agreement: CorrelationAgreement;
  /** Overall confidence 0-100% */
  confidence: number;
  details: string;
}

/** A detected propagation anomaly */
export interface PropagationAnomaly {
  type: "surprise_opening" | "overestimate" | "sudden_burst" | "sudden_drop";
  band: string;
  description: string;
  severity: "low" | "medium" | "high";
  /** Timestamp (ms) when anomaly was detected */
  detectedAt: number;
  spotCount: number;
  modelStatus: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalise various model status strings to a canonical form */
function normalizeStatus(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "excellent") return "Excellent";
  if (s === "good") return "Good";
  if (s === "fair") return "Fair";
  if (s === "poor") return "Poor";
  if (s === "closed") return "Closed";
  // Return title-cased original as fallback
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/** True if the model status is considered "open" (propagation expected) */
function isOpenStatus(status: string): boolean {
  const n = normalizeStatus(status);
  return n === "Excellent" || n === "Good" || n === "Fair";
}

/** True if the model status is considered "closed" or poor */
function isClosedStatus(status: string): boolean {
  const n = normalizeStatus(status);
  return n === "Closed" || n === "Poor";
}

/** Compute the arithmetic mean of numbers, or null for empty arrays */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Derive a band label from a LiveSpot.
 * Prefers the explicit `.band` field; falls back to frequency-based lookup.
 */
function spotBand(spot: LiveSpot): string | undefined {
  if (spot.band) return spot.band;
  // Frequency is in kHz
  const f = spot.frequency;
  if (f >= 1800 && f <= 2000) return "160m";
  if (f >= 3500 && f <= 4000) return "80m";
  if (f >= 5300 && f <= 5410) return "60m";
  if (f >= 7000 && f <= 7300) return "40m";
  if (f >= 10100 && f <= 10150) return "30m";
  if (f >= 14000 && f <= 14350) return "20m";
  if (f >= 18068 && f <= 18168) return "17m";
  if (f >= 21000 && f <= 21450) return "15m";
  if (f >= 24890 && f <= 24990) return "12m";
  if (f >= 28000 && f <= 29700) return "10m";
  if (f >= 50000 && f <= 54000) return "6m";
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Correlate a single band observation with its model prediction.
 *
 * Decision matrix:
 *  - "Excellent"/"Good" model + spots present  -> "confirmed"
 *  - "Closed"/"Poor" model + spots present     -> "surprise"
 *  - "Good"/"Fair" model + zero spots           -> "unverified"
 *  - "Excellent" model + zero spots             -> "discrepancy"
 */
export function correlateSpotWithModel(
  spotBandName: string,
  spotSNR: number | null,
  modelStatus: string,
  spotCount: number = spotSNR !== null ? 1 : 0,
): CorrelationResult {
  const status = normalizeStatus(modelStatus);

  // ----- Spots are present -----
  if (spotCount > 0) {
    if (isClosedStatus(status)) {
      // Model said closed, but spots exist -> surprise opening
      const adjustment = Math.min(1.0, 0.3 + spotCount * 0.02);
      return {
        agreement: "surprise",
        modelStatus: status,
        spotCount,
        averageSNR: spotSNR,
        confidenceAdjustment: -adjustment,
        details:
          `Surprise: ${spotCount} spot(s) on ${spotBandName} despite "${status}" prediction` +
          (spotSNR !== null ? ` (avg SNR ${spotSNR.toFixed(1)} dB)` : ""),
      };
    }

    // Model said open and spots confirm
    const snrBonus =
      spotSNR !== null ? Math.min(0.3, Math.max(0, (spotSNR + 20) * 0.015)) : 0;
    const densityBonus = Math.min(0.4, spotCount * 0.01);
    const adjustment = Math.min(1.0, snrBonus + densityBonus);

    return {
      agreement: "confirmed",
      modelStatus: status,
      spotCount,
      averageSNR: spotSNR,
      confidenceAdjustment: adjustment,
      details:
        `Confirmed: ${spotCount} spot(s) match "${status}" prediction on ${spotBandName}` +
        (spotSNR !== null ? ` (avg SNR ${spotSNR.toFixed(1)} dB)` : ""),
    };
  }

  // ----- No spots -----
  if (status === "Excellent") {
    return {
      agreement: "discrepancy",
      modelStatus: status,
      spotCount: 0,
      averageSNR: null,
      confidenceAdjustment: -0.4,
      details: `Discrepancy: model predicts "${status}" on ${spotBandName} but no spots observed`,
    };
  }

  if (isOpenStatus(status)) {
    return {
      agreement: "unverified",
      modelStatus: status,
      spotCount: 0,
      averageSNR: null,
      confidenceAdjustment: 0,
      details: `Unverified: model predicts "${status}" on ${spotBandName}, no spots yet to confirm`,
    };
  }

  // Model says closed, no spots -> agrees but nothing to prove
  return {
    agreement: "unverified",
    modelStatus: status,
    spotCount: 0,
    averageSNR: null,
    confidenceAdjustment: 0,
    details: `Unverified: "${status}" on ${spotBandName}, no spot activity`,
  };
}

/**
 * Calculate model confidence (0-100) given the model status and spot evidence.
 */
export function getModelConfidence(
  modelStatus: string,
  spotCount: number,
  hasRecentSpots: boolean,
): number {
  const status = normalizeStatus(modelStatus);

  // No spot evidence caps confidence at 50
  if (spotCount === 0 && !hasRecentSpots) {
    switch (status) {
      case "Excellent":
        return 50;
      case "Good":
        return 45;
      case "Fair":
        return 40;
      case "Poor":
        return 35;
      case "Closed":
        return 30;
      default:
        return 30;
    }
  }

  // Model said closed but spots exist -> low trust in model
  if (isClosedStatus(status) && spotCount > 0) {
    return Math.min(40, 20 + spotCount);
  }

  // Confirmed / supported scenarios
  switch (status) {
    case "Excellent":
      if (spotCount >= 30) return 95;
      if (spotCount >= 15) return 90;
      if (spotCount >= 5) return 80;
      return 65;
    case "Good":
      if (spotCount >= 30) return 90;
      if (spotCount >= 10) return 85;
      if (spotCount >= 3) return 75;
      return 60;
    case "Fair":
      if (spotCount >= 10) return 75;
      if (spotCount >= 3) return 70;
      return 55;
    case "Poor":
      if (spotCount >= 5) return 50;
      return 40;
    default:
      return 50;
  }
}

/**
 * Aggregate spot evidence across all bands and compare with model predictions.
 *
 * @param spots        - Current live spots
 * @param predictions  - Map of band name -> model status string (e.g. "Good")
 * @returns            - Per-band correlation summaries
 */
export function aggregateCorrelation(
  spots: LiveSpot[],
  predictions: Record<string, string>,
): BandCorrelationSummary[] {
  // Group spots by band
  const spotsByBand = new Map<string, LiveSpot[]>();
  for (const spot of spots) {
    const band = spotBand(spot);
    if (!band) continue;
    const list = spotsByBand.get(band) ?? [];
    list.push(spot);
    spotsByBand.set(band, list);
  }

  // Build summaries for every predicted band
  const summaries: BandCorrelationSummary[] = [];

  const allBands = new Set([
    ...Object.keys(predictions),
    ...spotsByBand.keys(),
  ]);

  for (const band of allBands) {
    const modelStatus = predictions[band] ?? "Unknown";
    const bandSpots = spotsByBand.get(band) ?? [];
    const spotCount = bandSpots.length;

    const snrValues = bandSpots
      .map((s) => s.snr)
      .filter((v): v is number => v !== undefined && v !== null);
    const averageSNR = mean(snrValues);

    const hasRecentSpots = spotCount > 0;
    const correlation = correlateSpotWithModel(
      band,
      averageSNR,
      modelStatus,
      spotCount,
    );

    // Confidence formula: base * (1 + agreementFactor * spotDensityFactor)
    const baseConfidence = getModelConfidence(
      modelStatus,
      spotCount,
      hasRecentSpots,
    );

    const agreementFactor =
      correlation.agreement === "confirmed"
        ? 0.15
        : correlation.agreement === "surprise"
          ? -0.2
          : correlation.agreement === "discrepancy"
            ? -0.15
            : 0;

    const spotDensityFactor = Math.min(1.0, spotCount / 30);

    const adjustedConfidence = Math.round(
      Math.min(
        100,
        Math.max(0, baseConfidence * (1 + agreementFactor * spotDensityFactor)),
      ),
    );

    summaries.push({
      band,
      modelStatus: normalizeStatus(modelStatus),
      spotCount,
      averageSNR: averageSNR !== null ? Math.round(averageSNR * 10) / 10 : null,
      agreement: correlation.agreement,
      confidence: adjustedConfidence,
      details: correlation.details,
    });
  }

  // Sort by common band order
  const bandOrder = [
    "160m",
    "80m",
    "60m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
    "6m",
  ];
  summaries.sort((a, b) => {
    const ai = bandOrder.indexOf(a.band);
    const bi = bandOrder.indexOf(b.band);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return summaries;
}

/**
 * Detect propagation anomalies by comparing spot activity with predictions.
 *
 * @param spots          - Live spots (should include timestamp via `.time`)
 * @param predictions    - Map of band name -> model status string
 * @param timeWindowMs   - Analysis window in milliseconds (default 10 min)
 */
export function detectAnomalies(
  spots: LiveSpot[],
  predictions: Record<string, string>,
  timeWindowMs: number = 10 * 60 * 1000,
): PropagationAnomaly[] {
  const now = Date.now();
  const windowStart = now - timeWindowMs;
  const halfWindow = now - timeWindowMs / 2;

  // Filter spots to the analysis window
  const recentSpots = spots.filter((s) => {
    const t = s.time instanceof Date ? s.time.getTime() : Number(s.time);
    return t >= windowStart;
  });

  // Group recent spots by band
  const spotsByBand = new Map<string, LiveSpot[]>();
  for (const spot of recentSpots) {
    const band = spotBand(spot);
    if (!band) continue;
    const list = spotsByBand.get(band) ?? [];
    list.push(spot);
    spotsByBand.set(band, list);
  }

  const anomalies: PropagationAnomaly[] = [];

  const allBands = new Set([
    ...Object.keys(predictions),
    ...spotsByBand.keys(),
  ]);

  for (const band of allBands) {
    const modelStatus = normalizeStatus(predictions[band] ?? "Unknown");
    const bandSpots = spotsByBand.get(band) ?? [];
    const count = bandSpots.length;

    // --- Surprise opening: "Closed"/"Poor" with 5+ spots ---
    if (isClosedStatus(modelStatus) && count >= 5) {
      const severity = count >= 20 ? "high" : count >= 10 ? "medium" : "low";
      anomalies.push({
        type: "surprise_opening",
        band,
        description: `${band}: ${count} spots detected despite "${modelStatus}" prediction`,
        severity,
        detectedAt: now,
        spotCount: count,
        modelStatus,
      });
    }

    // --- Overestimate: "Excellent"/"Good" with 0 spots in window ---
    if (
      (modelStatus === "Excellent" || modelStatus === "Good") &&
      count === 0
    ) {
      anomalies.push({
        type: "overestimate",
        band,
        description: `${band}: model predicts "${modelStatus}" but no spots observed in the last ${Math.round(timeWindowMs / 60000)} min`,
        severity: modelStatus === "Excellent" ? "medium" : "low",
        detectedAt: now,
        spotCount: 0,
        modelStatus,
      });
    }

    // --- Sudden burst: spot count doubled in the more recent half of the window ---
    if (count >= 6) {
      const olderHalf = bandSpots.filter((s) => {
        const t = s.time instanceof Date ? s.time.getTime() : Number(s.time);
        return t < halfWindow;
      }).length;
      const newerHalf = count - olderHalf;

      // Newer half has at least double the older half (and older half > 0 to avoid div/0)
      if (olderHalf > 0 && newerHalf >= olderHalf * 2) {
        const severity =
          newerHalf >= 30 ? "high" : newerHalf >= 15 ? "medium" : "low";
        anomalies.push({
          type: "sudden_burst",
          band,
          description: `${band}: spot activity surged from ${olderHalf} to ${newerHalf} in the recent window`,
          severity,
          detectedAt: now,
          spotCount: count,
          modelStatus,
        });
      }

      // --- Sudden drop: older half had many spots, newer half collapsed ---
      if (olderHalf >= 5 && newerHalf <= Math.ceil(olderHalf * 0.3)) {
        anomalies.push({
          type: "sudden_drop",
          band,
          description: `${band}: spot activity dropped from ${olderHalf} to ${newerHalf} in the recent window`,
          severity: olderHalf >= 15 ? "high" : "medium",
          detectedAt: now,
          spotCount: count,
          modelStatus,
        });
      }
    }
  }

  return anomalies;
}
