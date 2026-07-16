import { useEffect, useMemo, useState } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useResearchParticipation } from "@/hooks/useResearchParticipation";
import type { ResearchAllowedUse } from "@/lib/propagation/researchParticipation";

const USE_OPTIONS: Array<{
  value: ResearchAllowedUse;
  label: string;
  description: string;
}> = [
  {
    value: "anonymous_quality_metrics",
    label: "Anonymous quality metrics",
    description: "Include coarse, aggregated accuracy measurements.",
  },
  {
    value: "attempt_outcome_training",
    label: "Attempt and outcome training",
    description: "Use declared attempts and their outcomes to improve predictions.",
  },
  {
    value: "derived_equipment_training",
    label: "Derived station features",
    description: "Use bounded station-chain features, never raw shack inventory.",
  },
  {
    value: "research_follow_up",
    label: "Research follow-up",
    description: "Allow the research team to contact you about submitted evidence.",
  },
];

export function ResearchParticipationSettings() {
  const research = useResearchParticipation();
  const currentUses = useMemo(
    () => research.state?.consent?.allowedUses ?? [],
    [research.state?.consent?.allowedUses],
  );
  const optedIn = research.state?.consent?.status === "opted_in";
  const [editingOptIn, setEditingOptIn] = useState(false);
  const [selectedUses, setSelectedUses] = useState<ResearchAllowedUse[]>([]);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (optedIn) setSelectedUses(currentUses);
  }, [currentUses, optedIn]);

  if (!research.enabled || !research.authenticated) return null;

  const toggleUse = (value: ResearchAllowedUse) => {
    setSelectedUses((uses) =>
      uses.includes(value)
        ? uses.filter((candidate) => candidate !== value)
        : [...uses, value],
    );
    setStatus(null);
  };

  const save = async () => {
    if (selectedUses.length === 0) {
      setStatus("Select at least one permitted research use.");
      return;
    }
    try {
      await research.saveConsent(selectedUses);
      setEditingOptIn(false);
      setStatus("Research choices saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save choices.");
    }
  };

  const withdraw = async () => {
    try {
      await research.withdrawConsent();
      setEditingOptIn(false);
      setConfirmWithdrawal(false);
      setSelectedUses([]);
      setStatus("Research consent withdrawn. No new outcomes will be collected.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to withdraw consent.");
    }
  };

  return (
    <div className="border-t border-white/10 pt-6 mt-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Propagation Research
      </h3>
      {research.loading ? (
        <p className="text-sm text-gray-500">Loading participation status...</p>
      ) : (
        <>
          <ToggleSwitch
            checked={optedIn || editingOptIn}
            disabled={research.savingConsent}
            label="Volunteer research data"
            description="Independent of subscription or donation status and revocable at any time."
            onChange={(checked) => {
              setStatus(null);
              if (checked) {
                setEditingOptIn(true);
                setSelectedUses(
                  currentUses.length > 0
                    ? currentUses
                    : ["anonymous_quality_metrics", "attempt_outcome_training"],
                );
              } else if (optedIn) {
                setConfirmWithdrawal(true);
              } else {
                setEditingOptIn(false);
                setSelectedUses([]);
              }
            }}
          />

          {(optedIn || editingOptIn) && !confirmWithdrawal && (
            <div className="space-y-3 border-l-2 border-white/10 pl-4">
              {USE_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedUses.includes(option.value)}
                    disabled={research.savingConsent}
                    onChange={() => toggleUse(option.value)}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-plasma-orange focus:ring-plasma-orange"
                  />
                  <span>
                    <span className="block text-sm text-gray-200">{option.label}</span>
                    <span className="block text-xs text-gray-500">{option.description}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-gray-500">
                Shared research is aggregated at grid4/hour resolution with minimum cohort
                sizes. Raw equipment, callsigns, exact coordinates, credentials, and viewed-only
                predictions are excluded. Derived records stop entering future training after
                withdrawal; already published aggregate results cannot be retracted.
              </p>
              <button
                type="button"
                onClick={save}
                disabled={research.savingConsent || selectedUses.length === 0}
                className="w-full px-4 py-2 rounded-md text-sm font-medium bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30 hover:bg-plasma-orange/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {research.savingConsent ? "Saving..." : "Save Research Choices"}
              </button>
            </div>
          )}

          {confirmWithdrawal && (
            <div className="space-y-3 border border-caution-amber/30 bg-caution-amber/5 p-3 rounded-md">
              <p className="text-sm text-gray-300">
                Withdrawal stops new research collection and future training use.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={withdraw}
                  disabled={research.savingConsent}
                  className="flex-1 px-3 py-2 rounded-md text-sm font-medium bg-alert-red/20 text-alert-red border border-alert-red/30 disabled:opacity-50"
                >
                  Confirm Withdrawal
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmWithdrawal(false)}
                  disabled={research.savingConsent}
                  className="flex-1 px-3 py-2 rounded-md text-sm font-medium bg-white/5 text-gray-300 border border-white/10 disabled:opacity-50"
                >
                  Keep Participating
                </button>
              </div>
            </div>
          )}

          {(status || research.error) && (
            <p className="text-xs text-gray-400" role="status">
              {status ?? "Research participation status is unavailable."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
