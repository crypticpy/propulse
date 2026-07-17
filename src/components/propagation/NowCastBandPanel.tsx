import {
  BrainCircuit,
  Loader2,
  MapPin,
  RadioTower,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui";
import { ResearchAttemptControl } from "@/components/propagation/ResearchAttemptControl";
import type { NowCastBandPredictions } from "@/hooks/useNowCastBandPredictions";

interface NowCastBandPanelProps {
  state: NowCastBandPredictions;
  bands: readonly string[];
  stationLabel?: string;
  locationLabel?: string;
  compact?: boolean;
}

function probabilityTone(probability: number): string {
  if (probability >= 0.5) return "text-signal-green";
  if (probability >= 0.2) return "text-caution-amber";
  return "text-gray-200";
}

function formatPower(watts: number): string {
  if (watts >= 1_000) return `${(watts / 1_000).toFixed(1)} kW`;
  if (watts >= 10) return `${watts.toFixed(0)} W`;
  return `${watts.toFixed(1)} W`;
}

function formatAge(seconds: number | undefined): string | null {
  if (seconds === undefined) return null;
  if (seconds < 120) return `${seconds}s old`;
  if (seconds < 7_200) return `${Math.round(seconds / 60)}m old`;
  return `${(seconds / 3_600).toFixed(1)}h old`;
}

export function NowCastBandPanel({
  state,
  bands,
  stationLabel,
  locationLabel,
  compact = false,
}: NowCastBandPanelProps) {
  if (!state.visible) return null;
  const firstPrediction = [...state.predictions.values()][0];
  const pathAge = formatAge(firstPrediction?.data_freshness.path_history);
  const weatherAge = formatAge(firstPrediction?.data_freshness.space_weather);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <BrainCircuit
            className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">
              {state.personalized ? "NowCast + StationCast" : "NowCast"}
            </h3>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
              {locationLabel && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {locationLabel}
                </span>
              )}
              {state.personalized && stationLabel && (
                <span className="inline-flex items-center gap-1">
                  <RadioTower className="h-3 w-3" aria-hidden="true" />
                  {stationLabel}
                </span>
              )}
              <span>WSPR single-decode probability</span>
            </div>
          </div>
        </div>
        {state.pending && (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-gray-400"
            aria-label="Loading model predictions"
          />
        )}
      </div>

      {!state.pending && (state.capabilityError || !state.available) && (
        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-caution-amber">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Model capability unavailable. The established planner remains active.
          </span>
        </div>
      )}

      {state.predictions.size > 0 && (
        <div
          className={`mt-4 grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 ${
            compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          }`}
        >
          {bands.map((band) => {
            const prediction = state.predictions.get(band);
            if (!prediction) return null;
            const envelope = state.stationEnvelopes.get(band);
            const delta =
              prediction.personalized_probability - prediction.core_probability;
            const oodTitle = prediction.ood_flags.join(", ");
            return (
              <div
                key={band}
                className="bg-void-black/80 px-3 py-3"
                style={{ minHeight: state.personalized ? 158 : 116 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-white">
                    {band}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {prediction.profile === "physics" ? "Physics" : "NowCast"}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Core</span>
                    <span className="font-mono text-gray-200">
                      {(prediction.core_probability * 100).toFixed(1)}%
                    </span>
                  </div>
                  {state.personalized && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-400">Your station</span>
                      <span
                        className={`font-mono font-semibold ${probabilityTone(
                          prediction.personalized_probability,
                        )}`}
                      >
                        {(prediction.personalized_probability * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                {state.personalized && envelope && (
                  <div className="mt-2 border-t border-white/5 pt-2 text-[10px] text-gray-500">
                    {envelope.supported ? (
                      <>
                        <span>{formatPower(envelope.eirpWatts)} EIRP</span>
                        <span aria-hidden="true"> · </span>
                        <span>{envelope.totalPassiveLossDb.toFixed(1)} dB loss</span>
                        <span aria-hidden="true"> · </span>
                        <span>{envelope.antennaGainTowardPathDbi.toFixed(1)} dBi path</span>
                      </>
                    ) : (
                      <span className="text-caution-amber">Chain unsupported on this band</span>
                    )}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-gray-500">
                  <span>{Math.round(prediction.confidence * 100)}% confidence</span>
                  {state.personalized && (
                    <span className={delta >= 0 ? "text-signal-green" : "text-caution-amber"}>
                      {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)} pp
                    </span>
                  )}
                  {prediction.ood_flags.length > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-caution-amber"
                      title={oodTitle}
                    >
                      <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                      OOD
                    </span>
                  )}
                </div>
                <ResearchAttemptControl prediction={prediction} />
              </div>
            );
          })}
        </div>
      )}

      {state.errors.size > 0 && state.predictions.size === 0 && (
        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-caution-amber">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Model service unavailable. The established planner remains active.</span>
        </div>
      )}

      {state.partial && (
        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-caution-amber">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {state.predictions.size}/{state.requestedCount} bands scored. The
            established planner remains active for unavailable bands.
          </span>
        </div>
      )}

      {firstPrediction && (
        <div className="mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-1 border-t border-white/5 pt-2 text-[10px] text-gray-500">
          <span
            className="max-w-full truncate font-mono"
            title={firstPrediction.model_version}
          >
            {firstPrediction.model_version}
          </span>
          <span>Issued {firstPrediction.issue_time.slice(11, 16)} UTC</span>
          {pathAge && <span>Path data {pathAge}</span>}
          {weatherAge && <span>Space weather {weatherAge}</span>}
          {state.fallbackBands.length > 0 && (
            <span>{state.fallbackBands.length} physics fallback band{state.fallbackBands.length === 1 ? "" : "s"}</span>
          )}
          {firstPrediction.top_factors.length > 0 && (
            <span title="Predictive context, not causal effects">
              Context: {firstPrediction.top_factors.slice(0, 3).map((factor) =>
                factor.replace(/_/g, " "),
              ).join(", ")}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
