import { useState } from "react";
import { Check, Play, X } from "lucide-react";
import { useResearchParticipation } from "@/hooks/useResearchParticipation";
import type { PropagationPrediction } from "@/lib/propagation/modelClient";
import type {
  ResearchAttempt,
  ResearchOutcome,
} from "@/lib/propagation/researchParticipation";

const OUTCOMES: Array<{ value: ResearchOutcome; label: string }> = [
  { value: "receive_success", label: "Heard" },
  { value: "receive_failure", label: "Not heard" },
  { value: "contact_success", label: "Contact" },
  { value: "contact_failure", label: "No contact" },
];

export function ResearchAttemptControl({
  prediction,
}: {
  prediction: PropagationPrediction;
}) {
  const research = useResearchParticipation();
  const [attempt, setAttempt] = useState<ResearchAttempt | null>(null);
  const [recorded, setRecorded] = useState<ResearchOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (
    !prediction.research_receipt ||
    !research.enabled ||
    !research.authenticated ||
    !research.canRecordOutcomes
  ) {
    return null;
  }

  const start = async () => {
    setError(null);
    try {
      setAttempt(await research.startAttempt(prediction.research_receipt!));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start attempt.");
    }
  };

  const complete = async (outcomeType: ResearchOutcome) => {
    if (!attempt) return;
    setError(null);
    try {
      await research.completeAttempt({ attemptId: attempt.id, outcomeType });
      setRecorded(outcomeType);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record outcome.");
    }
  };

  if (recorded) {
    return (
      <div className="mt-2 flex items-center gap-1 text-[10px] text-signal-green" role="status">
        <Check className="h-3 w-3" aria-hidden="true" />
        Outcome recorded
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={start}
          disabled={research.startingAttempt}
          className="flex h-7 w-full items-center justify-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] font-medium text-gray-300 hover:bg-white/10 disabled:opacity-50"
        >
          <Play className="h-3 w-3" aria-hidden="true" />
          {research.startingAttempt ? "Starting..." : "Start attempt"}
        </button>
        {error && <p className="mt-1 text-[10px] text-alert-red">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[10px] text-gray-500">Record this attempt</p>
      <div className="grid grid-cols-2 gap-1">
        {OUTCOMES.map((outcome) => (
          <button
            key={outcome.value}
            type="button"
            onClick={() => complete(outcome.value)}
            disabled={research.completingAttempt}
            className="h-7 rounded-md border border-white/10 bg-white/5 px-1 text-[10px] text-gray-300 hover:bg-white/10 disabled:opacity-50"
          >
            {outcome.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => complete("not_attempted")}
        disabled={research.completingAttempt}
        className="flex h-6 w-full items-center justify-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-50"
      >
        <X className="h-3 w-3" aria-hidden="true" />
        Cancel attempt
      </button>
      {error && <p className="text-[10px] text-alert-red">{error}</p>}
    </div>
  );
}
