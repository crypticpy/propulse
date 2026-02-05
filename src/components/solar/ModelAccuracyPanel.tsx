/**
 * ModelAccuracyPanel Component (C2 continued)
 *
 * Dedicated model accuracy dashboard showing per-band prediction confidence,
 * overall model score, and detected propagation anomalies.
 */

import { useMemo } from "react";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import type { LiveSpot } from "@/types/livespot";
import { getBandConditionsForPath } from "@/lib/utils/bands";
import {
  aggregateCorrelation,
  detectAnomalies,
  type BandCorrelationSummary,
  type PropagationAnomaly,
  type CorrelationAgreement,
} from "@/lib/utils/spotCorrelation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AGREEMENT_COLORS: Record<CorrelationAgreement, string> = {
  confirmed: "text-signal-green",
  unverified: "text-gray-400",
  discrepancy: "text-alert-red",
  surprise: "text-cosmic-cyan",
};

const AGREEMENT_ICONS: Record<CorrelationAgreement, string> = {
  confirmed: "M5 13l4 4L19 7",
  unverified:
    "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01",
  discrepancy: "M6 18L18 6M6 6l12 12",
  surprise: "M13 10V3L4 14h7v7l9-11h-7z",
};

const ANOMALY_STYLES: Record<
  PropagationAnomaly["type"],
  { color: string; label: string }
> = {
  surprise_opening: { color: "text-cosmic-cyan", label: "Surprise Opening" },
  overestimate: { color: "text-alert-red", label: "Overestimate" },
  sudden_burst: { color: "text-signal-green", label: "Sudden Burst" },
  sudden_drop: { color: "text-caution-amber", label: "Sudden Drop" },
};

function confidenceColor(confidence: number): string {
  if (confidence >= 70) return "text-signal-green";
  if (confidence >= 50) return "text-caution-amber";
  return "text-plasma-orange";
}

function overallScoreLabel(score: number): string {
  if (score >= 80) return "Model is performing well today";
  if (score >= 60) return "Model is mostly accurate";
  if (score >= 40) return "Model accuracy is moderate";
  return "Model predictions need caution";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BandRow({ summary }: { summary: BandCorrelationSummary }) {
  const agreementColor = AGREEMENT_COLORS[summary.agreement];
  const iconPath = AGREEMENT_ICONS[summary.agreement];

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
      <span className="w-10 text-xs font-mono font-bold text-white">
        {summary.band}
      </span>
      <span className="w-14 text-[10px] text-gray-400 truncate">
        {summary.modelStatus}
      </span>
      <div className="flex-1 flex items-center gap-1">
        <svg
          className={`w-3.5 h-3.5 ${agreementColor}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={iconPath}
          />
        </svg>
        <span className={`text-[10px] font-medium ${agreementColor}`}>
          {summary.spotCount > 0 ? `${summary.spotCount} spots` : "No spots"}
        </span>
      </div>
      <span
        className={`text-xs font-mono font-bold ${confidenceColor(summary.confidence)}`}
      >
        {Math.round(summary.confidence)}%
      </span>
    </div>
  );
}

function AnomalyItem({ anomaly }: { anomaly: PropagationAnomaly }) {
  const style = ANOMALY_STYLES[anomaly.type];
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span
        className={`text-[10px] font-bold ${style.color} whitespace-nowrap`}
      >
        {style.label}
      </span>
      <span className="text-[10px] text-gray-400 leading-snug">
        {anomaly.band}: {anomaly.description}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ModelAccuracyPanel() {
  const location = useActiveLocation();
  const target = useMapStore((s) => s.target);
  const spots = useDXStore((s) => s.spots);
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  const kp = kIndexData?.[kIndexData.length - 1]?.kp_index ?? 3;
  const sfi = solarFluxData?.[solarFluxData.length - 1]?.flux ?? 100;

  // Build model predictions for current conditions
  const predictions = useMemo((): Record<string, string> => {
    if (!location) return {};

    const targetLat = target?.lat ?? 0;
    const targetLon = target?.lon ?? 180;

    const conditions = getBandConditionsForPath(
      location.lat,
      location.lon,
      targetLat,
      targetLon,
      kp,
      sfi,
      0.5, // mid-illumination default
    );

    const pred: Record<string, string> = {};
    for (const c of conditions) {
      pred[c.band] = c.status;
    }
    return pred;
  }, [location, target, kp, sfi]);

  // Aggregate correlation (cast DXSpot[] to LiveSpot[] - only band/frequency/snr used)
  const bandSummaries = useMemo(
    () => aggregateCorrelation(spots as unknown as LiveSpot[], predictions),
    [spots, predictions],
  );

  // Detect anomalies
  const anomalies = useMemo(
    () => detectAnomalies(spots as unknown as LiveSpot[], predictions),
    [spots, predictions],
  );

  // Overall model score
  const overallScore = useMemo(() => {
    if (bandSummaries.length === 0) return 0;
    const sum = bandSummaries.reduce((acc, s) => acc + s.confidence, 0);
    return Math.round(sum / bandSummaries.length);
  }, [bandSummaries]);

  if (!location) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-4">
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide mb-2">
          Model Accuracy
        </h2>
        <p className="text-sm text-gray-500 text-center py-4">
          Configure your location to see model accuracy.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
          Model Accuracy
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={`text-xl font-bold font-mono ${confidenceColor(overallScore)}`}
          >
            {overallScore}%
          </span>
        </div>
      </div>

      {/* Overall status */}
      <div className="text-xs text-gray-400 mb-3 italic">
        {overallScoreLabel(overallScore)}
      </div>

      {/* Per-band breakdown */}
      {bandSummaries.length > 0 ? (
        <div className="mb-3">
          <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1 px-0.5">
            <span className="w-10">Band</span>
            <span className="w-14">Model</span>
            <span className="flex-1">Status</span>
            <span>Conf</span>
          </div>
          {bandSummaries.map((summary) => (
            <BandRow key={summary.band} summary={summary} />
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500 text-sm mb-3">
          No spot data available for correlation.
        </div>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">
            Anomalies ({anomalies.length})
          </div>
          <div className="divide-y divide-white/5">
            {anomalies.slice(0, 5).map((a, i) => (
              <AnomalyItem key={`${a.type}-${a.band}-${i}`} anomaly={a} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
