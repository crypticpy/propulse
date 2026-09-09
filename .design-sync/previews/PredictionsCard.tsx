import { PredictionsCard } from "propulse";

// PredictionsCard has no props for injecting solar/band data — it reads
// live from useSolarFlux/useKIndex/useStationCastContext/useChainPerformance.
// These stories show the honest states its props (maxPredictions, onClick)
// actually control while the underlying data hooks resolve.
export function Default() {
  return <PredictionsCard />;
}

export function Interactive() {
  return <PredictionsCard maxPredictions={2} onClick={() => {}} />;
}
